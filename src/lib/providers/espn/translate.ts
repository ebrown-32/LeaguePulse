/**
 * ESPN fantasy football, translated into Sleeper's shapes.
 *
 * The app reads leagues the way Sleeper's API returns them. These functions
 * take ESPN's league API responses and return exactly those shapes, so a page
 * cannot tell an ESPN league from a Sleeper one. Pure functions: no network,
 * no storage, testable with Node's own runner (`node --test`).
 *
 * Points always come from ESPN's own totals, never recomputed, so every score
 * matches what the league sees on ESPN, custom scoring included.
 *
 * ESPN vocabulary, for reading this file:
 *   scoring period   an NFL week
 *   matchup period   a head-to-head round: one week in the regular season,
 *                    sometimes two in the playoffs (`matchupPeriods` maps one
 *                    to its weeks)
 *   lineup slot      where a player sits that week (QB, FLEX, bench, IR...)
 *   member           a person; a team has one or more owners, who are members
 */

import { espnLeagueKey, espnUserKey } from '../ids.ts';

/** ESPN player id to Sleeper player id. Unmatched players get an `espn_<id>` id. */
export type PlayerIdMap = (espnPlayerId: number) => string;

// ── ESPN codes ───────────────────────────────────────────────────────────────

/** Lineup slot to Sleeper roster position. */
const SLOT: Record<number, string> = {
  0: 'QB', 1: 'QB', 2: 'RB', 3: 'WRRB_FLEX', 4: 'WR', 5: 'REC_FLEX', 6: 'TE', 7: 'SUPER_FLEX',
  8: 'DL', 9: 'DL', 10: 'LB', 11: 'DL', 12: 'DB', 13: 'DB', 14: 'DB', 15: 'IDP_FLEX',
  16: 'DEF', 17: 'K', 18: 'P', 19: 'HC', 20: 'BN', 21: 'IR', 23: 'FLEX', 24: 'FLEX',
};
/** Starting slots in the order Sleeper lists them. */
const STARTING_ORDER = [0, 1, 2, 4, 6, 23, 3, 5, 24, 7, 16, 17, 18, 8, 9, 11, 10, 12, 13, 14, 15, 19];
const BENCH = 20, IR = 21;

export const POSITION: Record<number, string> = {
  1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 7: 'P', 9: 'DL', 10: 'DL', 11: 'LB', 12: 'DB', 13: 'DB', 14: 'HC', 16: 'DEF',
};

/** ESPN pro team id to the abbreviation Sleeper uses (and names its team defences by). */
export const PRO_TEAM: Record<number, string> = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN',
  11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ',
  21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX',
  33: 'BAL', 34: 'HOU',
};

/** A team defence is player -16000 minus its pro team id; Sleeper's id for it is the team abbreviation. */
export function defenceTeam(espnPlayerId: number): string | null {
  return espnPlayerId < 0 ? PRO_TEAM[-16000 - espnPlayerId] ?? null : null;
}

/**
 * ESPN scoring items to Sleeper scoring keys, for the parts of the app that
 * project points (they read `scoring_settings`). `per` turns ESPN's "a point
 * every N yards" items into Sleeper's points per yard. Actual points never use
 * this: they come from ESPN.
 */
const SCORING: Record<number, { key: string | string[]; per?: number; dst?: boolean }> = {
  3: { key: 'pass_yd' }, 5: { key: 'pass_yd', per: 5 }, 6: { key: 'pass_yd', per: 10 }, 7: { key: 'pass_yd', per: 20 }, 8: { key: 'pass_yd', per: 25 },
  4: { key: 'pass_td' }, 19: { key: 'pass_2pt' }, 20: { key: 'pass_int' },
  24: { key: 'rush_yd' }, 27: { key: 'rush_yd', per: 5 }, 28: { key: 'rush_yd', per: 10 }, 29: { key: 'rush_yd', per: 20 }, 30: { key: 'rush_yd', per: 25 },
  25: { key: 'rush_td' }, 26: { key: 'rush_2pt' },
  42: { key: 'rec_yd' }, 47: { key: 'rec_yd', per: 5 }, 48: { key: 'rec_yd', per: 10 }, 49: { key: 'rec_yd', per: 20 }, 50: { key: 'rec_yd', per: 25 },
  43: { key: 'rec_td' }, 44: { key: 'rec_2pt' }, 53: { key: 'rec' }, 72: { key: 'fum_lost' },
  74: { key: 'fgm_50p' }, 77: { key: 'fgm_40_49' }, 80: { key: ['fgm_0_19', 'fgm_20_29', 'fgm_30_39'] }, 85: { key: 'fgmiss' }, 86: { key: 'xpm' }, 88: { key: 'xpmiss' },
  89: { key: 'pts_allow_0', dst: true }, 90: { key: 'pts_allow_1_6', dst: true }, 91: { key: 'pts_allow_7_13', dst: true },
  92: { key: 'pts_allow_14_20', dst: true }, 123: { key: 'pts_allow_28_34', dst: true }, 124: { key: 'pts_allow_35p', dst: true },
  95: { key: 'int', dst: true }, 96: { key: 'fum_rec', dst: true }, 97: { key: 'blk_kick', dst: true }, 98: { key: 'safe', dst: true },
  99: { key: 'sack', dst: true }, 101: { key: 'st_td', dst: true }, 102: { key: 'st_td', dst: true }, 103: { key: 'def_td', dst: true }, 104: { key: 'def_td', dst: true },
};

