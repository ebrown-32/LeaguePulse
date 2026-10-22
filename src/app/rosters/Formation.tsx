'use client';

/**
 * A roster as a team on the field: the starters lined up in formation on a
 * strip of turf, the kicker and defense on special teams, and the bench on the
 * sideline. Each player is a card (headshot, name, the number that matters);
 * tap one for the profile.
 *
 * The formation is read from positions alone, which is all a fantasy lineup
 * knows: receivers split out wide, tight ends on the line, quarterbacks under
 * center, backs behind them. A flex starter simply lines up at its position.
 * Past four on the line, the inside receivers drop back into the slot. A row
 * with more than four cards shrinks them to fit, so none runs off a phone's field.
 * Switching teams, the new squad runs out into its spots.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { POSITION_COLOR } from './positions';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import type { AnalysisPlayer } from '@/app/api/rosters/analysis/route';

const EASE = [0.22, 1, 0.36, 1] as const;

const photoOf = playerPhoto;
const initials = initialsOf;
const lastName = (p: AnalysisPlayer) => (p.position === 'DEF' ? p.nflTeam || p.name : p.name.split(/\s+/).slice(1).join(' ') || p.name);

export interface FormationProps {
  starters: AnalysisPlayer[];
  bench: AnalysisPlayer[];
  /** The number each card leads with: the projection on a live roster, points on a past one. */
  lead: (p: AnalysisPlayer) => number | null;
  leadLabel: string;
  decimals: number;
  /** Changes when the team does, so the new squad runs out. */
  teamKey: string | number;
  onOpen: (p: AnalysisPlayer) => void;
}

/** The most cards on the line before the inside receivers move to the slot. */
const LINE_MAX = 4;

/** Starters into rows, front of the formation to back. */
function lineUp(starters: AnalysisPlayer[]) {
  const by = (pos: string[]) => starters.filter(p => pos.includes(p.position));
  const wr = by(['WR']), te = by(['TE']);
  // A crowded line keeps one receiver out wide on each side; the rest line up in the slot.
  const crowded = wr.length + te.length > LINE_MAX && wr.length > 2;
  const wide = crowded ? [wr[0], wr[1]] : wr;
  const slot = crowded ? wr.slice(2) : [];
  // Receivers split evenly to each side, tight ends inside them on the line.
  const left = wide.slice(0, Math.ceil(wide.length / 2)), right = wide.slice(Math.ceil(wide.length / 2));
  const teLeft = te.slice(0, Math.floor(te.length / 2)), teRight = te.slice(Math.floor(te.length / 2));
  const known = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
  return {
    line: { left, teLeft, teRight, right },
    slot,
    qb: by(['QB']),
    backs: by(['RB']),
    special: [...by(['K']), ...by(['DEF']), ...starters.filter(p => !known.has(p.position))],
  };
}

