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

export default function PodcastView({ leagueName, logoUrl }: { leagueName: string; logoUrl?: string | null }) {
  const [data, setData] = useState<{ episodes: Episode[]; recorded: boolean } | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [pickWeek, setPickWeek] = useState<number | null>(null);

  const load = useCallback(() => fetch('/api/podcast', { cache: 'no-store' }).then(r => r.json()).then(setData).catch(() => setData({ episodes: [], recorded: false })), []);
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    setPick(q.get('ep'));
    // A link from The Feed names its week too: if that episode was re-recorded since, the week's
    // new one plays instead.
    setPickWeek(Number(q.get('w')) || null);
  }, [load]);

  if (!data) return <div className="h-[560px] animate-pulse rounded-2xl bg-muted/60" />;
  const episode = data.episodes.find(e => e.id === pick) ?? data.episodes.find(e => e.week === pickWeek) ?? data.episodes[0];

  if (!episode) {
    return (
      <div className="lp-surface relative overflow-hidden rounded-2xl px-6 py-12 text-center sm:py-16">
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative mx-auto flex h-14 items-end justify-center gap-1.5" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <motion.span key={i} className="w-2 rounded-full bg-primary" animate={{ height: [10, 44, 18, 34, 10] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
          ))}
        </div>
        <p className="relative mt-6 font-display text-[22px] font-extrabold text-foreground">The first episode is on its way.</p>
        <p className="relative mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">
          Every Tuesday, once the week is final, the Desk&apos;s writers record {leagueName}&apos;s week: the games, the table, the trades and an argument or two.
        </p>
      </div>
    );
  }

  const choose = (e: Episode) => {
    setPick(e.id);
    history.replaceState(null, '', `?ep=${encodeURIComponent(e.id)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8">
      <Player key={episode.id} episode={episode} recorded={data.recorded} autoFocus logoUrl={logoUrl} />
      {data.episodes.length > 1 && (
        <section aria-labelledby="episodes">
          <div className="flex items-baseline justify-between">
            <h2 id="episodes" className="font-display text-[18px] font-extrabold text-foreground">Episodes</h2>
            <span className="text-[12px] font-semibold text-muted-foreground">{data.episodes.length} episodes</span>
          </div>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
            {data.episodes.map(e => <EpisodeCard key={e.id} e={e} current={e.id === episode.id} onPick={() => choose(e)} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

/** About how long an episode runs, from its words: a brisk read is about fifteen characters a second. */
function minutes(e: Episode): number {
  const chars = e.chapters.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.text.length, 0), 0);
  return Math.max(1, Math.round(chars / 15 / 60));
}

/** One episode: its week as the cover, the title, the panel and the running time. */
function EpisodeCard({ e, current, onPick }: { e: Episode; current: boolean; onPick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPick} aria-current={current || undefined}
        className={cn('lp-surface lp-lift flex w-full items-start gap-3 rounded-xl p-3 text-left sm:p-3.5', current && 'border-primary/50 ring-1 ring-primary/40')}>
        {/* The cover: the week, in the league's colour. */}
        <span className={cn('relative flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg', current ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] opacity-80">Week</span>
          <span className="lp-num font-display text-[28px] font-black leading-none">{e.week}</span>
          {current && (
            <span className="absolute bottom-1.5 flex h-2.5 items-end gap-[2px]" aria-hidden>
              {[0, 1, 2].map(i => <motion.span key={i} className="w-[3px] rounded-full bg-current" animate={{ height: [3, 10, 5, 8, 3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {current ? <span className="text-primary">Now playing</span> : `Episode ${e.week}`} · {minutes(e)} min
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[14.5px] font-bold leading-snug text-foreground">{e.title}</span>
          <span className="mt-1.5 flex items-center gap-2">
            <span className="flex -space-x-2">
              {e.hosts.slice(0, 4).map(h => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={h.id} src={h.avatar} alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-full bg-muted object-cover ring-2 ring-card" />
              ))}
            </span>
            <span className="min-w-0 truncate text-[12px] text-muted-foreground">{e.hosts.map(h => h.name).join(', ')}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
