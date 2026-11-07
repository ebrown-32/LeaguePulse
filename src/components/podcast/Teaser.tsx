'use client';

/** This week's episode of The Desk Weekly, at the top of the Feed: a way in to the player (app/podcast). */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import type { Episode } from '@/lib/ai/podcast';

export default function PodcastTeaser() {
  const [ep, setEp] = useState<Episode | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => { fetch('/api/podcast').then(r => r.json()).then(d => setEp(d.episodes?.[0] ?? null)).catch(() => {}); }, []);
  if (!ep) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <Link href={`/podcast?ep=${encodeURIComponent(ep.id)}`}
        className="lp-ink group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-[#0C1013] p-4 text-white ring-1 ring-white/10 transition hover:ring-[#EE5A2E]/50">
        <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-[#EE5A2E] opacity-20 blur-3xl" />
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#EE5A2E] shadow-[0_10px_30px_-8px_rgba(238,90,46,0.8)] transition group-hover:scale-105">
          <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6" fill="#fff" aria-hidden><path d="M7 4.5v15l12.5-7.5Z" /></svg>
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#EE5A2E]">The Desk Weekly · Week {ep.week}</p>
          <p className="mt-0.5 truncate text-[16px] font-extrabold">{ep.title}</p>
          <p className="truncate text-[12.5px] text-white/55">{panelNames(ep.hosts.map(h => h.name))} on the week that was</p>
        </div>
        <div className="relative hidden items-end gap-[3px] sm:flex" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <motion.span key={i} className="w-1 rounded-full bg-white/50" animate={reduce ? { height: 12 } : { height: [6, 22, 10, 18, 6] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1 }} />
          ))}
        </div>
      </Link>
    </motion.div>
  );
}

/** "A, B and C". */
function panelNames(names: string[]): string {
  return names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
