/**
 * When NFL games are actually being played, in US Eastern time.
 *
 * The desk should sound different at 1pm on a Sunday than it does on a
 * Wednesday, and a "games are underway" post written on a Tuesday is worse
 * than no post at all. Everything scheduled around live coverage checks here
 * first, so a misfiring cron produces silence rather than a lie.
 *
 * Eastern is hardcoded because the NFL schedules in it: kickoff windows are
 * defined as 1pm/4pm/8pm ET regardless of where the server or the reader is.
 */

export type GameState =
  /** Games kicked off within the last stretch; the slate is fresh. */
  | 'kickoff'
  /** Games are in progress. */
  | 'live'
  /** Game day, but the first kickoff has not happened yet. */
  | 'pregame'
  /** No NFL games today. */
  | 'idle';

export interface GameWindow {
  state: GameState;
  /** Human label for the slate, e.g. "Sunday afternoon". */
  label: string;
  /** Eastern-time parts used to decide, exposed for logging and tests. */
  et: { weekday: number; hour: number; minute: number };
}

/** How long after a window opens still counts as "kickoff" rather than "live". */
const KICKOFF_MINUTES = 45;

/** 0 = Sunday. Windows are [openMinute, closeMinute) in ET minutes past midnight. */
interface Slate {
  weekday: number;
  open: number;
  close: number;
  label: string;
  /** Saturday games only exist late in the season. */
  minWeek?: number;
}

const h = (hour: number, minute = 0) => hour * 60 + minute;

const SLATES: Slate[] = [
  // Sunday. The 9:30am international game happens only a handful of weeks a
  // year, so this window is a scheduling hint and nothing more: a caller must
  // still confirm against real scoring before saying games are underway. The
  // main window opens at 1pm and the night game runs to roughly 11:45pm.
  { weekday: 0, open: h(9, 30), close: h(12, 45), label: 'the early international game' },
  { weekday: 0, open: h(13),    close: h(23, 59), label: 'the Sunday slate' },
  // Thursday Night Football. Thanksgiving is handled separately: it is the one
  // Thursday that starts at lunchtime, and folding it in here made every
  // ordinary Thursday evening look like it was eight hours old.
  { weekday: 4, open: h(20),    close: h(23, 59), label: 'Thursday night' },
  // Monday Night Football.
  { weekday: 1, open: h(20),    close: h(23, 59), label: 'Monday night' },
  // Saturday games appear from week 15 on, and on the Friday after
  // Thanksgiving, which this treats as a normal Friday slate.
  { weekday: 6, open: h(13),    close: h(23, 59), label: 'the Saturday slate', minWeek: 15 },
  { weekday: 5, open: h(15),    close: h(23, 59), label: 'the Friday game',    minWeek: 12 },
];

/** The fourth Thursday in November, in Eastern time. */
function isThanksgiving(at: Date): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'numeric', day: 'numeric', weekday: 'short',
  });
  const p = Object.fromEntries(
    fmt.formatToParts(at).map(x => [x.type, x.value]),
  ) as Record<string, string>;
  if (p.month !== '11' || p.weekday !== 'Thu') return false;
  const day = Number(p.day);
  return day >= 22 && day <= 28;
}

/** Eastern-time weekday, hour and minute for an instant. */
function easternParts(at: Date): { weekday: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(at).map(p => [p.type, p.value]),
  ) as Record<string, string>;

  const DAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: DAYS[parts.weekday] ?? 0,
    // hour12:false renders midnight as "24" in some ICU versions.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/**
 * Where the NFL week is right now.
 *
 * `week` gates the slates that only exist late in the season, so a Saturday in
 * September reads as idle rather than as a game day with nothing on it.
 */
export function resolveGameWindow(at: Date = new Date(), week = 0): GameWindow {
  const et = easternParts(at);
  const mins = et.hour * 60 + et.minute;

  const today = SLATES.filter(s => s.weekday === et.weekday && (!s.minWeek || week >= s.minWeek));

  // Thanksgiving replaces the Thursday night window with an all-afternoon one.
  if (et.weekday === 4 && isThanksgiving(at)) {
    today.length = 0;
    today.push({ weekday: 4, open: h(12, 30), close: h(23, 59), label: 'Thanksgiving' });
  }

  for (const slate of today) {
    if (mins >= slate.open && mins < slate.close) {
      return {
        state: mins < slate.open + KICKOFF_MINUTES ? 'kickoff' : 'live',
        label: slate.label,
        et,
      };
    }
  }

  // Before the first kickoff on a day that has one.
  const upcoming = today.filter(s => mins < s.open).sort((a, b) => a.open - b.open)[0];
  if (upcoming) return { state: 'pregame', label: upcoming.label, et };

  return { state: 'idle', label: 'no games', et };
}

/** True when a live-coverage run has something real to talk about. */
export function isGameTime(window: GameWindow): boolean {
  return window.state === 'kickoff' || window.state === 'live';
}
