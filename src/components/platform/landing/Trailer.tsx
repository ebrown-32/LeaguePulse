'use client';

/**
 * The trailer, the hero's picture: a minute and a half of the real app, cut to music.
 * Filmed from a league with every team and manager renamed and every photo
 * replaced, so like the rest of this page it shows no real person.
 *
 * Nothing downloads until it is played (the poster is a still), and it never
 * plays by itself: it has sound, and the visitor chooses when.
 */

import { useRef, useState } from 'react';

/** The player, as the hero's picture: the poster with a play button until it is played. */
export default function Trailer() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const play = () => { setPlaying(true); requestAnimationFrame(() => video.current?.play().catch(() => {})); };

  return (
    <div id="trailer" className="scroll-mt-24">
      <div className="relative aspect-video overflow-hidden rounded-[22px] bg-black shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)] ring-1 ring-black/10 dark:ring-white/10">
        <video ref={video} src="/landing/trailer.mp4" poster="/landing/trailer-poster.webp" preload="none" playsInline
          controls={playing} onEnded={() => setPlaying(false)} className="h-full w-full object-cover"
          aria-label="LeaguePulse trailer: custom stadiums, league history, analytics, the AI media desk, Next Gen stats and the simulator, in the app" />
        {!playing && (
          <button onClick={play} aria-label="Play the trailer, 1 minute 32 seconds, with sound"
            className="group absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/55 via-black/5 to-black/15">
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--signal))] text-white shadow-[0_18px_40px_-10px_rgba(238,90,46,0.7)] transition duration-300 group-hover:scale-110 sm:h-20 sm:w-20">
              <span className="absolute inset-0 animate-ping rounded-full bg-[hsl(var(--signal))] opacity-25 motion-reduce:animate-none" />
              <svg viewBox="0 0 24 24" className="relative ml-1 h-8 w-8 sm:h-9 sm:w-9" fill="currentColor" aria-hidden><path d="M7 4.5v15l12.5-7.5Z" /></svg>
            </span>
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-md sm:bottom-4 sm:left-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--signal))]" />Watch the trailer, 1:32
            </span>
          </button>
        )}
      </div>
      <p className="mt-3 text-[11.5px] text-muted-foreground">Filmed in the app with an example league. Colors, logos, fonts, and more are completely customizable.</p>
    </div>
  );
}