export default function Formation({ starters, bench, lead, leadLabel, decimals, teamKey, onOpen }: FormationProps) {
  const rows = useMemo(() => lineUp(starters), [starters]);
  // How many cards share a row, which sets their width (see PlayerCard); four or fewer keeps the usual size.
  const across = (n: number) => ({ ['--n' as string]: Math.max(LINE_MAX, n) });
  const { left, teLeft, teRight, right } = rows.line;
  const best = Math.max(1, ...[...starters, ...bench].map(p => lead(p) ?? 0));
  // Each wave runs out a beat after the one in front of it.
  let order = 0;
  const card = (p: AnalysisPlayer, size: 'field' | 'bench' = 'field') => (
    <PlayerCard key={p.playerId} player={p} value={lead(p)} best={best} label={leadLabel} decimals={decimals}
      size={size} delay={size === 'field' ? 0.06 * order++ : 0} onOpen={() => onOpen(p)} />
  );

  return (
    // A container, so cards size to the field rather than the screen. --pad and --gap are the
    // field's padding (and border) and the line's gap at each width.
    <div className="space-y-4 [--gap:6px] [--max:clamp(64px,18.5vw,108px)] [--pad:18px] [container-type:inline-size] sm:[--gap:12px] sm:[--pad:50px] lg:[--max:136px]"
      style={across(0)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={teamKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
          <Field>
            <div className="relative flex flex-col gap-3 px-2 pb-5 pt-5 sm:gap-5 sm:px-6 sm:pb-8 sm:pt-8">
              {/* The line: receivers out wide, tight ends and the (drawn) line in the middle. */}
              <div className="flex items-end justify-between gap-1.5 sm:gap-3" style={across(left.length + teLeft.length + teRight.length + right.length)}>
                <div className="flex gap-1.5 sm:gap-3">{rows.line.left.map(p => card(p))}</div>
                <div className="flex items-end gap-1.5 sm:gap-3">
                  {rows.line.teLeft.map(p => card(p))}
                  <OffensiveLine />
                  {rows.line.teRight.map(p => card(p))}
                </div>
                <div className="flex gap-1.5 sm:gap-3">{rows.line.right.map(p => card(p))}</div>
              </div>
              {rows.slot.length > 0 && <div className="flex justify-center gap-1.5 sm:gap-3" style={across(rows.slot.length)}>{rows.slot.map(p => card(p))}</div>}
              {rows.qb.length > 0 && <div className="flex justify-center gap-2 sm:gap-4" style={across(rows.qb.length)}>{rows.qb.map(p => card(p))}</div>}
              {rows.backs.length > 0 && <div className={cn('flex justify-center', rows.backs.length <= 3 && 'sm:gap-14', rows.backs.length > 3 ? 'gap-1.5 sm:gap-3' : 'gap-6')} style={across(rows.backs.length)}>{rows.backs.map(p => card(p))}</div>}
            </div>
          </Field>

          {rows.special.length > 0 && (
            <div className="mt-3 rounded-2xl border border-border bg-card/60 p-3 sm:p-4">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Special teams and defense</p>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start sm:gap-3">{rows.special.map(p => card(p))}</div>
            </div>
          )}

          {bench.length > 0 && (
            <div className="mt-3 rounded-2xl border border-border bg-card/60 py-3 sm:py-4">
              <p className="mb-2.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:px-4">
                Sideline <span className="font-semibold normal-case tracking-normal text-muted-foreground/70">· {bench.length} on the bench</span>
              </p>
              {/* A row to swipe on a phone, wrapping on wider screens. */}
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-4">
                {bench.map(p => card(p, 'bench'))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Turf: mown stripes, yard lines and hash marks. */
function Field({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-900/40 shadow-[inset_0_0_80px_rgba(0,0,0,0.35)]"
      style={{
        background: 'repeating-linear-gradient(180deg, #2f7d43 0 44px, #2a7340 44px 88px)',
      }}>
      {/* Yard lines across, hash marks between, a vignette to sit the cards on. */}
      <div aria-hidden className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 87px, rgba(255,255,255,0.55) 87px 89px)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[30%] w-[3px]"
        style={{ backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 22px)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-[30%] w-[3px]"
        style={{ backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 22px)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_40%,transparent_40%,rgba(0,0,0,0.35))]" />
      {children}
    </div>
  );
}

/** The five linemen nobody drafts, drawn as helmets on the line. */
function OffensiveLine() {
  return (
    <div aria-hidden className="mb-2 hidden items-end gap-1 sm:flex">
      {Array.from({ length: 5 }, (_, i) => (
        <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i, duration: 0.4, ease: EASE }}
          className="h-5 w-6 rounded-t-full rounded-b-md border border-white/25 bg-white/15" />
      ))}
    </div>
  );
}

function PlayerCard({ player: p, value, best, label, decimals, size, delay, onOpen }: {
  player: AnalysisPlayer; value: number | null; best: number; label: string; decimals: number;
  size: 'field' | 'bench'; delay: number; onOpen: () => void;
}) {
  const reduce = useReducedMotion();
  const color = POSITION_COLOR[p.position] ?? POSITION_COLOR.DEFAULT;
  const photo = photoOf(p);
  const [broken, setBroken] = useState(false);
  // A gentle tilt toward the pointer, on devices that have one.
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [9, -9]), { stiffness: 260, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-11, 11]), { stiffness: 260, damping: 20 });
  const glare = useTransform([mx, my], (v: number[]) => `radial-gradient(circle at ${50 + v[0] * 100}% ${50 + v[1] * 100}%, rgba(255,255,255,0.28), transparent 55%)`);
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse' || reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const leave = () => { mx.set(0); my.set(0); };
  const share = !p.bye && value != null ? Math.max(0.06, value / best) : 0;
  const field = size === 'field';

  return (
    <motion.button
      type="button" onClick={onOpen} onPointerMove={move} onPointerLeave={leave}
      aria-label={`${p.name}, ${p.position}${p.nflTeam ? `, ${p.nflTeam}` : ''}${p.bye ? ', on a bye' : p.opponent ? `, ${p.opponent}` : ''}${!p.bye && value != null ? `, ${value.toFixed(decimals)} ${label}` : ''}`}
      initial={reduce ? false : { opacity: 0, y: field ? 46 : 12, scale: field ? 0.82 : 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24, delay }}
      whileHover={{ y: -4, scale: 1.04 }} whileTap={{ scale: 0.96 }}
      style={{
        rotateX: rx, rotateY: ry, transformPerspective: 700, ['--pc' as string]: color,
        // Its share of its row, never more than the usual size (Formation sets the variables).
        ...(field && { width: 'min(var(--max), calc((100cqw - var(--pad) + var(--gap)) / var(--n) - var(--gap)))' }),
      }}
      className={cn(
        'group relative shrink-0 overflow-hidden rounded-xl text-left text-white outline-none',
        'shadow-[0_10px_24px_-10px_rgba(0,0,0,0.65)] focus-visible:ring-2 focus-visible:ring-white',
        !field && 'w-[clamp(72px,21vw,100px)] lg:w-[112px]',
      )}
    >
      {/* Frame: the position color, a sheen, the photo. */}
      <span className="absolute inset-0 rounded-xl" style={{ background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 35%, #0b1116))` }} />
      <span className="absolute inset-[2px] rounded-[10px] bg-gradient-to-b from-[#16202a] to-[#0b1116]" />
      <span className="relative block">
        <span className="relative mx-[2px] mt-[2px] block aspect-[4/3.4] overflow-hidden rounded-t-[10px]"
          style={{ background: `radial-gradient(90% 90% at 50% 100%, color-mix(in srgb, ${color} 55%, transparent), transparent 70%)` }}>
          {photo && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" loading="lazy" onError={() => setBroken(true)} draggable={false}
              className={cn('absolute inset-x-0 bottom-0 mx-auto h-[92%] w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:scale-105',
                p.position === 'DEF' && 'bottom-[8%] h-[70%]')} />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-display text-[clamp(16px,5vw,26px)] font-black text-white/80">{initials(p.name)}</span>
          )}
          <span className="absolute left-1 top-1 rounded-md px-1 py-px text-[8.5px] font-black tracking-wider text-white sm:left-1.5 sm:top-1.5 sm:text-[9.5px]" style={{ background: color }}>
            {p.position}
          </span>
          {/* On a bye: dimmed, and said plainly. */}
          {p.bye && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45">
              <span className="-rotate-12 rounded-md border-2 border-white/80 px-1.5 py-0.5 font-display text-[11px] font-black tracking-[0.2em] text-white sm:text-[13px]">BYE</span>
            </span>
          )}
          {p.injuryStatus && (
            <span className="absolute right-1 top-1 rounded bg-rose-600 px-1 py-px text-[7.5px] font-black uppercase tracking-wider text-white sm:right-1.5 sm:top-1.5 sm:text-[8.5px]">
              {p.injuryStatus.length > 4 ? p.injuryStatus.slice(0, 3) : p.injuryStatus}
            </span>
          )}
        </span>
        <span className="relative block px-1.5 pb-1.5 pt-1 sm:px-2 sm:pb-2">
          <span className="block truncate text-[10.5px] font-extrabold leading-tight sm:text-[12.5px]">{lastName(p)}</span>
          <span className="flex items-baseline justify-between gap-1">
            <span className="truncate text-[8.5px] font-semibold uppercase tracking-wide text-white/55 sm:text-[9.5px]">
              {p.bye ? 'Bye week' : p.opponent
                ? <>{p.position !== 'DEF' && p.nflTeam && <span className="hidden sm:inline">{p.nflTeam} </span>}{p.opponent}</>
                : p.position === 'DEF' ? 'Defense' : p.nflTeam || 'FA'}
            </span>
            <span className={cn('font-display text-[12.5px] font-black tabular-nums sm:text-[15px]', p.bye && 'text-white/45')}>{p.bye ? '0.0' : value != null ? value.toFixed(decimals) : '–'}</span>
          </span>
          {/* How this player's number stacks up against the best on the roster. */}
          <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-white/10">
            <motion.span className="block h-full rounded-full" style={{ background: color }}
              initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.9, delay: delay + 0.25, ease: EASE }} />
          </span>
        </span>
      </span>
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background: glare }} />
    </motion.button>
  );
}
