'use client';

/**
 * The feed, kept live.
 *
 * Polls while the tab is visible and immediately when it comes back into view,
 * so a phone unlocked an hour later shows the last hour rather than waiting a
 * full interval. Hidden tabs do not poll at all.
 *
 * Tracks which posts arrived after the first load, so the UI can animate an
 * arrival rather than have the list silently change under the reader.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Typing {
  replyTo: string | null;
  personaName: string;
  personaAvatar?: string;
  personaAccent: string;
  dueAt: string;
}

/** When a post became visible: its scheduled time, not when it was written. */
export function visibleAt(p: { publishAt?: string; createdAt: string }): number {
  return new Date(p.publishAt ?? p.createdAt).getTime();
}

export function useLiveFeed<T extends { id: string }>(limit: number, intervalMs = 45_000) {
  const [posts, setPosts] = useState<T[] | null>(null);
  const [typing, setTyping] = useState<Typing[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch(`/api/ai/posts?limit=${limit}`, { cache: 'no-store' }).then(r => r.json());
      const list: T[] = d.posts ?? [];
      if (known.current) {
        const arrived = list.filter(p => !known.current!.has(p.id)).map(p => p.id);
        if (arrived.length) setFresh(prev => new Set([...prev, ...arrived]));
      }
      known.current = new Set(list.map(p => p.id));
      setPosts(list);
      setTyping(d.typing ?? []);
    } catch {
      setPosts(prev => prev ?? []);
    }
  }, [limit]);

  useEffect(() => {
    load();
    let t: ReturnType<typeof setInterval> | undefined;
    const start = () => { if (!t) t = setInterval(load, intervalMs); };
    const stop = () => { if (t) { clearInterval(t); t = undefined; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') { load(); start(); } else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [load, intervalMs]);

  return { posts, typing, fresh, reload: load };
}

/** A clock that ticks, so "2m" becomes "3m" without anything else changing. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function ago(at: number, now: number): string {
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 45) return 'now';
  const mins = Math.max(1, Math.round(secs / 60));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}
