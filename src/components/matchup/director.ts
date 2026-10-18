/**
 * The director: works the camera for the viewer, as a football broadcast would. Nearly all of it
 * is the game camera: high on the near sideline at midfield, panning with the action (the ball on
 * the drive most worth watching, a red zone drive first), sometimes pushing in. A play being
 * replayed gets that camera tight on the ball; a touchdown, the end zone up close. Now and then,
 * between plays, a cutaway: the end zone camera, or the crowd across the field.
 *
 * Positions are in the stadium's world units (Gridiron's U per yard), x along the field (the host
 * attacks +x), z across it (the host's sideline +z). Pure.
 */

import { U } from '@/app/team/[userId]/tycoon/Gridiron';
import type { LiveMatchup, LivePlay, LivePlayer } from '@/lib/live/liveTypes';

export interface Shot {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Seconds the camera takes to move there: a cut to a play is quick, a move between shots slow. */
  glide: number;
}

/** How long each shot between plays holds before the next. */
export const BEAT_MS = 9_000;

/** No shot centers beyond the end zones' middles. */
const EDGE = 3.4;
const clampX = (x: number) => Math.max(-EDGE, Math.min(EDGE, x));

/** Which way a player's team is going: the host's offense attacks +x, the visitors' offense -x. */
function attackOf(p: LivePlayer): 1 | -1 {
  const offense = p.state !== 'defending';
  return (p.side === 'host') === offense ? 1 : -1;
}

/** Where the ball is for a player on the field, in world x, or null. */
function ballX(p: LivePlayer): number | null {
  if ((p.state !== 'driving' && p.state !== 'defending') || p.yardsToEndzone == null) return null;
  return clampX(attackOf(p) * (50 - p.yardsToEndzone) * U);
}

/**
 * The game camera: at midfield on the near sideline, high, panning to the action at x (it slides
 * a little along the sideline, as the 50 yard line camera's operator leans with the play).
 * `push` brings it in closer.
 */
function game(x: number, portrait: boolean, glide: number, push = 0): Shot {
  const cx = x * 0.45;
  return portrait
    ? { position: [cx, 4.4 - push * 1.2, 6.4 - push * 1.6], target: [x, 0, 0.2], fov: 52, glide }
    : { position: [cx, 2.9 - push * 0.6, 4.4 - push * 0.9], target: [x, 0, 0.2], fov: 44 - push * 4, glide };
}

/** The shot for a play being replayed: on the ball, and for a touchdown, the end zone up close. */
function playShot(play: LivePlay, match: LiveMatchup, portrait: boolean): Shot {
  const p = match.players.find(x => x.playerId === play.playerId);
  if (play.scoring) {
    const dir = p ? attackOf(p) : play.side === 'host' ? 1 : -1;
    const ez = dir * 55 * U;
    return portrait
      ? { position: [ez - dir * 1.1, 3.0, 4.4], target: [ez, 0.1, 0], fov: 48, glide: 1.6 }
      : { position: [ez - dir * 1.8, 2.0, 3.2], target: [ez, 0.1, 0], fov: 42, glide: 1.6 };
  }
  const x = (p && ballX(p)) ?? 0;
  return game(x, portrait, 1.3, play.big ? 0.8 : 0.55);
}

/**
 * The drives on now, most worth watching first: in the red zone, then closest to scoring. The
 * camera stays with a red zone drive; otherwise it moves between drives every few shots.
 */
function action(match: LiveMatchup, beat: number): number {
  const on = match.players.filter(p => p.state === 'driving' && p.yardsToEndzone != null)
    .sort((a, b) => Number(b.redZone) - Number(a.redZone) || a.yardsToEndzone! - b.yardsToEndzone!);
  if (!on.length) return 0;
  const p = on[0].redZone ? on[0] : on[Math.floor(beat / 3) % on.length];
  return ballX(p) ?? 0;
}

/**
 * Between plays, beat by beat (each BEAT_MS): the game camera, wide or pushed in, with a cutaway
 * twice in every twelve beats, the end zone camera and the crowd.
 */
const ROTATION = ['game', 'push', 'game', 'game', 'push', 'endzone', 'game', 'game', 'push', 'game', 'crowd', 'game'] as const;

function idleShot(match: LiveMatchup, portrait: boolean, beat: number): Shot {
  const x = action(match, beat);
  const kind = ROTATION[((beat % ROTATION.length) + ROTATION.length) % ROTATION.length];
  if (kind === 'endzone') {
    // Behind the end zone the action is heading for, looking up the field.
    const end = Math.sign(x) || 1;
    return portrait
      ? { position: [end * 7.4, 9, 0.01], target: [-end * 0.3, 0, 0], fov: 52, glide: 1.2 }
      : { position: [end * 7.2, 3.6, 0.01], target: [-end * 0.6, 0, 0], fov: 46, glide: 1.2 };
  }
  if (kind === 'crowd') {
    // Across the field into the far stands, from low on the near sideline.
    return portrait
      ? { position: [x * 0.3, 3.0, 3.4], target: [x * 0.3, 1.0, -3.8], fov: 50, glide: 1.2 }
      : { position: [x * 0.3, 1.9, 2.8], target: [x * 0.3, 1.0, -3.8], fov: 44, glide: 1.2 };
  }
  // Back from a cutaway is a cut; otherwise the camera pans and pushes slowly.
  const prev = ROTATION[(((beat - 1) % ROTATION.length) + ROTATION.length) % ROTATION.length];
  const glide = prev === 'endzone' || prev === 'crowd' ? 1.2 : 3.5;
  return game(x, portrait, glide, kind === 'push' ? 0.35 : 0);
}

export function directorShot(o: { match: LiveMatchup; reel: LivePlay | null; portrait: boolean; beat: number }): Shot {
  return o.reel ? playShot(o.reel, o.match, o.portrait) : idleShot(o.match, o.portrait, o.beat);
}
