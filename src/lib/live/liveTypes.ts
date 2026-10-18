/**
 * A fantasy matchup, live, as the stadium shows it (components/matchup/LiveField):
 * the score for the scoreboard, where each starter is right now, and the plays
 * worth celebrating. Built on the server by lib/live/liveMatchup.
 *
 * Pure types.
 */

/**
 * Where a starter is, from their NFL game:
 *   driving    their team has the ball (a kicker only once it's in range)
 *   defending  a team defense, while the other team has the ball
 *   sideline   in a live game, not on the field right now
 *   pregame    their game hasn't kicked off
 *   final      their game is over
 *   bye        their team has no game this week
 */
export type LiveState = 'driving' | 'defending' | 'sideline' | 'pregame' | 'final' | 'bye';

export interface LivePlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  /** The fantasy team: the stadium's host, or the visitors. */
  side: 'host' | 'guest';
  /** Fantasy points so far this week (Sleeper's live figure). */
  points: number | null;
  state: LiveState;
  /** While driving or defending: yards from the ball to the end zone being attacked. */
  yardsToEndzone: number | null;
  /** "2nd & 7 at DET 34", while their team has the ball. */
  downDistance: string | null;
  redZone: boolean;
  /** Their NFL game in a line: "KC @ BUF · Q3 4:12", "Sun 1:00 PM", "Final". */
  game: string | null;
  /** The network their game is on ("CBS", "Prime Video"), from ESPN's scoreboard, when known. */
  channel: string | null;
  /** When they play: the kickoff ("Sun 1p") before their game, the clock ("Q2 4:12") during it. */
  when: string | null;
}

export interface LivePlay {
  id: string;
  playerId: string;
  side: 'host' | 'guest';
  text: string;
  /** Estimated fantasy points for the play (see lib/live/playFeed), or null. */
  points: number | null;
  scoring: boolean;
  /** Worth a celebration: a touchdown, or a big gain. */
  big: boolean;
  /**
   * What the stadium replays (LiveField): a catch (the ball thrown to the player), a throw (the
   * player threw it), a run, or something it doesn't draw (a kick, a sack).
   */
  kind: 'catch' | 'throw' | 'run' | 'other';
  /** Yards gained on the play, when known. */
  yards: number | null;
  at: string | null;
  period: number;
  clock: string;
}

export interface LiveMatchup {
  week: number;
  /** The fantasy week as a whole: before any kickoff, under way, or done. */
  phase: 'upcoming' | 'live' | 'final';
  host: { userId: string; name: string; score: number };
  guest: { userId: string; name: string; score: number };
  players: LivePlayer[];
  /** Newest first. */
  plays: LivePlay[];
  /** A simulated feed for development (see liveMatchup's demo), never real. Shown as DEMO. */
  demo?: boolean;
  /** Any NFL game in progress right now, ours or not: the field is for live play, not warm-ups. */
  anyGameLive?: boolean;
  updatedAt: number;
}
