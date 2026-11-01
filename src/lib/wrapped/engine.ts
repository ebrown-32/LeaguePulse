/**
 * League Wrapped: a season (or a league's whole history) told as a story for every manager, and
 * one for the league. Everything is computed from the league archive's rows (lib/wrapped/load), so
 * Sleeper and ESPN leagues get the same story, and any season works as well as the last.
 *
 *   Games      two teams sharing a matchup that week, as every page counts them
 *   Luck       actual regular-season wins against all-play: how many a team would expect to win
 *              if it played every other team every week. The gap is what the schedule gave or took
 *   Bench      the best legal lineup each week (metrics/optimalLineup) against the one started
 *   Trades     each side's players, judged by the points they went on to score in the lineups of
 *              the team that got them, for the rest of that season
 *
 * Pure: no I/O, so the tests can feed it a league and check every story.
 */

import { canFill, optimalLineup, startingSlots, type LineupPlayer } from '../metrics/optimalLineup.ts';
import type { LeagueFacts, ManagerFacts } from './facts.ts';

// ── What goes in ────────────────────────────────────────────────────────────

export interface WrapSeasonRow { season_id: string; season: number; settings: any; roster_positions: string[] | null; final: boolean }
export interface WrapTeamRow { season_id: string; roster_id: number; owner_id: string | null; team_name: string | null; avatar: string | null; wins: number | null; losses: number | null; ties: number | null; points_for: number | string | null; final_rank: number | null }
export interface WrapMatchupRow { season_id: string; week: number; roster_id: number; matchup_id: number | null; points: number | string | null; starters: string[] | null; players: string[] | null; players_points: Record<string, number> | null }
export interface WrapTransactionRow { season_id: string; week: number | null; type: string | null; status: string | null; roster_ids: number[] | null; adds: Record<string, number> | null; drops: Record<string, number> | null; faab_bid: number | null }
export interface WrapPickRow { season_id: string; round: number | null; pick_no: number; roster_id: number | null; player_id: string | null }
export interface WrapInput {
  seasons: WrapSeasonRow[];
  managers: { user_id: string; display_name: string | null }[];
  teams: WrapTeamRow[];
  matchups: WrapMatchupRow[];
  transactions: WrapTransactionRow[];
  picks: WrapPickRow[];
  players: { player_id: string; full_name: string | null; position: string | null; team: string | null }[];
}

// ── What comes out ──────────────────────────────────────────────────────────

export interface PlayerRef { id: string; name: string; position: string | null; team: string | null }
export interface Game { season: number; week: number; pts: number; opp: number; oppId: string; oppName: string; result: 'W' | 'L' | 'T'; margin: number; box?: BoxScore | null; stage?: 'playoffs' | 'consolation' | null }
export interface TradeVerdict { season: number; week: number; got: PlayerRef[]; gave: PlayerRef[]; gotPts: number; gavePts: number; net: number; partner: string }

export interface ManagerWrap {
  ownerId: string;
  name: string;
  team: string;
  avatar: string | null;
  seasons: number[];
  games: number;
  record: { w: number; l: number; t: number };
  pf: number;
  pfRank: number;
  /** Season: where the team finished (1 is the champion). All-time: titles and finals. */
  finish: number | null;
  titles: number;
  finals: number;
  best: Game | null;
  worst: Game | null;
  closestLoss: Game | null;
  biggestWin: Game | null;
  luckiestWin: Game | null;
  robbed: Game | null;
  luck: { actual: number; expected: number; delta: number; allPlayW: number; allPlayL: number } | null;
  bench: { efficiency: number; left: number; worst: { season: number; week: number; benched: PlayerRef; benchedPts: number; started: PlayerRef; startedPts: number } | null } | null;
  mvp: { player: PlayerRef; pts: number; share: number; starts: number } | null;
  steal: { player: PlayerRef; season: number; round: number; pick: number; pts: number } | null;
  bust: { player: PlayerRef; season: number; round: number; pick: number; pts: number } | null;
  pickup: { player: PlayerRef; season: number; week: number; pts: number; bid: number | null } | null;
  bestTrade: TradeVerdict | null;
  worstTrade: TradeVerdict | null;
  moves: { adds: number; trades: number; addsRank: number; tradesRank: number };
  nemesis: { id: string; name: string; w: number; l: number } | null;
  victim: { id: string; name: string; w: number; l: number } | null;
  topWeeks: number;
  volatility: number;
  /** Season by season, for all-time: record, points and finish. */
  history: { season: number; w: number; l: number; t: number; pf: number; finish: number | null }[];
  archetype: Archetype;
  /** What the History, Rivalries and Next Gen pages say about them (lib/wrapped/facts), when known. */
  facts?: ManagerFacts;
}

