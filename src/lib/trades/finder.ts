/**
 * Trade Finder for the league in this request: the pool of trades worth making (./engine), kept in
 * the league's storage, and dealt out a page at a time (./feed).
 *
 * The pool is built from the rosters, market values for the league's format (./values) and
 * projections in its scoring, and kept fresh without leaning on anyone's API:
 *
 *   rosters      looked at no more than every five minutes, whoever is scrolling: a change (a trade,
 *                a waiver claim) rebuilds the pool
 *   projections  rebuilt in at most an hour, so the pool moves with the week
 *   values       FantasyCalc's, cached for six hours across every league in the format (./values)
 *
 * A rebuild keeps the age of every trade it already had, so the ones that are new are marked
 * fresh and dealt early. One rebuild at a time per league; the others are served the last pool.
 * Server only.
 */

import { getRedis } from '@/lib/redisClient';
import { equivalent, adjusted, fairnessGrade, searchTrades, type TFTeam } from './engine';
import { feedOrder, type FeedFilters, type FeedTrade } from './feed';
import { formatOf, marketValues, nameKey } from './values';

export interface FinderPlayer {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  value: number;
  ppw: number;
  /** Market value's change over thirty days, where FantasyCalc has it. */
  trend: number | null;
}

export interface FinderSide {
  rosterId: number;
  gets: FinderPlayer[];
  gives: FinderPlayer[];
  /** Points a week the side's best lineup gains. */
  lineupDelta: number;
  /** Market value in less market value out, after the depth discount: two good players are
   *  worth less than one great one with the same total. */
  marketDelta: number;
}

export interface FinderTrade {
  id: string;
  kind: 'two' | 'three';
  grade: string;
  balance: number;
  /** New since the last rebuild. */
  fresh: boolean;
  sides: FinderSide[];
}

export interface FinderTeam {
  rosterId: number;
  name: string;
  avatar: string | null;
  record: string;
}

export interface FinderMeta {
  teams: FinderTeam[];
  source: 'FantasyCalc' | 'DynastyProcess';
  /** Weeks the projections cover, or null when they came from market value alone. */
  weeks: number[] | null;
  builtAt: number;
  valuesAt: number;
  poolSize: number;
  freshCount: number;
}

export interface FinderPage {
  trades: FinderTrade[];
  /** Trades matching the filters, in all. */
  total: number;
  /** The last page of this round: the caller starts another on a new seed. */
  exhausted: boolean;
  meta: FinderMeta;
}

type PlayerRow = [name: string, position: string, nflTeam: string, value: number, ppw: number, trend: number | null];

interface Pool {
  fingerprint: string;
  builtAt: number;
  /** The rebuild before this one: trades born after it are fresh. */
  previousAt: number;
  valuesAt: number;
  source: FinderMeta['source'];
  weeks: number[] | null;
  teams: FinderTeam[];
  players: Record<string, PlayerRow>;
  trades: FeedTrade[];
}

const KEY = 'trade_finder_pool_v1';
const LOCK = 'trade_finder_building';
const CHECK_MS = 5 * 60_000;
const REBUILD_MS = 3600_000;
/** The last pool each league was served, in this process. */
const memos = new Map<string, { pool: Pool | null; checkedAt: number }>();

const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const round = (x: number) => Math.round(x * 10) / 10;

async function tenantSlug(): Promise<string> {
  const { currentTenant } = await import('@/lib/tenant/context');
  return (await currentTenant())?.slug ?? '';
}

async function getPool(): Promise<Pool | null> {
  const slug = await tenantSlug();
  const memo = memos.get(slug) ?? { pool: null, checkedAt: 0 };
  memos.set(slug, memo);
  if (memo.pool && Date.now() - memo.checkedAt < CHECK_MS) return memo.pool;

  const redis = getRedis().client;
  let stored: (Pool & { checkedAt?: number }) | null = memo.pool;
  if (!stored) {
    try { stored = JSON.parse((await redis?.get(KEY).catch(() => null)) ?? 'null'); } catch { stored = null; }
  }
  if (stored && Date.now() - (stored.checkedAt ?? 0) < CHECK_MS) {
    Object.assign(memo, { pool: stored, checkedAt: stored.checkedAt ?? 0 });
    return stored;
  }

  const [api, { getCurrentLeagueId }] = await Promise.all([import('@/lib/api'), import('@/config/league')]);
  const leagueId = await getCurrentLeagueId();
  const [league, rosters, users] = await Promise.all([
    api.getLeagueInfo(leagueId), api.getLeagueRosters(leagueId), api.getLeagueUsers(leagueId),
  ]);
  if (!league || !rosters?.length) return stored;
  const fingerprint = hash(JSON.stringify(rosters.map((r: any) => [r.roster_id, r.players, r.settings?.wins, r.settings?.losses])));

  const now = Date.now();
  if (stored && stored.fingerprint === fingerprint && now - stored.builtAt < REBUILD_MS) {
    memo.pool = stored; memo.checkedAt = now;
    await redis?.set(KEY, JSON.stringify({ ...stored, checkedAt: now }), 7 * 86_400).catch(() => {});
    return stored;
  }
  // Someone else is rebuilding: the pool we have will do until they finish.
  if (stored && redis && await redis.get(LOCK).catch(() => null)) return stored;
  await redis?.set(LOCK, '1', 90).catch(() => {});
  try {
    const pool = await build(league, rosters, users, fingerprint, stored);
    if (!pool) return stored;
    memo.pool = pool; memo.checkedAt = now;
    await redis?.set(KEY, JSON.stringify({ ...pool, checkedAt: now }), 7 * 86_400).catch(() => {});
    return pool;
  } finally {
    await redis?.del(LOCK).catch(() => {});
  }
}

