import { fetchRssFeed } from './rss';
import { sleeperAPI } from './sleeperApi';
import { getLeagueUsers, getLeagueRosters } from './api';
import { getCurrentLeagueId } from '@/config/league';

const ESPN_NEWS_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl/news';
const ESPN_INJURIES_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';

const RSS_SOURCES = [
  { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nfl/rss.xml' },
  { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nfl/' },
  { name: 'ProFootballTalk', url: 'https://www.nbcsports.com/profootballtalk.rss' },
];

export interface Article {
  id: string;
  headline: string;
  description: string;
  url: string;
  imageUrl?: string;
  source: string;
  published: string; // ISO
  impact: 'high' | 'medium' | 'low';
}

export interface InjuryEntry {
  id: string;
  playerName: string;
  team: string;
  position: string;
  status: string;
  comment: string;
  date: string; // ISO
}

export interface TrendingEntry {
  playerId: string;
  name: string;
  team: string;
  position: string;
  type: 'add' | 'drop';
  count: number;
}

// Simple module-level TTL cache — matches the pattern already used for the
// team profile route, since these are all server-only aggregations that are
// expensive/rude to hit on every request but fine to serve slightly stale.
function withCache<T>(ttlMs: number) {
  let cached: { data: T; ts: number } | null = null;
  return async (loader: () => Promise<T>): Promise<T> => {
    if (cached && Date.now() - cached.ts < ttlMs) return cached.data;
    const data = await loader();
    cached = { data, ts: Date.now() };
    return data;
  };
}

const HIGH_IMPACT_WORDS = ['injury', 'injured', 'out', 'suspended', 'trade', 'traded', 'released', 'waived', 'ir', 'surgery', 'torn', 'fracture'];
const MEDIUM_IMPACT_WORDS = ['questionable', 'doubtful', 'probable', 'limited', 'practice', 'starter', 'targets', 'carries', 'snaps', 'debut'];

export function categorizeImpact(title: string): 'high' | 'medium' | 'low' {
  const t = title.toLowerCase();
  if (HIGH_IMPACT_WORDS.some(w => t.includes(w))) return 'high';
  if (MEDIUM_IMPACT_WORDS.some(w => t.includes(w))) return 'medium';
  return 'low';
}

function articleDedupeKey(a: Article): string {
  return a.headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
}

function dedupeArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter(a => {
    const key = articleDedupeKey(a);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadEspnArticles(): Promise<Article[]> {
  const response = await fetch(`${ESPN_NEWS_URL}?limit=50`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; LeaguePulse/1.0;)' },
  });
  if (!response.ok) throw new Error(`ESPN news failed: ${response.status}`);
  const data = await response.json();

  return (data.articles || []).map((a: any): Article => ({
    id: `espn_${a.id}`,
    headline: a.headline,
    description: a.description || '',
    url: a.links?.web?.href || '',
    imageUrl: a.images?.[0]?.url,
    source: 'ESPN',
    published: a.published || new Date().toISOString(),
    impact: categorizeImpact(a.headline || ''),
  }));
}

async function loadRssArticles(): Promise<Article[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(async src => {
      const items = await fetchRssFeed(src.url);
      return items.map((item, i): Article => ({
        id: `${src.name.toLowerCase().replace(/\s+/g, '')}_${item.published.getTime()}_${i}`,
        headline: item.title,
        description: item.description,
        url: item.link,
        imageUrl: item.imageUrl,
        source: src.name,
        published: item.published.toISOString(),
        impact: categorizeImpact(item.title),
      }));
    })
  );

  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}

// ESPN's endpoint and the RSS feeds each only expose their current top N
// items, so a plain "refetch and replace" cache silently loses anything that
// scrolls off the source's own list between refreshes — which is most of
// what a specific team's players ever get mentioned in, since that's a
// narrow slice of a small snapshot. Accumulating into a persistent pool
// (deduped, pruned by age) instead means the searchable article set keeps
// growing for as long as the server stays up, so both "All Teams" and
// per-team pagination actually have real depth to page through.
const articlePool = new Map<string, Article>();
let articlePoolLastFetch = 0;
const ARTICLE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const ARTICLE_POOL_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000; // 4 days

async function loadAllArticles(): Promise<Article[]> {
  if (Date.now() - articlePoolLastFetch > ARTICLE_REFRESH_INTERVAL_MS) {
    articlePoolLastFetch = Date.now();
    const [espn, rss] = await Promise.all([
      loadEspnArticles().catch(() => []),
      loadRssArticles().catch(() => []),
    ]);
    const deduped = dedupeArticles([...espn, ...rss]);
    for (const a of deduped) {
      articlePool.set(articleDedupeKey(a), a);
    }
    const cutoff = Date.now() - ARTICLE_POOL_MAX_AGE_MS;
    for (const [key, a] of articlePool) {
      if (new Date(a.published).getTime() < cutoff) articlePool.delete(key);
    }
  }

  return Array.from(articlePool.values())
    .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
}

/** Real NFL articles merged from ESPN's JSON API and publisher RSS feeds, deduped and sorted newest-first. */
export async function getArticles(limit = 40, team?: FantasyTeam): Promise<Article[]> {
  const all = await loadAllArticles();
  const filtered = team ? all.filter(a => articleMentionsTeam(a, team)) : all;
  return filtered.slice(0, limit);
}

const injuriesCache = withCache<InjuryEntry[]>(15 * 60 * 1000);

/** Structured, per-player injury designations sourced from ESPN's real injury report. */
export async function getInjuries(team?: FantasyTeam): Promise<InjuryEntry[]> {
  const all = await loadAllInjuries();
  return team ? all.filter(i => playerBelongsToTeam(i.playerName, team)) : all;
}

async function loadAllInjuries(): Promise<InjuryEntry[]> {
  return injuriesCache(async () => {
    const response = await fetch(ESPN_INJURIES_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; LeaguePulse/1.0;)' },
    });
    if (!response.ok) throw new Error(`ESPN injuries failed: ${response.status}`);
    const data = await response.json();

    const entries: InjuryEntry[] = [];
    for (const team of data.injuries || []) {
      for (const injury of team.injuries || []) {
        const athlete = injury.athlete;
        if (!athlete) continue;
        entries.push({
          id: String(injury.id),
          playerName: athlete.displayName,
          team: team.displayName,
          position: athlete.position?.abbreviation || '',
          status: injury.status || 'Unknown',
          comment: injury.shortComment || injury.longComment || '',
          date: injury.date || new Date().toISOString(),
        });
      }
    }

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });
}