export interface Archetype { id: string; title: string; why: string }
type BenchWorst = NonNullable<ManagerWrap['bench']>['worst'];

export interface LeagueWrap {
  seasons: number[];
  managers: number;
  games: number;
  points: number;
  trades: number;
  adds: number;
  champions: { season: number; ownerId: string; name: string; team: string; record: string }[];
  best: (Game & { ownerId: string; name: string }) | null;
  blowout: (Game & { ownerId: string; name: string }) | null;
  closest: (Game & { ownerId: string; name: string }) | null;
  luckiest: { ownerId: string; name: string; delta: number } | null;
  unluckiest: { ownerId: string; name: string; delta: number } | null;
  tradeOfTheYear: (TradeVerdict & { ownerId: string; name: string }) | null;
  busiest: { ownerId: string; name: string; moves: number } | null;
  mvp: { player: PlayerRef; ownerId: string; name: string; pts: number } | null;
  facts?: LeagueFacts;
}

export interface Wrapped { scope: 'season' | 'all'; season: number | null; inProgress: boolean; league: LeagueWrap; managers: ManagerWrap[] }

// ── The work ────────────────────────────────────────────────────────────────

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Titles and finishes as the History page decides them (lib/wrapped/facts). When given, they win
 * over the archive's own: the archive only knows a finish where the provider's bracket filled it in.
 */
export interface Standing { champions: { season: number; ownerId: string }[]; runnerUps: { season: number; ownerId: string }[]; finishes: Record<string, Record<number, number>> }