export function scoringSettings(items: any[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const map = SCORING[Number(it.statId)];
    if (!map) continue;
    const raw = map.dst ? Number(it.pointsOverrides?.['16'] ?? it.points ?? 0) : Number(it.points ?? 0);
    const value = map.per ? raw / map.per : raw;
    for (const k of Array.isArray(map.key) ? map.key : [map.key]) {
      // Yardage can come from two ESPN items (a point every 25 yards and a
      // point per yard), and Sleeper's one key is their sum. Anything else
      // that two items feed (kick and punt return touchdowns) is one rate.
      const isYards = k.endsWith('_yd');
      out[k] = isYards ? Math.round(((out[k] ?? 0) + value) * 1e4) / 1e4 : (out[k] ?? value);
    }
  }
  return out;
}

// ── The season as a whole ────────────────────────────────────────────────────

/** What the per-week translations need to know about the season. */
export interface SeasonContext {
  espnLeagueId: string;
  season: number;
  teamIds: number[];
  /** Matchup period to the weeks it covers. */
  periods: Record<string, number[]>;
  regularPeriods: number;
  /** Starting slots, in order, as ESPN slot ids (one entry per starter). */
  starterSlots: number[];
  /** ESPN member id to Sleeper-style user id. */
  memberToUser: Record<string, string>;
  /** Team id to its owner's user id. */
  teamOwner: Record<number, string>;
}

export interface TranslatedBase {
  league: any;
  users: any[];
  rosters: any[];
  winners_bracket: any[];
  losers_bracket: any[];
  drafts: any[];
  picks: any[];
  ctx: SeasonContext;
  /** Whether the season is over: its data will not change again. */
  final: boolean;
  /** The week ESPN considers current, capped at the season's last. */
  currentWeek: number;
  finalWeek: number;
}

/**
 * A team's logo, when the app can show it. ESPN logos are ESPN's own art or a
 * commissioner's upload hosted by ESPN; anything else (a logo linked from
 * some other site) is left out rather than loaded from an unknown host.
 */
const LOGO_HOSTS = new Set(['g.espncdn.com', 'a.espncdn.com', 's.espncdn.com', 'mystique-api.fantasy.espn.com']);
export function teamLogo(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url.replace(/^http:/, 'https:'));
    return LOGO_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

const teamName = (t: any) =>
  String(t.name ?? [t.location, t.nickname].filter(Boolean).join(' ') ?? '').trim() || `Team ${t.id}`;

/** A manager's name for the page: first name and last initial, never the ESPNFAN handle unless that is all there is. */
function managerName(m: any): string {
  const first = String(m.firstName ?? '').trim();
  const last = String(m.lastName ?? '').trim();
  if (first) return last ? `${first} ${last[0]}.` : first;
  return String(m.displayName ?? 'Manager');
}

/** Every slot as Sleeper's roster_positions: starters in Sleeper's order, then bench and IR. */
function rosterPositions(counts: Record<string, number>): { positions: string[]; starterSlots: number[] } {
  const starterSlots: number[] = [];
  for (const slot of STARTING_ORDER) for (let i = 0; i < Number(counts[slot] ?? 0); i++) starterSlots.push(slot);
  const positions = starterSlots.map(s => SLOT[s] ?? 'FLEX');
  for (let i = 0; i < Number(counts[BENCH] ?? 0); i++) positions.push('BN');
  for (let i = 0; i < Number(counts[IR] ?? 0); i++) positions.push('IR');
  return { positions, starterSlots };
}