const trendingCache = withCache<TrendingEntry[]>(15 * 60 * 1000);

/** Sleeper's real trending add/drop counts, resolved from player IDs to names via Sleeper's player directory. */
export async function getTrendingPlayers(team?: FantasyTeam): Promise<TrendingEntry[]> {
  const all = await loadAllTrendingPlayers();
  return team ? all.filter(t => playerBelongsToTeam(t.name, team)) : all;
}

async function loadAllTrendingPlayers(): Promise<TrendingEntry[]> {
  return trendingCache(async () => {
    const [adds, drops, players] = await Promise.all([
      sleeperAPI.fetchTrendingPlayers('add', 24, 25),
      // Drops get the same depth as adds now that they have their own view;
      // the old cap of 8 only made sense when they were a feed afterthought.
      sleeperAPI.fetchTrendingPlayers('drop', 24, 25),
      sleeperAPI.fetchPlayers(),
    ]);

    const resolve = (list: any[], type: 'add' | 'drop'): TrendingEntry[] =>
      list
        .map(entry => {
          const player = players[entry.player_id];
          if (!player) return null;
          return {
            playerId: entry.player_id,
            name: `${player.first_name} ${player.last_name}`.trim(),
            team: player.team || 'FA',
            position: player.position || '',
            type,
            count: entry.count,
          };
        })
        .filter((e): e is TrendingEntry => e !== null);

    return [...resolve(adds, 'add'), ...resolve(drops, 'drop')];
  });
}

export interface FeedItem {
  id: string;
  kind: 'article' | 'injury' | 'trending';
  title: string;
  subtitle: string;
  url?: string;
  imageUrl?: string;
  source: string;
  impact?: 'high' | 'medium' | 'low';
  team?: string;
  position?: string;
  status?: string;
  count?: number;
  trendType?: 'add' | 'drop';
  publishedAt: string; // ISO — real for articles/injuries, staggered-synthetic for trending
}

export type FeedKind = FeedItem['kind'];
export type TrendType = TrendingEntry['type'];

export interface FeedPage {
  items: FeedItem[];
  hasMore: boolean;
}

/**
 * A single feed mixing articles, injury alerts, and waiver trends, sorted by
 * actual recency rather than a fixed ratio — real ESPN injury timestamps and
 * article publish times sort naturally; Sleeper's trending endpoint has no
 * per-player timestamp at all, so those are spread across its 24h lookback
 * window by rank (highest add-count = most recent) so they interleave
 * instead of clustering artificially at "now".
 */
