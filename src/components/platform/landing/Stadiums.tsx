'use client';

/**
 * Franchise HQ's stadiums, one of each style, as the app draws them fully
 * built (public/landing/stadiums/). The teams are invented, like every team on
 * this page; the pictures are the real 3D view, rendered with the same
 * renderer the app uses (team/[userId]/tycoon/Stadium3D).
 *
 * One large picture with the rest below to pick from. It moves on by itself
 * every few seconds, holds while the pointer is over it, and stands still for
 * anyone who prefers reduced motion.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

const STADIUMS = [
  { id: 'cantilever', team: 'Harbor Hawks', style: 'Cantilever', where: 'Waterfront, at sunset', color: '#0e6ba8' },
  { id: 'coliseum', team: 'Mesa Scorpions', style: 'Coliseum', where: 'Desert, late afternoon', color: '#c4522b' },
  { id: 'dome', team: 'Metro Monarchs', style: 'Dome', where: 'City, at night', color: '#5b2a86' },
  { id: 'grandstand', team: 'Ridgeline Rams', style: 'Grandstand', where: 'Mountains, at dusk', color: '#7a1f2b' },
  { id: 'horseshoe', team: 'Valley Vipers', style: 'Horseshoe', where: 'Park, midday', color: '#1f7a3a' },
  { id: 'bowl', team: 'Capital Comets', style: 'Classic Bowl', where: 'City, afternoon', color: '#c8102e' },
] as const;

const ease = [0.22, 1, 0.36, 1] as const;
const src = (id: string, size: 'full' | 'thumb') => `/landing/stadiums/${id}${size === 'thumb' ? '-thumb' : ''}.webp`;

export default function Stadiums() {
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (held || reduce) return;
    const t = setTimeout(() => setAt(i => (i + 1) % STADIUMS.length), 5200);
    return () => clearTimeout(t);
  }, [at, held, reduce]);
  const s = STADIUMS[at];
  // On a phone the strip scrolls sideways: keep the one showing in view (the strip only, never the page).
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current, tile = el?.children[at] as HTMLElement | undefined;
    if (!el || !tile || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: tile.offsetLeft - (el.clientWidth - tile.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [at, reduce]);

  return (
    <div onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[22px] bg-black shadow-[0_40px_80px_-40px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
        <AnimatePresence initial={false}>
          <motion.div key={s.id} className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.7 }, scale: { duration: 6, ease: 'linear' } }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(s.id, 'full')} alt={`The ${s.team}' ${s.style.toLowerCase()} stadium, ${s.where.toLowerCase()}`}
              width={1600} height={1000} className="h-full w-full object-cover" loading={at === 0 ? 'eager' : 'lazy'} />
          </motion.div>
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        <AnimatePresence mode="wait">
          <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.45, ease }}
            className="absolute bottom-0 left-0 p-4 text-white sm:p-6">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color, boxShadow: '0 0 0 2px rgba(255,255,255,0.7)' }} />
              {s.style}
            </p>
            <p className="lp-display mt-1 text-[22px] font-extrabold tracking-[-0.02em] sm:text-[30px]">{s.team}</p>
            <p className="text-[12.5px] text-white/75">{s.where}</p>
          </motion.div>
        </AnimatePresence>
        {/* How long until the next one. */}
        {!held && !reduce && (
          <motion.div key={`bar-${s.id}`} className="absolute bottom-0 left-0 h-[3px] bg-[hsl(var(--signal))]"
            initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 5.2, ease: 'linear' }} />
        )}
      </div>

      <div ref={strip} className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-6 sm:overflow-visible sm:px-0" role="tablist" aria-label="Stadium styles">
        {STADIUMS.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === at} onClick={() => setAt(i)}
            className={cn('group relative w-[38%] shrink-0 overflow-hidden rounded-xl text-left ring-1 transition sm:w-auto',
              i === at ? 'ring-2 ring-[hsl(var(--signal))]' : 'ring-white/10 hover:ring-white/40')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(x.id, 'thumb')} alt="" width={480} height={300} loading="lazy"
              className={cn('aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-105', i !== at && 'opacity-70 group-hover:opacity-100')} />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[11px] font-semibold text-white">{x.style}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