/** Sleeper's playoff_round_type: 0 one week a round, 1 a two week final, 2 two weeks every round. */
function roundType(periods: Record<string, number[]>, regular: number): number {
  const lengths = Object.keys(periods).map(Number).filter(p => p > regular).sort((a, b) => a - b).map(p => periods[p].length);
  if (!lengths.length || lengths.every(l => l <= 1)) return 0;
  if (lengths.every(l => l >= 2)) return 2;
  return lengths[lengths.length - 1] >= 2 ? 1 : 0;
}

/** Points as Sleeper splits them: whole points and hundredths. */
const split = (n: number) => {
  const cents = Math.round(Number(n || 0) * 100);
  return { whole: Math.floor(cents / 100), decimal: cents % 100 };
};

/**
 * The season's league, managers, teams, brackets and draft, from one ESPN
 * response with views mSettings, mTeam, mRoster, mMatchup, mStatus and
 * mDraftDetail.
 */
export function translateBase(raw: any, pid: PlayerIdMap, opts: { firstSeason?: number } = {}): TranslatedBase {
  const espnLeagueId = String(raw.id);
  const season = Number(raw.seasonId);
  const key = espnLeagueKey(espnLeagueId, season);
  const settings = raw.settings ?? {};
  const status = raw.status ?? {};
  const sched = settings.scheduleSettings ?? {};
  const teams: any[] = raw.teams ?? [];
  const members: any[] = raw.members ?? [];
  const schedule: any[] = raw.schedule ?? [];
  const draft = raw.draftDetail ?? {};

  const regularPeriods = Number(sched.matchupPeriodCount ?? 0) || 13;
  const periods: Record<string, number[]> = sched.matchupPeriods && Object.keys(sched.matchupPeriods).length
    ? sched.matchupPeriods
    : Object.fromEntries(Array.from({ length: Number(status.finalScoringPeriod ?? 17) }, (_, i) => [String(i + 1), [i + 1]]));
  const finalWeek = Number(status.finalScoringPeriod ?? Math.max(...Object.values(periods).flat()));
  const currentWeek = Math.max(1, Math.min(Number(raw.scoringPeriodId ?? status.latestScoringPeriod ?? 1), finalWeek));
  const playoffStart = periods[String(regularPeriods + 1)]?.[0] ?? regularPeriods + 1;

  const memberToUser: Record<string, string> = {};
  for (const m of members) memberToUser[m.id] = espnUserKey(espnLeagueId, m.id);
  const ownerOf = (t: any) => String(t.primaryOwner ?? t.owners?.[0] ?? '');
  const teamOwner: Record<number, string> = {};
  for (const t of teams) {
    const o = ownerOf(t);
    // A team with no member (an orphaned team) still needs an owner id.
    teamOwner[t.id] = o ? (memberToUser[o] ??= espnUserKey(espnLeagueId, o)) : `${key}-team-${t.id}`;
  }

  const { positions, starterSlots } = rosterPositions(settings.rosterSettings?.lineupSlotCounts ?? {});
  const decided = schedule.filter(m => m.winner && m.winner !== 'UNDECIDED');
  const allDecided = schedule.length > 0 && decided.length === schedule.length;
  const final = Boolean(status.isExpired) || (allDecided && currentWeek >= finalWeek);
  const leagueStatus = !draft.drafted ? (draft.inProgress ? 'drafting' : 'pre_draft') : final ? 'complete' : 'in_season';

  const prior = (status.previousSeasons ?? [])
    .map(Number).filter((y: number) => y < season && (!opts.firstSeason || y >= opts.firstSeason));
  const previous = prior.length ? espnLeagueKey(espnLeagueId, Math.max(...prior)) : null;

  const counts = settings.rosterSettings?.lineupSlotCounts ?? {};
  const acq = settings.acquisitionSettings ?? {};
  const keepers = Number(settings.draftSettings?.keeperCount ?? 0);
  const rounds = teams.length ? Math.ceil((draft.picks?.length ?? 0) / teams.length) : 0;

  const league = {
    league_id: key,
    name: String(settings.name ?? 'ESPN League'),
    season: String(season),
    season_type: 'regular',
    sport: 'nfl',
    status: leagueStatus,
    total_rosters: teams.length,
    previous_league_id: previous,
    draft_id: key,
    avatar: null,
    scoring_settings: scoringSettings(settings.scoringSettings?.scoringItems),
    roster_positions: positions,
    settings: {
      playoff_week_start: playoffStart,
      playoff_teams: Number(sched.playoffTeamCount ?? 0),
      playoff_round_type: roundType(periods, regularPeriods),
      playoff_type: 0,
      num_teams: teams.length,
      max_keepers: keepers,
      type: keepers > 0 ? 1 : 0,
      draft_rounds: rounds,
      daily_waivers: 0,
      bench_slots: Number(counts[BENCH] ?? 0),
      reserve_slots: Number(counts[IR] ?? 0),
      waiver_budget: acq.isUsingAcquisitionBudget ? Number(acq.acquisitionBudget ?? 0) : 0,
      trade_deadline: 99,
      leg: currentWeek,
      last_scored_leg: final ? finalWeek : Math.max(0, currentWeek - 1),
      divisions: (sched.divisions ?? []).length > 1 ? sched.divisions.length : 0,
    },
    metadata: { provider: 'espn', espn_league_id: espnLeagueId },
  };

  // One owner per league: Sleeper marks the commissioner, and season linking
  // looks for them.
  const commissioner = members.find(m => m.isLeagueCreator) ?? members.find(m => m.isLeagueManager) ?? members[0];
  const teamByOwner = new Map<string, any>();
  for (const t of teams) for (const o of t.owners ?? [ownerOf(t)]) if (o && !teamByOwner.has(o)) teamByOwner.set(o, t);
  const users = members.map(m => {
    const t = teamByOwner.get(m.id);
    return {
      user_id: memberToUser[m.id],
      username: String(m.displayName ?? ''),
      display_name: managerName(m),
      avatar: '',
      metadata: { team_name: t ? teamName(t) : undefined, avatar: teamLogo(t?.logo) },
      is_owner: m === commissioner,
    };
  });

  const rosters = teams.map(t => {
    const entries: any[] = t.roster?.entries ?? [];
    const slotted = startersFrom(entries.map(e => ({ slot: Number(e.lineupSlotId), id: pid(Number(e.playerId)) })), starterSlots);
    const rec = t.record?.overall ?? {};
    const pf = split(rec.pointsFor ?? t.points ?? 0), pa = split(rec.pointsAgainst ?? 0);
    const owners: string[] = (t.owners ?? []).map((o: string) => memberToUser[o] ?? espnUserKey(espnLeagueId, o));
    return {
      roster_id: Number(t.id),
      owner_id: teamOwner[t.id],
      co_owners: owners.filter(o => o !== teamOwner[t.id]),
      league_id: key,
      players: entries.map(e => pid(Number(e.playerId))),
      starters: slotted.starters,
      reserve: entries.filter(e => Number(e.lineupSlotId) === IR).map(e => pid(Number(e.playerId))),
      settings: {
        wins: Number(rec.wins ?? 0),
        losses: Number(rec.losses ?? 0),
        ties: Number(rec.ties ?? 0),
        fpts: pf.whole, fpts_decimal: pf.decimal,
        fpts_against: pa.whole, fpts_against_decimal: pa.decimal,
        waiver_position: Number(t.waiverRank ?? 0),
        waiver_budget_used: Number(t.transactionCounter?.acquisitionBudgetSpent ?? 0),
        total_moves: Number(t.transactionCounter?.acquisitions ?? 0),
        division: Number(t.divisionId ?? 0) + 1,
        rank: Number(t.playoffSeed ?? 0) || undefined,
        // Final place, once the season is over: 1 the champion, 2 the runner-up.
        ...(final && Number(t.rankCalculatedFinal ?? t.rankFinal ?? 0) > 0
          ? { poff: Number(t.rankCalculatedFinal || t.rankFinal) } : {}),
      },
      metadata: { team_name: teamName(t), logo: teamLogo(t.logo) },
    };
  });

  const { winners, losers } = brackets(schedule, teams, regularPeriods, Number(sched.playoffTeamCount ?? 0));

  const picks = (draft.picks ?? []).map((p: any) => ({
    draft_id: key,
    round: Number(p.roundId),
    pick_no: Number(p.overallPickNumber),
    draft_slot: Number(p.roundPickNumber),
    roster_id: Number(p.teamId),
    player_id: pid(Number(p.playerId)),
    picked_by: p.memberId ? (memberToUser[p.memberId] ?? '') : teamOwner[p.teamId] ?? '',
    is_keeper: Boolean(p.keeper) || null,
    metadata: { amount: p.bidAmount ? String(p.bidAmount) : undefined },
  }));
  const order: number[] = settings.draftSettings?.pickOrder ?? [];
  const draftType = String(settings.draftSettings?.type ?? '').toUpperCase() === 'AUCTION' ? 'auction' : 'snake';
  const drafts = [{
    draft_id: key,
    league_id: key,
    season: String(season),
    sport: 'nfl',
    type: draftType,
    status: draft.drafted ? 'complete' : draft.inProgress ? 'drafting' : 'pre_draft',
    start_time: draft.completeDate ?? null,
    settings: { rounds, teams: teams.length },
    draft_order: Object.fromEntries(order.map((teamId, i) => [teamOwner[teamId], i + 1])),
    slot_to_roster_id: Object.fromEntries(order.map((teamId, i) => [String(i + 1), teamId])),
    metadata: {},
  }];

  return {
    league, users, rosters, winners_bracket: winners, losers_bracket: losers, drafts, picks,
    ctx: {
      espnLeagueId, season, teamIds: teams.map(t => Number(t.id)), periods, regularPeriods, starterSlots,
      memberToUser, teamOwner,
    },
    final, currentWeek, finalWeek,
  };
}

