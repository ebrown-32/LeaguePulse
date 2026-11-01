/**
 * The Edge: what the market (lib/market/crawl) says about one league, from leagues like it.
 *
 *   field      the closest group of sampled leagues with enough of them: the league's own format,
 *              widening to the same kind and quarterbacks, the same kind, then every league
 *   vsField    the league against the field: trading, waiver activity and scoring, as percentiles
 *   waiver     players most leagues like this one roster, sitting unowned in this one
 *   movers     the week's most added (with what it took to win them), dropped and traded for
 *   calls      each team's lineup calls last week that went against the field, and how they went
 *
 * Held in memory per league for half an hour: the market only changes once an hour, and a league
 * site's visitors all see the same thing. Server only; call inside the league's request.
 */

import { ensureArchive, T } from '@/lib/archive/db';
import { bidAt } from './aggregate';
import { comparisonLadder, formatLabel, formatOf } from './format';

/** Fewer leagues than this in a week and a percentage means too little. */
const MIN_LEAGUES = 15;
const TTL_MS = 30 * 60_000;

export interface EdgePlayer { id: string; name: string; position: string; team: string }
export interface Metric { id: string; label: string; mine: number; median: number; percentile: number; unit: string; higherIs: 'busier' | 'better' }
export interface WaiverPick extends EdgePlayer { rosteredPct: number; startPct: number; ppgStarted: number | null; bid50: number | null; bid75: number | null }
export interface Mover extends EdgePlayer { pct: number; bid50?: number | null; bid75?: number | null }
export interface Call extends EdgePlayer { kind: 'benched' | 'bold'; fieldStartPct: number; points: number }
export interface TeamCalls { rosterId: number; name: string; avatar: string | null; calls: Call[] }

export interface Edge {
  ready: boolean;
  /** How big the market is so far, for the warming-up state. */
  sampled: number;
  format: string;
  field?: { label: string; exact: boolean; leagues: number; week: number; season: string };
  vsField?: Metric[];
  waiver?: WaiverPick[];
  movers?: { added: Mover[]; dropped: Mover[]; tradedFor: Mover[] };
  calls?: TeamCalls[];
}

interface Agg { rostered: number; started: number; startPts: number; adds: number; drops: number; bids: number; hist: number[]; tradedFor: number }

const memo = new Map<string, { at: number; value: Promise<Edge> }>();

