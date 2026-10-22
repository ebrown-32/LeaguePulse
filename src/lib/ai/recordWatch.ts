/**
 * When a league record falls, The Feed says so. Checked by the franchise job every fifteen
 * minutes (api/franchise/cron), but it only does real work once a fantasy week is final: then it
 * rebuilds the record book (lib/enhancedHistoryApi, the History page's) and looks for a list
 * whose new #1 was set in that week.
 *
 *   Games and players   the week's result beats every one before it (a tie isn't a new record)
 *   Streaks             a run of wins or losses that just passed every other manager's best
 *   Seasons             the regular season's totals, once the season is over
 *
 * Who covers it: a writer from the media desk when the league has AI and the desk is on (they skip
 * the desk's daily caps, like trades: a record is rare), with a reply from someone else. Otherwise
 * the record holder's franchise account posts it, which costs nothing. Either way the post carries
 * a record card (OfficialVisual 'record').
 *
 * The first look at a league remembers where its season is and announces nothing, since its
 * records so far are history, not news. A week waits two hours after going final, so points have
 * settled. Server only; call inside the league's request.
 */

import type { EnhancedHistoricalRecord } from '@/lib/enhancedHistoryApi';
import type { Personality } from './personalities';
import type { FeedPost } from './store';
import type { OfficialVisual } from '@/lib/franchise/announce';

const STATE = 'records_watch';
const ANNOUNCED = 'records_announced';
const LOCK = 'records_watch_lock';
const SETTLE_MS = 2 * 3_600_000;
/** Records covered per run: a week that rewrote the book trickles out over the next runs. */
const PER_RUN = 3;
const KEEP = 300;

type Unit = 'pts' | 'margin' | 'games' | 'record';
type Scope = 'game' | 'streak' | 'season';

/** The lists worth a post: what the record is, and whether holding it is something to brag about. */
const WATCHED: Record<string, { label: string; unit: Unit; good: boolean; scope: Scope }> = {
  highScore:      { label: 'Most points in a week',          unit: 'pts',    good: true,  scope: 'game' },
  lowScore:       { label: 'Fewest points in a week',        unit: 'pts',    good: false, scope: 'game' },
  blowout:        { label: 'Biggest margin of victory',      unit: 'margin', good: true,  scope: 'game' },
  closeGame:      { label: 'Closest game',                   unit: 'margin', good: true,  scope: 'game' },
  shootout:       { label: 'Most combined points in a game', unit: 'pts',    good: true,  scope: 'game' },
  highScoreLoss:  { label: 'Most points in a loss',          unit: 'pts',    good: false, scope: 'game' },
  lowScoreWin:    { label: 'Fewest points in a win',         unit: 'pts',    good: true,  scope: 'game' },
  playerGame:     { label: 'Most points by a starter',       unit: 'pts',    good: true,  scope: 'game' },
  benchGame:      { label: 'Most points left on the bench',  unit: 'pts',    good: false, scope: 'game' },
  gameWinStreak:  { label: 'Longest winning streak',         unit: 'games',  good: true,  scope: 'streak' },
  gameLossStreak: { label: 'Longest losing streak',          unit: 'games',  good: false, scope: 'streak' },
  seasonPoints:   { label: 'Most points in a season',        unit: 'pts',    good: true,  scope: 'season' },
  seasonPointsLow:{ label: 'Fewest points in a season',      unit: 'pts',    good: false, scope: 'season' },
  seasonRecord:   { label: 'Best regular-season record',     unit: 'record', good: true,  scope: 'season' },
  pointsAgainst:  { label: 'Most points against in a season', unit: 'pts',   good: false, scope: 'season' },
};
/** Which way the record runs, as the record book ranks it (lib/enhancedHistoryApi assignRecordRankings). */
const LOWER_WINS = new Set(['lowScore', 'closeGame', 'lowScoreWin', 'seasonPointsLow']);

interface State { season: string; week: number; done: boolean }
interface Pending { state: State; at: number }

export interface Broken {
  key: string;
  type: string;
  record: EnhancedHistoricalRecord;
  /** The record it beat, or for a streak, the best of every other manager. */
  was: EnhancedHistoricalRecord | null;
}

