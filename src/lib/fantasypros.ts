/**
 * FantasyPros public API v2 client.
 *
 * The free tier is severely rate limited and that shapes everything here:
 *
 *   - 50 requests per DAY across the whole key
 *   - every response is truncated to 10 rows (`public_api_limited: true`)
 *   - /rankings/experts returns 0 rows entirely (verified), so expert accuracy
 *     ratings are unavailable; the per-player breakdown below is the richest
 *     expert data the tier actually exposes
 *
 * So this module is never called from a page render or a user-triggered
 * request. A single scheduled refresh pulls one snapshot per day and every
 * reader is served that cached copy.
 *
 * Schemas were taken from the published OpenAPI spec at
 * /public/v2/docs/fantasypros_v2_public.yml and verified against live
 * responses, not inferred.
 */

const BASE = 'https://api.fantasypros.com/public/v2/json';

// The positions the rankings page actually renders. K and DST boards were
// pulled while the analyzer needed the coverage; nothing displays them now,
// so they are dropped rather than spend 4 requests a day on unused data.
export const RANKED_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;
export type RankedPosition = (typeof RANKED_POSITIONS)[number];

/**
 * The two boards we publish.
 *
 * `weekly` is this week's start/sit consensus. `dynasty` values players as
 * long-term assets, which is why it carries age and draws on a much deeper
 * expert pool (27 vs a handful in the offseason).
 */
export const RANKING_MODES = ['weekly', 'dynasty'] as const;
export type RankingMode = (typeof RANKING_MODES)[number];

/** One request per position per board: what a refresh of these boards costs. */
export const requestsFor = (modes: readonly RankingMode[]) => RANKED_POSITIONS.length * modes.length;
/** The free tier's allowance, per key per day. */
export const DAILY_REQUESTS = 50;

/**
 * Whether a key works: one small request (this week's QB board). It costs one
 * of the key's daily requests. FantasyPros answers a bad key with 401 or 403.
 */
export async function testFantasyProsKey(key: string, season: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const params = new URLSearchParams({ position: 'QB', scoring: 'PPR', type: 'weekly', week: '1' });
  const res = await fetch(`${BASE}/nfl/${season}/consensus-rankings?${params}`, { headers: { 'x-api-key': key }, cache: 'no-store' }).catch(() => null);
  if (!res) return { ok: false, error: 'Could not reach FantasyPros. Try again in a minute.' };
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'FantasyPros did not accept that key. Check it was copied in full.' };
  if (res.status === 429) return { ok: false, error: 'This key has used its requests for today. Try again tomorrow.' };
  return { ok: false, error: `FantasyPros answered ${res.status}. Try again in a minute.` };
}

/** One expert's individual take on a player. */
export interface ExpertRank {
  id: string;
  name: string;
  twitter: string | null;
  rank: number;
  /** rank minus consensus. Negative = higher on him than the field. */
  delta: number;
}

export interface EcrPlayer {
  playerId: number;
  name: string;
  team: string;
  position: string;
  posRank: string | null;
  rankEcr: number;
  rankMin: number | null;
  rankMax: number | null;
  rankAve: number | null;
  rankStd: number | null;
  byeWeek: string | null;
  opponent: string | null;
  ownedAvg: number | null;
  /** Dynasty boards carry age; weekly ones do not. */
  age: string | null;
  url: string | null;
  /** Every expert's individual ranking, best to worst. */
  experts: ExpertRank[];
  /** The experts furthest from consensus in each direction. */
  highestOn: ExpertRank | null;
  lowestOn: ExpertRank | null;
}

export interface EcrBoard {
  position: RankedPosition;
  mode: RankingMode;
  /** How many players FantasyPros ranks, before free-tier truncation. */
  totalRanked: number;
  returned: number;
  experts: number;
  /** FantasyPros' own "last updated" stamp, e.g. "8/09". */
  lastUpdated: string | null;
  players: EcrPlayer[];
  /** Everyone contributing to this board, for an attribution panel. */
  panel: { id: string; name: string; twitter: string | null; publishedAt: string | null }[];
}