export function computeWrapped(input: WrapInput, season: number | null, standing?: Standing): Wrapped {
  const seasons = input.seasons.filter(s => season === null || s.season === season).sort((a, b) => a.season - b.season);
  const seasonOf = new Map(seasons.map(s => [s.season_id, s]));
  /** Where an owner finished a season: the History page's place if known, else the archive's. */
  const finishOf = (owner: string, t: WrapTeamRow) => {
    const yr = seasonOf.get(t.season_id)!.season;
    if (standing) {
      if (standing.champions.some(c => c.ownerId === owner && c.season === yr)) return 1;
      if (standing.runnerUps.some(c => c.ownerId === owner && c.season === yr)) return 2;
      return standing.finishes[owner]?.[yr] ?? t.final_rank ?? null;
    }
    return t.final_rank ?? null;
  };
  const nameOfUser = new Map(input.managers.map(m => [m.user_id, m.display_name ?? '']));
  const players = new Map(input.players.map(p => [p.player_id, p]));
  const ref = (id: string): PlayerRef => {
    const p = players.get(id);
    const def = /^[A-Z]{2,3}$/.test(id);
    return { id, name: p?.full_name || (def ? `${id} Defense` : `Player ${id}`), position: p?.position ?? (def ? 'DEF' : null), team: p?.team ?? (def ? id : null) };
  };

  // Who each roster is, every season: its owner carries the story across seasons.
  const teamBy = new Map<string, WrapTeamRow>();
  for (const t of input.teams) if (seasonOf.has(t.season_id)) teamBy.set(`${t.season_id}:${t.roster_id}`, t);
  const ownerOf = (sid: string, rid: number) => teamBy.get(`${sid}:${rid}`)?.owner_id ?? null;
  const latestTeam = new Map<string, WrapTeamRow>();
  for (const s of seasons) for (const t of input.teams) if (t.season_id === s.season_id && t.owner_id) latestTeam.set(t.owner_id, t);
  const display = (owner: string) => nameOfUser.get(owner) || latestTeam.get(owner)?.team_name || 'A manager';

  // Games.
  const games = new Map<string, Game[]>();
  const weekScores = new Map<string, { owner: string; pts: number }[]>();
  const regularWeek = (sid: string, week: number) => week < Number(seasonOf.get(sid)?.settings?.playoff_week_start ?? 99);
  const byWeek = new Map<string, WrapMatchupRow[]>();
  for (const m of input.matchups) {
    if (!seasonOf.has(m.season_id) || m.matchup_id == null) continue;
    const k = `${m.season_id}:${m.week}:${m.matchup_id}`;
    byWeek.set(k, [...(byWeek.get(k) ?? []), m]);
  }
  for (const [k, pair] of byWeek) {
    if (pair.length !== 2) continue;
    const [sid, wk] = k.split(':');
    const week = Number(wk), s = seasonOf.get(sid)!.season;
    const [a, b] = pair;
    const oa = ownerOf(sid, a.roster_id), ob = ownerOf(sid, b.roster_id);
    if (!oa || !ob || (num(a.points) <= 0 && num(b.points) <= 0)) continue;
    for (const [me, them, mo, to] of [[a, b, oa, ob], [b, a, ob, oa]] as const) {
      const pts = num(me.points), opp = num(them.points);
      const g: Game = { season: s, week, pts, opp, oppId: to, oppName: display(to), result: pts > opp ? 'W' : pts < opp ? 'L' : 'T', margin: r2(Math.abs(pts - opp)) };
      games.set(mo, [...(games.get(mo) ?? []), g]);
      if (regularWeek(sid, week)) {
        const wk2 = `${sid}:${week}`;
        weekScores.set(wk2, [...(weekScores.get(wk2) ?? []), { owner: mo, pts }]);
      }
    }
  }

  // Started points, player by player, for every team: MVPs, pickups, trades and drafts read these.
  const started = new Map<string, Map<string, { pts: number; starts: number; byWeek: Map<string, number> }>>();
  const benchByOwner = new Map<string, { actual: number; optimal: number; worst: BenchWorst; worstGain: number }>();
  const slotsOf = (sid: string) => seasonOf.get(sid)?.roster_positions ?? null;
  for (const m of input.matchups) {
    if (!seasonOf.has(m.season_id)) continue;
    const owner = ownerOf(m.season_id, m.roster_id);
    if (!owner) continue;
    const pp = m.players_points ?? {};
    const st = (m.starters ?? []).filter(id => id && id !== '0');
    const mine = started.get(owner) ?? new Map();
    started.set(owner, mine);
    for (const id of st) {
      const e = mine.get(id) ?? { pts: 0, starts: 0, byWeek: new Map() };
      e.pts += num(pp[id]); e.starts++; e.byWeek.set(`${m.season_id}:${m.week}`, num(pp[id]));
      mine.set(id, e);
    }
    // The bench, for games actually played.
    const slots = slotsOf(m.season_id);
    if (!slots || m.matchup_id == null || !(m.players ?? []).length || num(m.points) <= 0) continue;
    const roster: LineupPlayer[] = (m.players ?? []).filter(id => id && id !== '0')
      .map(id => ({ playerId: id, points: num(pp[id]), positions: [ref(id).position ?? ''] }));
    const optimal = optimalLineup(roster, slots);
    const best = optimal.total;
    const actual = st.reduce((s, id) => s + num(pp[id]), 0);
    const b = benchByOwner.get(owner) ?? { actual: 0, optimal: 0, worst: null, worstGain: 0 };
    b.actual += actual; b.optimal += Math.max(best, actual);
    // The worst benching: one swap that was really on the table. A starter in his lineup slot (the
    // starters come in the order of the league's starting slots), against a benched player who
    // could have filled that very slot. A running back can take a FLEX, never the defense's spot.
    const lineup = startingSlots(slots);
    const raw = (m.starters ?? []);
    const bench = roster.filter(p => !st.includes(p.playerId));
    for (let k = 0; k < Math.min(raw.length, lineup.length); k++) {
      const id = raw[k];
      if (!id || id === '0') continue;
      const startedPts = num(pp[id]);
      for (const p of bench) {
        const gain = p.points - startedPts;
        if (gain > b.worstGain && canFill(lineup[k], p.positions)) {
          b.worstGain = gain;
          b.worst = { season: seasonOf.get(m.season_id)!.season, week: m.week, benched: ref(p.playerId), benchedPts: r1(p.points), started: ref(id), startedPts: r1(startedPts) };
        }
      }
    }
    benchByOwner.set(owner, b);
  }
  /** Points a player started for a team after a given week of a season. */
  const startedAfter = (owner: string, id: string, sid: string, week: number) => {
    let s = 0;
    for (const [k, v] of started.get(owner)?.get(id)?.byWeek ?? []) {
      const [ks, kw] = k.split(':');
      if (ks === sid && Number(kw) >= week) s += v;
    }
    return s;
  };

  // Moves and trades.
  const adds = new Map<string, number>(), tradeCount = new Map<string, number>();
  const pickups = new Map<string, ManagerWrap['pickup']>();
  const trades: (TradeVerdict & { ownerId: string })[] = [];
  for (const t of input.transactions) {
    if (!seasonOf.has(t.season_id) || t.status !== 'complete') continue;
    const s = seasonOf.get(t.season_id)!.season, week = num(t.week);
    if (t.type === 'waiver' || t.type === 'free_agent') {
      for (const [id, rid] of Object.entries(t.adds ?? {})) {
        const owner = ownerOf(t.season_id, Number(rid));
        if (!owner) continue;
        adds.set(owner, (adds.get(owner) ?? 0) + 1);
        const pts = startedAfter(owner, id, t.season_id, week);
        if (pts > (pickups.get(owner)?.pts ?? 0)) pickups.set(owner, { player: ref(id), season: s, week, pts: r1(pts), bid: t.faab_bid ?? null });
      }
    } else if (t.type === 'trade') {
      const rosters = [...new Set((t.roster_ids ?? []).map(Number))];
      for (const rid of rosters) {
        const owner = ownerOf(t.season_id, rid);
        if (!owner) continue;
        tradeCount.set(owner, (tradeCount.get(owner) ?? 0) + 1);
        const got = Object.entries(t.adds ?? {}).filter(([, r]) => Number(r) === rid).map(([id]) => id);
        const gave = Object.entries(t.drops ?? {}).filter(([, r]) => Number(r) === rid).map(([id]) => id);
        if (!got.length && !gave.length) continue;
        const gotPts = got.reduce((s2, id) => s2 + startedAfter(owner, id, t.season_id, week), 0);
        // What he gave up, in the lineups of whoever got each player.
        const gavePts = gave.reduce((s2, id) => {
          const to = ownerOf(t.season_id, Number(t.adds?.[id]));
          return s2 + (to ? startedAfter(to, id, t.season_id, week) : 0);
        }, 0);
        const partners = rosters.filter(x => x !== rid).map(x => ownerOf(t.season_id, x)).filter((x): x is string => Boolean(x));
        trades.push({ ownerId: owner, season: s, week, got: got.map(ref), gave: gave.map(ref), gotPts: r1(gotPts), gavePts: r1(gavePts), net: r1(gotPts - gavePts), partner: partners.map(display).join(' and ') || 'another team' });
      }
    }
  }

  // Draft value: started points for the team that picked the player, that season.
  const steals = new Map<string, ManagerWrap['steal']>(), busts = new Map<string, ManagerWrap['bust']>();
  for (const p of input.picks) {
    if (!seasonOf.has(p.season_id) || !p.player_id || p.roster_id == null) continue;
    const owner = ownerOf(p.season_id, p.roster_id);
    if (!owner) continue;
    const pts = startedAfter(owner, p.player_id, p.season_id, 0);
    const round = num(p.round) || 1;
    const entry = { player: ref(p.player_id), season: seasonOf.get(p.season_id)!.season, round, pick: p.pick_no, pts: r1(pts) };
    if (round >= 5 && pts > (steals.get(owner)?.pts ?? 0)) steals.set(owner, entry);
    if (round <= 2 && (busts.get(owner) === undefined || pts < (busts.get(owner)?.pts ?? Infinity))) busts.set(owner, entry);
  }

  // Each manager.
  const owners = [...new Set(input.teams.filter(t => seasonOf.has(t.season_id) && t.owner_id).map(t => t.owner_id!))];
  const pfOf = (o: string) => input.teams.filter(t => t.owner_id === o && seasonOf.has(t.season_id)).reduce((s, t) => s + num(t.points_for), 0);
  const rankBy = (val: (o: string) => number) => { const sorted = [...owners].sort((a, b) => val(b) - val(a)); return (o: string) => sorted.indexOf(o) + 1; };
  const pfRank = rankBy(pfOf), addsRank = rankBy(o => adds.get(o) ?? 0), tradesRank = rankBy(o => tradeCount.get(o) ?? 0);

  // Weekly top scores, and all-play.
  const topWeeks = new Map<string, number>();
  const allPlay = new Map<string, { w: number; l: number; expected: number }>();
  for (const scores of weekScores.values()) {
    const max = Math.max(...scores.map(s => s.pts));
    for (const s of scores) {
      if (s.pts === max) topWeeks.set(s.owner, (topWeeks.get(s.owner) ?? 0) + 1);
      const beat = scores.filter(o => o.owner !== s.owner && o.pts < s.pts).length;
      const lost = scores.filter(o => o.owner !== s.owner && o.pts > s.pts).length;
      const a = allPlay.get(s.owner) ?? { w: 0, l: 0, expected: 0 };
      a.w += beat; a.l += lost; a.expected += (scores.length > 1 ? beat / (scores.length - 1) : 0);
      allPlay.set(s.owner, a);
    }
  }

  const managers: ManagerWrap[] = owners.map(o => {
    const gs = games.get(o) ?? [];
    const teams = input.teams.filter(t => t.owner_id === o && seasonOf.has(t.season_id));
    const record = teams.reduce((r, t) => ({ w: r.w + num(t.wins), l: r.l + num(t.losses), t: r.t + num(t.ties) }), { w: 0, l: 0, t: 0 });
    const by = (f: (g: Game) => boolean, sort: (a: Game, b: Game) => number) => gs.filter(f).sort(sort)[0] ?? null;
    const regularWins = gs.filter(g => g.result === 'W' && regularWeek(seasons.find(s => s.season === g.season)!.season_id, g.week)).length;
    const ap = allPlay.get(o);
    const b = benchByOwner.get(o);
    const mvpEntry = [...(started.get(o) ?? [])].sort((x, y) => y[1].pts - x[1].pts)[0];
    const totalStarted = [...(started.get(o) ?? [])].reduce((s, [, v]) => s + v.pts, 0);
    // Head to head, regular and post-season.
    const h2h = new Map<string, { w: number; l: number }>();
    for (const g of gs) { const h = h2h.get(g.oppId) ?? { w: 0, l: 0 }; if (g.result === 'W') h.w++; if (g.result === 'L') h.l++; h2h.set(g.oppId, h); }
    const rivals = [...h2h].filter(([, h]) => h.w + h.l >= 2);
    const nemesisEntry = rivals.sort((x, y) => (y[1].l - y[1].w) - (x[1].l - x[1].w) || y[1].l - x[1].l)[0];
    const victimEntry = [...rivals].sort((x, y) => (y[1].w - y[1].l) - (x[1].w - x[1].l) || y[1].w - x[1].w)[0];
    const myTrades = trades.filter(t => t.ownerId === o).sort((x, y) => y.net - x.net);
    const pts = gs.map(g => g.pts);
    const mean = pts.reduce((s, x) => s + x, 0) / Math.max(1, pts.length);
    const sd = Math.sqrt(pts.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, pts.length));
    const latest = latestTeam.get(o);
    // A full URL or a path on this site as it is (the shared Avatar's rule); otherwise a Sleeper avatar id.
    const avatar = latest?.avatar ? (/^(https?:\/\/|\/)/.test(latest.avatar) ? latest.avatar : `https://sleepercdn.com/avatars/thumbs/${latest.avatar}`) : null;
    const history = seasons.map(s => {
      const t = teams.find(x => x.season_id === s.season_id);
      return t ? { season: s.season, w: num(t.wins), l: num(t.losses), t: num(t.ties), pf: r1(num(t.points_for)), finish: finishOf(o, t) } : null;
    }).filter((x): x is NonNullable<typeof x> => Boolean(x));
    return {
      ownerId: o, name: display(o), team: latest?.team_name || display(o), avatar,
      seasons: history.map(h => h.season), games: gs.length, record,
      pf: r1(pfOf(o)), pfRank: pfRank(o),
      finish: season !== null && teams[0] ? finishOf(o, teams[0]) : null,
      titles: teams.filter(t => finishOf(o, t) === 1).length,
      finals: teams.filter(t => (finishOf(o, t) ?? 99) <= 2).length,
      best: by(() => true, (a, b2) => b2.pts - a.pts),
      worst: by(g => g.pts > 0, (a, b2) => a.pts - b2.pts),
      closestLoss: by(g => g.result === 'L', (a, b2) => a.margin - b2.margin),
      biggestWin: by(g => g.result === 'W', (a, b2) => b2.margin - a.margin),
      luckiestWin: by(g => g.result === 'W', (a, b2) => a.pts - b2.pts),
      robbed: by(g => g.result === 'L', (a, b2) => b2.pts - a.pts),
      luck: ap ? { actual: regularWins, expected: r1(ap.expected), delta: r1(regularWins - ap.expected), allPlayW: ap.w, allPlayL: ap.l } : null,
      bench: b && b.optimal > 0 ? { efficiency: Math.round((b.actual / b.optimal) * 1000) / 10, left: r1(b.optimal - b.actual), worst: b.worst } : null,
      mvp: mvpEntry ? { player: ref(mvpEntry[0]), pts: r1(mvpEntry[1].pts), share: totalStarted ? Math.round((mvpEntry[1].pts / totalStarted) * 100) : 0, starts: mvpEntry[1].starts } : null,
      steal: steals.get(o) ?? null,
      bust: busts.get(o) ?? null,
      pickup: pickups.get(o) ?? null,
      bestTrade: myTrades[0] && myTrades[0].net > 0 ? strip(myTrades[0]) : null,
      worstTrade: myTrades.length && myTrades[myTrades.length - 1].net < 0 ? strip(myTrades[myTrades.length - 1]) : null,
      moves: { adds: adds.get(o) ?? 0, trades: tradeCount.get(o) ?? 0, addsRank: addsRank(o), tradesRank: tradesRank(o) },
      nemesis: nemesisEntry && nemesisEntry[1].l > nemesisEntry[1].w ? { id: nemesisEntry[0], name: display(nemesisEntry[0]), ...nemesisEntry[1] } : null,
      victim: victimEntry && victimEntry[1].w > victimEntry[1].l ? { id: victimEntry[0], name: display(victimEntry[0]), ...victimEntry[1] } : null,
      topWeeks: topWeeks.get(o) ?? 0,
      volatility: r1(sd),
      history,
      archetype: { id: 'manager', title: 'The Manager', why: '' },
    };
  });
  assignArchetypes(managers);

  // The league.
  const tag = (o: string) => ({ ownerId: o, name: display(o) });
  const allGames = [...games].flatMap(([o, gs]) => gs.map(g => ({ ...g, ...tag(o) })));
  const winners = allGames.filter(g => g.result === 'W');
  const lucky = managers.filter(m => m.luck).sort((a, b) => b.luck!.delta - a.luck!.delta);
  const toty = trades.filter(t => t.net > 0).sort((a, b) => b.net - a.net)[0];
  const busiest = [...managers].sort((a, b) => (b.moves.adds + b.moves.trades) - (a.moves.adds + a.moves.trades))[0];
  const mvp = managers.filter(m => m.mvp).sort((a, b) => b.mvp!.pts - a.mvp!.pts)[0];
  const league: LeagueWrap = {
    seasons: seasons.map(s => s.season),
    managers: managers.length,
    games: Math.round(allGames.length / 2),
    points: r1(allGames.reduce((s, g) => s + g.pts, 0)),
    trades: new Set(input.transactions.filter(t => seasonOf.has(t.season_id) && t.type === 'trade' && t.status === 'complete').map(t => JSON.stringify([t.season_id, t.week, t.roster_ids, t.adds]))).size,
    adds: [...adds.values()].reduce((a, b) => a + b, 0),
    champions: input.teams.filter(t => seasonOf.has(t.season_id) && t.owner_id && finishOf(t.owner_id, t) === 1).map(t => ({
      season: seasonOf.get(t.season_id)!.season, ownerId: t.owner_id!, name: display(t.owner_id!), team: t.team_name || display(t.owner_id!), record: `${num(t.wins)}-${num(t.losses)}${num(t.ties) ? `-${num(t.ties)}` : ''}`,
    })).sort((a, b) => b.season - a.season),
    best: [...allGames].sort((a, b) => b.pts - a.pts)[0] ?? null,
    blowout: [...winners].sort((a, b) => b.margin - a.margin)[0] ?? null,
    closest: winners.filter(g => g.margin > 0 && g.opp > 0).sort((a, b) => a.margin - b.margin)[0] ?? null,
    luckiest: lucky[0] ? { ...tag(lucky[0].ownerId), delta: lucky[0].luck!.delta } : null,
    unluckiest: lucky.length > 1 ? { ...tag(lucky[lucky.length - 1].ownerId), delta: lucky[lucky.length - 1].luck!.delta } : null,
    tradeOfTheYear: toty ? { ...strip(toty), ...tag(toty.ownerId) } : null,
    busiest: busiest ? { ...tag(busiest.ownerId), moves: busiest.moves.adds + busiest.moves.trades } : null,
    mvp: mvp ? { player: mvp.mvp!.player, ...tag(mvp.ownerId), pts: mvp.mvp!.pts } : null,
  };

  // The games worth a box score: the league's biggest, and each manager's best and heartbreak.
  const box = (g: (Game & { ownerId?: string }) | null, owner: string) => { if (g) g.box = boxScore(input, g.season, g.week, owner); };
  box(league.best, league.best?.ownerId ?? ''); box(league.blowout, league.blowout?.ownerId ?? ''); box(league.closest, league.closest?.ownerId ?? '');
  for (const m of managers) { box(m.best, m.ownerId); box(m.closestLoss, m.ownerId); }

  const inProgress = season !== null && seasons.length > 0 && !seasons[0].final;
  return { scope: season === null ? 'all' : 'season', season, inProgress, league, managers: managers.sort((a, b) => a.name.localeCompare(b.name)) };
}

