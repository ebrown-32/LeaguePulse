/**
 * Where a fantasy starter is, from their NFL game (lib/live/liveTypes): on the
 * field with the ball, defending, on the sideline, or not playing right now.
 *
 * Pure.
 */

import type { LiveGame } from './espn';
import type { LivePlayer, LiveState } from './liveTypes';

export const OFFENSE = new Set(['QB', 'RB', 'WR', 'TE', 'FB']);
/** A kicker comes out once the ball is about this close: a long field goal's range. */
export const KICKER_RANGE = 37;

/** "Sun 1p", "Mon 8:15p": short enough for a card on the sideline (Eastern, as the NFL lists them). */
const kickoff = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  return s.replace(':00', '').replace(/\s?([AP])M$/, (_, x: string) => x.toLowerCase());
};

/** Where one starter is, from their NFL game. Exported for tests. */
export function placeOf(position: string, team: string, g: LiveGame | undefined, gameWeek: boolean, past: boolean): Pick<LivePlayer, 'state' | 'yardsToEndzone' | 'downDistance' | 'redZone' | 'game'> {
  const none = { yardsToEndzone: null, downDistance: null, redZone: false };
  if (past) return { state: 'final', ...none, game: 'Final' };
  if (!gameWeek) return { state: 'pregame', ...none, game: null };
  if (!g) return { state: 'bye', ...none, game: 'Bye' };
  const label = `${g.away.abbr} @ ${g.home.abbr}`;
  if (g.state === 'pre') return { state: 'pregame', ...none, game: `${label} · ${kickoff(g.kickoff) ?? g.detail}` };
  if (g.state === 'post') return { state: 'final', ...none, game: `${label} · Final` };
  const game = `${label} · ${g.detail}`;
  const ours = g.possession === team, theirs = g.possession != null && !ours;
  let state: LiveState = 'sideline';
  if (ours && OFFENSE.has(position)) state = 'driving';
  if (ours && position === 'K' && (g.yardsToEndzone ?? 99) <= KICKER_RANGE) state = 'driving';
  if (theirs && position === 'DEF') state = 'defending';
  return state === 'sideline'
    ? { state, ...none, game }
    : { state, yardsToEndzone: g.yardsToEndzone, downDistance: g.downDistance, redZone: g.redZone, game };
}

