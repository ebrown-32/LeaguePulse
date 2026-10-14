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
  /** How many trades ESPN counts for each team this season (it keeps the count after it drops the trades). */
  tradeCounts: Record<number, number>;
}

/**
 * A team's logo, when the app can show it.
 *
 * ESPN's own logo art is public. A logo a manager uploaded lives on ESPN's
 * image service, which only answers signed-in browsers, so it is served
 * through this site instead (/api/league-data/logo/<league>/<image>, with
 * the league's cookies). A logo linked from anywhere else is left out rather than loaded
 * from an unknown host.
 */
const LOGO_HOSTS = new Set(['g.espncdn.com', 'a.espncdn.com', 's.espncdn.com']);
export function teamLogo(url: unknown, espnLeagueId: string): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url.replace(/^http:/, 'https:'));
    const uploaded = u.hostname === 'mystique-api.fantasy.espn.com' && /^\/apis\/v1\/domains\/lm\/images\/([0-9a-f-]{8,64})$/i.exec(u.pathname);
    if (uploaded) return `/api/league-data/logo/${espnLeagueId}/${uploaded[1].toLowerCase()}`;
    return LOGO_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * ESPN stores some names with an emoji mangled into replacement characters
 * ("ï¿½ï¿½ Ocular Patdown"). What is left of it is dropped; the rest of the
 * name is kept.
 */
export function cleanName(s: string): string {
  // Two or more in a row: a lone "ï" is a letter (Naïve), a run of them is the remains of an emoji.
  return s.replace(/[ïÂ¿½\u0080-\u009f\uFFFD]{2,}/g, '').replace(/\s+/g, ' ').trim();
}

const teamName = (t: any) =>
  cleanName(String(t.name ?? [t.location, t.nickname].filter(Boolean).join(' ') ?? '')) || `Team ${t.id}`;

/** A manager's name for the page: first name and last initial, never the ESPNFAN handle unless that is all there is. */
function managerName(m: any): string {
  const first = String(m.firstName ?? '').trim();
  const last = String(m.lastName ?? '').trim();
  if (first) return last ? `${first} ${last[0]}.` : first;
  return String(m.displayName ?? 'Manager');
}

/** A short, stable hash with no imports (this file also runs in the browser): two 32-bit FNV-1a passes. */
function hash64(s: string): string {
  const pass = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };
  return pass(0x811c9dc5) + pass(0x050c5d1f);
}

const fullName = (m: any) =>
  `${String(m.firstName ?? '').trim()} ${String(m.lastName ?? '').trim()}`.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Each member's manager id.
 *
 * People change ESPN accounts between seasons (a real league: one manager on
 * one account for 2017 to 2019 and another from 2020; another with two
 * accounts in the league at once), and on ESPN that is a new member id. A
 * manager is the same person whatever account they used, so where ESPN gives
 * a full name the id is a hash of it: the same in every season, with no name
 * in it. Two members of one season with the same full name are one person
 * when they share a team or only one has a team (a real league: two accounts
 * co-owning one team); members with that name who each run a different team
 * are different people and keep their member ids.
 */