export function edgeFor(leagueId: string): Promise<Edge> {
  const hit = memo.get(leagueId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = build(leagueId).catch(err => { memo.delete(leagueId); throw err; });
  memo.set(leagueId, { at: Date.now(), value });
  return value;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const percentileOf = (xs: number[], v: number) => (xs.length ? Math.round((xs.filter(x => x < v).length / xs.length) * 100) : 50);

async function build(leagueId: string): Promise<Edge> {
  const db = await ensureArchive();
  const api = await import('@/lib/api');
  const league = await api.getLeagueInfo(leagueId);
  const f = formatOf(league as never);
  const format = formatLabel(f);
  if (!db) return { ready: false, sampled: 0, format };
  const season = String(league.season);

  const [{ rows: sampledRows }, { rows: fmtRows }] = await Promise.all([
    db.query(`SELECT count(*)::int AS n FROM ${T('mkt_leagues')} WHERE season = $1`, [season]),
    db.query<{ fmt: string; week: number; leagues: number }>(`SELECT fmt, week, leagues FROM ${T('mkt_fmt_week')} WHERE season = $1`, [season]),
  ]);
  const sampled = Number(sampledRows[0]?.n ?? 0);

  // The closest group with enough leagues in its latest week.
  const fmts = [...new Set(fmtRows.map(r => r.fmt))];
  let field: Edge['field'] & { fmts: string[] } | undefined;
  for (const [i, rung] of comparisonLadder(f, fmts).entries()) {
    if (!rung.fmts.length) continue;
    const byWeek = new Map<number, number>();
    for (const r of fmtRows) if (rung.fmts.includes(r.fmt)) byWeek.set(r.week, (byWeek.get(r.week) ?? 0) + r.leagues);
    const week = Math.max(0, ...[...byWeek].filter(([, n]) => n >= MIN_LEAGUES).map(([w]) => w));
    if (week) { field = { label: rung.label, exact: i === 0, leagues: byWeek.get(week)!, week, season, fmts: rung.fmts }; break; }
  }
  if (!field) return { ready: false, sampled, format };
  const { week, fmts: group } = field;

  // The field's players this week, and who was traded for over the last three.
  const { rows } = await db.query(
    `SELECT player_id, week, rostered, started, start_pts, adds, drops, bids, bid_hist, traded_for
     FROM ${T('mkt_player_week')} WHERE season = $1 AND fmt = ANY($2) AND week BETWEEN $3 AND $4`,
    [season, group, week - 2, week],
  );
  const now = new Map<string, Agg>();
  const traded = new Map<string, number>();
  for (const r of rows) {
    traded.set(r.player_id, (traded.get(r.player_id) ?? 0) + Number(r.traded_for));
    if (Number(r.week) !== week) continue;
    const a = now.get(r.player_id) ?? { rostered: 0, started: 0, startPts: 0, adds: 0, drops: 0, bids: 0, hist: [0, 0, 0, 0, 0, 0, 0], tradedFor: 0 };
    a.rostered += Number(r.rostered); a.started += Number(r.started); a.startPts += Number(r.start_pts);
    a.adds += Number(r.adds); a.drops += Number(r.drops); a.bids += Number(r.bids);
    (r.bid_hist as number[]).forEach((v, i) => { a.hist[i] += Number(v); });
    now.set(r.player_id, a);
  }
  const leagues3 = Number((await db.query(
    `SELECT COALESCE(sum(leagues), 0)::int AS n FROM ${T('mkt_fmt_week')} WHERE season = $1 AND fmt = ANY($2) AND week BETWEEN $3 AND $4`,
    [season, group, week - 2, week])).rows[0]?.n ?? 0) || field.leagues;

  const [{ getPlayersDirectory }, rosters, users, matchups] = await Promise.all([
    import('@/lib/playerStats'),
    api.getLeagueRosters(leagueId).catch(() => [] as any[]),
    api.getLeagueUsers(leagueId).catch(() => [] as any[]),
    api.getLeagueMatchups(leagueId, week).catch(() => [] as any[]),
  ]);
  const dir = await getPlayersDirectory().catch(() => ({} as Record<string, any>));
  const who = (id: string): EdgePlayer | null => {
    const p = dir[id];
    if (!p) return null;
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
    return name ? { id, name, position: String(p.position ?? (/^[A-Z]{2,3}$/.test(id) ? 'DEF' : '')), team: String(p.team ?? '') } : null;
  };
  const L = field.leagues;
  const bids = (a: Agg) => (a.bids >= 3 ? { bid50: bidAt(a.hist, 0.5), bid75: bidAt(a.hist, 0.75) } : { bid50: null, bid75: null });

  // Waiver edge: players the field rosters and actually starts, unowned here. Ranked by starts,
  // not roster share: in deep dynasty leagues nearly everyone is rostered, and a stash nobody
  // starts is no edge.
  const owned = new Set<string>((rosters as any[]).flatMap(r => [...(r.players ?? []), ...(r.reserve ?? []), ...(r.taxi ?? [])]).map(String));
  const waiver: WaiverPick[] = [...now].filter(([id, a]) => !owned.has(id) && a.rostered / L >= 0.3 && a.started > 0)
    .sort((x, y) => y[1].started - x[1].started || y[1].rostered - x[1].rostered).slice(0, 30)
    .map(([id, a]) => { const p = who(id); return p ? { ...p, rosteredPct: pct(a.rostered, L), startPct: pct(a.started, L), ppgStarted: a.started ? Math.round((a.startPts / a.started) * 10) / 10 : null, ...bids(a) } : null; })
    .filter((x): x is WaiverPick => Boolean(x)).slice(0, 12);

  const top = (score: (a: Agg, id: string) => number, n: number, denom: number, extra?: (a: Agg) => Partial<Mover>) =>
    [...now].map(([id, a]) => [id, a, score(a, id)] as const).filter(([, , s]) => s > 0).sort((x, y) => y[2] - x[2]).slice(0, n * 2)
      .map(([id, a, s]) => { const p = who(id); return p ? { ...p, pct: pct(s, denom), ...(extra?.(a) ?? {}) } : null; })
      .filter((x): x is Mover => Boolean(x)).slice(0, n);
  const movers = {
    added: top(a => a.adds, 10, L, bids),
    dropped: top(a => a.drops, 8, L),
    tradedFor: top((_, id) => traded.get(id) ?? 0, 8, leagues3),
  };
  // Players traded for but not on any roster this week still count.
  if (movers.tradedFor.length < 8) {
    for (const [id, n] of [...traded].sort((a, b) => b[1] - a[1])) {
      if (movers.tradedFor.length >= 8 || movers.tradedFor.some(m => m.id === id) || !n) continue;
      const p = who(id); if (p) movers.tradedFor.push({ ...p, pct: pct(n, leagues3) });
    }
  }

  // Lineup calls against the field, last week, team by team.
  const nameOf = (rid: number) => {
    const owner = (rosters as any[]).find(r => r.roster_id === rid)?.owner_id;
    const u = (users as any[]).find(x => x.user_id === owner);
    return { name: u?.metadata?.team_name || u?.display_name || `Team ${rid}`, avatar: u?.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null };
  };
  const calls: TeamCalls[] = (String(league.season) === season ? (matchups as any[]) : []).map(m => {
    const starters = new Set<string>((m.starters ?? []).filter((x: string) => x && x !== '0'));
    const out: (Call & { gap: number })[] = [];
    for (const id of new Set<string>((m.players ?? []).map(String))) {
      const a = now.get(id);
      if (!a || a.rostered / L < 0.4) continue;
      const rate = a.started / a.rostered;
      const started = starters.has(id);
      const p = who(id);
      if (!p) continue;
      const points = Math.round(Number(m.players_points?.[id] ?? 0) * 10) / 10;
      if (!started && rate >= 0.7) out.push({ ...p, kind: 'benched', fieldStartPct: Math.round(rate * 100), points, gap: rate });
      if (started && rate <= 0.3) out.push({ ...p, kind: 'bold', fieldStartPct: Math.round(rate * 100), points, gap: 1 - rate });
    }
    return { rosterId: Number(m.roster_id), ...nameOf(Number(m.roster_id)), calls: out.sort((x, y) => y.gap - x.gap).slice(0, 4).map(({ gap: _g, ...c }) => c) };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // The league against the field, season so far.
  const vsField = await compare(db, leagueId, season, group, week, rosters as any[], league);

  return { ready: true, sampled, format, field: { label: field.label, exact: field.exact, leagues: field.leagues, week, season }, vsField, waiver, movers, calls };
}

async function compare(db: NonNullable<Awaited<ReturnType<typeof ensureArchive>>>, leagueId: string, season: string, group: string[], week: number, rosters: any[], league: any): Promise<Metric[]> {
  const api = await import('@/lib/api');
  const size = rosters.length || Number(league.total_rosters) || 1;
  const txs = (await Promise.all(Array.from({ length: week }, (_, i) => api.getLeagueTransactions(leagueId, i + 1).catch(() => [])))).flat() as any[];
  const done = txs.filter(t => t.status === 'complete');
  const myTrades = done.filter(t => t.type === 'trade').length / size;
  const myAdds = done.filter(t => t.type === 'waiver' || t.type === 'free_agent').reduce((s, t) => s + Object.keys(t.adds ?? {}).length, 0) / size;
  const pts = rosters.reduce((s, r) => s + Number(r.settings?.fpts ?? 0) + Number(r.settings?.fpts_decimal ?? 0) / 100, 0);
  const regular = Math.max(1, Math.min(week, Number(league.settings?.playoff_week_start ?? 15) - 1));
  const myPpg = pts / size / regular;

  // Leagues counted through the same week, so a season so far is compared with a season so far.
  const { rows } = await db.query(
    `SELECT size, trades, adds, team_weeks, pts_sum FROM ${T('mkt_leagues')}
     WHERE season = $1 AND fmt = ANY($2) AND ingested_week >= $3 AND league_id <> $4`,
    [season, group, week, leagueId],
  );
  const trades = rows.map(r => Number(r.trades) / Number(r.size));
  const adds = rows.map(r => Number(r.adds) / Number(r.size));
  const ppg = rows.filter(r => Number(r.team_weeks) > 0).map(r => Number(r.pts_sum) / Number(r.team_weeks));
  const metric = (id: string, label: string, mine: number, xs: number[], unit: string, higherIs: Metric['higherIs']): Metric =>
    ({ id, label, mine: Math.round(mine * 10) / 10, median: Math.round(median(xs) * 10) / 10, percentile: percentileOf(xs, mine), unit, higherIs });
  if (rows.length < MIN_LEAGUES) return [];
  return [
    metric('trades', 'Trades per team', myTrades, trades, 'trades', 'busier'),
    metric('adds', 'Waiver and free agent adds per team', myAdds, adds, 'adds', 'busier'),
    metric('ppg', 'Points per team, per week', myPpg, ppg, 'pts', 'better'),
  ];
}
