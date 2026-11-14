'use client';

/**
 * Rivalry week, at the top of the rivalries page (api/rivalry-week): this week's grudge matches,
 * each side in its colours with the all-time series and why it's a grudge; and last week's, with
 * who won and whose stadium is flying the banner. Nothing when there's neither.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Flame } from '@/components/icons';
import type { RivalryGame, RivalryNow } from '@/lib/rivalryWeek';

const ease = [0.22, 1, 0.36, 1] as const;
/** Stadiums (and the plane over the loser's) are on the hosted product. */
const HOSTED = process.env.NEXT_PUBLIC_LP_HOSTED === '1';

function Side({ t, wins, right, won }: { t: RivalryGame['a']; wins: number; right?: boolean; won?: boolean | null }) {
  return (
    <Link href={`/team/${encodeURIComponent(t.userId)}`} className={`flex min-w-0 flex-1 items-center gap-2.5 ${right ? 'flex-row-reverse text-right' : ''}`}>
      {t.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={t.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${t.color}, 0 0 22px -2px ${t.color}` }} />
        : <span className="h-11 w-11 shrink-0 rounded-full" style={{ background: t.color }} />}
      <span className="min-w-0">
        <span className={`block truncate text-[14px] font-black ${won === false ? 'text-muted-foreground' : 'text-foreground'}`}>{t.teamName}</span>
        <span className="lp-num text-[12px] font-bold" style={{ color: t.color }}>{wins} all-time</span>
      </span>
    </Link>
  );
}

function Card({ g, week, done, i }: { g: RivalryGame; week: number; done: boolean; i: number }) {
  const reduce = useReducedMotion();
  const loser = g.winner ? (g.winner === g.a.userId ? g.b : g.a) : null;
  const winner = g.winner ? (g.winner === g.a.userId ? g.a : g.b) : null;
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.5, ease }}
      className="relative overflow-hidden rounded-2xl p-[2px]" style={{ background: `linear-gradient(100deg, ${g.a.color}, ${g.b.color})` }}>
      <div className="relative rounded-[14px] bg-card p-3.5 sm:p-4">
        <div className="pointer-events-none absolute inset-0 rounded-[14px] opacity-[0.08]" style={{ background: `linear-gradient(100deg, ${g.a.color}, transparent 45%, transparent 55%, ${g.b.color})` }} />
        <p className="relative flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.18em] text-[#e0352b]">
          <Flame className="h-3.5 w-3.5" /> {done ? `Week ${week} rivalry, final` : `Rivalry week · week ${week}`} · {g.label}
        </p>
        <div className="relative mt-3 flex items-center gap-2">
          <Side t={g.a} wins={g.series.aWins} won={done ? g.winner === g.a.userId : undefined} />
          {done && g.final
            ? <span className="lp-num shrink-0 text-center text-[15px] font-black text-foreground">{g.final.a.toFixed(1)}<span className="mx-1 text-muted-foreground">-</span>{g.final.b.toFixed(1)}</span>
            : <span className="shrink-0 font-display text-[18px] font-black italic text-muted-foreground">VS</span>}
          <Side t={g.b} wins={g.series.bWins} right won={done ? g.winner === g.b.userId : undefined} />
        </div>
        {!done && g.reasons.length > 0 && (
          <ul className="relative mt-3 flex flex-wrap gap-1.5">
            {g.reasons.map(r => <li key={r} className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-semibold text-foreground/80">{r}</li>)}
          </ul>
        )}
        {done && winner && loser && (
          <p className="relative mt-3 text-[12.5px] text-foreground/80">
            <b>{winner.teamName}</b> owns this one.{HOSTED && <> There&apos;s a plane over <Link href={`/team/${encodeURIComponent(loser.userId)}`} className="font-bold text-primary hover:underline">{loser.teamName}&apos;s stadium</Link> all week to prove it.</>}
          </p>
        )}
      </div>
    </motion.li>
  );
}

export default function RivalryWeekBanner() {
  const [d, setD] = useState<RivalryNow | null>(null);
  useEffect(() => { fetch('/api/rivalry-week').then(r => r.json()).then(setD).catch(() => {}); }, []);
  if (!d || (!d.upcoming && !d.last)) return null;
  return (
    <section className="mb-6 space-y-3">
      {d.upcoming && (
        <ul className="grid gap-3 md:grid-cols-2">
          {d.upcoming.games.map((g, i) => <Card key={g.matchupId} g={g} week={d.upcoming!.week} done={false} i={i} />)}
        </ul>
      )}
      {d.last?.settled && (
        <ul className="grid gap-3 md:grid-cols-2">
          {d.last.games.map((g, i) => <Card key={g.matchupId} g={g} week={d.last!.week} done i={i} />)}
        </ul>
      )}
    </section>
  );
}