interface RawRow {
  player_id: number;
  player_name: string;
  player_team_id: string;
  player_position_id: string;
  pos_rank: string | null;
  rank_ecr: number;
  rank_min: number | string | null;
  rank_max: number | string | null;
  rank_ave: number | string | null;
  rank_std: number | string | null;
  player_bye_week: string | null;
  player_opponent: string | null;
  player_owned_avg: number | null;
  player_age: string | null;
  player_page_url: string | null;
  experts?: Record<string, string | number>;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export async function fetchConsensusRankings(opts: {
  key: string;
  season: string;
  week: number;
  position: RankedPosition;
  mode: RankingMode;
  scoring: 'PPR' | 'HALF' | 'STD';
}): Promise<EcrBoard> {
  const key = opts.key;

  const params = new URLSearchParams({
    position: opts.position,
    scoring: opts.scoring,
    type: opts.mode,
    // Ask for expert names, handles, publish dates, and the per-player
    // breakdown. Costs nothing extra against the request budget.
    experts: 'show',
  });
  // Dynasty is season-long and takes no week. Weekly needs one; in the
  // offseason there is no current week, so fall forward to week 1.
  if (opts.mode === 'weekly') params.set('week', String(opts.week > 0 ? opts.week : 1));

  const url = `${BASE}/nfl/${opts.season}/consensus-rankings?${params}`;
  const res = await fetch(url, { headers: { 'x-api-key': key }, cache: 'no-store' });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `FantasyPros ${res.status} for ${opts.mode}/${opts.position}: ${body.slice(0, 200) || res.statusText}`,
    );
  }

  const data = await res.json();
  const rows: RawRow[] = Array.isArray(data.players) ? data.players : [];
  const names: Record<string, string> = data.expert_names ?? {};
  const twitter: Record<string, string> = data.expert_twitter ?? {};
  const published: Record<string, string> = data.expert_pub ?? {};

  const players = rows.map(r => {
    const experts: ExpertRank[] = Object.entries(r.experts ?? {})
      .map(([id, rank]) => ({
        id,
        name: names[id] || `Expert ${id}`,
        twitter: twitter[id] || null,
        rank: Number(rank),
        delta: Number(rank) - r.rank_ecr,
      }))
      .filter(e => Number.isFinite(e.rank))
      .sort((a, b) => a.rank - b.rank);

    return {
      playerId: r.player_id,
      name: r.player_name,
      team: r.player_team_id,
      position: r.player_position_id,
      posRank: r.pos_rank ?? null,
      rankEcr: r.rank_ecr,
      rankMin: num(r.rank_min),
      rankMax: num(r.rank_max),
      rankAve: num(r.rank_ave),
      rankStd: num(r.rank_std),
      byeWeek: r.player_bye_week ?? null,
      opponent: r.player_opponent ?? null,
      ownedAvg: num(r.player_owned_avg),
      age: r.player_age ?? null,
      url: r.player_page_url ?? null,
      experts,
      // Sorted ascending, so the first is the most bullish and the last the
      // most bearish. Only interesting when they actually disagree.
      highestOn: experts.length > 1 ? experts[0] : null,
      lowestOn: experts.length > 1 ? experts[experts.length - 1] : null,
    };
  });

  return {
    position: opts.position,
    mode: opts.mode,
    totalRanked: num(data.count) ?? rows.length,
    returned: rows.length,
    experts: num(data.total_experts) ?? Object.keys(names).length,
    lastUpdated: data.last_updated ?? null,
    players,
    panel: Object.keys(names).map(id => ({
      id,
      name: names[id],
      twitter: twitter[id] || null,
      publishedAt: published[id] ?? null,
    })),
  };
}
