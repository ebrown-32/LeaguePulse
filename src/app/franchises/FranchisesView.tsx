'use client';

/**
 * Every franchise in the league's history, from the archive: the ones playing
 * now first, then the ones that have left. Each card opens the franchise's page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Trophy } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { FranchiseSummary } from '@/lib/archive/franchises';

interface Row extends FranchiseSummary { color: string | null; motto: string | null; managed: boolean; managerName: string | null }

const record = (f: Row) => (f.ties ? `${f.wins}-${f.losses}-${f.ties}` : `${f.wins}-${f.losses}`);
const span = (f: Row) => (f.firstSeason === f.lastSeason ? `${f.firstSeason}` : `${f.firstSeason} to ${f.lastSeason}`);

export default function FranchisesView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [archived, setArchived] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/franchises')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setRows(d.franchises); setArchived(d.archived); })
      .catch(() => setError('Could not load the franchises.'));
  }, []);

  if (error) return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{error}</p>;
  if (!rows) return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />)}</div>;
  if (!archived || !rows.length) {
    return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">The league&apos;s history is still being gathered. Franchises appear here once it is.</p>;
  }

  const active = rows.filter(r => r.active), former = rows.filter(r => !r.active);
  return (
    <div className="space-y-8">
      <Leaderboard rows={rows} />
      <Grid rows={active} />
      {former.length > 0 && (
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Former franchises</h2>
          <Grid rows={former} muted />
        </section>
      )}
    </div>
  );
}

function Grid({ rows, muted }: { rows: Row[]; muted?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((f, i) => (
        <motion.div key={f.franchiseId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.35 }}>
          <Link href={`/team/${encodeURIComponent(f.franchiseId)}`}
            className={cn('group relative block overflow-hidden rounded-2xl border border-border bg-card p-4 transition hover:border-foreground/25 hover:shadow-sm sm:p-5', muted && 'opacity-80')}>
            {f.color && <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: f.color }} />}
            <div className="flex items-center gap-3.5">
              <Crest f={f} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold leading-tight tracking-tight">{f.teamName || f.manager}</p>
                <p className="truncate text-[13px] text-muted-foreground">{f.manager}</p>
              </div>
            </div>
            {f.motto && <p className="mt-3 line-clamp-1 text-[13px] italic text-muted-foreground">&ldquo;{f.motto}&rdquo;</p>}
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat label="Record" value={record(f)} />
              <Stat label={f.seasons === 1 ? 'Season' : 'Seasons'} value={String(f.seasons)} sub={span(f)} />
              <Stat label={f.titles === 1 ? 'Title' : 'Titles'} value={String(f.titles)} />
            </dl>
            {f.titleSeasons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {f.titleSeasons.map(y => (
                  <span key={y} className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">
                    <Trophy className="h-3 w-3" />{y}
                  </span>
                ))}
              </div>
            )}
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

function Crest({ f, small }: { f: Row; small?: boolean }) {
  const [broken, setBroken] = useState(false);
  // The platform's own avatar: a franchise's custom logo is for its franchise page only.
  const src = broken ? null : f.avatar;
  return (
    <span className={cn('relative flex shrink-0 items-center justify-center overflow-hidden bg-muted font-bold', small ? 'h-8 w-8 rounded-lg text-[13px]' : 'h-12 w-12 rounded-xl text-[18px]')}
      style={f.color ? { boxShadow: `0 0 0 2px ${f.color}` } : undefined}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
        : (f.teamName || f.manager).slice(0, 1)}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2 py-2">
      <dd className="text-[15px] font-bold tabular-nums leading-tight">{value}</dd>
      <dt className="mt-0.5 text-[11px] text-muted-foreground">{label}</dt>
      {sub && <dd className="text-[10.5px] text-muted-foreground/80">{sub}</dd>}
    </div>
  );
}

interface Board { rank: number; franchiseId: string; value: number; interest: number; stadiumName: string; teamName: string | null; manager: string | null; lastAttendance: number | null; capacity: number | null }

/**
 * The league's franchises by value (Franchise HQ, lib/tycoon). Quiet by
 * default: the top three; the rest unfold on request.
 */
function Leaderboard({ rows }: { rows: Row[] }) {
  const [board, setBoard] = useState<Board[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch('/api/tycoon').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.available) setBoard(d.franchises); }).catch(() => {});
  }, []);
  if (!board?.length) return null;
  const meta = new Map(rows.map(r => [r.franchiseId, r]));
  const top = board[0].value;
  const value = (v: number) => `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M`;
  const name = (b: Board) => b.teamName ?? b.manager ?? '';

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Franchise values</h2>
        {board.length > 3 && (
          <button onClick={() => setOpen(o => !o)} aria-expanded={open}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
            {open ? 'Show less' : `See all ${board.length}`}
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} className="inline-flex"><ChevronDown className="h-3.5 w-3.5" /></motion.span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {board.slice(0, 3).map((b, i) => {
          const m = meta.get(b.franchiseId);
          return (
            <motion.div key={b.franchiseId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <Link href={`/team/${encodeURIComponent(b.franchiseId)}`}
                className="group flex h-full flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-card/60 px-2 py-2.5 text-center transition hover:border-foreground/20 hover:bg-card sm:flex-row sm:gap-2.5 sm:px-3 sm:text-left">
                <span className="hidden w-3 shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground/70 sm:block">{b.rank}</span>
                {m && <Crest f={m} small />}
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight sm:line-clamp-1 sm:text-[13px]">{name(b)}</span>
                  <span className="block text-[12px] font-bold tabular-nums text-muted-foreground">{value(b.value)}</span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="space-y-1 pt-3">
              {board.slice(3).map((b, i) => (
                <motion.li key={b.franchiseId} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.035 }}>
                  <Link href={`/team/${encodeURIComponent(b.franchiseId)}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-muted/50">
                    <span className="text-right text-[12px] font-semibold tabular-nums text-muted-foreground">{b.rank}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{name(b)}</span>
                      <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-muted">
                        <motion.span className="block h-full rounded-full bg-foreground/35"
                          initial={{ width: 0 }} animate={{ width: `${(b.value / top) * 100}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.035, ease: [0.22, 1, 0.36, 1] }} />
                      </span>
                    </span>
                    <span className="text-[12.5px] font-semibold tabular-nums text-muted-foreground">{value(b.value)}</span>
                  </Link>
                </motion.li>
              ))}
            </div>
          </motion.ol>
        )}
      </AnimatePresence>
    </section>
  );
}