const fmt = (unit: Unit, r: EnhancedHistoricalRecord) =>
  unit === 'games' ? `${r.value} games` : unit === 'record' ? r.details?.record ?? '' : r.value.toFixed(2);
const whenOf = (r: EnhancedHistoricalRecord) =>
  r.details?.from && r.details?.to ? `${r.details.from} to ${r.details.to}` : r.week ? `${r.season} Week ${r.week}` : `${r.season} season`;
const keyOf = (r: EnhancedHistoricalRecord) => `${r.type}:${r.season}:${r.week ?? r.details?.to ?? '-'}:${r.userId}`;

/**
 * The records the newest results set, from a freshly built record book. Pure, for tests: `weeks`
 * are the current season's weeks that just went final; `seasonEnded` when its regular season's
 * totals just became final.
 */
export function findBroken(records: EnhancedHistoricalRecord[], season: string, weeks: number[], seasonEnded: boolean): Broken[] {
  const out: Broken[] = [];
  const fresh = new Set(weeks.map(w => `${season} Week ${w}`));
  for (const [type, meta] of Object.entries(WATCHED)) {
    const list = records.filter(r => r.type === type)
      .sort((a, b) => (a.contextualRank ?? 99) - (b.contextualRank ?? 99));
    const top = list[0];
    if (!top) continue;
    const better = (a: number, b: number) => (LOWER_WINS.has(type) ? a < b : a > b);

    if (meta.scope === 'game') {
      if (top.season !== season || !weeks.includes(top.week ?? -1)) continue;
      const was = list.find(r => !(r.season === season && weeks.includes(r.week ?? -1)));
      // The league's very first games aren't breaking anything.
      if (!was || !better(top.value, was.value)) continue;
      out.push({ key: keyOf(top), type, record: top, was });
    } else if (meta.scope === 'streak') {
      if (!top.details?.active || !fresh.has(top.details.to ?? '')) continue;
      const was = list.find(r => r.userId !== top.userId) ?? null;
      // Past everyone else's best, and only just: a streak that already held the record is old news.
      if (!was || top.value <= was.value || top.value - weeks.length > was.value) continue;
      out.push({ key: keyOf(top), type, record: top, was });
    } else {
      if (!seasonEnded || top.season !== season) continue;
      const was = list.find(r => r.season !== season);
      if (!was || !better(top.value, was.value)) continue;
      out.push({ key: keyOf(top), type, record: top, was });
    }
  }
  return out;
}

/** The weeks that went final since the last look, and whether the season's totals just did. */
export function whatsNew(prev: State, cur: State): { weeks: number[]; seasonEnded: boolean } {
  const from = prev.season === cur.season ? prev.week + 1 : 1;
  const weeks = Array.from({ length: Math.max(0, cur.week - from + 1) }, (_, i) => from + i);
  return { weeks, seasonEnded: cur.done && !(prev.season === cur.season && prev.done) };
}