function strip(t: TradeVerdict & { ownerId?: string }): TradeVerdict {
  const { ownerId: _o, ...rest } = t;
  return rest;
}

/**
 * Who each manager was, in one title: the trait where they stand furthest from the league, so
 * every manager gets the one that's most true of them. A title in the season scope outranks
 * everything; so does a ring count all-time.
 */
const TRAITS: { id: string; high: [string, string]; low: [string, string]; value: (m: ManagerWrap) => number | null }[] = [
  { id: 'points', value: m => m.pf, high: ['The Juggernaut', 'Scored more than almost anyone.'], low: ['The Underdog', 'Points were hard to come by.'] },
  { id: 'luck', value: m => m.luck?.delta ?? null, high: ['The Lucky Charm', 'Won more than the scores said they should.'], low: ['Snakebitten', 'The schedule had it out for them.'] },
  { id: 'moves', value: m => m.moves.adds, high: ['The Tinkerer', 'Never met a waiver wire they didn’t like.'], low: ['Set It and Forget It', 'Drafted a team and trusted it.'] },
  { id: 'trades', value: m => m.moves.trades, high: ['The Wheeler-Dealer', 'Always on the phone.'], low: ['The Hermit', 'Trade offers went unanswered.'] },
  { id: 'bench', value: m => m.bench?.efficiency ?? null, high: ['The Lineup Whisperer', 'Started the right guys, week after week.'], low: ['The Bench Hoarder', 'The best players were often on the bench.'] },
  { id: 'swing', value: m => m.volatility, high: ['Boom or Bust', 'Either a fireworks show or a fire drill.'], low: ['Mr. Reliable', 'The same solid score, every single week.'] },
];

