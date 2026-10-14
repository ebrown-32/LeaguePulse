/**
 * What a league's commissioner enters by hand, and how it joins the league's
 * data.
 *
 * Two kinds of entry:
 *
 *   moves     trades and pickups the source never kept (ESPN drops them for
 *             its oldest seasons). Each joins its season's transactions for
 *             its week, in Sleeper's shape, marked as entered.
 *   seasons   whole seasons from before the league used Sleeper or ESPN:
 *             teams, weekly scores, the champion. Each becomes a league of
 *             its own (`manual-<year>`) in Sleeper's shapes, linked in before
 *             the league's earliest season, so History, records and rings
 *             count it like any other.
 *
 * Entries are a layer over the source, applied as data is read (see
 * leagueFetch). Nothing is written back to Sleeper or ESPN, and a league with
 * no entries reads exactly as before.
 *
 * No imports beyond these modules: runs in the browser, on the server and in
 * Node's own test runner.
 */

export const MANUAL_PREFIX = 'manual-';

export type MoveType = 'trade' | 'waiver' | 'free_agent';

export interface ManualMove {
  id: string;
  /** The season's league id (Sleeper, `espn-…` or `manual-…`). */
  leagueId: string;
  season: string;
  /** 0 for before week 1. */
  week: number;
  type: MoveType;
  /** Team (roster) ids: both sides of a trade, or the one team making a pickup. */
  teams: number[];
  /** Player id to the team that gets him. */
  adds: Record<string, number>;
  /** Player id to the team that lets him go. */
  drops: Record<string, number>;
  waiverBid?: number;
  note?: string;
  createdAt: number;
}

export interface ManualTeam {
  /** 1, 2, 3...: the team's roster id in that season. */
  id: number;
  /** An existing manager's id (from another season), so their records join up; null for someone new. */
  managerId: string | null;
  managerName: string;
  teamName?: string;
}

export interface ManualGame {
  week: number;
  a: number;
  b: number;
  aScore: number;
  bScore: number;
}

export interface ManualSeason {
  season: number;
  name?: string;
  teams: ManualTeam[];
  games: ManualGame[];
  /** Weeks of regular season; later weeks are playoffs. */
  regularWeeks: number;
  playoffTeams: number;
  champion?: number | null;
  runnerUp?: number | null;
  updatedAt: number;
}

export interface ManualData {
  moves: ManualMove[];
  seasons: ManualSeason[];
}

export const EMPTY: ManualData = { moves: [], seasons: [] };

export const manualLeagueId = (season: number | string) => `${MANUAL_PREFIX}${season}`;