export async function coverBrokenRecords(): Promise<{ covered: number; skipped?: string }> {
  const [{ getRedis }, api, { getCurrentLeagueId }, { weekPhase }] = await Promise.all([
    import('@/lib/redisClient'), import('@/lib/api'), import('@/config/league'), import('@/lib/nflSchedule'),
  ]);
  const redis = getRedis().client;
  if (!redis) return { covered: 0, skipped: 'no-storage' };

  // Where the season is: the last week that's final, and whether the league has finished it.
  const leagueId = await getCurrentLeagueId();
  const [nfl, league] = await Promise.all([api.getNFLState().catch(() => null as any), api.getLeagueInfo(leagueId).catch(() => null as any)]);
  if (!nfl || !league) return { covered: 0, skipped: 'no-league' };
  const season = String(league.season);
  const nflWeek = String(nfl.season) === season ? Number(nfl.week ?? 0) : 99;
  const lastWeek = Math.min(nflWeek, Number(league.settings?.playoff_week_end || league.settings?.last_scored_leg || 18));
  let week = 0;
  for (const w of [lastWeek, lastWeek - 1]) {
    if (w >= 1 && (String(nfl.season) !== season || (await weekPhase(season, w).catch(() => 'upcoming')) === 'final')) { week = w; break; }
  }
  if (!week && lastWeek > 2) week = lastWeek - 2;
  const cur: State = { season, week, done: league.status === 'complete' };

  const read = async <T,>(k: string): Promise<T | null> => { try { const v = await redis.get(k); return v ? JSON.parse(v) as T : null; } catch { return null; } };
  const prev = await read<State>(STATE);
  if (!prev) { await redis.set(STATE, JSON.stringify(cur)); return { covered: 0, skipped: 'first-look' }; }
  const { weeks, seasonEnded } = whatsNew(prev, cur);
  if (!weeks.length && !seasonEnded) return { covered: 0 };

  // Let the points settle before reading the book.
  const pending = await read<Pending>(`${STATE}:pending`);
  if (!pending || JSON.stringify(pending.state) !== JSON.stringify(cur)) {
    await redis.set(`${STATE}:pending`, JSON.stringify({ state: cur, at: Date.now() } satisfies Pending));
    return { covered: 0, skipped: 'settling' };
  }
  if (Date.now() - pending.at < SETTLE_MS) return { covered: 0, skipped: 'settling' };
  if (await redis.get(LOCK)) return { covered: 0, skipped: 'running' };
  await redis.set(LOCK, '1', 900);

  try {
    const { generateEnhancedLeagueHistory } = await import('@/lib/enhancedHistoryApi');
    const history = await generateEnhancedLeagueHistory(leagueId);
    const announced = (await read<string[]>(ANNOUNCED)) ?? [];
    const broken = findBroken(history.records, season, weeks, seasonEnded).filter(b => !announced.includes(b.key));
    const now = broken.slice(0, PER_RUN);

    let covered = 0;
    for (const b of now) {
      try {
        await cover(b, leagueId);
        covered++;
      } catch (err) {
        console.error('[recordWatch] could not cover', b.key, err instanceof Error ? err.message : err);
      }
      // Remembered either way: a record that couldn't be covered isn't retried every quarter hour.
      announced.push(b.key);
    }
    await redis.set(ANNOUNCED, JSON.stringify(announced.slice(-KEEP)));
    // Caught up only once every record from these weeks has gone out.
    if (broken.length <= PER_RUN) await redis.set(STATE, JSON.stringify(cur));
    return { covered };
  } finally {
    await redis.del(LOCK).catch(() => {});
  }
}

/** Who holds what, by team name: the league's names now, else the manager's handle at the time. */
async function teamNames(leagueId: string): Promise<(userId: string, fallback: string) => string> {
  const api = await import('@/lib/api');
  const users = await api.getLeagueUsers(leagueId).catch(() => [] as any[]);
  const byId = new Map((users as any[]).map(u => [String(u.user_id), u.metadata?.team_name || u.display_name]));
  return (id, fallback) => byId.get(id) || fallback;
}

async function cover(b: Broken, leagueId: string): Promise<void> {
  const meta = WATCHED[b.type];
  const [{ isAIConfigured }, { getDeskVolume }, { getPlayersDirectory }, nameOf] = await Promise.all([
    import('./claude'), import('./deskVolume'), import('@/lib/playerStats'), teamNames(leagueId),
  ]);
  const r = b.record, was = b.was;
  const holder = nameOf(r.userId, r.username);
  const player = r.details?.playerId
    ? await getPlayersDirectory().then(dir => dir[r.details!.playerId!]).catch(() => null)
    : null;
  const visualBase = {
    type: 'record' as const, label: meta.label, value: fmt(meta.unit, r), unit: meta.unit === 'record' ? '' : meta.unit === 'games' ? '' : 'pts',
    holder, when: whenOf(r), good: meta.good,
    was: was ? { value: fmt(meta.unit, was), holder: nameOf(was.userId, was.username), when: whenOf(was) } : null,
    ...(r.details?.playerId && r.details.player
      ? { player: { id: r.details.playerId, name: r.details.player, position: r.details.position ?? '', nflTeam: String(player?.team ?? '') } }
      : {}),
  };

  const facts = [
    `A league record fell: ${meta.label.toLowerCase()}, in the league's whole history.`,
    `The new record: ${r.details?.player ? `${r.details.player}${r.details.position ? ` (${r.details.position})` : ''} scored ${fmt(meta.unit, r)} points for ${holder}` : `${holder}, ${fmt(meta.unit, r)}${meta.unit === 'pts' || meta.unit === 'margin' ? ' points' : ''}`}, ${whenOf(r)}.`,
    r.details?.opponent && r.details.winnerScore != null && r.details.loserScore != null
      ? `The game finished ${r.details.winnerScore.toFixed(2)} to ${r.details.loserScore.toFixed(2)} (the opponent was ${r.details.opponent}).` : '',
    was ? `The old record: ${nameOf(was.userId, was.username)}, ${fmt(meta.unit, was)}, ${whenOf(was)}.` : '',
    meta.good ? '' : 'This is a record nobody wants to hold.',
  ].filter(Boolean).join('\n');

  const ai = (await isAIConfigured()) && (await getDeskVolume()) !== 'off';
  if (ai && await coverWithWriter(b, holder, facts, visualBase)) return;
  await coverAsFranchise(r.userId, b.type, meta, visualBase);
}