function assignArchetypes(ms: ManagerWrap[]): void {
  const stats = TRAITS.map(t => {
    const vals = ms.map(t.value).filter((v): v is number => v !== null);
    const mean = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length)) || 1;
    return { t, mean, sd };
  });
  const taken = new Map<string, number>();
  for (const m of ms) {
    if (m.titles > 0 && (m.finish === 1 || m.titles >= 2)) {
      m.archetype = m.titles >= 2
        ? { id: 'dynasty', title: 'The Dynasty', why: `${m.titles} championships. Everyone else is chasing.` }
        : { id: 'champion', title: 'The Champion', why: 'Held the trophy. Nothing else needs saying.' };
      continue;
    }
    const scored = stats.map(({ t, mean, sd }) => {
      const v = t.value(m);
      return v === null ? null : { t, z: (v - mean) / sd };
    }).filter((x): x is { t: typeof TRAITS[number]; z: number } => Boolean(x))
      // A title already given out counts for a little less, so the league isn't six Tinkerers.
      .map(x => ({ ...x, score: Math.abs(x.z) - 0.35 * (taken.get(`${x.t.id}:${x.z >= 0}`) ?? 0) }))
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (!top) continue;
    const [title, why] = top.z >= 0 ? top.t.high : top.t.low;
    m.archetype = { id: `${top.t.id}-${top.z >= 0 ? 'high' : 'low'}`, title, why };
    taken.set(`${top.t.id}:${top.z >= 0}`, (taken.get(`${top.t.id}:${top.z >= 0}`) ?? 0) + 1);
  }
}