export function parseManualLeague(id: string): number | null {
  const m = /^manual-(\d{4})$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** A stable id for a manager who exists only in entered seasons, from their name. */
export function manualManagerId(name: string): string {
  let h = 0x811c9dc5;
  const s = name.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${MANUAL_PREFIX}u-${h.toString(16).padStart(8, '0')}`;
}

const isEmpty = (d: ManualData | null | undefined) => !d || (!d.moves.length && !d.seasons.length);

// ── Moves, in Sleeper's shape ───────────────────────────────────────────────

export function moveToSleeper(m: ManualMove): any {
  return {
    type: m.type,
    transaction_id: `manual-${m.id}`,
    status: 'complete',
    status_updated: m.createdAt,
    created: m.createdAt,
    roster_ids: m.teams,
    consenter_ids: m.teams,
    adds: Object.keys(m.adds).length ? m.adds : null,
    drops: Object.keys(m.drops).length ? m.drops : null,
    draft_picks: [],
    waiver_budget: [],
    creator: '',
    // Before week 1 is filed with week 1, as the platforms file preseason moves.
    leg: Math.max(1, m.week),
    settings: m.type === 'waiver' && m.waiverBid ? { waiver_bid: m.waiverBid } : null,
    metadata: { manual: true, ...(m.note ? { note: m.note } : {}) },
  };
}

// ── A whole season, in Sleeper's shapes ─────────────────────────────────────

const split = (n: number) => {
  const cents = Math.round(n * 100);
  return { whole: Math.floor(cents / 100), decimal: cents % 100 };
};

export function teamUserId(t: ManualTeam): string {
  return t.managerId || manualManagerId(t.managerName || `Team ${t.id}`);
}

/** The season's previous season: the newest entered season before it. */
export function previousManual(data: ManualData, season: number): string | null {
  const older = data.seasons.map(s => s.season).filter(y => y < season);
  return older.length ? manualLeagueId(Math.max(...older)) : null;
}

/**
 * Answer a Sleeper path for an entered season: `league/manual-2016`,
 * `league/manual-2016/matchups/3` and so on. Undefined when the path is not
 * one an entered season has.
 */
export function serveManualSeason(data: ManualData, path: string): { status: number; body: unknown } | undefined {
  const m = /^(league|draft)\/manual-(\d{4})(?:\/(.*))?$/.exec(path.split('?')[0]);
  if (!m) return undefined;
  const year = Number(m[2]);
  const s = data.seasons.find(x => x.season === year);
  if (!s) return { status: 404, body: null };
  const rest = (m[3] ?? '').replace(new RegExp(`^${year}/`), '');
  const id = manualLeagueId(year);
  const lastWeek = Math.max(s.regularWeeks, ...s.games.map(g => g.week), 1);

  if (m[1] === 'draft') return rest === '' ? { status: 200, body: null } : { status: 200, body: [] };

  if (rest === '') {
    return {
      status: 200,
      body: {
        league_id: id,
        name: s.name || `Season ${year}`,
        season: String(year),
        season_type: 'regular',
        sport: 'nfl',
        status: 'complete',
        total_rosters: s.teams.length,
        previous_league_id: previousManual(data, year),
        draft_id: null,
        avatar: null,
        scoring_settings: {},
        roster_positions: [],
        settings: {
          playoff_week_start: s.regularWeeks + 1,
          playoff_teams: s.playoffTeams,
          playoff_round_type: 0,
          num_teams: s.teams.length,
          type: 0,
          leg: lastWeek,
          last_scored_leg: lastWeek,
        },
        metadata: {
          provider: 'manual',
          // Entered seasons have scores and results; who started each week is not entered.
          coverage: { lineups: false, moves: true, trades: true, counts: {} },
        },
      },
    };
  }
  if (rest === 'users') {
    const seen = new Set<string>();
    return {
      status: 200,
      body: s.teams.flatMap((t, i) => {
        const uid = teamUserId(t);
        if (seen.has(uid)) return [];
        seen.add(uid);
        return [{
          user_id: uid,
          username: t.managerName,
          display_name: t.managerName,
          avatar: '',
          metadata: { team_name: t.teamName || undefined },
          is_owner: i === 0,
        }];
      }),
    };
  }
  if (rest === 'rosters') {
    const rec = new Map(s.teams.map(t => [t.id, { w: 0, l: 0, t: 0, pf: 0, pa: 0 }]));
    for (const g of s.games) {
      if (g.week > s.regularWeeks) continue;
      const a = rec.get(g.a), b = rec.get(g.b);
      if (!a || !b) continue;
      a.pf += g.aScore; a.pa += g.bScore; b.pf += g.bScore; b.pa += g.aScore;
      if (g.aScore > g.bScore) { a.w++; b.l++; } else if (g.bScore > g.aScore) { b.w++; a.l++; } else { a.t++; b.t++; }
    }
    const order = [...s.teams].sort((x, y) => {
      const a = rec.get(x.id)!, b = rec.get(y.id)!;
      return b.w - a.w || b.pf - a.pf;
    }).map(t => t.id);
    return {
      status: 200,
      body: s.teams.map(t => {
        const r = rec.get(t.id)!;
        const pf = split(r.pf), pa = split(r.pa);
        const poff = t.id === s.champion ? 1 : t.id === s.runnerUp ? 2 : undefined;
        return {
          roster_id: t.id,
          owner_id: teamUserId(t),
          co_owners: [],
          league_id: id,
          players: [], starters: [], reserve: [],
          settings: {
            wins: r.w, losses: r.l, ties: r.t,
            fpts: pf.whole, fpts_decimal: pf.decimal, fpts_against: pa.whole, fpts_against_decimal: pa.decimal,
            rank: order.indexOf(t.id) + 1,
            ...(poff ? { poff } : {}),
          },
          metadata: { team_name: t.teamName || undefined },
        };
      }),
    };
  }
  const week = /^matchups\/(\d+)$/.exec(rest);
  if (week) {
    const w = Number(week[1]);
    const games = s.games.filter(g => g.week === w);
    const rows = new Map<number, any>();
    games.forEach((g, i) => {
      for (const [team, points] of [[g.a, g.aScore], [g.b, g.bScore]] as const) {
        rows.set(team, { matchup_id: i + 1, roster_id: team, points, custom_points: null, players: [], starters: [], starters_points: [], players_points: {} });
      }
    });
    for (const t of s.teams) if (!rows.has(t.id)) rows.set(t.id, { matchup_id: null, roster_id: t.id, points: 0, custom_points: null, players: [], starters: [], starters_points: [], players_points: {} });
    return { status: 200, body: w > lastWeek ? [] : [...rows.values()].sort((a, b) => a.roster_id - b.roster_id) };
  }
  if (/^transactions\/\d+$/.test(rest)) return { status: 200, body: [] };
  if (rest === 'winners_bracket') {
    const done = s.champion && s.runnerUp;
    return { status: 200, body: done ? [{ r: 1, m: 1, t1: s.champion, t2: s.runnerUp, w: s.champion, l: s.runnerUp, p: 1 }] : [] };
  }
  if (rest === 'losers_bracket' || rest === 'drafts' || rest === 'traded_picks') return { status: 200, body: [] };
  return { status: 404, body: null };
}

// ── The layer over the source ───────────────────────────────────────────────

/**
 * A source response with the commissioner's entries joined in, or the same
 * body when there are none for it.
 *
 *   league/<id>                  the league's earliest season links back to
 *                                the newest entered season before it
 *   league/<id>/transactions/<w> entered moves for that season and week
 */
export function applyManual(data: ManualData | null | undefined, path: string, body: unknown): unknown {
  if (isEmpty(data)) return body;
  const p = path.split('?')[0];
  const league = /^league\/([^/]+)$/.exec(p);
  if (league && body && typeof body === 'object' && !Array.isArray(body)) {
    const l = body as { previous_league_id?: string | null; season?: string };
    if (!l.previous_league_id && l.season && !league[1].startsWith(MANUAL_PREFIX)) {
      const prev = previousManual(data!, Number(l.season));
      if (prev) return { ...l, previous_league_id: prev };
    }
    return body;
  }
  const tx = /^league\/([^/]+)\/transactions\/(\d+)$/.exec(p);
  if (tx) {
    const moves = data!.moves.filter(m => m.leagueId === tx[1] && Math.max(1, m.week) === Number(tx[2]));
    if (!moves.length) return body;
    return [...(Array.isArray(body) ? body : []), ...moves.map(moveToSleeper)];
  }
  return body;
}