/** Starters in slot order, with "0" for an empty slot as Sleeper does. */
function startersFrom(entries: { slot: number; id: string; points?: number }[], starterSlots: number[]) {
  const pool = [...entries];
  const starters: string[] = [];
  const points: number[] = [];
  for (const slot of starterSlots) {
    const i = pool.findIndex(e => e.slot === slot);
    if (i === -1) { starters.push('0'); points.push(0); continue; }
    const [e] = pool.splice(i, 1);
    starters.push(e.id);
    points.push(Number(e.points ?? 0));
  }
  return { starters, points };
}

/**
 * Sleeper's winners and losers brackets from ESPN's playoff schedule.
 *
 * Newer ESPN seasons label each playoff game's tier. Older ones do not, so the
 * winners bracket is followed instead: it starts with the playoff seeds, and a
 * game is in it when both teams are still alive in it.
 */
function brackets(schedule: any[], teams: any[], regular: number, playoffTeams: number) {
  const games = schedule
    .filter(m => Number(m.matchupPeriodId) > regular && m.home && m.away)
    .sort((a, b) => Number(a.matchupPeriodId) - Number(b.matchupPeriodId) || Number(a.id) - Number(b.id));
  const rounds = [...new Set(games.map(g => Number(g.matchupPeriodId)))];
  const labelled = games.some(g => g.playoffTierType);
  const alive = new Set(teams.filter(t => Number(t.playoffSeed ?? 0) > 0 && Number(t.playoffSeed) <= playoffTeams).map(t => Number(t.id)));

  const winners: any[] = [], losers: any[] = [];
  let m = 0;
  rounds.forEach((period, ri) => {
    const lastRound = ri === rounds.length - 1;
    const out: number[] = [];
    for (const g of games.filter(x => Number(x.matchupPeriodId) === period)) {
      const t1 = Number(g.home.teamId), t2 = Number(g.away.teamId);
      const w = g.winner === 'HOME' ? t1 : g.winner === 'AWAY' ? t2 : null;
      const l = w === null ? null : w === t1 ? t2 : t1;
      const inWinners = labelled ? g.playoffTierType === 'WINNERS_BRACKET' : alive.has(t1) && alive.has(t2);
      const row: any = { r: ri + 1, m: ++m, t1, t2, w, l };
      if (inWinners) {
        if (lastRound) row.p = 1;
        winners.push(row);
        if (l !== null) out.push(l);
      } else {
        losers.push(row);
      }
    }
    for (const l of out) alive.delete(l);
  });
  return { winners, losers };
}