async function build(league: any, rosters: any[], users: any[], fingerprint: string, previous: Pool | null): Promise<Pool | null> {
  const market = await marketValues(formatOf(league));
  if (!market) return null;
  const [api, { getPlayersDirectory }, { weeklyProjectionsFor, fantasyPositions }, { teamAvatar }] = await Promise.all([
    import('@/lib/api'), import('@/lib/playerStats'), import('@/lib/sim/weeklyProjections'), import('@/lib/teamAvatar'),
  ]);
  const [directory, nfl] = await Promise.all([getPlayersDirectory().catch(() => ({} as Record<string, any>)), api.getNFLState().catch(() => null as any)]);

  // Points a week: the average of the next three weeks' projections, in the league's scoring.
  const slots: string[] = league.roster_positions ?? [];
  const inSeason = nfl?.season_type === 'regular' && String(nfl?.season) === String(league.season);
  const lastRegular = Math.max(1, Number(league.settings?.playoff_week_start ?? 15) - 1);
  const start = inSeason ? Math.max(1, Number(nfl.week)) : 1;
  const weeks = [start, start + 1, start + 2].filter(w => w <= lastRegular);
  const byWeek = weeks.length
    ? await weeklyProjectionsFor(String(league.season), weeks, fantasyPositions(slots), league.scoring_settings).catch(() => new Map<number, Map<string, number>>())
    : new Map<number, Map<string, number>>();
  const projected = [...byWeek.values()].some(m => m.size > 0);
  const ppwOf = (id: string, value: number) => {
    if (!projected) return value / 500; // No projections (the offseason): the market's view, scaled to points.
    const pts = [...byWeek.values()].map(m => m.get(id)).filter((x): x is number => x != null);
    return pts.length ? pts.reduce((s, x) => s + x, 0) / pts.length : 0;
  };

  const players: Record<string, PlayerRow> = {};
  const teams: TFTeam[] = rosters.map((r: any) => ({
    rosterId: Number(r.roster_id),
    players: (r.players ?? []).map((id: string) => {
      const d = directory[id] ?? {};
      const name = d.full_name || [d.first_name, d.last_name].filter(Boolean).join(' ') || id;
      const position = d.position ?? '';
      const value = market.byId[id] ?? market.byName[nameKey(name, position)] ?? 0;
      const ppw = ppwOf(id, value);
      players[id] = [name, position, d.team ?? 'FA', Math.round(value), round(ppw), market.trend[id] ?? null];
      return { id, name, position, nflTeam: d.team ?? 'FA', value, ppw };
    }),
  }));

  const now = Date.now();
  const born = new Map((previous?.trades ?? []).map(t => [t.id, t.born]));
  const trades: FeedTrade[] = searchTrades(teams, { slots, limit: 2000 }).map(t => ({
    ...t,
    balance: Math.round(t.balance * 1000) / 1000,
    score: round(t.score),
    sides: t.sides.map(s => ({ ...s, lineupDelta: round(s.lineupDelta), valueDelta: round(s.valueDelta) })),
    // The first pool has nothing to be newer than.
    born: born.get(t.id) ?? (previous ? now : 0),
  }));
  // Only players in a trade travel with the pool.
  const used = new Set(trades.flatMap(t => t.sides.flatMap(s => s.gives)));
  for (const id of Object.keys(players)) if (!used.has(id)) delete players[id];

  const user = (owner: string) => users.find((u: any) => String(u.user_id) === owner);
  return {
    fingerprint, builtAt: now, previousAt: previous?.builtAt ?? now, valuesAt: market.fetchedAt,
    source: market.source, weeks: projected ? weeks : null,
    teams: rosters.map((r: any) => {
      const u = user(String(r.owner_id ?? ''));
      const ties = Number(r.settings?.ties ?? 0);
      return {
        rosterId: Number(r.roster_id),
        name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
        avatar: teamAvatar(u) || null,
        record: `${Number(r.settings?.wins ?? 0)}-${Number(r.settings?.losses ?? 0)}${ties ? `-${ties}` : ''}`,
      };
    }),
    players, trades,
  };
}

export async function tradeFeed(q: FeedFilters & { seed: number; offset: number; limit: number }): Promise<FinderPage | null> {
  const pool = await getPool();
  if (!pool) return null;
  const positionOf = (id: string) => pool.players[id]?.[1];
  const freshSince = pool.previousAt;
  const order = feedOrder(pool.trades, q, q.seed, positionOf, freshSince);
  const page = order.slice(q.offset, q.offset + q.limit);
  const player = (id: string): FinderPlayer => {
    const [name, position, nflTeam, value, ppw, trend] = pool.players[id] ?? [id, '', 'FA', 0, 0, null];
    return { id, name, position, nflTeam, value, ppw, trend };
  };
  const adjOf = (ids: string[]) => ids.reduce((s, id) => s + adjusted(pool.players[id]?.[3] ?? 0), 0);
  return {
    trades: page.map(t => ({
      id: t.id, kind: t.kind, grade: fairnessGrade(t.balance), balance: t.balance, fresh: t.born > freshSince,
      sides: t.sides.map(s => ({
        rosterId: s.rosterId, gets: s.gets.map(player), gives: s.gives.map(player), lineupDelta: s.lineupDelta,
        marketDelta: Math.round(equivalent(adjOf(s.gets)) - equivalent(adjOf(s.gives))),
      })),
    })),
    total: order.length,
    exhausted: q.offset + q.limit >= order.length,
    meta: {
      teams: pool.teams, source: pool.source, weeks: pool.weeks, builtAt: pool.builtAt, valuesAt: pool.valuesAt,
      poolSize: pool.trades.length, freshCount: pool.trades.filter(t => t.born > freshSince).length,
    },
  };
}
