'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Lock } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

/**
 * The trophy case.
 *
 * One ring on display at a time, with the years along the bottom to switch
 * between them. Mounting six WebGL canvases at once would be several hundred
 * milliseconds of work and a lot of GPU memory for something most visitors
 * glance at, so the gallery is a row of chips and only the selected ring is
 * ever rendered.
 *
 * Future seasons are shown deliberately rather than hidden. A ring nobody has
 * won yet is the most interesting object in the case.
 */

const ChampionRing = dynamic(() => import('@/components/ui/ChampionRing'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] w-full items-center justify-center rounded-xl bg-card/60">
      <div className="honeycomb" style={{ ['--honeycomb-size' as string]: '12px' }}>
        {Array.from({ length: 7 }, (_, i) => <div key={i} />)}
      </div>
    </div>
  ),
});

export interface Champion {
  season: string;
  userId: string;
  username: string;
  avatar: string;
  details?: { championshipScore?: number };
}

/**
 * Seasons a 3D ring model actually ships for.
 *
 * A league that started in 2019 has real champions with no model to show, and
 * one starting in 2031 will too. The case still lists those seasons, it just
 * shows the champion without a ring rather than requesting a file that is not
 * there and rendering an empty canvas.
 */
const RING_MODELS = new Set(['2024', '2025', '2026', '2027', '2028', '2029']);

/** How far past the current season to display unclaimed rings. */
const FUTURE_SEASONS = 3;

export default function TrophyCase({
  champions,
  currentSeason,
  leagueSeasons = [],
}: {
  champions: Champion[];
  /** The season being played, whose ring is still up for grabs. */
  currentSeason: string;
  /** Every season this league has played, so the case reflects its own
   *  history rather than a fixed range of years. */
  leagueSeasons?: string[];
}) {
  const bySeason = useMemo(
    () => new Map(champions.map(c => [String(c.season), c])),
    [champions],
  );

  /**
   * Every season worth a place in the case: the ones this league has played,
   * the one being played, and a few still to come.
   *
   * Derived rather than listed, so a league that started in 2019 sees its own
   * years instead of a hardcoded 2024 to 2029.
   */
  const seasons = useMemo(() => {
    const set = new Set<string>([
      ...leagueSeasons.map(String),
      ...champions.map(c => String(c.season)),
      String(currentSeason),
    ].filter(y => /^\d{4}$/.test(y)));

    const current = Number(currentSeason);
    if (Number.isFinite(current)) {
      for (let i = 1; i <= FUTURE_SEASONS; i++) set.add(String(current + i));
    }
    // Newest first, so the case opens on the most recent silverware.
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [leagueSeasons, champions, currentSeason]);

  const reigning = useMemo(
    () => [...champions].sort((a, b) => b.season.localeCompare(a.season))[0] ?? null,
    [champions],
  );

  const [selected, setSelected] = useState(reigning?.season ?? currentSeason);
  const champ = bySeason.get(selected) ?? null;
  const isCurrent = selected === currentSeason;
  const isFuture = Number(selected) > Number(currentSeason);

  if (!champions.length) return null;

  return (
    <section className="lp-glass overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Trophy className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Ring showcase
        </h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {champions.length} awarded
        </span>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        {/* Who holds it, or who might. */}
        <div className="order-2 min-w-0 sm:order-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
            {champ
              ? (champ.season === reigning?.season ? 'Reigning champion' : `${champ.season} champion`)
              : isCurrent ? 'This season' : 'Unclaimed'}
          </p>

          {champ ? (
            <>
              <Link
                href={`/team/${champ.userId}`}
                className="mt-2 flex items-center gap-3 transition-opacity hover:opacity-80"
              >
                <Avatar avatarId={champ.avatar} size={44} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate font-display text-lg font-bold text-foreground">
                    {champ.username}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Won the {champ.season} title
                  </span>
                </span>
              </Link>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* Anyone with more than one ring has a claim worth stating. */}
                {champions.filter(c => c.userId === champ.userId).length > 1 && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                    <Trophy className="h-3 w-3" />
                    {champions.filter(c => c.userId === champ.userId).length} time champion
                  </span>
                )}
                {typeof champ.details?.championshipScore === 'number' && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                    Title game
                    <span className="font-semibold tabular-nums text-foreground">
                      {champ.details.championshipScore.toFixed(2)}
                    </span>
                  </span>
                )}
              </div>

              <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                {champions.length === 1
                  ? 'The only name on the wall so far.'
                  : `One of ${champions.length} titles won since the league started.`}
              </p>
            </>
          ) : (
            <div className="mt-2">
              <p className="font-display text-lg font-bold text-foreground">
                {isFuture ? `The ${selected} ring` : 'Still being played for'}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {isFuture
                  ? 'No name on this one yet.'
                  : 'This season is still being played.'}
              </p>
            </div>
          )}
        </div>

        {/* The ring itself. Only ever one canvas. */}
        <div className="order-1 w-full sm:order-2 sm:w-[260px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected}
              initial={{ opacity: 0 }}
              animate={{ opacity: champ ? 1 : 0.45 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              // Unclaimed rings sit dimmed, so the case reads at a glance as
              // won versus not without needing a label on every one.
              className={cn(!champ && 'grayscale')}
            >
              {RING_MODELS.has(selected) ? (
                <ChampionRing modelPath={`/models/rings/ring-${selected}.glb`} height={200} />
              ) : (
                // No model ships for this year. Show the season plainly rather
                // than an empty canvas waiting on a file that does not exist.
                <div className="flex h-[200px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40">
                  <Trophy className="h-7 w-7 text-muted-foreground/50" />
                  <span className="font-display text-sm font-bold text-muted-foreground">
                    {selected}
                  </span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* The years. */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border p-3">
        {seasons.map(season => {
          const won = bySeason.get(season);
          const active = season === selected;
          return (
            <button
              key={season}
              onClick={() => setSelected(season)}
              aria-pressed={active}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors',
                active ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80',
              )}
            >
              {won ? (
                <Avatar avatarId={won.avatar} size={20} className="shrink-0" />
              ) : (
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <span className="min-w-0 text-left">
                <span className={cn(
                  'block text-[12px] font-bold tabular-nums',
                  active ? 'text-primary' : 'text-foreground',
                )}>
                  {season}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {won ? won.username : Number(season) > Number(currentSeason) ? 'Future' : 'Open'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
