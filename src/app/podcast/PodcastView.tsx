'use client';

/**
 * The Desk Weekly's page: this week's episode in the player (components/podcast/Player) and the
 * ones before it. Admins record episodes from the AI Desk admin (PodcastAdmin), not here.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Episode } from '@/lib/ai/podcast';
import Player from '@/components/podcast/Player';

export default function PodcastView({ leagueName }: { leagueName: string }) {
  const [data, setData] = useState<{ episodes: Episode[]; recorded: boolean } | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  const load = useCallback(() => fetch('/api/podcast', { cache: 'no-store' }).then(r => r.json()).then(setData).catch(() => setData({ episodes: [], recorded: false })), []);
  useEffect(() => {
    load();
    setPick(new URLSearchParams(window.location.search).get('ep'));
  }, [load]);

  if (!data) return <div className="h-[520px] animate-pulse rounded-[28px] bg-card" />;
  const episode = data.episodes.find(e => e.id === pick) ?? data.episodes[0];

  if (!episode) {
    return (
      <div className="space-y-4">
        <div className="lp-ink relative overflow-hidden rounded-[28px] bg-[#0C1013] p-10 text-center text-white">
          <div className="mx-auto flex h-16 items-end justify-center gap-1.5" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <motion.span key={i} className="w-2 rounded-full bg-[#EE5A2E]" animate={{ height: [10, 48, 18, 36, 10] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
            ))}
          </div>
          <p className="mt-6 text-[22px] font-extrabold">The first episode is on its way.</p>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-white/60">
            Every Tuesday, once the week is final, the Desk&apos;s writers record {leagueName}&apos;s week: the games, the table, the trades and an argument or two.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Player key={episode.id} episode={episode} recorded={data.recorded} autoFocus />
      {data.episodes.length > 1 && (
        <section>
          <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Earlier episodes</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.episodes.map(e => (
              <li key={e.id}>
                <button type="button" onClick={() => { setPick(e.id); history.replaceState(null, '', `?ep=${encodeURIComponent(e.id)}`); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={cn('lp-surface lp-lift w-full rounded-2xl p-4 text-left', e.id === episode.id && 'ring-2 ring-primary')}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#EE5A2E]">Episode {e.number} · Week {e.week}</p>
                  <p className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug">{e.title}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{e.teaser}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
