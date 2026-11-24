/**
 * The Edge's research dataset for one league: every fantasy-relevant player's season, scored the
 * way this league scores, with who owns him here. Server only.
 *
 *   The games      every final week's stat lines (Sleeper's, from Sportradar), each with the team
 *                  the player was on that week and who they played, so a traded player's games
 *                  count against the right defenses. Scored with the league's own settings.
 *   Usage          shares of his team's snaps, targets, carries and air yards that week, from the
 *                  same lines (his number over his team's total).
 *   Matchups       what each defense has given up to each position a game, in this league's
 *                  scoring, ranked. A fantasy defense's "defense" is the offense it faced.
 *   This week      Sleeper's projections for the week being set, in the league's scoring, and
 *                  each team's opponents from here on (the NFL schedule).
 *   The league     who rosters and starts each player here, and each team's record.
 *   The field      where the site has a market (lib/market), how leagues like this one value him.
 *
 * A final week never changes, so its lines are fetched once a server and kept; the dataset is
 * kept half an hour per league. Nothing is estimated: a player with no stat line has no game.
 */

import 'server-only';
import { scoreStatLine, scoringLabel, type ScoringSettings } from '@/lib/scoring';
import { eligible, POSITIONS, type Allowed, type Game, type Player, type Pos, type Research, type TeamInfo } from './metrics';

const STATS = 'https://api.sleeper.com/stats/nfl';
const TTL_MS = 30 * 60_000;
/** Players kept beyond those on the league's rosters: the season's best scorers at each position. */
const KEEP: Record<Pos, number> = { QB: 45, RB: 110, WR: 140, TE: 60, K: 36, DEF: 32 };

interface Row { id: string; pos: Pos; team: string; opp: string; stats: Record<string, number> }

const weekMemo = new Map<string, Promise<Row[]>>();