/** A writer's post about it, and someone else's reply. False when there's nobody to write it. */
async function coverWithWriter(b: Broken, holder: string, facts: string, visual: Record<string, unknown>): Promise<boolean> {
  const [{ getPersonalities, addPost }, { writeTweet }, { personaAvatarUrl }, { addReply }] = await Promise.all([
    import('./store'), import('./generate'), import('./avatar'), import('./threads'),
  ]);
  const people = (await getPersonalities()).filter((p: Personality) => p.enabled && !p.hidden);
  const pool = people.filter(p => (p.type ?? 'media') === 'media');
  if (!pool.length) return false;
  let h = 7; for (const c of b.key) h = (h * 31 + c.charCodeAt(0)) | 0;
  const writer = pool[Math.abs(h) % pool.length];
  const tweet = await writeTweet(writer, holder, 'A league record just fell. That is the news: say so, and say what it means.', facts);
  const now = new Date().toISOString();
  const post: FeedPost = {
    id: `${Date.now()}-${writer.id}-record`,
    personalityId: writer.id, personaName: writer.name, personaHandle: writer.handle, personaAccent: writer.accent,
    personaType: writer.type ?? 'media', personaAvatar: personaAvatarUrl(writer),
    kind: 'tweet', content: { ...tweet, visual: { ...visual, color: '#d4a017' } }, createdAt: now, publishAt: now, source: 'cron',
    subject: holder,
  };
  await addPost(post);
  await addReply(people, post, [], Date.now() + (5 + Math.random() * 10) * 60_000).catch(err =>
    console.error('[recordWatch] reply failed', err instanceof Error ? err.message : err));
  return true;
}

/** The record holder's own account says it: proudly, or with a shrug for the ones nobody wants. */
async function coverAsFranchise(franchiseId: string, type: string, meta: { label: string; good: boolean }, visual: Record<string, unknown>): Promise<void> {
  const { faceOf, postAs } = await import('@/lib/franchise/announce');
  const face = await faceOf(franchiseId);
  const v = visual as { value: string; unit: string; was: { value: string; holder: string; when: string } | null; player?: { name: string } };
  const value = `${v.value}${v.unit ? ` ${v.unit}` : ''}`;
  const old = v.was ? `\n\nThe old mark: ${v.was.value}, ${v.was.holder}, ${v.was.when}.` : '';
  const text = meta.good
    ? v.player
      ? `NEW LEAGUE RECORD\n\n${v.player.name}: ${value}, the most a starter has ever scored in this league.${old}\n\n${face.tag}`
      : `NEW LEAGUE RECORD\n\n${meta.label}: ${value}. Nobody in league history has done it better.${old}\n\n${face.tag}`
    : type === 'gameLossStreak'
      ? `A league record, of sorts.\n\n${meta.label}: ${value}. It ends when it ends. We'll be back.${old}`
      : `A league record, of sorts.\n\n${meta.label}: ${value}. We'd like to forget this one. The record book won't let us.${old}`;
  await postAs(face, { text, visual: { ...visual, color: face.color } as OfficialVisual, event: `record:${type}` });
}
