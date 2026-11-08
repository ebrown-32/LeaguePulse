'use client';

/**
 * A fantasy matchup, live, for the stadium (api/live/matchup): fetched while
 * its week is on, every five seconds while the stadium is in view and an NFL
 * game is being played (every minute between games), once when the week is over. New plays come back one at a time as `reel`, for the
 * stadium to replay (the ball in the air, the run, the scorer in the end
 * zone), in the order they happened; a big one is also `celebrate`, for the
 * scoreboard flash and the banner (and, for a score, the fireworks and the pyro). Plays already in the feed
 * when the stadium opened are history, not news.
 *
 * `demo` (a development server only: ?livedemo=1 on the page) simulates a game.
 *
 * `highlights`: a finished week, replayed: the matchup's top scorers and their real plays (ESPN's
 * play by play for that week, asked for with `plays=1`), each one's best, building to the
 * biggest. Where a week's plays can't be had, the top scorers' totals, drawn as the play their
 * position makes and marked `recreated`. It loops for as long as it's on.
 */

import { useEffect, useRef, useState } from 'react';
import type { LiveMatchup, LivePlay } from '@/lib/live/liveTypes';

/** While any NFL game is being played, every few seconds (the server's copy is about as fresh); otherwise a minute, to catch a kickoff. */
const LIVE_POLL_MS = 5_000, IDLE_POLL_MS = 60_000;
/** How long a replay holds the stage: a touchdown lingers in the end zone. */
const REEL_MS = 4_000, TOUCHDOWN_MS = 7_000;
/** At most this many plays wait their turn; a backlog older than that isn't news any more. */
const QUEUE_MAX = 4;

export function liveDemoRequested(): boolean {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('livedemo') === '1';
}

/**
 * A play as a highlight's caption: ESPN's own words, without the formation ("(Shotgun)") or the
 * extra point, the snapper and the holder after it.
 */
export function playCaption(text: string): string {
  return text
    .replace(/^\s*\([^)]*\)\s*/, '')
    .replace(/\bTOUCHDOWN\b[\s\S]*$/, 'TOUCHDOWN')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * The week's highlights, biggest last: the matchup's top scorers (three) and each one's best plays
 * (two: touchdowns first, then the most points), as they happened. Only plays the stadium can draw.
 */
export function highlightReel(d: LiveMatchup, count = 5): { play: LivePlay; name: string }[] {
  const nameOf = (id: string) => d.players.find(x => x.playerId === id)?.name ?? '';
  const drawn = d.plays.filter(p => p.kind !== 'other' && !p.recreated);
  if (drawn.length) {
    const stars = [...d.players].filter(p => (p.points ?? 0) > 0).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
      .filter(p => drawn.some(x => x.playerId === p.playerId)).slice(0, 3);
    const best = (a: LivePlay, b: LivePlay) => Number(b.scoring) - Number(a.scoring) || (b.points ?? 0) - (a.points ?? 0) || (b.yards ?? 0) - (a.yards ?? 0);
    const picks = stars.flatMap(p => drawn.filter(x => x.playerId === p.playerId).sort(best).slice(0, 2));
    if (picks.length) {
      return picks.sort((a, b) => (a.points ?? 0) - (b.points ?? 0) || Number(a.scoring) - Number(b.scoring))
        .map(play => ({ play: { ...play, big: true, text: playCaption(play.text) }, name: nameOf(play.playerId) }));
    }
  }
  return recreatedReel(d, count);
}

/** Where the plays can't be had: the top scorers' totals, as their position's play. */
function recreatedReel(d: LiveMatchup, count: number): { play: LivePlay; name: string }[] {
  const kindOf = (pos: string): LivePlay['kind'] => (pos === 'QB' ? 'throw' : pos === 'RB' ? 'run' : pos === 'WR' || pos === 'TE' ? 'catch' : 'other');
  return d.players
    .filter(p => typeof p.points === 'number' && p.points > 0 && kindOf(p.position) !== 'other')
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, count)
    .reverse()
    .map((p, i, all) => ({
      name: p.name,
      play: {
        id: `hl-${p.playerId}`, playerId: p.playerId, side: p.side, kind: kindOf(p.position),
        text: `${p.name}: ${p.points!.toFixed(1)} fantasy points`, points: p.points, yards: null,
        scoring: false, big: i >= all.length - 2, at: null, period: 0, clock: '', recreated: true,
      },
    }));
}

export function useLiveMatchup(o: { host: string | null; guest: string | null; week?: number; enabled: boolean; polling: boolean; highlights?: boolean }) {
  const [match, setMatch] = useState<LiveMatchup | null>(null);
  const [reel, setReel] = useState<{ play: LivePlay; name: string } | null>(null);
  const queue = useRef<{ play: LivePlay; name: string }[]>([]);
  const [queued, setQueued] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const demo = useRef(false);
  const reelOf = useRef<{ play: LivePlay; name: string }[]>([]);
  useEffect(() => { demo.current = liveDemoRequested(); }, []);

  useEffect(() => {
    if (!o.enabled || !o.host || !o.guest) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout> | null = null;
    seen.current = null;
    const load = async () => {
      const q = new URLSearchParams({ host: o.host!, guest: o.guest! });
      if (o.week) q.set('week', String(o.week));
      if (demo.current) q.set('demo', '1');
      if (o.highlights) q.set('plays', '1');
      const d: LiveMatchup | null = await fetch(`/api/live/matchup?${q}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
      if (cancelled) return;
      if (d) {
        // Highlights: the week's best, recreated, from the top.
        if (o.highlights && seen.current === null) {
          seen.current = new Set();
          reelOf.current = highlightReel(d);
          queue.current = [...reelOf.current];
          setQueued(n => n + 1);
        }
        // The first look is the record so far; anything after it is news.
        else if (seen.current === null) seen.current = new Set(d.plays.map(p => p.id));
        else {
          const fresh = d.plays.filter(p => !seen.current!.has(p.id));
          fresh.forEach(p => seen.current!.add(p.id));
          // Oldest first, as they happened: the ones the stadium can draw, and any big one.
          const worth = fresh.filter(p => p.kind !== 'other' || p.big).reverse()
            .map(p => ({ play: p, name: d.players.find(x => x.playerId === p.playerId)?.name ?? '' }));
          if (worth.length) {
            queue.current = [...queue.current, ...worth].slice(-QUEUE_MAX);
            setQueued(n => n + 1);
          }
        }
        setMatch(d);
      }
      // Keep going while the week isn't over; quickly whenever a game is actually on.
      if (o.polling && !o.highlights && (demo.current || (d && d.phase !== 'final'))) {
        timer = setTimeout(load, demo.current ? 15_000 : d?.anyGameLive ? LIVE_POLL_MS : IDLE_POLL_MS);
      }
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [o.enabled, o.polling, o.host, o.guest, o.week, o.highlights]);

  // One replay at a time, each for its time on stage. Highlights go round again after a breath.
  useEffect(() => {
    if (reel) return;
    if (queue.current.length) { setReel(queue.current.shift()!); return; }
    if (o.highlights && reelOf.current.length) {
      const t = setTimeout(() => { queue.current = [...reelOf.current]; setQueued(n => n + 1); }, 1500);
      return () => clearTimeout(t);
    }
  }, [reel, queued, o.highlights]);
  useEffect(() => {
    if (!reel) return;
    const t = setTimeout(() => setReel(null), reel.play.scoring ? TOUCHDOWN_MS : REEL_MS);
    return () => clearTimeout(t);
  }, [reel]);
  const celebrate = reel?.play.big ? reel : null;

  return { match, celebrate, reel };
}