/** One final week's stat lines. Kept for the life of the server: a final week doesn't change. */
function weekRows(season: string, week: number): Promise<Row[]> {
  const key = `${season}:${week}`;
  const hit = weekMemo.get(key);
  if (hit) return hit;
  const qs = new URLSearchParams({ season_type: 'regular' });
  for (const p of POSITIONS) qs.append('position[]', p);
  const p = fetch(`${STATS}/${season}/${week}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`stats ${r.status}`))))
    .then((rows: any[]) => (Array.isArray(rows) ? rows : []).flatMap((r): Row[] => {
      const pos = r?.player?.position as Pos;
      if (!r?.player_id || !POSITIONS.includes(pos) || !r.team || !r.opponent || !r.stats) return [];
      return [{ id: String(r.player_id), pos, team: String(r.team), opp: String(r.opponent), stats: r.stats }];
    }));
  weekMemo.set(key, p);
  // A failed read, or a week with nothing in it yet, is asked for again next time.
  p.then(rows => { if (rows.length < 100) weekMemo.delete(key); }, () => weekMemo.delete(key));
  return p;
}

const memo = new Map<string, { at: number; value: Promise<Research> }>();

export function researchFor(leagueId: string): Promise<Research> {
  const hit = memo.get(leagueId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = build(leagueId).catch(err => { memo.delete(leagueId); throw err; });
  memo.set(leagueId, { at: Date.now(), value });
  return value;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

async function build(leagueId: string): Promise<Research> {
  const [api, { getPlayersDirectory }, sched, { weeklyProjections }] = await Promise.all([
    import('@/lib/api'), import('@/lib/playerStats'), import('@/lib/nflSchedule'), import('@/lib/sim/weeklyProjections'),
  ]);
  const [league, state, rosters, users, dir] = await Promise.all([
    api.getLeagueInfo(leagueId) as Promise<any>,
    api.getNFLState().catch(() => null as any),
    api.getLeagueRosters(leagueId).catch(() => [] as any[]),
    api.getLeagueUsers(leagueId).catch(() => [] as any[]),
    getPlayersDirectory().catch(() => ({} as Record<string, any>)),
  ]);
  const season = String(league.season);
  const current = String(state?.season ?? season) === season;
  const scoring: ScoringSettings | null = league.scoring_settings ?? null;
  const slots: string[] = (league.roster_positions ?? []).filter((s: string) => eligible(s).length > 0);
  const nflWeek = current ? Math.min(18, Math.max(1, Number(state?.week ?? 1))) : 18;
  const through = await sched.lastCompletedWeek(season, nflWeek, current).catch(() => 0);
  // The week being set: the next one, unless most of its games have already kicked off.
  let week = Math.min(18, through + 1);
  const started = (g: { status: string }) => g.status !== 'pre_game';
  let weekGames = await sched.weekGames(season, week, current).catch(() => []);
  if (week < 18 && weekGames.length && weekGames.filter(g => !started(g)).length < weekGames.length / 2) {
    week += 1;
    weekGames = await sched.weekGames(season, week, current).catch(() => []);
  }
  const locked = [...new Set(weekGames.filter(started).flatMap(g => [g.home, g.away]))];

  // The week's dates. Kickoff times are ESPN's (Sleeper's schedule has the day only); ESPN writes
  // Washington as WSH.
  const { espnScoreboardWeek } = await import('@/lib/live/espn');
  const fromEspn = (a: string) => (a === 'WSH' ? 'WAS' : a);
  const kickoffs = (await espnScoreboardWeek(season, week).catch(() => []))
    .filter(g => g.kickoff && Number.isFinite(Date.parse(g.kickoff)))
    .map(g => ({ at: new Date(g.kickoff).toISOString(), home: fromEspn(g.home.abbr), away: fromEspn(g.away.abbr) }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const ls = league.settings ?? {};
  const waiverDays: number[] = Array.isArray(ls.waiver_days) ? ls.waiver_days
    // Sleeper's weekly waiver day is a number whose first day isn't documented: left out, not guessed.
    : ls.daily_waivers === 1 ? [0, 1, 2, 3, 4, 5, 6] : [];
  const deadlineWeek = Number(ls.trade_deadline);
  const calendar: Research['calendar'] = {
    games: kickoffs,
    byes: [],
    waiverDays,
    faab: Number(ls.waiver_budget) > 0 ? Number(ls.waiver_budget) : null,
    tradeDeadline: ls.trade_deadline_at ? { at: new Date(Number(ls.trade_deadline_at)).toISOString() }
      : deadlineWeek > 0 && deadlineWeek < 30 ? { afterWeek: deadlineWeek } : null,
    playoffStart: Number(ls.playoff_week_start) > 0 ? Number(ls.playoff_week_start) : null,
  };

  // Every final week's lines, a few at a time.
  const weeks = Array.from({ length: through }, (_, i) => i + 1);
  const byWeek = new Map<number, Row[]>();
  const queue = [...weeks];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (;;) { const w = queue.shift(); if (w === undefined) return; byWeek.set(w, await weekRows(season, w).catch(() => [])); }
  }));

  const games = new Map<string, Game[]>();
  const posOf = new Map<string, Pos>();
  const allowed = new Map<string, Map<Pos, { pts: number; weeks: Set<number> }>>();
  for (const w of weeks) {
    const rows = (byWeek.get(w) ?? []).filter(r => r.pos === 'DEF' || num(r.stats.gp) >= 1 || num(r.stats.off_snp) > 0);
    // Each team's totals that week, for the shares.
    const team = new Map<string, { tgt: number; car: number; air: number }>();
    for (const r of rows) {
      if (r.pos === 'DEF' || r.pos === 'K') continue;
      const t = team.get(r.team) ?? { tgt: 0, car: 0, air: 0 };
      t.tgt += num(r.stats.rec_tgt); t.car += num(r.stats.rush_att); t.air += Math.max(0, num(r.stats.rec_air_yd));
      team.set(r.team, t);
    }
    const scored = rows.map(r => ({ r, pts: scoreStatLine(r.stats, scoring) })).filter((x): x is { r: Row; pts: number } => x.pts !== null);
    // Where each finished at his position that week.
    const rank = new Map<string, number>();
    for (const pos of POSITIONS) scored.filter(x => x.r.pos === pos).sort((a, b) => b.pts - a.pts).forEach((x, i) => rank.set(x.r.id, i + 1));
    for (const { r, pts } of scored) {
      const s = r.stats, t = team.get(r.team);
      const g: Game = { w, tm: r.team, opp: r.opp, pts: r1(pts), rk: rank.get(r.id) ?? 99 };
      if (r.pos !== 'DEF' && r.pos !== 'K') {
        if (num(s.tm_off_snp) > 0) g.snp = r3(num(s.off_snp) / num(s.tm_off_snp));
        if (num(s.rec_tgt) > 0 || r.pos !== 'QB') {
          g.tgt = num(s.rec_tgt); g.rec = num(s.rec); g.recYd = num(s.rec_yd);
          if (t && t.tgt > 0) g.tgtSh = r3(num(s.rec_tgt) / t.tgt);
          if (num(s.rec_air_yd)) { g.air = Math.round(num(s.rec_air_yd)); if (t && t.air > 0) g.airSh = r3(Math.max(0, num(s.rec_air_yd)) / t.air); }
        }
        if (num(s.rush_att) > 0 || r.pos === 'RB') {
          g.car = num(s.rush_att); g.rushYd = num(s.rush_yd);
          if (t && t.car > 0) g.carSh = r3(num(s.rush_att) / t.car);
        }
        const rz = num(s.rec_rz_tgt) + num(s.rush_rz_att) + (r.pos === 'QB' ? num(s.pass_rz_att) : 0);
        if (rz) g.rz = rz;
        const td = num(s.rush_td) + num(s.rec_td) + num(s.pass_td);
        if (td) g.td = td;
        if (r.pos === 'QB' || num(s.pass_att) >= 5) { g.passAtt = num(s.pass_att); g.passYd = num(s.pass_yd); g.passTd = num(s.pass_td); g.int = num(s.pass_int); }
      }
      games.set(r.id, [...(games.get(r.id) ?? []), g]);
      posOf.set(r.id, r.pos);
      const d = allowed.get(r.opp) ?? new Map<Pos, { pts: number; weeks: Set<number> }>();
      const a = d.get(r.pos) ?? { pts: 0, weeks: new Set<number>() };
      a.pts += pts; a.weeks.add(w); d.set(r.pos, a); allowed.set(r.opp, d);
    }
  }

  // What each defense gives up to each position, a game, ranked (1 gives up the most).
  const dvp: Research['dvp'] = {};
  for (const pos of POSITIONS) {
    const list = [...allowed].map(([def, m]) => ({ def, a: m.get(pos) })).filter((x): x is { def: string; a: { pts: number; weeks: Set<number> } } => Boolean(x.a?.weeks.size))
      .map(x => ({ def: x.def, ppg: x.a.pts / x.a.weeks.size, games: x.a.weeks.size })).sort((a, b) => b.ppg - a.ppg);
    list.forEach((x, i) => { (dvp[x.def] ??= {})[pos] = { ppg: r1(x.ppg), rank: i + 1, games: x.games } satisfies Allowed; });
  }

  // The league: who's on which roster, and in its lineup.
  const owner = new Map<string, number>(), starting = new Set<string>();
  for (const r of rosters as any[]) {
    for (const id of [...(r.players ?? []), ...(r.reserve ?? []), ...(r.taxi ?? [])]) owner.set(String(id), Number(r.roster_id));
    for (const id of r.starters ?? []) if (id && id !== '0') starting.add(String(id));
  }
  const userById = new Map<string, any>((users as any[]).map(u => [u.user_id, u]));
  const { teamAvatar } = await import('@/lib/teamAvatar');
  const teams: TeamInfo[] = (rosters as any[]).map(r => {
    const u = userById.get(r.owner_id);
    return {
      rosterId: Number(r.roster_id), userId: String(r.owner_id ?? ''),
      name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`, avatar: teamAvatar(u),
      wins: num(r.settings?.wins), losses: num(r.settings?.losses), ties: num(r.settings?.ties),
      pf: r1(num(r.settings?.fpts) + num(r.settings?.fpts_decimal) / 100),
    };
  });

  // The pool: everyone on a roster here, and the season's best at each position.
  const total = (id: string) => (games.get(id) ?? []).reduce((s, g) => s + g.pts, 0);
  const keep = new Set<string>(owner.keys());
  for (const pos of POSITIONS) {
    [...posOf].filter(([, p]) => p === pos).map(([id]) => id).sort((a, b) => total(b) - total(a)).slice(0, KEEP[pos]).forEach(id => keep.add(id));
  }

  const [proj, schedule, market, matchups] = await Promise.all([
    through < 18 ? weeklyProjections(season, week, POSITIONS, scoring).catch(() => new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
    sched.seasonSchedule(season, current).catch(() => []),
    import('@/lib/market/players').then(m => m.fieldPlayers(league)).catch(() => null),
    api.getLeagueMatchups(leagueId, week).catch(() => [] as any[]),
  ]);
  const pairs = new Map<number, number[]>();
  for (const m of matchups as any[]) if (m.matchup_id != null) pairs.set(m.matchup_id, [...(pairs.get(m.matchup_id) ?? []), Number(m.roster_id)]);
  const fixtures = [...pairs.values()].filter(p => p.length === 2) as [number, number][];
  // The field's favourites nobody here owns belong in the pool too.
  if (market) for (const [id, m] of market.players) if (m.rostered >= 25 || m.adds >= 5) keep.add(id);

  const players: Player[] = [];
  for (const id of keep) {
    const d = dir[id];
    const pos = (posOf.get(id) ?? d?.position) as Pos;
    if (!POSITIONS.includes(pos)) continue;
    const name = d?.full_name || [d?.first_name, d?.last_name].filter(Boolean).join(' ');
    if (!name) continue;
    const gs = games.get(id) ?? [];
    const p: Player = {
      id, name, pos, team: String(d?.team ?? gs.at(-1)?.tm ?? ''),
      owner: owner.get(id) ?? null, games: gs,
      proj: proj.has(id) ? r1(proj.get(id)!) : null,
    };
    if (starting.has(id)) p.starting = true;
    if (d?.injury_status) p.inj = String(d.injury_status);
    if (typeof d?.years_exp === 'number') p.exp = d.years_exp;
    const m = market?.players.get(id);
    if (m) p.mkt = m;
    players.push(p);
  }

  // Each team's opponents from the week being set on.
  const sched2: Research['schedule'] = {};
  const nflTeams = new Set<string>();
  for (const g of schedule as any[]) { if (g.home) nflTeams.add(g.home); if (g.away) nflTeams.add(g.away); }
  for (let w = week; w <= 18; w++) {
    const gs = (schedule as any[]).filter(g => Number(g.week) === w);
    if (!gs.length) continue;
    for (const t of nflTeams) {
      const g = gs.find(x => x.home === t || x.away === t);
      (sched2[t] ??= []).push({ w, opp: g ? (g.home === t ? g.away : g.home) : null, home: g ? g.home === t : false });
    }
  }

  calendar.byes = Object.entries(sched2).filter(([, gs]) => gs.find(g => g.w === week)?.opp === null).map(([t]) => t).sort();

  return {
    season, through, week, calendar, scoring: scoringLabel(scoring), slots, teams, fixtures, locked,
    players: players.sort((a, b) => total(b.id) - total(a.id)),
    dvp, schedule: sched2, field: market?.field ?? null,
  };
}