function managerIds(espnLeagueId: string, members: any[], teams: any[]): Record<string, string> {
  const teamOf = new Map<string, number>();
  for (const t of teams) for (const o of [t.primaryOwner, ...(t.owners ?? [])]) if (o && !teamOf.has(o)) teamOf.set(o, Number(t.id));
  const byName = new Map<string, any[]>();
  for (const m of members) {
    const n = fullName(m);
    if (n) byName.set(n, [...(byName.get(n) ?? []), m]);
  }
  const out: Record<string, string> = {};
  for (const m of members) {
    const n = fullName(m);
    const sameTeams = n ? new Set(byName.get(n)!.map(x => teamOf.get(x.id)).filter(t => t !== undefined)) : new Set();
    out[m.id] = espnUserKey(espnLeagueId, n && sameTeams.size <= 1 ? `n${hash64(n)}` : m.id);
  }
  return out;
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
  // ESPN does not keep a period's weeks in order (a two week round can read [16, 15]).
  const firstPlayoff = periods[String(regularPeriods + 1)];
  const playoffStart = firstPlayoff?.length ? Math.min(...firstPlayoff.map(Number)) : regularPeriods + 1;

  const memberToUser = managerIds(espnLeagueId, members, teams);
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
      // ESPN's "win bonus for top half" is Sleeper's league median game: a
      // second result each week, a win for scoring in the top half. ESPN
      // already counts it in each team's record.
      league_average_match: settings.scoringSettings?.scoringEnhancementType === 'WIN_BONUS_TOP_HALF' ? 1 : 0,
      leg: currentWeek,
      last_scored_leg: final ? finalWeek : Math.max(0, currentWeek - 1),
      divisions: (sched.divisions ?? []).length > 1 ? sched.divisions.length : 0,
    },
    metadata: {
      provider: 'espn',
      espn_league_id: espnLeagueId,
      // A season ESPN only serves from its history endpoint has final scores,
      // standings, playoffs and the draft, but no lineups, moves or trades:
      // only how many of each every team made. Said here so pages can say
      // so (src/lib/coverage.ts), rather than show an empty week as if
      // nothing happened in it.
      ...(raw.lpSource === 'history' ? {
        coverage: {
          lineups: false, moves: false, trades: false,
          counts: {
            trades: Math.ceil(teams.reduce((n, t) => n + Number(t.transactionCounter?.trades ?? 0), 0) / 2),
            moves: teams.reduce((n, t) => n + Number(t.transactionCounter?.acquisitions ?? 0), 0),
          },
        },
      } : {}),
    },
  };

  // One owner per league: Sleeper marks the commissioner, and season linking
  // looks for them.
  const commissioner = members.find(m => m.isLeagueCreator) ?? members.find(m => m.isLeagueManager) ?? members[0];
  const teamByOwner = new Map<string, any>();
  for (const t of teams) for (const o of t.owners ?? [ownerOf(t)]) if (o && !teamByOwner.has(o)) teamByOwner.set(o, t);
  // One entry per manager: two accounts of one person (see managerIds) are one user.
  const seen = new Set<string>();
  const users = [...members]
    .sort((a, b) => Number(teamByOwner.has(b.id)) - Number(teamByOwner.has(a.id)))
    .filter(m => !seen.has(memberToUser[m.id]) && Boolean(seen.add(memberToUser[m.id])))
    .map(m => {
    const t = teamByOwner.get(m.id);
    return {
      user_id: memberToUser[m.id],
      username: String(m.displayName ?? ''),
      display_name: managerName(m),
      avatar: '',
      metadata: { team_name: t ? teamName(t) : undefined, avatar: teamLogo(t?.logo, espnLeagueId) },
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
      metadata: { team_name: teamName(t), logo: teamLogo(t.logo, espnLeagueId) },
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
    tradeCounts: Object.fromEntries(teams.map(t => [Number(t.id), Number(t.transactionCounter?.trades ?? 0)])),
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
 * Trades are not here: see translateTrades.
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

/** A game runs about four hours from kickoff; a trade before then is that week's. */
const GAME_MS = 4 * 60 * 60 * 1000;

/** The week a moment belongs to: the first whose last game had not finished. */
export function weekOf(at: number, weekEnds: Record<string, number>, fallback: number): number {
  const weeks = Object.keys(weekEnds).map(Number).sort((a, b) => a - b);
  for (const w of weeks) if (at <= weekEnds[w] + GAME_MS) return w;
  return weeks.length ? weeks[weeks.length - 1] : fallback;
}

/**
 * Sleeper's trade transactions from ESPN's league activity feed. Each feed
 * topic is one trade, and each of its messages one player moving: `targetId`
 * the player, `from` and `to` the teams. Placed in the week they happened,
 * as Sleeper places them.
 */
export function translateTrades(topics: any[], ctx: SeasonContext, weekEnds: Record<string, number>, fallbackWeek: number, pid: PlayerIdMap): any[] {
  const out: any[] = [];
  for (const t of topics ?? []) {
    const moves = (t.messages ?? []).filter((m: any) => Number(m.messageTypeId) === 244 && Number(m.from) > 0 && Number(m.to) > 0);
    if (!moves.length) continue;
    const adds: Record<string, number> = {}, drops: Record<string, number> = {};
    const teams = new Set<number>();
    for (const m of moves) {
      const id = pid(Number(m.targetId));
      adds[id] = Number(m.to);
      drops[id] = Number(m.from);
      teams.add(Number(m.from)); teams.add(Number(m.to));
    }
    const at = Number(t.date ?? moves[0].date ?? 0);
    const ids = [...teams];
    out.push({
      type: 'trade',
      transaction_id: String(t.id),
      status: 'complete',
      status_updated: at,
      created: at,
      roster_ids: ids,
      consenter_ids: ids,
      adds, drops,
      draft_picks: [],
      waiver_budget: [],
      creator: (t.author && ctx.memberToUser[t.author]) || ctx.teamOwner[ids[0]] || '',
      leg: weekOf(at, weekEnds, fallbackWeek),
      settings: null,
      metadata: null,
    });
  }
  return out;
}

/** One roster move that is not a trade: a waiver claim or free agent pickup, with when it happened. */
export interface Pickup { player: string; to: number; at: number }
/** A player let go by a team, with when. */
export interface Release { player: string; from: number; at: number }

/**
 * A finished season's trades, rebuilt from its weekly rosters.
 *
 * ESPN deletes a league's trade feed when the season ends, but keeps every
 * week's rosters, every pickup, and how many trades each team made. A player
 * on one team one week and another team the next, with no pickup to explain
 * it, was traded. Moves between the same two teams in the same week are one
 * trade. Players who passed through a roster within the week count too,
 * because otherwise one side of a trade can go missing:
 *
 *   picked up, then traded on   a player new to a team, whose last pickup
 *                               that week was by another team, was traded
 *                               from that team (a real case: claimed on
 *                               waivers, traded the same week);
 *   traded, then dropped        a player who leaves a team for nobody,
 *                               dropped that week by a team that did not
 *                               have him and did not pick him up, was traded
 *                               to that team first (a real case: received in
 *                               a trade and cut straight away).
 *
 * ESPN's counts then decide what is kept: trades with players going both
 * ways first, then one-way moves only while both teams still have a trade
 * left to account for, and never a one-way move a pickup in the next or last
 * week explains. Checked against a real league: every season from 2020 to
 * 2025 rebuilt to exactly ESPN's counts, and the current season to exactly
 * the trades its feed lists.
 *
 * `rosters[0]` is the draft; `rosters[w]` is week w. `pickups[w]` and
 * `releases[w]` are the moves made during week w.
 */
export function rebuildTrades(o: {
  rosters: Record<number, Record<string, number>>;
  pickups: Record<number, Pickup[]>;
  releases?: Record<number, Release[]>;
  tradeCounts: Record<number, number> | null;
  weekEnds: Record<string, number>;
  lastWeek: number;
  ctx: SeasonContext;
}): any[] {
  type Move = { player: string; from: number; to: number };
  const found: { week: number; a: number; b: number; moves: Move[] }[] = [];
  const pickedUp = (week: number, player: string, to: number) => (o.pickups[week] ?? []).some(p => p.player === player && p.to === to);

  for (let w = 1; w <= o.lastWeek; w++) {
    const before = o.rosters[w - 1], after = o.rosters[w];
    if (!before || !after) continue;
    const byPair = new Map<string, { a: number; b: number; moves: Move[] }>();
    const add = (player: string, from: number, to: number) => {
      const [a, b] = from < to ? [from, to] : [to, from];
      const key = `${a}-${b}`;
      if (!byPair.has(key)) byPair.set(key, { a, b, moves: [] });
      byPair.get(key)!.moves.push({ player, from, to });
    };
    for (const [player, to] of Object.entries(after)) {
      let from: number | undefined = before[player];
      if (from === to) continue;
      const last = (o.pickups[w] ?? []).filter(p => p.player === player).sort((x, y) => x.at - y.at).pop();
      if (last) {
        if (last.to === to) continue; // a pickup, not a trade
        from = last.to;               // picked up by one team, traded on to another
      }
      if (from === undefined || from === to) continue;
      add(player, from, to);
    }
    // Traded, then dropped before the next week's rosters.
    for (const r of o.releases?.[w] ?? []) {
      const had = before[r.player];
      if (had === undefined || had === r.from || after[r.player] !== undefined) continue;
      if (pickedUp(w, r.player, r.from)) continue;
      add(r.player, had, r.from);
    }
    for (const t of byPair.values()) found.push({ week: w, ...t });
  }

  const twoWay = (t: (typeof found)[number]) => new Set(t.moves.map(m => m.to)).size > 1;
  const left = o.tradeCounts ? { ...o.tradeCounts } : null;
  const kept: typeof found = [];
  for (const t of [...found.filter(twoWay), ...found.filter(t => !twoWay(t))]) {
    if (!twoWay(t) && t.moves.every(m => pickedUp(t.week - 1, m.player, m.to) || pickedUp(t.week + 1, m.player, m.to))) continue;
    if (left) {
      if ((left[t.a] ?? 0) < 1 || (left[t.b] ?? 0) < 1) continue;
      left[t.a]--; left[t.b]--;
    }
    kept.push(t);
  }

  const DAY = 24 * 60 * 60 * 1000;
  return kept.sort((x, y) => x.week - y.week || x.a - y.a).map(t => {
    // When exactly is not recorded; the day after the week before ended is
    // the earliest it can have been, and it sorts with the week's moves.
    const prevEnd = o.weekEnds[String(t.week - 1)];
    const at = prevEnd ? prevEnd + DAY : (o.weekEnds[String(t.week)] ?? 0) - 6 * DAY;
    const ids = [t.a, t.b];
    return {
      type: 'trade',
      transaction_id: `rebuilt-${o.ctx.season}-${t.week}-${t.a}-${t.b}`,
      status: 'complete',
      status_updated: at,
      created: at,
      roster_ids: ids,
      consenter_ids: ids,
      adds: Object.fromEntries(t.moves.map(m => [m.player, m.to])),
      drops: Object.fromEntries(t.moves.map(m => [m.player, m.from])),
      draft_picks: [],
      waiver_budget: [],
      creator: o.ctx.teamOwner[t.a] ?? '',
      leg: t.week,
      settings: null,
      metadata: { rebuilt: true },
    };
  });
}
