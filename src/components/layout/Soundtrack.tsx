'use client';

/**
 * The site soundtrack's controls (lib/soundtrack): a button that plays and pauses it, bars dancing
 * while it plays, and, where there's room (the desktop side rail, open), the track playing and a
 * skip. One player behind every button, so the music carries on from page to page.
 *
 * `SoundtrackTracks` hands it the tracks, once, from the root layout. With none (a self-hosted
 * site, or no files yet), nothing shows.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Music } from '@/components/icons';
import { cn } from '@/lib/utils';
import { soundtrack, type Track } from '@/lib/soundtrack';

export function SoundtrackTracks({ tracks }: { tracks: Track[] }) {
  useEffect(() => { soundtrack.load(tracks); }, [tracks]);
  return null;
}

function useSoundtrack() {
  return useSyncExternalStore(l => soundtrack.subscribe(l), () => soundtrack.snapshot, () => soundtrack.snapshot);
}

function Bars({ on }: { on: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className="flex h-[14px] items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-[3px] rounded-full bg-current"
          animate={on && !reduce ? { height: [4, 13, 6, 11, 4] } : { height: 4 }}
          transition={on && !reduce ? { duration: 0.9, repeat: Infinity, delay: i * 0.14 } : { duration: 0.2 }} />
      ))}
    </span>
  );
}

/** `rail`: the desktop side rail (the track and a skip beside it when open); `header`: a phone's top bar. */
export function SoundtrackButton({ place }: { place: 'rail' | 'header' }) {
  const s = useSoundtrack();
  if (!s.tracks.length) return null;
  const on = s.playing || s.held;
  const track = s.tracks[s.index];
  const label = on ? `Pause the soundtrack: ${track?.title}` : `Play the soundtrack${track ? `: ${track.title}` : ''}`;

  if (place === 'header') {
    return (
      <button type="button" onClick={() => soundtrack.toggle()} aria-label={label} aria-pressed={on} title={track?.title}
        className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card transition-colors',
          on ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
        {on ? <Bars on={s.playing} /> : <Music className="h-4 w-4" />}
      </button>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1 lp-rail-folded:flex-col">
      <button type="button" onClick={() => soundtrack.toggle()} aria-label={label} aria-pressed={on} title={track?.title}
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
          on ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground')}>
        {on ? <Bars on={s.playing} /> : <Music className="h-[18px] w-[18px]" />}
      </button>
      {on && track && (
        <div className="lp-rail-label flex min-w-0 flex-1 items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground" title={track.title}>{track.title}</span>
          {s.tracks.length > 1 && (
            <button type="button" onClick={() => soundtrack.next()} aria-label="Next track"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
