'use client';

/**
 * Featured leagues: real sites, running on LeaguePulse, linked.
 *
 * The one place on the front page with real screenshots. Each is cropped to
 * the league's name and its headline numbers, so no manager or team name
 * appears, and a league is only listed with its commissioner's say-so.
 * To feature another, add it to FEATURED with two screenshots in
 * public/featured/ (the top of its home page on a computer and on a phone, cut off above
 * anything with a manager or team name in it).
 */

import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { PennantMark } from '../marks';

const ease = [0.22, 1, 0.36, 1] as const;

interface FeaturedLeague {
  name: string;
  url: string;
  host: string;
  provider: string;
  since: string;
  blurb: string;
  desktop: string;
  phone: string;
}

const FEATURED: FeaturedLeague[] = [
  {
    name: 'The Domination League',
    url: 'https://www.dominationleague.com',
    host: 'dominationleague.com',
    provider: 'Sleeper',
    since: '2024',
    blurb: 'The league LeaguePulse was built for. Its own address, its own crest and colours, a desk that posts all week and a Game Day screen that runs every Sunday.',
    desktop: '/featured/dominationleague-desktop.webp',
    phone: '/featured/dominationleague-phone.webp',
  },
];

export default function FeaturedLeagues() {
  return (
    <section id="leagues" className="scroll-mt-16 border-t border-border py-20 lg:scroll-mt-28 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease }}>
          <div className="flex items-center gap-3">
            <PennantMark size={24} />
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Featured leagues</span>
          </div>
          <h2 className="lp-display mt-6 max-w-2xl text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">
            Real leagues. <span className="lp-brand-text">Running on it right now.</span>
          </h2>
        </motion.div>
        <div className="mt-12 space-y-10">
          {FEATURED.map(l => <LeagueCard key={l.url} league={l} />)}
        </div>
      </div>
    </section>
  );
}

function LeagueCard({ league: l }: { league: FeaturedLeague }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  // The phone drifts a little against the browser as the card scrolls past.
  const phoneY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, -40]);

  return (
    <motion.article ref={ref} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease }}
      className="group relative overflow-hidden rounded-[28px] border border-border bg-card">
      <div className="grid grid-cols-1 items-center gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="rounded-full border border-border px-2.5 py-1">{l.provider}</span>
            <span className="rounded-full border border-border px-2.5 py-1">Since {l.since}</span>
          </div>
          <h3 className="lp-display mt-5 text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[34px]">{l.name}</h3>
          <p className="mt-3 max-w-md text-[15.5px] leading-relaxed text-muted-foreground">{l.blurb}</p>
          <a href={l.url} target="_blank" rel="noopener noreferrer"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-[14px] font-semibold text-background transition hover:bg-foreground/85">
            Visit {l.host}
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden
              className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
              <path d="M5 11 11 5M6 5h5v5" />
            </svg>
          </a>
        </div>

        <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${l.name}`}
          className="relative block min-w-0 pb-10 pr-8 sm:pb-12 sm:pr-14">
          {/* Browser */}
          <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-[0_30px_60px_-30px_hsl(var(--foreground)/0.35)] transition-transform duration-500 group-hover:-translate-y-1">
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
              <span className="flex gap-1.5" aria-hidden>
                <i className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                <i className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                <i className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
              </span>
              <span className="mx-auto truncate rounded-full bg-muted px-3 py-1 font-mono text-[11px] text-muted-foreground">{l.host}</span>
              <span className="w-[42px]" aria-hidden />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.desktop} alt={`${l.name} on a computer`} width={1770} height={517} loading="lazy" className="block h-auto w-full" />
          </div>
          {/* Phone */}
          <motion.div style={{ y: phoneY }}
            className="absolute bottom-0 right-0 w-[30%] min-w-[96px] max-w-[190px] overflow-hidden rounded-[22px] border-[5px] border-foreground bg-foreground shadow-[0_24px_50px_-20px_hsl(var(--foreground)/0.5)] sm:rounded-[28px] sm:border-[6px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.phone} alt={`${l.name} installed on a phone`} width={585} height={820} loading="lazy" className="block h-auto w-full rounded-[17px] sm:rounded-[22px]" />
          </motion.div>
        </a>
      </div>
    </motion.article>
  );
}
