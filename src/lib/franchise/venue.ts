/**
 * Where a fantasy matchup is played, and how full the place is.
 *
 * ── Who hosts ───────────────────────────────────────────────────────────────
 *
 * ESPN names a home team for every game, and that stands. Sleeper names
 * nobody, so LeaguePulse decides, the way football does:
 *
 *   playoffs        the higher seed hosts (the better regular-season record,
 *                   then points scored, as Sleeper seeds)
 *   regular season  the two alternate, home and home: whoever hosted the last
 *                   meeting travels. The first meeting ever goes to the team
 *                   with the better record at the time.
 *
 * Every input comes from the league's history, so the same game always has the
 * same host, on every page and for every visitor.
 *
 * ── Game day ────────────────────────────────────────────────────────────────
 *
 * Before the week's first kickoff the lots fill first: a few early birds days
 * out, tailgates building through game day, every space taken by kickoff. The
 * gates open three hours out and the stands fill to the crowd the host's
 * stadium actually draws (the tycoon economy's projection), filling fastest in
 * the last hour. Live, a full house; final, the last fans filing out.
 *
 * Pure.
 */

export interface MeetingResult {
  season: string;
  week: number;
  stage: 'regular' | 'playoff' | 'consolation';
}

/** A team's games, as the rivalries data records them: its score and the opponent's. */
export interface TeamGame {
  season: string;
  week: number;
  stage: 'regular' | 'playoff' | 'consolation';
  score: number;
  opponentScore: number;
}

export interface TeamRecord { wins: number; losses: number; ties: number; pointsFor: number }

export type HostReason = 'espn' | 'seed' | 'alternate' | 'first-meeting';

export interface HostInput {
  a: string; b: string;
  season: string; week: number;
  playoff: boolean;
  /** The provider's own home team, when it names one (ESPN). */
  providerHome?: string | null;
  /** Every regular-season or postseason game between the two, either order. */
  meetings: MeetingResult[];
  /** Each team's games against anyone, for its record at any point. */
  gamesOf: (userId: string) => TeamGame[];
}

const before = (g: { season: string; week: number }, season: string, week: number) =>
  Number(g.season) < Number(season) || (g.season === season && g.week < week);

/** A team's regular-season record in a season, from the games before a week. */
export function recordAt(games: TeamGame[], season: string, week: number): TeamRecord {
  const r: TeamRecord = { wins: 0, losses: 0, ties: 0, pointsFor: 0 };
  for (const g of games) {
    if (g.season !== season || g.week >= week || g.stage !== 'regular') continue;
    if (g.score > g.opponentScore) r.wins++; else if (g.score < g.opponentScore) r.losses++; else r.ties++;
    r.pointsFor += g.score;
  }
  return r;
}

/** Positive when x's record is better: win share, then points scored. */
function compare(x: TeamRecord, y: TeamRecord): number {
  const pct = (r: TeamRecord) => { const n = r.wins + r.losses + r.ties; return n ? (r.wins + r.ties / 2) / n : 0; };
  return pct(x) - pct(y) || x.pointsFor - y.pointsFor;
}

/** Of two teams, the one with the better record then; ties to the lower id, so it is never a coin flip. */
function better(input: HostInput, season: string, week: number): string {
  const c = compare(recordAt(input.gamesOf(input.a), season, week), recordAt(input.gamesOf(input.b), season, week));
  return c > 0 ? input.a : c < 0 ? input.b : (input.a < input.b ? input.a : input.b);
}

export function chooseHost(input: HostInput): { host: string; guest: string; reason: HostReason } {
  const pair = (host: string, reason: HostReason) => ({ host, guest: host === input.a ? input.b : input.a, reason });
  if (input.providerHome === input.a || input.providerHome === input.b) return pair(input.providerHome, 'espn');
  if (input.playoff) return pair(better(input, input.season, Number.POSITIVE_INFINITY), 'seed');
  const prior = input.meetings
    .filter(m => m.stage === 'regular' && before(m, input.season, input.week))
    .sort((x, y) => Number(x.season) - Number(y.season) || x.week - y.week);
  if (!prior.length) return pair(better(input, input.season, input.week), 'first-meeting');
  // The first meeting went to the better record then; they have swapped every regular-season meeting since.
  const first = better(input, prior[0].season, prior[0].week);
  const other = first === input.a ? input.b : input.a;
  return pair(prior.length % 2 === 0 ? first : other, 'alternate');
}

// ── Game day ────────────────────────────────────────────────────────────────

export type GameDayStage = 'quiet' | 'tailgating' | 'gates' | 'live' | 'final';

export interface GameDay {
  /** Share of seats filled, 0 to 1. */
  stands: number;
  /** Share of the lots and the plaza filled, 0 to 1. */
  lots: number;
  stage: GameDayStage;
  /** Hours to the week's first kickoff (negative once it has passed). */
  hours: number;
}

const HOUR = 3_600_000;
const smooth = (t: number) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
/** From a to b as h goes from h0 down to h1 (hours before kickoff count down). */
const ramp = (h: number, h0: number, h1: number, a: number, b: number) => a + (b - a) * smooth((h0 - h) / (h0 - h1));

/**
 * How full the stadium and its lots are at `now`, for a game whose week kicks
 * off at `kickoff`. `crowd` is the share of seats this game's crowd will fill.
 */
export function gameDay(now: number, kickoff: number | null, phase: 'upcoming' | 'live' | 'final', crowd: number): GameDay {
  const full = Math.min(1, Math.max(0, crowd));
  const hours = kickoff === null ? Number.POSITIVE_INFINITY : (kickoff - now) / HOUR;
  if (phase === 'final') return { stands: full * 0.1, lots: 0.25, stage: 'final', hours };
  if (phase === 'live' || hours <= 0) return { stands: full, lots: 0.97, stage: 'live', hours };
  const lots = hours > 72 ? 0.04
    : hours > 24 ? ramp(hours, 72, 24, 0.04, 0.16)
    : hours > 6 ? ramp(hours, 24, 6, 0.16, 0.5)
    : hours > 1 ? ramp(hours, 6, 1, 0.5, 0.95)
    : 0.97;
  const stands = hours > 3 ? 0 : hours > 1 ? ramp(hours, 3, 1, 0, 0.3) * full : ramp(hours, 1, 0, 0.3, 1) * full;
  const stage: GameDayStage = hours <= 3 ? 'gates' : lots >= 0.15 ? 'tailgating' : 'quiet';
  return { stands, lots, stage, hours };
}

/**
 * When a week's first game kicks off. Sleeper's schedule gives game dates
 * without times, so each date takes the NFL's usual slot for its day in New
 * York time: Thursday and Monday night 8:15, Friday 8:15, Saturday 4:30,
 * Sunday 1:00. Close enough for a crowd that fills over hours.
 */
export function firstKickoff(dates: string[]): number | null {
  const valid = dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!valid.length) return null;
  const [y, m, d] = valid[0].split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const [hh, mm] = day === 0 ? [13, 0] : day === 6 ? [16, 30] : [20, 15];
  return newYorkTime(y, m, d, hh, mm);
}

/** A wall-clock time in New York, as a timestamp, daylight saving and all. */
function newYorkTime(y: number, m: number, d: number, hh: number, mm: number): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(new Date(guess)).reduce<Record<string, number>>((o, p) => (p.type === 'literal' ? o : { ...o, [p.type]: Number(p.value) }), {});
  const asNy = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return guess - (asNy - guess);
}