export async function getUnifiedFeed(
  offset = 0,
  limit = 20,
  team?: FantasyTeam,
  kinds?: FeedKind[],
  trend: TrendType = 'add',
): Promise<FeedPage> {
  // Each tab asks for the kinds it actually renders, so an unused source is
  // never fetched (the waiver tab shouldn't pay for 120 articles).
  const want = (kind: FeedKind) => !kinds?.length || kinds.includes(kind);

  // Waiver-wire trends are global by nature (they're about players NOT on
  // any given roster) and were never actually filtered by team — showing them
  // inside a "curated for your team" view just reads as noise, so they're
  // dropped entirely once a team is selected rather than left unfiltered.
  const [articles, injuries, trending] = await Promise.all([
    want('article') ? getArticles(120, team) : Promise.resolve([]),
    want('injury') ? getInjuries(team).catch(() => []) : Promise.resolve([]),
    want('trending') && !team ? getTrendingPlayers().catch(() => []) : Promise.resolve([]),
  ]);

  const articleItems: FeedItem[] = articles.map(a => ({
    id: a.id,
    kind: 'article',
    title: a.headline,
    subtitle: a.description,
    url: a.url,
    imageUrl: a.imageUrl,
    source: a.source,
    impact: a.impact,
    publishedAt: a.published,
  }));

  // "Active" just means healthy/no longer newsworthy — excluded so the feed
  // isn't dominated by hundreds of non-events.
  const injuryItems: FeedItem[] = injuries
    .filter(i => i.status !== 'Active')
    .map(i => ({
      id: `injury_${i.id}`,
      kind: 'injury',
      title: `${i.playerName} (${i.position} - ${i.team})`,
      subtitle: i.comment,
      source: 'ESPN',
      status: i.status,
      team: i.team,
      position: i.position,
      publishedAt: i.date,
    }));

  const trendingOfType = trending.filter(t => t.type === trend).slice(0, 25);
  const lookbackMs = 24 * 60 * 60 * 1000;
  const staggerMs = trendingOfType.length > 1 ? lookbackMs / trendingOfType.length : 0;
  const trendingItems: FeedItem[] = trendingOfType.map((t, idx) => ({
    // Direction is part of the id because a churning player can appear in
    // both the add and drop lists at once — same playerId, two cards, and a
    // duplicate React key if the type isn't included.
    id: `trending_${t.type}_${t.playerId}`,
    kind: 'trending',
    title: `${t.name} (${t.position} - ${t.team})`,
    subtitle: t.type === 'drop'
      ? `Dropped from ${t.count.toLocaleString()} rosters in the last 24 hours`
      : `Added on ${t.count.toLocaleString()} rosters in the last 24 hours`,
    source: 'Sleeper',
    count: t.count,
    trendType: t.type,
    team: t.team,
    position: t.position,
    publishedAt: new Date(Date.now() - idx * staggerMs).toISOString(),
  }));

  const all = [...articleItems, ...injuryItems, ...trendingItems]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const page = all.slice(offset, offset + limit);
  return { items: page, hasMore: offset + limit < all.length };
}

// ── Team tailoring ──────────────────────────────────────────────────────────
// Lets each tab be filtered down to a specific fantasy manager's roster so
// the "content they'd care about" ask means something concrete: articles/
// injuries that name one of their players, not just NFL news in general.

export interface FantasyTeam {
  userId: string;
  teamName: string;
  avatar: string;
  playerNames: string[]; // normalized "first last" — the only signal precise enough to match on
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.']/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Last-name-only matching is unreliable at any length threshold — even a
// longer surname like "Johnson" collides with hyphenated names (regex \b
// treats the hyphen in "Gardner-Johnson" as a word boundary, so it'd match
// "Johnson" there too, flagging an article about a completely different
// player as being about this team's guy). Full "first last" name match is
// the only signal precise enough to trust.
function articleMentionsTeam(article: Article, team: FantasyTeam): boolean {
  if (!team.playerNames.length) return false;
  const haystack = `${article.headline} ${article.description}`.toLowerCase();
  return team.playerNames.some(name => new RegExp(`\\b${escapeRegex(name)}\\b`).test(haystack));
}

function playerBelongsToTeam(playerName: string, team: FantasyTeam): boolean {
  return team.playerNames.includes(normalizeName(playerName));
}

const teamsCache = withCache<FantasyTeam[]>(15 * 60 * 1000);

/** Every fantasy manager in the current league with their live roster, for tailoring content to "their guys". */
export async function getFantasyTeams(): Promise<FantasyTeam[]> {
  return teamsCache(async () => {
    const leagueId = await getCurrentLeagueId();
    const [users, rosters, players] = await Promise.all([
      getLeagueUsers(leagueId),
      getLeagueRosters(leagueId),
      sleeperAPI.fetchPlayers(),
    ]);

    const userById = new Map(users.map((u: any) => [u.user_id, u]));

    return rosters
      .filter((r: any) => r.owner_id && userById.has(r.owner_id))
      .map((r: any) => {
        const user = userById.get(r.owner_id);
        const playerNames: string[] = (r.players || [])
          .map((pid: string) => players[pid])
          .filter(Boolean)
          .map((p: any) => normalizeName(`${p.first_name} ${p.last_name}`));

        return {
          userId: r.owner_id,
          teamName: user.metadata?.team_name || user.display_name,
          avatar: user.avatar || '',
          playerNames,
        };
      });
  });
}