// ── Box scores ──────────────────────────────────────────────────────────────

export interface BoxSide { ownerId: string; name: string; team: string; avatar: string | null; pts: number; lineup: { slot: string; player: PlayerRef | null; pts: number }[] }
export interface BoxScore { season: number; week: number; winner: BoxSide; loser: BoxSide; tie: boolean }

/**
 * One game, both lineups, slot by slot: what a team started where (the starters come in the order
 * of the league's starting slots), and what each scored. Null when the archive doesn't have it.
 */
export function boxScore(input: WrapInput, season: number, week: number, ownerId: string): BoxScore | null {
  const s = input.seasons.find(x => x.season === season);
  if (!s) return null;
  const team = input.teams.find(t => t.season_id === s.season_id && t.owner_id === ownerId);
  if (!team) return null;
  const mine = input.matchups.find(m => m.season_id === s.season_id && m.week === week && m.roster_id === team.roster_id);
  if (!mine || mine.matchup_id == null) return null;
  const theirs = input.matchups.find(m => m.season_id === s.season_id && m.week === week && m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id);
  if (!theirs) return null;
  const players = new Map(input.players.map(p => [p.player_id, p]));
  const names = new Map(input.managers.map(m => [m.user_id, m.display_name ?? '']));
  const ref = (id: string): PlayerRef => {
    const p = players.get(id);
    const def = /^[A-Z]{2,3}$/.test(id);
    return { id, name: p?.full_name || (def ? `${id} Defense` : `Player ${id}`), position: p?.position ?? (def ? 'DEF' : null), team: p?.team ?? (def ? id : null) };
  };
  const slots = startingSlots(s.roster_positions ?? []);
  const side = (m: WrapMatchupRow): BoxSide => {
    const t = input.teams.find(x => x.season_id === s.season_id && x.roster_id === m.roster_id);
    const owner = t?.owner_id ?? '';
    const starters = m.starters ?? [];
    const n = Math.max(slots.length, starters.length);
    const avatar = t?.avatar ? (/^(https?:\/\/|\/)/.test(t.avatar) ? t.avatar : `https://sleepercdn.com/avatars/thumbs/${t.avatar}`) : null;
    return {
      ownerId: owner, name: names.get(owner) || t?.team_name || 'A manager', team: t?.team_name || names.get(owner) || '', avatar,
      pts: num(m.points),
      lineup: Array.from({ length: n }, (_, k) => {
        const id = starters[k];
        return { slot: slots[k] ?? 'FLEX', player: id && id !== '0' ? ref(id) : null, pts: r1(id ? num(m.players_points?.[id]) : 0) };
      }),
    };
  };
  const a = side(mine), b = side(theirs);
  const tie = a.pts === b.pts;
  return { season, week, winner: a.pts >= b.pts ? a : b, loser: a.pts >= b.pts ? b : a, tie };
}
