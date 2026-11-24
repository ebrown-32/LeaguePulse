/**
 * The Edge: what the market (lib/market/crawl) says about one league, from leagues like it.
 *
 *   field      the closest group of sampled leagues with enough of them: the league's own format,
 *              widening to the same kind and quarterbacks, the same kind, then every league
 *   vsField    the league against the field: trading, waiver activity and scoring, as percentiles
 *   waiver     players most leagues like this one roster, sitting unowned in this one
 *   movers     the week's most added (with what it took to win them), dropped and traded for
 *   calls      each team's lineup calls last week that went against the field, and how they went
 *   lineups    whose share of the field's lineups rose and fell most since the week before
 *   stashes    whose share of the field's rosters has grown most over two weeks
 *   hits       last week's big games from players most of the field left on the bench
 *   draft      the draft's steals and busts: where the field drafted a player against where he
 *              ranks in points (redraft and keeper fields; a dynasty startup is years old)
 *   trades     recent real trades from the field, as their sides: players, picks and budget
 *   sample     which formats the market's leagues are, so "the field" is never a black box
 *
 * Every player in these carries `here`: who has him in this league, or that he's a free agent.
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

export interface EdgePlayer { id: string; name: string; position: string; team: string; /** Who rosters him in this league; null for a free agent. */ here?: string | null }
/** A share of the field now against before, in percent. */
export interface Shift extends EdgePlayer { now: number; was: number }
export interface Hit extends EdgePlayer { startPct: number; points: number }
export interface DraftValue extends EdgePlayer { adp: number; adpRank: number; ptsRank: number; points: number }
export interface FieldTrade { week: number; sides: { players: EdgePlayer[]; picks: string[]; faab: number }[] }
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
  lineups?: { risers: Shift[]; fallers: Shift[] };
  stashes?: Shift[];
  hits?: Hit[];
  draft?: { steals: DraftValue[]; busts: DraftValue[]; drafts: number } | null;
  trades?: FieldTrade[];
  sample?: { label: string; leagues: number; yours: boolean }[];
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
  let field: Edge['field'] & { fmts: string[]; byWeek: Map<number, number> } | undefined;
  for (const [i, rung] of comparisonLadder(f, fmts).entries()) {
    if (!rung.fmts.length) continue;
    const byWeek = new Map<number, number>();
    for (const r of fmtRows) if (rung.fmts.includes(r.fmt)) byWeek.set(r.week, (byWeek.get(r.week) ?? 0) + r.leagues);
    const week = Math.max(0, ...[...byWeek].filter(([, n]) => n >= MIN_LEAGUES).map(([w]) => w));
    if (week) { field = { label: rung.label, exact: i === 0, leagues: byWeek.get(week)!, week, season, fmts: rung.fmts, byWeek }; break; }
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
  /** Rostered and started counts the week before, and two weeks before. */
  const prev = new Map<string, { r: number; s: number }>(), prev2 = new Map<string, { r: number; s: number }>();
  for (const r of rows) {
    traded.set(r.player_id, (traded.get(r.player_id) ?? 0) + Number(r.traded_for));
    if (Number(r.week) !== week) {
      const m = Number(r.week) === week - 1 ? prev : prev2;
      const x = m.get(r.player_id) ?? { r: 0, s: 0 };
      x.r += Number(r.rostered); x.s += Number(r.started); m.set(r.player_id, x);
      continue;
    }
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
  // Who has each player in this league, for "is he available here".
  const hereOf = new Map<string, string>();
  for (const r of rosters as any[]) {
    const u = (users as any[]).find(x => x.user_id === r.owner_id);
    const teamName = u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`;
    for (const id of [...(r.players ?? []), ...(r.reserve ?? []), ...(r.taxi ?? [])]) hereOf.set(String(id), teamName);
  }
  const who = (id: string): EdgePlayer | null => {
    const p = dir[id];
    if (!p) return null;
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
    return name ? { id, name, position: String(p.position ?? (/^[A-Z]{2,3}$/.test(id) ? 'DEF' : '')), team: String(p.team ?? ''), here: hereOf.get(id) ?? null } : null;
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

  // Lineups and rosters on the move: this week's share of the field against earlier weeks'.
  const L1 = field.byWeek.get(week - 1) ?? 0, L2 = field.byWeek.get(week - 2) ?? 0;
  const shifts = (m: Map<string, { r: number; s: number }>, Lp: number, k: 'r' | 's', min: number): Shift[] => {
    if (Lp < MIN_LEAGUES) return [];
    const out: Shift[] = [];
    for (const [id, a] of now) {
      const nowPct = pct(k === 's' ? a.started : a.rostered, L), wasPct = pct(m.get(id)?.[k] ?? 0, Lp);
      if (Math.max(nowPct, wasPct) < min) continue;
      const p = who(id); if (p) out.push({ ...p, now: nowPct, was: wasPct });
    }
    // Players who were in lineups before and aren't on a roster at all this week.
    for (const [id, x] of m) if (!now.has(id) && pct(x[k], Lp) >= min) { const p = who(id); if (p) out.push({ ...p, now: 0, was: pct(x[k], Lp) }); }
    return out;
  };
  // A player back from a bye, or on one, hasn't won or lost a role: only teams that played both weeks count.
  const sched = await import('@/lib/nflSchedule');
  const [gamesNow, gamesPrev] = await Promise.all([sched.weekGames(season, week).catch(() => []), sched.weekGames(season, week - 1).catch(() => [])]);
  const played = (gs: { home: string; away: string }[]) => new Set(gs.flatMap(g => [g.home, g.away]));
  const both = new Set([...played(gamesNow)].filter(t => played(gamesPrev).has(t)));
  const started = gamesNow.length && gamesPrev.length ? shifts(prev, L1, 's', 10).filter(x => both.has(x.team)) : [];
  const lineups = {
    risers: [...started].sort((a, b) => (b.now - b.was) - (a.now - a.was)).filter(x => x.now - x.was >= 3).slice(0, 8),
    fallers: [...started].sort((a, b) => (a.now - a.was) - (b.now - b.was)).filter(x => x.was - x.now >= 3).slice(0, 8),
  };
  const stashes = shifts(prev2, L2, 'r', 8).sort((a, b) => (b.now - b.was) - (a.now - a.was)).filter(x => x.now - x.was >= 3).slice(0, 8);

  // Big games most of the field sat: started in under a third of leagues, by enough to mean it.
  const hits: Hit[] = [...now].filter(([, a]) => a.started >= 3 && a.started / L < 0.33 && a.startPts / a.started >= 15)
    .sort((x, y) => y[1].startPts / y[1].started - x[1].startPts / x[1].started).slice(0, 16)
    .map(([id, a]) => { const p = who(id); return p ? { ...p, startPct: pct(a.started, L), points: Math.round((a.startPts / a.started) * 10) / 10 } : null; })
    .filter((x): x is Hit => Boolean(x)).slice(0, 8);

  const [draft, trades] = await Promise.all([
    draftValues(db, season, group, f, who).catch(() => null),
    fieldTrades(db, season, group, week, who).catch(() => [] as FieldTrade[]),
  ]);

  // What the market is made of, this week: its biggest formats, and which are this league's field.
  const { parseFormat } = await import('./format');
  const sample = fmtRows.filter(r => Number(r.week) === week).sort((a, b) => Number(b.leagues) - Number(a.leagues)).slice(0, 8)
    .map(r => { const pf = parseFormat(r.fmt); return pf ? { label: formatLabel(pf), leagues: Number(r.leagues), yours: group.includes(r.fmt) } : null; })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return {
    ready: true, sampled, format, field: { label: field.label, exact: field.exact, leagues: field.leagues, week, season },
    vsField, waiver, movers, calls, lineups, stashes, hits, draft, trades, sample,
  };
}

type Db = NonNullable<Awaited<ReturnType<typeof ensureArchive>>>;

/**
 * The draft against the season: every player the field drafted often enough, ranked by where he
 * went and by the points he's scored since (Sleeper's season totals, in the field's scoring).
 * A steal went late and ranks high; a bust went in the first five rounds and doesn't.
 */
async function draftValues(db: Db, season: string, group: string[], f: ReturnType<typeof formatOf>, who: (id: string) => EdgePlayer | null): Promise<Edge['draft']> {
  if (f.kind === 'dynasty') return null;
  const { rows } = await db.query<{ player_id: string; picks: string; pick_sum: string }>(
    `SELECT player_id, sum(picks) AS picks, sum(pick_sum) AS pick_sum FROM ${T('mkt_adp')}
     WHERE season = $1 AND fmt = ANY($2) AND kind = $3 GROUP BY player_id`, [season, group, f.kind]);
  const drafts = Math.max(0, ...rows.map(r => Number(r.picks)));
  if (drafts < MIN_LEAGUES) return null;
  const { getSeasonStats } = await import('@/lib/playerStats');
  const stats = await getSeasonStats(season);
  const key = f.scoring === 'ppr' ? 'pts_ppr' : f.scoring === 'half' ? 'pts_half_ppr' : f.scoring === 'std' ? 'pts_std' : 'pts_ppr';
  // Drafted in at least a third of the field's drafts, so an average pick means something.
  const list = rows.filter(r => Number(r.picks) >= drafts / 3).map(r => ({ id: r.player_id, adp: Number(r.pick_sum) / Number(r.picks), points: Number(stats[r.player_id]?.[key] ?? 0) }));
  [...list].sort((a, b) => a.adp - b.adp).forEach((x, i) => { (x as any).adpRank = i + 1; });
  [...list].sort((a, b) => b.points - a.points).forEach((x, i) => { (x as any).ptsRank = i + 1; });
  const full = list as (typeof list[number] & { adpRank: number; ptsRank: number })[];
  const named = (xs: typeof full): DraftValue[] => xs.map(x => { const p = who(x.id); return p ? { ...p, adp: Math.round(x.adp * 10) / 10, adpRank: x.adpRank, ptsRank: x.ptsRank, points: Math.round(x.points * 10) / 10 } : null; }).filter((x): x is DraftValue => Boolean(x));
  return {
    drafts,
    steals: named(full.filter(x => x.ptsRank <= 60 && x.adpRank - x.ptsRank >= 20).sort((a, b) => (b.adpRank - b.ptsRank) - (a.adpRank - a.ptsRank)).slice(0, 12)).slice(0, 8),
    busts: named(full.filter(x => x.adpRank <= 60 && x.ptsRank - x.adpRank >= 20).sort((a, b) => (b.ptsRank - b.adpRank) - (a.ptsRank - a.adpRank)).slice(0, 12)).slice(0, 8),
  };
}

const ROUND = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

/** Recent two-team trades from the field with something named on both sides, newest first; ones with a player this league rosters come first. */
async function fieldTrades(db: Db, season: string, group: string[], week: number, who: (id: string) => EdgePlayer | null): Promise<FieldTrade[]> {
  const { rows } = await db.query<{ week: number; sides: { players: string[]; picks: { season: string; round: number }[]; faab: number }[] }>(
    `SELECT week, sides FROM ${T('mkt_trades')} WHERE season = $1 AND fmt = ANY($2) AND teams = 2 AND week BETWEEN $3 AND $4
     ORDER BY made_at DESC NULLS LAST LIMIT 120`, [season, group, week - 2, week]);
  const out: (FieldTrade & { local: boolean })[] = [];
  for (const r of rows) {
    const sides = (r.sides ?? []).map(s => ({
      players: (s.players ?? []).map(who).filter((x): x is EdgePlayer => Boolean(x)),
      picks: (s.picks ?? []).map(p => `${p.season} ${ROUND[p.round - 1] ?? `round ${p.round}`}`),
      faab: Number(s.faab) || 0,
    }));
    if (sides.length !== 2 || sides.some(s => !s.players.length && !s.picks.length)) continue;
    if (!sides.some(s => s.players.length)) continue;
    out.push({ week: Number(r.week), sides, local: sides.some(s => s.players.some(p => p.here)) });
  }
  return out.sort((a, b) => Number(b.local) - Number(a.local)).slice(0, 8).map(({ local: _l, ...t }) => t);
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
    `SELECT size, trades, adds, team_weeks, pts_sum, pts_sq FROM ${T('mkt_leagues')}
     WHERE season = $1 AND fmt = ANY($2) AND ingested_week >= $3 AND league_id <> $4`,
    [season, group, week, leagueId],
  );
  const trades = rows.map(r => Number(r.trades) / Number(r.size));
  const adds = rows.map(r => Number(r.adds) / Number(r.size));
  const ppg = rows.filter(r => Number(r.team_weeks) > 0).map(r => Number(r.pts_sum) / Number(r.team_weeks));
  // How far a team's week strays from the league's average, in points: the spread of its scores.
  const spreadOf = (n: number, sum: number, sq: number) => (n > 1 ? Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) : 0);
  const myWeeks = (await Promise.all(Array.from({ length: regular }, (_, i) => api.getLeagueMatchups(leagueId, i + 1).catch(() => [] as any[])))).flat()
    .map((m: any) => Number(m.points ?? 0)).filter(x => x > 0);
  const mySpread = spreadOf(myWeeks.length, myWeeks.reduce((a, b) => a + b, 0), myWeeks.reduce((a, b) => a + b * b, 0));
  const spreads = rows.filter(r => Number(r.team_weeks) > 1).map(r => spreadOf(Number(r.team_weeks), Number(r.pts_sum), Number(r.pts_sq)));
  // The league's points a week from its own weekly scores (the season total over the field's weeks overstates it when the field is a week or two behind).
  const myPpgWeeks = myWeeks.length ? myWeeks.reduce((a, b) => a + b, 0) / myWeeks.length : myPpg;
  const metric = (id: string, label: string, mine: number, xs: number[], unit: string, higherIs: Metric['higherIs']): Metric =>
    ({ id, label, mine: Math.round(mine * 10) / 10, median: Math.round(median(xs) * 10) / 10, percentile: percentileOf(xs, mine), unit, higherIs });
  if (rows.length < MIN_LEAGUES) return [];
  return [
    metric('trades', 'Trades per team', myTrades, trades, 'trades', 'busier'),
    metric('adds', 'Waiver and free agent adds per team', myAdds, adds, 'adds', 'busier'),
    metric('ppg', 'Points per team, per week', myPpgWeeks, ppg, 'pts', 'better'),
    ...(mySpread > 0 && spreads.length >= MIN_LEAGUES ? [metric('spread', 'Swing in a team\'s score, week to week', mySpread, spreads, 'pts', 'better')] : []),
  ];
}
