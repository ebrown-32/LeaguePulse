'use client';

/**
 * Game day, across the top of every page: each matchup in the league and its score, while the
 * week's NFL games are being played (api/live/strip). Nothing at all the rest of the week.
 *
 * Polled every thirty seconds while live and every five minutes otherwise, and not at all from a
 * tab nobody is looking at. A score that moves flashes. The visitor can put it away for the visit
 * (×) or for good (Preferences, lib/prefs).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from '@/components/icons';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { usePrefs } from '@/lib/prefs';
import type { StripGame, StripSide } from '@/app/api/live/strip/route';

const HIDDEN = 'lp:strip:hidden';

function Score({ s, lead }: { s: StripSide; lead: boolean }) {
  return (
    <motion.span key={s.pts} initial={{ scale: 1.25, color: 'hsl(var(--primary))' }} animate={{ scale: 1, color: lead ? 'hsl(var(--primary))' : 'hsl(var(--foreground) / 0.75)' }}
      transition={{ duration: 0.6 }} className={cn('inline-block min-w-[3.4ch] text-center text-[13px] tabular-nums', lead ? 'font-black' : 'font-semibold')}>
      {s.pts.toFixed(1)}
    </motion.span>
  );
}

function Game({ g }: { g: StripGame }) {
  const aLead = g.a.pts > g.b.pts, bLead = g.b.pts > g.a.pts;
  const side = (s: StripSide, right: boolean, lead: boolean) => (
    <span className={cn('flex min-w-0 items-center gap-1.5', right && 'flex-row-reverse')}>
      <Avatar avatarId={s.avatar} size={20} className="shrink-0 rounded-md" />
      <span className={cn('max-w-[96px] truncate text-[12.5px]', lead ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s.team}</span>
    </span>
  );
  return (
    <Link href="/matchups" className="flex shrink-0 snap-start items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-foreground/[0.05]">
      {side(g.a, false, aLead)}
      <span className="flex items-center gap-1 rounded-lg bg-muted/60 px-1.5 py-0.5">
        <Score s={g.a} lead={aLead} />
        <span className="text-[10px] text-muted-foreground/60">–</span>
        <Score s={g.b} lead={bLead} />
      </span>
      {side(g.b, true, bLead)}
    </Link>
  );
}

export default function LiveStrip() {
  const prefs = usePrefs();
  const off = prefs.liveStrip === false;
  const [data, setData] = useState<{ week: number; games: StripGame[] } | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => { try { setHidden(sessionStorage.getItem(HIDDEN) === '1'); } catch { setHidden(false); } }, []);

  useEffect(() => {
    if (off || hidden) return;
    let timer = 0, live = false, stop = false;
    // `?livedemo=1` in development: a made-up live week, to see the strip on a quiet day.
    const demo = new URLSearchParams(window.location.search).get('livedemo') === '1' ? '?demo=1' : '';
    const load = async () => {
      if (document.hidden) return schedule();
      try {
        const r = await fetch(`/api/live/strip${demo}`);
        const d = r.ok ? await r.json() : { live: false };
        live = Boolean(d.live && d.games?.length);
        if (!stop) setData(live ? { week: d.week, games: d.games } : null);
      } catch { /* the next poll tries again */ }
      schedule();
    };
    const schedule = () => { if (!stop) timer = window.setTimeout(load, live ? 30_000 : 300_000); };
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); load(); } };
    load();
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [off, hidden]);

  const dismiss = () => { setHidden(true); try { sessionStorage.setItem(HIDDEN, '1'); } catch { /* this visit only */ } };
  const show = !off && !hidden && data;

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div key="strip" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="z-40 overflow-hidden xl:sticky xl:top-0">
          <div className="mx-auto max-w-7xl px-0 sm:px-6 lg:px-8 xl:pt-4">
            <div role="region" aria-label={`Live scores, week ${data.week}`}
              // A phone: a bar under the header. Wider: the league's own surface, on its radius scale, floating on desktop.
              className="flex h-12 items-center gap-2 border-y border-border/70 bg-card/85 pl-3 pr-1.5 backdrop-blur-xl sm:lp-surface sm:lp-edge sm:rounded-2xl xl:lp-float">
              <span className="flex shrink-0 items-center gap-2 pr-1">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="lp-live-ping absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-foreground">Live</span>
                <span className="hidden text-[11px] font-semibold text-muted-foreground sm:inline">Week {data.week}</span>
              </span>
              <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
              <div className="flex min-w-0 flex-1 snap-x items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {data.games.map(g => <Game key={g.id} g={g} />)}
              </div>
              <Link href="/live" className="group hidden shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10 md:flex">
                Game Day <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <button type="button" onClick={dismiss} aria-label="Hide live scores for this visit"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
