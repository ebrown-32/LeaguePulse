'use client';

/**
 * A fantasy matchup, live, for the stadium (api/live/matchup): fetched while
 * its week is on, every five seconds while the stadium is in view and an NFL
 * game is being played (every minute between games), once when the week is over. New plays come back one at a time as `reel`, for the
 * stadium to replay (the ball in the air, the run, the scorer in the end
 * zone), in the order they happened; a big one is also `celebrate`, for the
 * fireworks, the scoreboard flash and the banner. Plays already in the feed
 * when the stadium opened are history, not news.
 *
 * `demo` (a development server only: ?livedemo=1 on the page) simulates a game.
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

export function useLiveMatchup(o: { host: string | null; guest: string | null; week?: number; enabled: boolean; polling: boolean }) {
  const [match, setMatch] = useState<LiveMatchup | null>(null);
  const [reel, setReel] = useState<{ play: LivePlay; name: string } | null>(null);
  const queue = useRef<{ play: LivePlay; name: string }[]>([]);
  const [queued, setQueued] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const demo = useRef(false);
  useEffect(() => { demo.current = liveDemoRequested(); }, []);

  useEffect(() => {
    if (!o.enabled || !o.host || !o.guest) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout> | null = null;
    seen.current = null;
    const load = async () => {
      const q = new URLSearchParams({ host: o.host!, guest: o.guest! });
      if (o.week) q.set('week', String(o.week));
      if (demo.current) q.set('demo', '1');
      const d: LiveMatchup | null = await fetch(`/api/live/matchup?${q}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
      if (cancelled) return;
      if (d) {
        // The first look is the record so far; anything after it is news.
        if (seen.current === null) seen.current = new Set(d.plays.map(p => p.id));
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
      if (o.polling && (demo.current || (d && d.phase !== 'final'))) {
        timer = setTimeout(load, demo.current ? 15_000 : d?.anyGameLive ? LIVE_POLL_MS : IDLE_POLL_MS);
      }
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [o.enabled, o.polling, o.host, o.guest, o.week]);

  // One replay at a time, each for its time on stage.
  useEffect(() => { if (!reel && queue.current.length) setReel(queue.current.shift()!); }, [reel, queued]);
  useEffect(() => {
    if (!reel) return;
    const t = setTimeout(() => setReel(null), reel.play.scoring ? TOUCHDOWN_MS : REEL_MS);
    return () => clearTimeout(t);
  }, [reel]);
  const celebrate = reel?.play.big ? reel : null;

  return { match, celebrate, reel };
}