// ── One week ─────────────────────────────────────────────────────────────────

export function periodOfWeek(ctx: SeasonContext, week: number): number | null {
  for (const [p, weeks] of Object.entries(ctx.periods)) if (weeks.map(Number).includes(week)) return Number(p);
  return null;
}

/**
 * Sleeper's matchups for one week, from an ESPN response with views
 * mMatchupScore and mBoxscore for that scoring period. Every team gets a row;
 * a team with no game that week (a playoff bye, or out of the playoffs) has a
 * null matchup id, as on Sleeper.
 */
export function translateWeek(raw: any, ctx: SeasonContext, week: number, pid: PlayerIdMap): any[] {
  const period = periodOfWeek(ctx, week);
  const games = (raw?.schedule ?? [])
    .filter((m: any) => Number(m.matchupPeriodId) === period)
    .sort((a: any, b: any) => Number(a.id) - Number(b.id));

  const rows = new Map<number, any>();
  games.forEach((g: any, i: number) => {
    for (const side of [g.home, g.away]) {
      if (!side) continue;
      const entries = (side.rosterForCurrentScoringPeriod?.entries ?? []).map((e: any) => ({
        slot: Number(e.lineupSlotId),
        id: pid(Number(e.playerId)),
        points: Number(e.playerPoolEntry?.appliedStatTotal ?? 0),
      }));
      const { starters, points } = startersFrom(entries, ctx.starterSlots);
      const weekPoints = side.pointsByScoringPeriod?.[String(week)]
        ?? (ctx.periods[String(period)]?.length === 1 ? side.totalPoints : undefined)
        ?? side.rosterForCurrentScoringPeriod?.appliedStatTotal ?? 0;
      rows.set(Number(side.teamId), {
        matchup_id: i + 1,
        roster_id: Number(side.teamId),
        points: Math.round(Number(weekPoints) * 100) / 100,
        custom_points: null,
        players: entries.map((e: any) => e.id),
        starters,
        starters_points: points,
        players_points: Object.fromEntries(entries.map((e: any) => [e.id, e.points])),
      });
    }
  });
  for (const teamId of ctx.teamIds) {
    if (!rows.has(teamId)) {
      rows.set(teamId, {
        matchup_id: null, roster_id: teamId, points: 0, custom_points: null,
        players: [], starters: [], starters_points: [], players_points: {},
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.roster_id - b.roster_id);
}

/**
 * Sleeper's transactions for one week, from ESPN's mTransactions2 view for
 * that scoring period: completed waiver claims and free agent moves.
 *
 * Trades are not here. ESPN's transaction list keeps a completed trade's
 * players only on the original proposal, which it stops returning once the
 * trade goes through; they need ESPN's league activity feed instead.
 */
export function translateTransactions(raw: any, ctx: SeasonContext, week: number, pid: PlayerIdMap): any[] {
  const out: any[] = [];
  for (const t of raw?.transactions ?? []) {
    if (t.status !== 'EXECUTED') continue;
    const type = t.type === 'WAIVER' ? 'waiver' : t.type === 'FREEAGENT' ? 'free_agent' : null;
    if (!type) continue;
    const adds: Record<string, number> = {}, drops: Record<string, number> = {};
    const rosterIds = new Set<number>();
    for (const it of t.items ?? []) {
      const id = pid(Number(it.playerId));
      if (it.type === 'ADD') { adds[id] = Number(it.toTeamId); rosterIds.add(Number(it.toTeamId)); }
      else if (it.type === 'DROP') { drops[id] = Number(it.fromTeamId); rosterIds.add(Number(it.fromTeamId)); }
    }
    if (!Object.keys(adds).length && !Object.keys(drops).length) continue;
    if (!rosterIds.size && t.teamId) rosterIds.add(Number(t.teamId));
    const ids = [...rosterIds].filter(Boolean);
    out.push({
      type,
      transaction_id: String(t.id),
      status: 'complete',
      status_updated: Number(t.processDate ?? t.proposedDate ?? 0),
      created: Number(t.proposedDate ?? t.processDate ?? 0),
      roster_ids: ids,
      consenter_ids: ids,
      adds: Object.keys(adds).length ? adds : null,
      drops: Object.keys(drops).length ? drops : null,
      draft_picks: [],
      waiver_budget: [],
      creator: (t.memberId && ctx.memberToUser[t.memberId]) || ctx.teamOwner[Number(t.teamId)] || '',
      leg: week,
      settings: type === 'waiver' ? { waiver_bid: Number(t.bidAmount ?? 0) } : null,
      metadata: null,
    });
  }
  return out.sort((a, b) => b.status_updated - a.status_updated);
}
