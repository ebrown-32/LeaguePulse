'use client';

/**
 * A legend's story, opened by tapping their statue (LegendStatues): who they are, what they've
 * scored for the franchise, their best game and season by season. A dialog over the whole page, not
 * just the stadium: every page that shows a stadium lays its own captions over it.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from '@/components/icons';
import type { FranchiseLegend } from '@/lib/archive/franchises';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';

const fmt = (n: number, d = 1) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function LegendCard({ legend, team, onClose }: { legend: FranchiseLegend; team: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const photo = playerPhoto({ playerId: legend.playerId, position: legend.position ?? '', nflTeam: legend.nflTeam });
  const most = Math.max(1, ...legend.bySeason.map(s => s.points));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <motion.div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
    <motion.div role="dialog" aria-modal="true" aria-label={`${legend.name}, franchise legend`}
      className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] text-white shadow-2xl"
      initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <div className="relative flex items-end gap-3 px-4 pt-4" style={{ background: `linear-gradient(115deg, ${team} 0%, #0b0f14 85%)` }}>
        <div className="relative h-24 w-20 shrink-0 overflow-hidden">
          {photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photo} alt="" className="absolute bottom-0 h-full w-full object-contain object-bottom" />
            : <span className="flex h-full items-center justify-center font-display text-3xl font-black text-white/80">{initialsOf(legend.name)}</span>}
        </div>
        <div className="min-w-0 flex-1 pb-3">
          <span className="inline-block bg-white px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.2em] text-black">No. {legend.rank} franchise legend</span>
          <p className="mt-1.5 truncate font-display text-[22px] font-black uppercase leading-none">{legend.name}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">{[legend.position, legend.nflTeam].filter(Boolean).join(' · ')}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-px bg-white/10 text-center">
        {[
          [fmt(legend.points), 'points'],
          [String(legend.games), legend.games === 1 ? 'game' : 'games'],
          [String(legend.seasons), legend.seasons === 1 ? 'season' : 'seasons'],
          [fmt(legend.points / Math.max(1, legend.games)), 'per game'],
        ].map(([v, l]) => (
          <div key={l} className="bg-[#0b0f14] px-1 py-2.5">
            <p className="font-display text-[17px] font-black tabular-nums leading-none">{v}</p>
            <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-wider text-white/55">{l}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 px-4 py-3.5">
        {legend.best && (
          <p className="text-[12.5px] text-white/80">
            <span className="font-semibold text-white">Best game:</span> {fmt(legend.best.points)} points, week {legend.best.week} of {legend.best.season}
          </p>
        )}
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Points for the franchise, by season</p>
          <ul className="space-y-1">
            {legend.bySeason.map((s, i) => (
              <li key={s.season} className="flex items-center gap-2 text-[11.5px] tabular-nums">
                <span className="w-9 shrink-0 text-white/60">{s.season}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.span className="block h-full rounded-full" style={{ background: team }}
                    initial={{ width: 0 }} animate={{ width: `${(s.points / most) * 100}%` }} transition={{ duration: 0.6, delay: 0.1 + i * 0.05, ease: 'easeOut' }} />
                </span>
                <span className="w-12 shrink-0 text-right font-semibold">{fmt(s.points)}</span>
                <span className="w-8 shrink-0 text-right text-white/50">{s.games}g</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
    </motion.div>,
    document.body,
  );
}
