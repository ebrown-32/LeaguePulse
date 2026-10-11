/**
 * ESPN's public NFL feeds: the live scoreboard, team rosters and play by play.
 *
 * Sleeper says whether a game has started and how many fantasy points a player
 * has. It says nothing about the game itself: no clock, no down and distance,
 * no ball position, no channel. ESPN's site API has all of that, free and
 * without a key.
 *
 * ── The caveat ───────────────────────────────────────────────────────────────
 *
 * These endpoints are public but undocumented. They have been stable for
 * years and are widely used, but ESPN makes no promise about them, so every
 * read here fails soft: a broken feed degrades the watch guide to what Sleeper
 * alone can say, and never takes a page down. Reads are cached on the server
 * so a room full of people refreshing on a Sunday is one request to ESPN, not
 * hundreds.
 */

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';

/** Sleeper's team codes where they differ from ESPN's. */
const SLEEPER_TO_ESPN: Record<string, string> = { WAS: 'WSH', OAK: 'LV' };
export const espnTeam = (sleeperCode: string | null | undefined) =>
  sleeperCode ? SLEEPER_TO_ESPN[sleeperCode] ?? sleeperCode : null;

async function getJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Teams and rosters ────────────────────────────────────────────────────────

export interface EspnAthlete {
  id: string;
  name: string;
  position: string;
  team: string;   // ESPN abbreviation
}

export async function espnTeams(): Promise<{ id: string; abbr: string }[]> {
  const d = await getJson<any>(`${SITE}/teams`, 86_400);
  return (d?.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map((t: any) => ({ id: String(t.team.id), abbr: String(t.team.abbreviation) }));
}

/** Every athlete on every NFL roster, practice squad and injured lists included. */
export async function espnAthletes(): Promise<EspnAthlete[]> {
  const teams = await espnTeams();
  const rosters = await Promise.all(teams.map(async t => {
    const d = await getJson<any>(`${SITE}/teams/${t.id}/roster`, 21_600);
    return (d?.athletes ?? []).flatMap((g: any) => (g.items ?? []).map((a: any): EspnAthlete => ({
      id: String(a.id),
      name: String(a.fullName ?? a.displayName ?? ''),
      position: String(a.position?.abbreviation ?? ''),
      team: t.abbr,
    })));
  }));
  return rosters.flat();
}

// ── Scoreboard ───────────────────────────────────────────────────────────────

export type GameState = 'pre' | 'in' | 'post';

export interface LiveGame {
  id: string;
  away: { abbr: string; score: number; id: string };
  home: { abbr: string; score: number; id: string };
  state: GameState;
  /** "Q2 4:12", "Halftime", "Final", or the kickoff time. */
  detail: string;
  kickoff: string;
  period: number;
  clock: string;
  /** Who has the ball, by ESPN abbreviation. Only while the game is live. */
  possession: string | null;
  /** e.g. "2nd & 7 at DET 34". */
  downDistance: string | null;
  /** Yards the team with the ball has to go for a touchdown. */
  yardsToEndzone: number | null;
  redZone: boolean;
  lastPlay: string | null;
  /** TV network or stream, e.g. "CBS", "Prime Video". */
  broadcast: string | null;
}

/**
 * Yards to the end zone, from ESPN's "DET 34" style position text.
 *
 * The ball is on the possessing team's own half when the side named is
 * theirs, so the distance to score is 100 minus the yard line; on the
 * opponent's half it is the yard line itself. "50" has no side.
 */
export function yardsToGo(possessionText: string | null | undefined, possession: string | null): number | null {
  if (!possessionText) return null;
  const m = /^([A-Z]{2,3})?\s*(\d{1,2})$/.exec(possessionText.trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (!m[1]) return 50;
  if (!possession) return null;
  return m[1] === possession ? 100 - n : n;
}

export async function espnScoreboard(): Promise<LiveGame[]> {
  // Fifteen seconds: a play takes about forty, so this is fresh enough to
  // follow a drive and coarse enough to be one request per room, not per tab.
  const d = await getJson<any>(`${SITE}/scoreboard`, 15);
  return (d?.events ?? []).map((e: any): LiveGame => {
    const c = e.competitions?.[0] ?? {};
    const st = c.status ?? e.status ?? {};
    const team = (side: 'home' | 'away') => {
      const t = (c.competitors ?? []).find((x: any) => x.homeAway === side);
      return { abbr: String(t?.team?.abbreviation ?? ''), score: Number(t?.score ?? 0), id: String(t?.team?.id ?? '') };
    };
    const away = team('away'), home = team('home');
    const s = c.situation ?? null;
    const possession = s?.possession
      ? (s.possession === home.id ? home.abbr : s.possession === away.id ? away.abbr : null)
      : null;
    const state: GameState = st.type?.state === 'in' ? 'in' : st.type?.state === 'post' ? 'post' : 'pre';
    return {
      id: String(e.id),
      away, home, state,
      detail: String(st.type?.shortDetail ?? st.type?.detail ?? ''),
      kickoff: String(e.date ?? ''),
      period: Number(st.period ?? 0),
      clock: String(st.displayClock ?? ''),
      possession,
      downDistance: state === 'in' ? s?.downDistanceText ?? null : null,
      yardsToEndzone: state === 'in' ? yardsToGo(s?.possessionText, possession) : null,
      redZone: state === 'in' && Boolean(s?.isRedZone),
      lastPlay: s?.lastPlay?.text ?? null,
      broadcast: (c.broadcasts ?? []).flatMap((b: any) => b.names ?? [])[0]
        ?? c.geoBroadcasts?.[0]?.media?.shortName ?? null,
    };
  });
}

// ── Play by play ─────────────────────────────────────────────────────────────

export interface Play {
  id: string;
  sequence: number;
  /** ESPN's classification: "Rush", "Pass Reception", "Passing Touchdown"... */
  type: string;
  text: string;
  period: number;
  clock: string;
  /** When it happened, wall clock. */
  at: string | null;
  scoring: boolean;
  /** ESPN athlete id and the part they played: rusher, passer, receiver, scorer... */
  participants: { id: string; role: string }[];
  downDistance: string | null;
  yards: number | null;
}

/**
 * Every play of one game, with the athletes involved.
 *
 * From the "core" API rather than the site summary: the summary names players
 * only in the play text ("J.Williams up the middle"), which cannot be matched
 * to a roster reliably. Core tags each play with athlete ids and roles.
 */
export async function espnPlays(eventId: string, live: boolean): Promise<Play[]> {
  const d = await getJson<any>(
    `${CORE}/events/${eventId}/competitions/${eventId}/plays?limit=400`,
    live ? 20 : 3600,
  );
  return (d?.items ?? []).map((p: any): Play => ({
    id: String(p.id),
    sequence: Number(p.sequenceNumber ?? 0),
    type: String(p.type?.text ?? ''),
    text: String(p.text ?? ''),
    period: Number(p.period?.number ?? 0),
    clock: String(p.clock?.displayValue ?? ''),
    at: p.wallclock ?? null,
    scoring: Boolean(p.scoringPlay),
    participants: (p.participants ?? []).map((x: any) => ({
      id: String(x.athlete?.$ref ?? '').split('/athletes/')[1]?.split('?')[0] ?? '',
      role: String(x.type ?? ''),
    })).filter((x: { id: string }) => x.id),
    downDistance: p.start?.downDistanceText ?? null,
    yards: typeof p.statYardage === 'number' ? p.statYardage : null,
  }));
}
