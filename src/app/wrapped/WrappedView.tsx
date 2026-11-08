'use client';

/**
 * League Wrapped (lib/wrapped/engine): pick a season, or all time, and a manager, and their year
 * plays as a story, on a night-game stage lit in the league's own colors. Their franchise's
 * stadium opens it; players come as trading cards; the big moments make the front page of a
 * newspaper; the league's own writers weigh in. The league gets a story too, and every story ends
 * on a card for the group chat.
 *
 * Phones first: full screen, tap the right side to go on and the left to go back, swipe either way,
 * swipe down to close, hold to pause.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Play, Volume2, VolumeX } from '@/components/icons';
import Avatar from '@/components/ui/Avatar';
import BoxScore from '@/components/wrapped/BoxScore';
import { useStadiumPhoto } from '@/components/desk/StadiumPhoto';
import { POSITION_COLOR } from '@/app/rosters/positions';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import { cn } from '@/lib/utils';
import type { Game, LeagueWrap, ManagerWrap, PlayerRef, Wrapped } from '@/lib/wrapped/engine';
import type { RecordHeld } from '@/lib/wrapped/facts';
import { cueFor, music } from '@/lib/wrapped/music';
import dynamic from 'next/dynamic';

// The rings and the trophy (components/trophies), turning in their slides.
const RingPiece = dynamic(() => import('@/components/trophies/Forge').then(m => m.RingPiece), { ssr: false });
const TrophyPiece = dynamic(() => import('@/components/trophies/Forge').then(m => m.TrophyPiece), { ssr: false });
/** Seasons with a hand-made ring model (lib/ringModels), set by the page. */
let RING_MODELS = new Set<string>();
import { copy, end, headline, picker, take, type Pick } from './copy';

export interface Writer { id: string; name: string; handle: string; avatar: string; type: string }

const ease = [0.22, 1, 0.36, 1] as const;
const PRIMARY = 'hsl(var(--primary))';
const prim = (a: number) => `hsl(var(--primary) / ${a})`;
const rec = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const STAGE = { playoffs: ' · Playoffs', consolation: ' · Consolation' } as const;
const when = (g: Game, all: boolean) => `${all ? `Week ${g.week}, ${g.season}` : `Week ${g.week}`}${g.stage ? STAGE[g.stage] : ''}`;
const last = (name: string) => name.split(' ').slice(-1)[0];

/** The Record Book's lists, named as the History page names them. */
const RECORD_LABEL: Record<string, string> = {
  highScore: 'Highest score', lowScore: 'Lowest score', blowout: 'Biggest blowout', closeGame: 'Closest game',
  shootout: 'Shootout', highScoreLoss: 'Most points in a loss', lowScoreWin: 'Fewest points in a win',
  playerGame: 'Best player game', benchGame: 'Left on the bench', seasonPoints: 'Most points in a season',
  seasonPointsLow: 'Fewest points in a season', seasonRecord: 'Best record', pointsAgainst: 'Toughest schedule',
  gameWinStreak: 'Win streak', gameLossStreak: 'Losing streak', winStreak: 'Winning seasons',
  playoffHighScore: 'Playoff high', playoffLowScore: 'Playoff low',
};
/** What a record's number counts, in its list's unit. */
function recordUnit(r: RecordHeld): string {
  switch (r.type) {
    case 'blowout': case 'closeGame': return 'margin';
    case 'gameWinStreak': case 'gameLossStreak': return 'games';
    case 'winStreak': return 'seasons';
    case 'seasonRecord': return 'record';
    case 'pointsAgainst': return 'pts against';
    default: return 'pts';
  }
}
const COUNTS = new Set(['gameWinStreak', 'gameLossStreak', 'winStreak']);
/** Gold, silver and bronze, lit from the top left; past third, steel. */
const MEDAL = [
  'linear-gradient(145deg, #FFF4C2, #FACC15 45%, #B8860B)',
  'linear-gradient(145deg, #FFFFFF, #CBD5E1 45%, #7C8899)',
  'linear-gradient(145deg, #FFD9B0, #D97706 45%, #8A4B0B)',
];
const STEEL = 'linear-gradient(145deg, #E2E8F0, #94A3B8 45%, #475569)';

/** A round play button: a solid triangle, nudged right so it looks centered (a triangle's weight sits left). */
function PlayDisc({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full', className)}>
      <Play className="ml-[8%] h-[42%] w-[42%]" />
    </span>
  );
}

/** A game's box score as its own slide: both teams, both lineups. */
function boxSlide(key: string, g: Game | null | undefined, kicker: string, tone: string): Slide | null {
  if (!g?.box) return null;
  return { key, tone, body: <>
    <Kicker>{kicker}</Kicker>
    <Rise i={1} className="mt-4"><BoxScore box={g.box} tone="stage" /></Rise>
  </> };
}

/**
 * A Record Book entry, as a card: its rank on a medal, the list's name, the number counting up in
 * its unit, and who, what and when as chips that wrap. Nothing is cut short. A #1 glows gold.
 */
function RecordRow({ r, k, who, avatar }: { r: RecordHeld; k: number; who?: string; avatar?: string | null }) {
  const first = r.rank === 1;
  const at = 0.35 + k * 0.16;
  const chips: { label: string; avatar?: string | null; tone?: string }[] = [
    ...(who ? [{ label: who, avatar }] : []),
    ...(r.detail && r.type !== 'seasonRecord' ? [{ label: r.detail }] : []),
    { label: `${r.season}${r.week ? ` · Week ${r.week}` : ''}` },
    ...(r.stage ? [{ label: r.stage === 'playoffs' ? 'Playoffs' : 'Consolation', tone: r.stage === 'playoffs' ? '#FACC15' : '#94A3B8' }] : []),
  ];
  return (
    <motion.li initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: at, type: 'spring', stiffness: 220, damping: 20 }}
      className={cn('relative overflow-hidden rounded-2xl border p-3 backdrop-blur-md',
        first ? 'border-[#FACC15]/45 bg-[#FACC15]/[0.09] shadow-[0_0_34px_-12px_rgba(250,204,21,0.7)]' : 'border-white/15 bg-white/[0.07]')}>
      {first && (
        <motion.span aria-hidden className="pointer-events-none absolute inset-0" initial={{ x: '-110%' }} animate={{ x: '110%' }}
          transition={{ delay: at + 0.5, duration: 1.2, ease: 'easeInOut' }}
          style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)' }} />
      )}
      <div className="relative flex items-start gap-3">
        <motion.span initial={{ scale: 0, rotate: -120 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: at + 0.15, type: 'spring', stiffness: 380, damping: 14 }}
          className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full text-black shadow-[inset_0_-2px_4px_rgba(0,0,0,0.25),0_4px_12px_-4px_rgba(0,0,0,0.6)]"
          style={{ background: MEDAL[r.rank - 1] ?? STEEL }}>
          <span className="text-[8px] font-black uppercase leading-none tracking-wider opacity-70">No.</span>
          <span className="text-[17px] font-black leading-none tabular-nums">{r.rank}</span>
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">{RECORD_LABEL[r.type] ?? r.type}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {chips.map(c => (
              <span key={c.label} className="inline-flex items-center gap-1 rounded-full bg-white/10 py-0.5 pl-1.5 pr-2 text-[11px] font-medium leading-tight text-white/80"
                style={c.tone ? { color: c.tone, background: `${c.tone}22` } : undefined}>
                {c.avatar && <Avatar avatarId={c.avatar} size={14} className="rounded-full" />}
                {c.label}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 pl-1 text-right">
          <p className={cn('text-[21px] font-black leading-none tracking-tight tabular-nums', first && 'text-[#FDE68A]')}>
            {r.type === 'seasonRecord' ? (r.detail ?? `${Math.round(r.value * 1000) / 10}%`) : <Count to={r.value} decimals={COUNTS.has(r.type) ? 0 : 2} delay={(at + 0.2) * 1000} />}
          </p>
          <p className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/50">{recordUnit(r)}</p>
        </div>
      </div>
    </motion.li>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** A number that counts up when it arrives. */
function Count({ to, decimals = 0, delay = 0 }: { to: number; decimals?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) { setV(to); return; }
    let raf = 0; const t0 = performance.now() + delay;
    const step = (t: number) => { const k = Math.max(0, Math.min(1, (t - t0) / 1100)); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, reduce, delay]);
  return <span className="tabular-nums">{v.toFixed(decimals)}</span>;
}

/** Each piece of a slide arrives a beat after the one above it. */
function Rise({ i = 0, children, className }: { i?: number; children: React.ReactNode; className?: string }) {
  return <motion.div initial={{ opacity: 0, y: 22, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.12 + i * 0.2, duration: 0.65, ease }} className={className}>{children}</motion.div>;
}
const Kicker = ({ children, i = 0 }: { children: React.ReactNode; i?: number }) =>
  <Rise i={i}><p className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: PRIMARY }}>{children}</p></Rise>;
const Big = ({ children, i = 1, small = false }: { children: React.ReactNode; i?: number; small?: boolean }) =>
  <Rise i={i}><div className={cn('font-display font-black leading-[0.9] tracking-[-0.04em] [overflow-wrap:break-word]', small ? 'text-[clamp(30px,min(11cqw,10vh),64px)]' : 'text-[clamp(44px,min(19cqw,17vh),120px)]')}>{children}</div></Rise>;
const Line = ({ children, i = 2, className }: { children: React.ReactNode; i?: number; className?: string }) =>
  <Rise i={i}><p className={cn('mt-3 text-[clamp(17px,4.8vw,22px)] font-semibold leading-snug text-white/90', className)}>{children}</p></Rise>;
const Small = ({ children, i = 3 }: { children: React.ReactNode; i?: number }) =>
  <Rise i={i}><p className="mt-2 text-[13.5px] leading-relaxed text-white/60">{children}</p></Rise>;

/** A player as a trading card: the rosters page's card, grown up, with a stamp for the occasion. */
function TradingCard({ p, value, label, stamp, size = 'lg', i = 1, dim = false }: { p: PlayerRef; value: React.ReactNode; label: string; stamp?: string; size?: 'lg' | 'sm'; i?: number; dim?: boolean }) {
  const [broken, setBroken] = useState(false);
  const color = POSITION_COLOR[p.position ?? ''] ?? POSITION_COLOR.DEFAULT;
  const src = playerPhoto({ playerId: p.id, position: p.position ?? '', nflTeam: p.team });
  return (
    <motion.div initial={{ opacity: 0, rotate: -8, y: 40, scale: 0.85 }} animate={{ opacity: dim ? 0.75 : 1, rotate: size === 'lg' ? -2 : 0, y: 0, scale: 1 }}
      transition={{ delay: 0.1 + i * 0.18, type: 'spring', stiffness: 160, damping: 15 }}
      className={cn('relative shrink-0 overflow-hidden rounded-[18px] p-[3px] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.75)]', size === 'lg' ? 'w-[min(58vw,220px)]' : 'w-[min(35vw,150px)]')}
      style={{ background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 30%, #0b1116))` }}>
      <div className="relative overflow-hidden rounded-[15px] bg-gradient-to-b from-[#16202a] to-[#0b1116]">
        <div className="relative aspect-[4/3.6] overflow-hidden" style={{ background: `radial-gradient(90% 90% at 50% 100%, color-mix(in srgb, ${color} 60%, transparent), transparent 70%)` }}>
          {src && !broken
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={src} alt={p.name} onError={() => setBroken(true)} draggable={false} className={cn('absolute inset-x-0 bottom-0 mx-auto h-[94%] w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]', p.position === 'DEF' && 'bottom-[10%] h-[68%]')} />
            : <span className="absolute inset-0 flex items-center justify-center font-display text-[42px] font-black text-white/80">{initialsOf(p.name)}</span>}
          <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-wider text-white" style={{ background: color }}>{p.position ?? ''}</span>
          {/* The foil: a sheen that sweeps across once. */}
          <motion.span aria-hidden className="pointer-events-none absolute inset-0" initial={{ x: '-120%' }} animate={{ x: '120%' }} transition={{ delay: 0.6 + i * 0.18, duration: 1.1, ease: 'easeInOut' }}
            style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%)' }} />
        </div>
        <div className="px-3 pb-3 pt-2">
          <p className={cn('font-extrabold leading-tight', size === 'lg' ? 'text-[16px]' : 'text-[12.5px]')}>{p.name}</p>
          {/* A small card stacks its label over its number, so neither is cut short. */}
          <div className={cn('mt-0.5 flex gap-x-2', size === 'lg' ? 'items-baseline justify-between' : 'flex-col')}>
            <span className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-wider text-white/55">{label}</span>
            <span className={cn('shrink-0 font-black tabular-nums tracking-tight', size === 'lg' ? 'text-[24px]' : 'text-[18px]')}>{value}</span>
          </div>
        </div>
      </div>
      {stamp && (
        <motion.span initial={{ scale: 2.4, opacity: 0, rotate: -24 }} animate={{ scale: 1, opacity: 1, rotate: -14 }} transition={{ delay: 0.9 + i * 0.18, type: 'spring', stiffness: 300, damping: 14 }}
          className={cn('absolute top-[38%] rounded-md font-display font-black uppercase', size === 'lg' ? 'right-2 border-[3px] px-2 py-0.5 text-[15px] tracking-widest' : 'right-1 border-2 px-1.5 py-px text-[10.5px] tracking-wider')}
          style={{ borderColor: '#EE5A2E', color: '#EE5A2E', background: 'rgba(255,255,255,0.9)' }}>{stamp}</motion.span>
      )}
    </motion.div>
  );
}

/** A torn front-page clipping: the masthead, the date, a headline and its story. */
function Clipping({ league, date, head, dek, i = 2, tilt = -2 }: { league: string; date: string; head: string; dek?: string; i?: number; tilt?: number }) {
  // Torn top and bottom edges, the same every time for the same headline.
  const tear = useMemo(() => {
    const pk = picker(head);
    const n = 18, top: string[] = [], bottom: string[] = [];
    for (let k = 0; k <= n; k++) {
      const x = (k / n) * 100;
      top.push(`${x}% ${pk([0, 1.2, 2.4, 0.6, 1.8])}%`);
      bottom.unshift(`${x}% ${100 - pk([0, 1.2, 2.4, 0.6, 1.8])}%`);
    }
    return `polygon(${[...top, ...bottom].join(',')})`;
  }, [head]);
  return (
    <motion.div initial={{ opacity: 0, y: 60, rotate: tilt * 3, scale: 0.9 }} animate={{ opacity: 1, y: 0, rotate: tilt, scale: 1 }}
      transition={{ delay: 0.15 + i * 0.2, type: 'spring', stiffness: 120, damping: 16 }}
      className="relative w-full max-w-[420px] drop-shadow-[0_22px_40px_rgba(0,0,0,0.55)]">
      <div className="px-5 pb-6 pt-5 text-[#1b1813]" style={{ clipPath: tear, background: 'linear-gradient(180deg, #f4eedf, #ebe2cd)', fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-[#1b1813] pb-1">
          <span className="text-[19px] font-black italic tracking-tight">The Pulse</span>
          <span className="min-w-0 text-right text-[9.5px] uppercase leading-tight tracking-[0.18em] opacity-70">{league} edition</span>
        </div>
        <p className="mt-1 border-b border-[#1b1813]/40 pb-1 text-[9.5px] uppercase tracking-[0.2em] opacity-70">{date}</p>
        <p className="mt-3 text-[clamp(23px,6.6vw,32px)] font-black uppercase leading-[0.98] tracking-[-0.01em]">{head}</p>
        {dek && <p className="mt-2.5 text-[14px] leading-snug opacity-85">{dek}</p>}
      </div>
    </motion.div>
  );
}

/** A writer's take, as a post from the press box. */
function Take({ writer, text, i = 3 }: { writer: Writer | null; text: string; i?: number }) {
  return (
    <motion.div initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: 0.2 + i * 0.2, type: 'spring', stiffness: 180, damping: 18 }}
      className="mt-5 flex max-w-[420px] gap-3 rounded-2xl border border-white/15 bg-white/[0.08] p-3.5 backdrop-blur-md">
      {writer?.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={writer.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full bg-white/10" />
        : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-black" style={{ background: PRIMARY }}>LP</span>}
      <div className="min-w-0">
        <p className="text-[13px] font-bold leading-tight">{writer?.name ?? 'The Press Box'} <span className="whitespace-nowrap font-normal text-white/50">{writer?.handle ?? '@pulse'}</span></p>
        <p className="mt-0.5 text-[14.5px] leading-snug text-white/90">{text}</p>
      </div>
    </motion.div>
  );
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 50 }, (_, i) => ({
    x: Math.random() * 100, d: 1.8 + Math.random() * 1.8, delay: Math.random() * 0.8, r: Math.random() * 720 - 360, w: 6 + Math.random() * 6, i,
  })), []);
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      {bits.map(b => (
        <motion.span key={b.i} className="absolute top-0 block rounded-[2px]" style={{ left: `${b.x}%`, width: b.w, height: b.w * 0.45, background: b.i % 3 === 0 ? PRIMARY : b.i % 3 === 1 ? '#FACC15' : '#ffffff' }}
          initial={{ y: -40, rotate: 0, opacity: 1 }} animate={{ y: '110vh', rotate: b.r, opacity: [1, 1, 0.5] }} transition={{ duration: b.d, delay: b.delay, ease: 'easeIn' }} />
      ))}
    </div>
  );
}

// ── Slides ──────────────────────────────────────────────────────────────────

/** A slide: its tone (a glow beside the league's own color), whether the stadium is its backdrop, and what's on it. */
interface Slide { key: string; tone: string; stadium?: boolean; confetti?: boolean; ghost?: string; body: React.ReactNode }

const TONES = { gold: '#EAB308', fire: '#EA580C', blood: '#E11D48', storm: '#64748B', violet: '#8B5CF6', sea: '#0EA5E9', grass: '#22C55E', night: '#6366F1' };

function managerSlides(m: ManagerWrap, w: Wrapped, cast: Writer[], league: string, cardUrl: string): Slide[] {
  const all = w.scope === 'all';
  const p: Pick = picker(`${m.ownerId}:${w.season ?? 'all'}`);
  const writer = () => (cast.length ? p(cast) : null);
  const year = all ? 'All time' : `${w.season}${w.inProgress ? ', so far' : ''}`;
  const date = (g?: Game | null) => (g ? `${g.season} season · Week ${g.week}` : all ? 'Career edition' : `${w.season} season`);
  const champ = !all && m.finish === 1;
  const s: Slide[] = [];

  s.push({ key: 'intro', tone: TONES.night, stadium: true, body: <>
    <Kicker>League Wrapped · {year}</Kicker>
    {m.avatar && <Rise i={1}><Avatar avatarId={m.avatar} size={88} className="mt-4 rounded-3xl ring-4 ring-white/25" /></Rise>}
    <Big i={2} small>{m.name}</Big>
    <Line i={3}>{all ? `${m.seasons.length} seasons. Every win, every loss, every regret.` : `${end(m.team)} This was your season.`}</Line>
    <Small i={4}>Tap to begin.</Small>
  </> });

  s.push({ key: 'record', tone: champ ? TONES.gold : TONES.sea, confetti: champ || (all && m.titles > 0), ghost: rec(m.record), body: <>
    <Kicker>{all ? 'Career record' : 'The record'}</Kicker>
    <Big><Count to={m.record.w} />-<Count to={m.record.l} />{m.record.t ? <>-<Count to={m.record.t} /></> : null}</Big>
    <Rise i={2} className="mt-5">
      <Clipping league={league} date={date()} i={2} tilt={-2}
        head={headline.record(p, m.name, m.record.w, m.record.l, champ || (all && m.titles > 0))}
        dek={champ ? 'The trophy has a new home. Scenes.' : all && m.titles ? `${m.titles} championship${m.titles > 1 ? 's' : ''}, ${m.finals} final${m.finals === 1 ? '' : 's'}. ${ord(m.pfRank)} in career points.` : `${copy.record(p, m.record.w, m.record.l)} ${ord(m.pfRank)} in points scored.`} />
    </Rise>
  </> });

  const f = m.facts;
  // The ring: this season's, or (all time) the latest one they've won.
  const ringSeason = champ ? String(w.season) : all ? [...m.history].reverse().find(h => h.finish === 1)?.season?.toString() : undefined;
  if (ringSeason) s.push({ key: 'ring', tone: TONES.gold, confetti: champ, body: <>
    <Kicker>{champ ? `The ${ringSeason} ring` : m.titles > 1 ? `${m.titles} rings. The latest:` : `The ${ringSeason} ring`}</Kicker>
    <Rise i={1}><RingPiece season={ringSeason} league={league} champion={m.name} model={RING_MODELS.has(ringSeason)} /></Rise>
    <Line i={2}>{champ ? 'Yours. Forever. Wear it to the draft.' : `${ringSeason}, ${m.name}. Still shining.`}</Line>
  </> });

  if (f?.records.length) s.push({ key: 'records', tone: TONES.gold, body: <>
    <Kicker>The Record Book</Kicker>
    <Big i={1} small>{f.records.some(r => r.rank === 1) ? 'You\u2019re in the book.' : 'Knocking on the door.'}</Big>
    <Rise i={2}><ul className="mt-5 space-y-2">{f.records.slice(0, 4).map((r, k) => <RecordRow key={`${r.type}${r.season}${r.week}`} r={r} k={k} />)}</ul></Rise>
    {f.records.length > 4 && <Small i={4}>And {f.records.length - 4} more on the History page.</Small>}
  </> });

  const finish = !all ? f?.finishes[0]?.finish ?? m.finish : null;
  const postseason = f && (f.titles.length || f.runnerUps.length || f.regularSeasonTitles.length || f.playoffRecord.w + f.playoffRecord.l > 0 || (all && f.legacy));
  if (f && postseason) s.push({ key: 'postseason', tone: f.titles.length ? TONES.gold : TONES.sea, confetti: f.titles.length > 0, body: <>
    <Kicker>{all ? 'The trophy case' : 'The postseason'}</Kicker>
    <Big i={1} small>{all
      ? (f.titles.length ? `${f.titles.length} ring${f.titles.length > 1 ? 's' : ''}` : f.runnerUps.length ? 'So close, so often' : 'Still chasing')
      : (f.titles.length ? 'Champion.' : f.runnerUps.length ? 'Runner-up.' : finish ? `Finished ${ord(finish)}.` : 'Season over.')}</Big>
    <Rise i={2}><div className="mt-5 grid max-w-[420px] grid-cols-2 gap-2.5">
      {[
        { k: 'Titles', v: f.titles.length ? f.titles.join(', ') : '0' },
        { k: 'Finals lost', v: f.runnerUps.length ? f.runnerUps.join(', ') : '0' },
        { k: 'Regular-season titles', v: f.regularSeasonTitles.length ? f.regularSeasonTitles.join(', ') : '0' },
        { k: 'Playoff record', v: `${f.playoffRecord.w}-${f.playoffRecord.l}` },
        ...(all ? [{ k: 'Playoff trips', v: String(f.playoffAppearances) }] : []),
        ...(all && f.legacy ? [{ k: 'Legacy rank', v: `#${f.legacy.rank} of ${f.legacy.of}` }] : []),
      ].map((x, k) => (
        <motion.div key={x.k} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 + k * 0.08 }} className="rounded-2xl border border-white/15 bg-white/[0.07] p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">{x.k}</p>
          <p className={cn('mt-1 font-black leading-tight tracking-tight tabular-nums', x.v.length > 12 ? 'text-[15px]' : 'text-[20px]')}>{x.v}</p>
        </motion.div>
      ))}
    </div></Rise>
    <Small i={4}>Playoff record counts decided title-bracket games, as your team page does.</Small>
  </> });

  if (m.best) s.push({ key: 'best', tone: TONES.fire, ghost: m.best.pts.toFixed(0), body: <>
    <Kicker>Your best week · {when(m.best, all)}</Kicker>
    <Big><Count to={m.best.pts} decimals={1} /></Big>
    <Line>{copy.best(p, m.best.oppName)}</Line>
    <Small>{m.best.pts.toFixed(1)} to {m.best.opp.toFixed(1)} against {end(m.best.oppName)}</Small>
    <Take writer={writer()} text={take.best(p, m.best.pts)} i={4} />
  </> });
  const bestBox = boxSlide('best-box', m.best, `The box score · ${m.best ? when(m.best, all) : ''}`, TONES.fire);
  if (bestBox) s.push(bestBox);

  if (m.worst) s.push({ key: 'worst', tone: TONES.storm, body: <>
    <Kicker>And your worst</Kicker>
    <Rise i={1} className="mt-4">
      <Clipping league={league} date={date(m.worst)} i={1} tilt={2} head={headline.worst(p, m.name, m.worst.pts)}
        dek={`${copy.worst(p, m.worst.pts)} ${m.worst.result === 'W' ? 'Somehow, they won anyway.' : `${m.worst.oppName} put up ${m.worst.opp.toFixed(1)}.`}`} />
    </Rise>
  </> });

  if (m.closestLoss) s.push({ key: 'heartbreak', tone: TONES.blood, ghost: m.closestLoss.margin.toFixed(1), body: <>
    <Kicker>The one that got away · {when(m.closestLoss, all)}</Kicker>
    <Big>by <Count to={m.closestLoss.margin} decimals={2} /></Big>
    <Line>{copy.heartbreak(p, m.closestLoss.margin)}</Line>
    <Small>{m.closestLoss.oppName} {m.closestLoss.opp.toFixed(2)}, you {m.closestLoss.pts.toFixed(2)}.</Small>
    <Take writer={writer()} text={take.heartbreak(p)} i={4} />
  </> });
  const heartBox = boxSlide('heartbreak-box', m.closestLoss, `How it slipped away · ${m.closestLoss ? when(m.closestLoss, all) : ''}`, TONES.blood);
  if (heartBox) s.push(heartBox);

  if (m.luck) {
    const d = m.luck.delta, needle = Math.max(-1, Math.min(1, d / 3));
    s.push({ key: 'luck', tone: d >= 0 ? TONES.gold : TONES.violet, body: <>
      <Kicker>Luck check</Kicker>
      {/* A gauge from cursed to blessed, its needle swinging into place. */}
      <Rise i={1}><div className="relative mt-4 h-[110px] w-[220px]">
        <div className="absolute inset-0 overflow-hidden"><div className="h-[220px] w-[220px] rounded-full" style={{ background: `conic-gradient(from 270deg, #8B5CF6, #64748B 25%, ${PRIMARY} 50%, transparent 50%)` }} /></div>
        <div className="absolute left-1/2 top-[22px] h-[176px] w-[176px] -translate-x-1/2 rounded-full bg-[#07090c]" />
        <motion.div className="absolute bottom-0 left-[calc(50%-2px)] h-[96px] w-[4px] origin-bottom rounded-full bg-white" initial={{ rotate: -90 }} animate={{ rotate: needle * 90 }} transition={{ delay: 0.6, type: 'spring', stiffness: 60, damping: 8 }} />
        <span className="absolute -bottom-5 left-0 text-[10px] font-bold uppercase tracking-widest text-white/60">Cursed</span>
        <span className="absolute -bottom-5 right-0 text-[10px] font-bold uppercase tracking-widest text-white/60">Blessed</span>
      </div></Rise>
      <div className="mt-7"><Big i={2}>{d >= 0 ? '+' : '−'}<Count to={Math.abs(d)} decimals={1} /><span className="ml-2 text-[0.32em] tracking-normal">wins</span></Big></div>
      <Line i={3}>{copy.luck(p, d)}</Line>
      <Small i={4}>Head to head in the regular season. Playing everyone every week, you&apos;d have gone {m.luck.allPlayW}-{m.luck.allPlayL}: {m.luck.expected} wins expected, {m.luck.actual} won.</Small>
    </> });
  }

  if (m.mvp) s.push({ key: 'mvp', tone: TONES.violet, body: <>
    <Kicker>{all ? 'Your all-time MVP' : 'Your MVP'}</Kicker>
    <div className="mt-5 flex justify-center"><TradingCard p={m.mvp.player} value={<Count to={m.mvp.pts} />} label={`${m.mvp.starts} starts`} stamp="MVP" /></div>
    <Line i={3} className="text-center">{m.mvp.share}% of everything you scored. {copy.mvp(p, m.mvp.share, last(m.mvp.player.name))}</Line>
  </> });

  if (m.bench) s.push({ key: 'bench', tone: TONES.grass, body: <>
    <Kicker>The coach&apos;s report</Kicker>
    {/* Lineup IQ as a ring that fills. */}
    <Rise i={1}><div className="relative mt-4 h-36 w-36">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <motion.circle cx="50" cy="50" r="42" fill="none" stroke={PRIMARY} strokeWidth="9" strokeLinecap="round" strokeDasharray={264} initial={{ strokeDashoffset: 264 }} animate={{ strokeDashoffset: 264 * (1 - m.bench.efficiency / 100) }} transition={{ delay: 0.4, duration: 1.3, ease }} /></svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center font-display text-[30px] font-black"><Count to={m.bench.efficiency} decimals={1} /><span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Lineup IQ</span></span>
    </div></Rise>
    <Line i={2}>{copy.bench(p, m.bench.efficiency)}</Line>
    <Small i={3}>{m.bench.left.toLocaleString()} points left on the bench{all ? ' over your career' : ''}.</Small>
    <Take writer={writer()} text={take.bench(p, m.bench.efficiency)} i={4} />
  </> });

  if (m.bench?.worst) {
    const b = m.bench.worst;
    s.push({ key: 'benching', tone: TONES.fire, body: <>
      <Kicker>Exhibit A · Week {b.week}{all ? `, ${b.season}` : ''}</Kicker>
      <div className="mt-5 flex items-center justify-center gap-2 sm:gap-3">
        <TradingCard p={b.benched} value={b.benchedPts.toFixed(1)} label="On your bench" stamp="Benched" size="sm" i={1} />
        <Rise i={2}><span className="font-display text-[26px] font-black text-white/50">vs</span></Rise>
        <TradingCard p={b.started} value={b.startedPts.toFixed(1)} label="In your lineup" size="sm" i={3} dim />
      </div>
      <Line i={4} className="text-center">You sat {last(b.benched.name)} to start {last(b.started.name)}.</Line>
      <Rise i={5}><p className="mt-2 text-center text-[13.5px] text-white/60">{copy.benching(p)}</p></Rise>
    </> });
  }

  if (m.steal) s.push({ key: 'steal', tone: TONES.blood, body: <>
    <Kicker>Draft day steal{all ? `, ${m.steal.season}` : ''}</Kicker>
    <div className="mt-5 flex justify-center"><TradingCard p={m.steal.player} value={<Count to={m.steal.pts} />} label={`Round ${m.steal.round}, pick ${m.steal.pick}`} stamp="Steal" /></div>
    <Line i={3} className="text-center">{copy.steal(p, m.steal.round)}</Line>
  </> });

  if (m.pickup && m.pickup.pts >= 20) s.push({ key: 'pickup', tone: TONES.grass, body: <>
    <Kicker>Best pickup{all ? `, ${m.pickup.season}` : ''}</Kicker>
    <div className="mt-5 flex justify-center"><TradingCard p={m.pickup.player} value={<Count to={m.pickup.pts} />} label={`Week ${m.pickup.week}${m.pickup.bid ? `, $${m.pickup.bid}` : ''}`} stamp="Gem" /></div>
    <Line i={3} className="text-center">{copy.pickup(p, m.pickup.bid)}</Line>
  </> });

  if (m.bestTrade) {
    const t = m.bestTrade;
    s.push({ key: 'trade', tone: TONES.sea, body: <>
      <Kicker>Trade of your {all ? 'career' : 'season'}</Kicker>
      <Rise i={1} className="mt-4">
        <Clipping league={league} date={`${t.season} season · Week ${t.week}`} i={1} tilt={-1.5} head={headline.trade(p, m.name, t.partner)}
          dek={`${m.name} got ${t.got.map(x => x.name).join(' and ') || 'picks'} (${t.gotPts} pts after); ${t.partner} got ${t.gave.map(x => x.name).join(' and ') || 'picks and promises'} (${t.gavePts}). Net: +${t.net}. ${copy.trade(p, t.net)}`} />
      </Rise>
    </> });
  }
  if (m.worstTrade && m.worstTrade.net <= -25) {
    const t = m.worstTrade;
    s.push({ key: 'badtrade', tone: TONES.storm, body: <>
      <Kicker>And the one we don&apos;t talk about</Kicker>
      <Big>{'−'}<Count to={Math.abs(t.net)} decimals={1} /></Big>
      <Line>You sent {t.gave.map(x => x.name).join(' and ') || 'a lot'} to {t.partner} for {t.got.map(x => x.name).join(' and ') || 'not much'}.</Line>
      <Small>{copy.badTrade(p)}</Small>
    </> });
  }

  if (m.nemesis || m.victim) s.push({ key: 'rivals', tone: TONES.blood, body: <>
    <Kicker>Rivalries</Kicker>
    {m.nemesis && <Rise i={1} className="mt-4"><Clipping league={league} date={date()} i={1} tilt={1.5} head={headline.rival(p, m.nemesis.name, m.name, m.nemesis.w, m.nemesis.l)} dek={copy.nemesis(p, m.nemesis.name)} /></Rise>}
    {m.victim && <Rise i={3}><div className="mt-5 max-w-[420px] rounded-2xl border border-white/15 bg-white/[0.08] p-3.5 text-[14.5px] backdrop-blur-md"><span className="font-bold">Favorite victim: {m.victim.name}, {m.victim.w}-{m.victim.l}.</span> <span className="text-white/75">{copy.victim(p, m.victim.name)}</span></div></Rise>}
  </> });

  if (m.moves.adds + m.moves.trades > 0) s.push({ key: 'moves', tone: TONES.night, body: <>
    <Kicker>The front office</Kicker>
    <div className="flex items-end gap-5">
      <Big><Count to={m.moves.adds} /></Big>
      <Rise i={2}><p className="pb-3 text-[13px] font-bold uppercase tracking-widest text-white/60">pickups<br /><span className="text-white">{m.moves.trades} trades</span></p></Rise>
    </div>
    <Line i={3}>{copy.moves(p, m.moves.adds, m.moves.addsRank, w.league.managers)}</Line>
    <Small i={3}>{ord(m.moves.addsRank)} most active on the wire, {ord(m.moves.tradesRank)} in trades.</Small>
    <Take writer={writer()} text={take.moves(p, m.moves.adds)} i={4} />
  </> });

  if (all && m.history.length > 1) {
    const max = Math.max(...m.history.map(h => h.w + h.l + h.t), 1);
    s.push({ key: 'career', tone: TONES.sea, body: <>
      <Kicker>Season by season</Kicker>
      <Rise i={1}><div className="mt-5 flex h-48 items-end gap-1.5" role="img" aria-label="Wins each season; titles in gold">
        {m.history.map((h, k) => (
          <div key={h.season} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[11px] font-bold tabular-nums">{h.w}</span>
            <motion.div className="w-full rounded-t-[4px]" style={{ background: h.finish === 1 ? '#FACC15' : prim(0.85) }}
              initial={{ height: 0 }} animate={{ height: `${(h.w / max) * 150}px` }} transition={{ delay: 0.3 + k * 0.07, duration: 0.6, ease }} />
            <span className="text-[10px] text-white/60">&rsquo;{String(h.season).slice(2)}</span>
          </div>
        ))}
      </div></Rise>
      <Line i={3}>Wins each season{m.titles ? '. Gold is a title.' : '.'}</Line>
    </> });
  }

  if (f?.nextGen) {
    const ng = f.nextGen;
    const traits = ([['Consistency', ng.consistency], ['Explosiveness', ng.explosiveness], ['Clutch', ng.clutch], ['Efficiency', ng.efficiency], ['Momentum', ng.momentum], ['Luck', ng.luck]] as const);
    const top = [...traits].sort((a, b) => b[1] - a[1])[0];
    s.push({ key: 'nextgen', tone: TONES.violet, body: <>
      <Kicker>Your Next Gen profile{all ? ', all time' : ''}</Kicker>
      <Big i={1} small>Superpower: {top[0]}</Big>
      <Rise i={2}><div className="mt-5 max-w-[420px] space-y-2.5">
        {traits.map(([k, v], n) => (
          <div key={k}>
            <div className="flex justify-between text-[12.5px] font-bold"><span className={k === top[0] ? '' : 'text-white/75'}>{k}</span><span className="tabular-nums">{v}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/12">
              <motion.div className="h-full rounded-full" style={{ background: k === top[0] ? PRIMARY : 'rgba(255,255,255,0.75)' }}
                initial={{ width: 0 }} animate={{ width: `${Math.max(2, Math.min(100, v))}%` }} transition={{ delay: 0.5 + n * 0.1, duration: 0.8, ease }} />
            </div>
          </div>
        ))}
      </div></Rise>
      <Small i={4}>Scores out of 100, from the Next Gen page.</Small>
    </> });
  }

  s.push({ key: 'archetype', tone: TONES.gold, stadium: true, confetti: m.archetype.id === 'champion' || m.archetype.id === 'dynasty', body: <>
    <Kicker>{all ? 'All time, you are' : `In ${w.season}, you were`}</Kicker>
    <motion.div initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 110, damping: 13 }} style={{ transformPerspective: 800 }}>
      <div className="mt-2 font-display text-[clamp(46px,14vw,88px)] font-black leading-[0.92] tracking-[-0.04em]">{m.archetype.title}</div>
    </motion.div>
    <Line i={3}>{m.archetype.why}</Line>
    <Take writer={writer()} text={take.archetype(p, m.archetype.title)} i={4} />
  </> });

  s.push({ key: 'card', tone: TONES.night, body: <SummaryCard src={cardUrl} name={m.name} /> });
  return s;
}

function leagueSlides(L: LeagueWrap, w: Wrapped, cast: Writer[], league: string, cardUrl: string): Slide[] {
  const all = w.scope === 'all';
  const p: Pick = picker(`league:${w.season ?? 'all'}`);
  const writer = () => (cast.length ? p(cast) : null);
  const season = all ? 'All-time edition' : `${w.season} season`;
  const s: Slide[] = [];
  s.push({ key: 'intro', tone: TONES.night, stadium: true, body: <>
    <Kicker>League Wrapped · {all ? 'All time' : `${w.season}${w.inProgress ? ', so far' : ''}`}</Kicker>
    <Big i={1} small>{league}</Big>
    <Line i={2}>{all ? `${L.seasons.length} seasons. ${L.games.toLocaleString()} games.` : `${L.games} games, ${L.trades} trades, ${L.adds} pickups.`} Here&apos;s what happened.</Line>
    <Small i={3}>Tap to begin.</Small>
  </> });
  if (L.champions.length) s.push({ key: 'champ', tone: TONES.gold, confetti: true, body: all ? <>
    <Kicker>Every champion</Kicker>
    <Rise i={1}><ul className="mt-4 max-w-[420px] space-y-1.5 text-[16px]">{L.champions.map((c, k) => (
      <motion.li key={c.season} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + k * 0.08 }} className="flex justify-between gap-4 border-b border-white/10 pb-1.5">
        <span className="font-display font-black" style={{ color: '#FACC15' }}>{c.season}</span><span className="min-w-0 font-semibold leading-tight">{c.name}</span><span className="tabular-nums text-white/60">{c.record}</span>
      </motion.li>))}</ul></Rise>
  </> : <>
    <Kicker>Your champion</Kicker>
    <Rise i={1} className="mt-4"><Clipping league={league} date={season} i={1} head={headline.champion(p, L.champions[0].name)} dek={`${L.champions[0].team} finishes ${L.champions[0].record} and lifts the trophy. The rest of the league will hear about this until the draft.`} /></Rise>
  </> });
  // The hardware: the trophy, every champion on it (all time), or the season's ring.
  if (all && L.champions.length) s.push({ key: 'trophy', tone: TONES.night, body: <>
    <Kicker>The trophy</Kicker>
    <Rise i={1}><TrophyPiece league={league} champions={L.champions.map(c => ({ season: String(c.season), name: c.name }))} /></Rise>
    <Line i={2}>{L.champions.length} champion{L.champions.length === 1 ? '' : 's'}. Every name, engraved.</Line>
  </> });
  if (!all && L.champions[0] && !w.inProgress) s.push({ key: 'ring', tone: TONES.gold, body: <>
    <Kicker>The {w.season} ring</Kicker>
    <Rise i={1}><RingPiece season={String(w.season)} league={league} champion={L.champions[0].name} model={RING_MODELS.has(String(w.season))} /></Rise>
    <Line i={2}>{L.champions[0].name}&apos;s, forever.</Line>
  </> });

  const book = L.facts?.records ?? [];
  if (book.length) s.push({ key: 'records', tone: TONES.gold, body: <>
    <Kicker>{all ? 'The Record Book' : `Records that fell in ${w.season}`}</Kicker>
    <Big i={1} small>{all ? 'Every #1.' : `${book.length} new record${book.length > 1 ? 's' : ''}.`}</Big>
    <Rise i={2}><ul className="mt-5 space-y-2">{book.slice(0, 5).map((r, k) => <RecordRow key={`${r.type}${r.season}${r.week}`} r={r} k={k} who={r.name} avatar={w.managers.find(x => x.ownerId === r.ownerId)?.avatar} />)}</ul></Rise>
    {book.length > 5 && <Small i={4}>The rest are on the History page.</Small>}
  </> });

  if (L.best) s.push({ key: 'best', tone: TONES.fire, body: <>
    <Kicker>Game of the {all ? 'ages' : 'year'} · {when(L.best, all)}</Kicker>
    <Big><Count to={L.best.pts} decimals={1} /></Big>
    <Line>{L.best.name}, against {end(L.best.oppName)}</Line>
    <Take writer={writer()} text={take.best(p, L.best.pts)} i={3} />
  </> });
  const gotyBox = boxSlide('best-box', L.best, `The box score · ${L.best ? when(L.best, all) : ''}`, TONES.fire);
  if (gotyBox) s.push(gotyBox);
  if (L.blowout) s.push({ key: 'blowout', tone: TONES.blood, body: <>
    <Kicker>Biggest blowout</Kicker>
    <Rise i={1} className="mt-4"><Clipping league={league} date={`${L.blowout.season} season · Week ${L.blowout.week}`} i={1} tilt={2}
      head={`${L.blowout.name.toUpperCase()} WINS BY ${L.blowout.margin.toFixed(1)}`} dek={`${L.blowout.oppName} has asked that we stop printing the score. We are printing the score: ${L.blowout.pts.toFixed(1)} to ${L.blowout.opp.toFixed(1)}.`} /></Rise>
  </> });
  const blowBox = boxSlide('blowout-box', L.blowout, `The carnage, slot by slot · ${L.blowout ? when(L.blowout, all) : ''}`, TONES.blood);
  if (blowBox) s.push(blowBox);
  if (L.closest) s.push({ key: 'closest', tone: TONES.blood, body: <>
    <Kicker>Closest finish · {when(L.closest, all)}</Kicker>
    <Big>by <Count to={L.closest.margin} decimals={2} /></Big>
    <Line>{L.closest.name} edged {end(L.closest.oppName)} Cardiologists were consulted.</Line>
    <Small>{L.closest.name} {L.closest.pts.toFixed(2)}, {L.closest.oppName} {L.closest.opp.toFixed(2)}.</Small>
    <Take writer={writer()} text={take.heartbreak(p)} i={3} />
  </> });
  const closeBox = boxSlide('closest-box', L.closest, `Every point counted · ${L.closest ? when(L.closest, all) : ''}`, TONES.blood);
  if (closeBox) s.push(closeBox);
  if (L.luckiest && L.unluckiest) s.push({ key: 'luck', tone: TONES.gold, body: <>
    <Kicker>The luck ledger</Kicker>
    <Rise i={1}><p className="mt-4 text-[clamp(28px,8vw,40px)] font-black">{L.luckiest.name} <span className="text-[#4ADE80]">+{L.luckiest.delta}</span></p></Rise>
    <Line i={2}>Won more than the scores said they should. Buy a lottery ticket.</Line>
    <Rise i={3}><p className="mt-7 text-[clamp(28px,8vw,40px)] font-black">{L.unluckiest.name} <span className="text-[#FB7185]">{L.unluckiest.delta}</span></p></Rise>
    <Line i={4}>The schedule had a personal grudge. Hug them.</Line>
  </> });
  if (L.tradeOfTheYear) s.push({ key: 'trade', tone: TONES.sea, body: <>
    <Kicker>Trade of the {all ? 'ages' : 'year'}</Kicker>
    <Rise i={1} className="mt-4"><Clipping league={league} date={`${L.tradeOfTheYear.season} season · Week ${L.tradeOfTheYear.week}`} i={1}
      head={headline.trade(p, L.tradeOfTheYear.name, L.tradeOfTheYear.partner)} dek={`${L.tradeOfTheYear.name} got ${L.tradeOfTheYear.got.map(x => x.name).join(' and ')} and came out ${L.tradeOfTheYear.net} points ahead.`} /></Rise>
  </> });
  if (L.mvp) s.push({ key: 'mvp', tone: TONES.violet, body: <>
    <Kicker>The league&apos;s MVP</Kicker>
    <div className="mt-5 flex justify-center"><TradingCard p={L.mvp.player} value={<Count to={L.mvp.pts} />} label={`For ${L.mvp.name}`} stamp="MVP" /></div>
  </> });
  if (L.busiest) s.push({ key: 'busy', tone: TONES.night, body: <>
    <Kicker>Most likely to be on the waiver wire at 3am</Kicker>
    <Big i={1} small>{L.busiest.name}</Big>
    <Line i={2}>{L.busiest.moves} moves. Someone check on them.</Line>
    <Take writer={writer()} text={take.moves(p, L.busiest.moves)} i={3} />
  </> });
  s.push({ key: 'card', tone: TONES.night, body: <SummaryCard src={cardUrl} name={league} /> });
  return s;
}

function SummaryCard({ src, name }: { src: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      // Share the image itself where the phone allows it, the link otherwise.
      const blob = await fetch(src).then(r => r.blob()).catch(() => null);
      const file = blob ? new File([blob], 'league-wrapped.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${name}: League Wrapped`, url });
      else if (navigator.share) await navigator.share({ title: `${name}: League Wrapped`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* closed */ }
  };
  return (
    <div className="flex flex-col items-center gap-4" data-interactive>
      <Rise i={0}><p className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: PRIMARY }}>Post it in the group chat</p></Rise>
      <motion.img src={src} alt={`${name}'s League Wrapped card`} draggable={false} initial={{ y: 30, opacity: 0, rotate: -3 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 140, damping: 16 }}
        className="max-h-[56dvh] w-auto rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/20" />
      <Rise i={2}><div className="flex gap-2">
        <button onClick={share} className="rounded-full bg-white px-6 py-3 text-[15px] font-bold text-black">{copied ? 'Link copied' : 'Share'}</button>
        <a href={src} download={`${name.replace(/[^\w]+/g, '-')}-wrapped.png`} className="rounded-full border border-white/40 px-6 py-3 text-[15px] font-bold">Save</a>
      </div></Rise>
    </div>
  );
}

// ── The player ──────────────────────────────────────────────────────────────

/**
 * A slide, always whole on screen: centered when it fits, and scaled down to fit when it's taller
 * than the room between the controls (a box score on a small phone, a phone on its side), rather
 * than cut off at the top and bottom.
 */
function Fit({ children }: { children: React.ReactNode }) {
  const room = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const r = room.current, b = body.current;
    if (!r || !b) return;
    // The body's own size isn't changed by its transform, so measuring it never feeds back.
    const measure = () => { const need = b.offsetHeight, have = r.clientHeight; setScale(need > have ? Math.max(0.42, have / need) : 1); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(r); ro.observe(b);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={room} className="flex min-h-0 w-full flex-1 items-center justify-center">
      <div ref={body} className="w-full shrink-0" style={scale < 1 ? { transform: `scale(${scale})` } : undefined}>{children}</div>
    </div>
  );
}

const SLIDE_MS = 7500;

function Story({ slides, onClose, onDone, stadium }: { slides: Slide[]; onClose: () => void; onDone?: () => void; stadium: { host: string; team: string; season: string } | null }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dir, setDir] = useState(1);
  const [drag, setDrag] = useState(0);
  const paused = useRef(false);
  const gesture = useRef<{ x: number; y: number; t: number; hold: number | null } | null>(null);
  const glow = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(music.muted);
  const end = slides.length - 1;
  const go = useCallback((d: number) => {
    setDir(d);
    setI(x => Math.max(0, Math.min(end, x + d)));
    setProgress(0);
    try { navigator.vibrate?.(6); } catch { /* not on this phone */ }
  }, [end]);

  // The franchise's stadium, photographed at night from above: developed once, for the whole story.
  const spec = useMemo(() => (stadium ? { shot: 'aerial' as const, host: stadium.host, guest: stadium.host, season: stadium.season, week: 1, hour: 20.5, stands: 0.95, lots: 0.9 } : null), [stadium]);
  const photo = useStadiumPhoto(spec, stadium?.team ?? '');

  // The soundtrack (lib/wrapped/music): from the count-in when the story opens, out when it closes.
  useEffect(() => { music.start(); return () => music.stop(); }, []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const { cue, low } = cueFor(slides[i].key, slides[i].confetti);
    music.slide(cue, low, dir > 0);
    // Only on a change of slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    let raf = 0, prev = performance.now(), wasPaused = false;
    const tick = (t: number) => {
      const dt = t - prev; prev = t;
      if (!paused.current && i < end) setProgress(p => { const n = p + dt / SLIDE_MS; if (n >= 1) { go(1); return 0; } return n; });
      if (paused.current !== wasPaused) { wasPaused = paused.current; music.setPaused(wasPaused); }
      // The stage's light thumps with the kick.
      if (glow.current && !reduce) glow.current.style.opacity = String(0.7 + 0.3 * music.pulse());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, end, go, reduce]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); paused.current = !paused.current; }
    };
    window.addEventListener('keydown', onKey);
    const was = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = was; };
  }, [go, onClose]);

  // Gestures: tap a side, swipe across, swipe down to close, hold to pause.
  const down = (e: React.PointerEvent) => {
    music.unlock(); // a story opened from a link starts its music on the first tap
    if ((e.target as HTMLElement).closest('[data-interactive]')) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), hold: window.setTimeout(() => { paused.current = true; }, 220) };
  };
  const move = (e: React.PointerEvent) => {
    const g = gesture.current; if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if ((Math.abs(dx) > 8 || Math.abs(dy) > 8) && g.hold) { clearTimeout(g.hold); g.hold = null; }
    if (dy > 0 && dy > Math.abs(dx)) setDrag(dy);
  };
  const up = (e: React.PointerEvent) => {
    const g = gesture.current; gesture.current = null;
    setDrag(0);
    if (!g) return;
    if (g.hold) clearTimeout(g.hold);
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    const held = paused.current && Date.now() - g.t > 220;
    paused.current = false;
    if (dy > 110 && dy > Math.abs(dx)) return onClose();
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return go(dx < 0 ? 1 : -1);
    if (held) return;
    if (e.clientX < window.innerWidth * 0.3) go(-1); else if (i < end) go(1);
  };

  const slide = slides[i];
  return (
    <motion.div className="fixed inset-0 z-[90] touch-none select-none overflow-hidden bg-[#07090c] text-white [-webkit-touch-callout:none]"
      initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1, y: drag * 0.6 }} exit={{ opacity: 0, y: 80 }} transition={{ duration: 0.3, ease }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gesture.current = null; setDrag(0); paused.current = false; }}
      style={{ borderRadius: drag ? 24 : 0 }}>
      {photo.darkroom}
      {/* The stage: night, lit in the league's own color, with the slide's tone across from it. */}
      <div ref={glow} className="absolute inset-0" style={{ opacity: 0.7, background: `radial-gradient(90% 70% at 15% 0%, ${prim(0.55)}, transparent 60%)` }} />
      <motion.div key={`tone-${slide.key}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
        style={{ background: `radial-gradient(80% 60% at 100% 100%, ${slide.tone}66, transparent 65%)` }} />
      <AnimatePresence>
        {slide.stadium && photo.url && (
          <motion.div key="stadium" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img src={photo.url} alt="" className="h-full w-full object-cover" initial={{ scale: 1.15 }} animate={{ scale: reduce ? 1.15 : 1.02 }} transition={{ duration: 9, ease: 'easeOut' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,9,12,0.35) 0%, rgba(7,9,12,0.55) 45%, rgba(7,9,12,0.95) 100%)' }} />
          </motion.div>
        )}
      </AnimatePresence>
      {!reduce && <motion.div aria-hidden className="absolute -right-24 top-1/4 h-[60vmin] w-[60vmin] rounded-full opacity-30 blur-3xl" style={{ background: PRIMARY }}
        animate={{ x: [0, -30, 10, 0], y: [0, 24, -16, 0], scale: [1, 1.12, 0.96, 1] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />}
      {slide.ghost && <motion.div key={`ghost-${slide.key}`} aria-hidden initial={{ opacity: 0, x: 60 }} animate={{ opacity: 0.07, x: 0 }} transition={{ duration: 1.2, ease }}
        className="pointer-events-none absolute -bottom-[0.16em] right-[-0.04em] whitespace-nowrap font-display text-[38vmin] font-black leading-none tracking-[-0.05em]">{slide.ghost}</motion.div>}
      {slide.confetti && !reduce && <Confetti key={`c-${slide.key}`} />}

      {/* Progress, a segment a slide, below the phone's status bar. */}
      <div className="absolute inset-x-3 z-10 flex gap-1 sm:inset-x-6" style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}>
        {slides.map((s2, k) => (
          <div key={s2.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${k < i ? 100 : k === i ? (i === end ? 100 : progress * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <button aria-label={muted ? 'Sound on' : 'Sound off'} aria-pressed={!muted} data-interactive
        onClick={() => { music.unlock(); music.setMuted(!muted); setMuted(!muted); }}
        className="absolute right-[62px] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/30 backdrop-blur sm:right-[78px]" style={{ top: 'calc(env(safe-area-inset-top) + 22px)' }}>
        {muted ? <VolumeX className="h-5 w-5 text-white/70" /> : <Volume2 className="h-5 w-5" />}
      </button>
      <button aria-label="Close" data-interactive onClick={onClose}
        className="absolute right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-[24px] backdrop-blur sm:right-6" style={{ top: 'calc(env(safe-area-inset-top) + 22px)' }}>&times;</button>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={slide.key} className="relative z-[5] mx-auto flex h-full w-full max-w-xl flex-col px-5 [container-type:inline-size] sm:px-10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + min(78px, 15vh))', paddingBottom: 'calc(env(safe-area-inset-bottom) + min(52px, 8vh))' }}
          initial={{ opacity: 0, x: reduce ? 0 : dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : dir * -40, filter: 'blur(6px)' }} transition={{ duration: 0.35, ease }}>
          <Fit>{slide.body}</Fit>
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-x-0 z-10 flex justify-center text-[12px] font-semibold text-white/55" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}>
        {i === end && onDone
          ? <button data-interactive onClick={onDone} className="rounded-full bg-white/15 px-5 py-2.5 text-[13px] text-white backdrop-blur">Watch the next story</button>
          : <span className="[@media(max-height:520px)]:hidden">Tap or swipe · hold to pause · swipe down to close</span>}
      </div>
    </motion.div>
  );
}

/** A story's thumbnail: its MVP's photo, nothing at all if there isn't one (never a broken image). */
function CoverPlayer({ p }: { p: PlayerRef }) {
  const [ok, setOk] = useState(true);
  const src = playerPhoto({ playerId: p.id, position: p.position ?? '', nflTeam: p.team });
  if (!src || !ok) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" draggable={false} onError={() => setOk(false)}
    className={cn('pointer-events-none absolute inset-x-0 top-[8%] mx-auto h-[62%] w-auto object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.55)]', p.position === 'DEF' && 'top-[16%] h-[44%]')} />;
}

// ── The page ────────────────────────────────────────────────────────────────

interface Payload { seasons: { season: number; final: boolean }[]; wrapped: Wrapped | null; cast?: Writer[]; error?: string }

/** `archived`: whether this site keeps a league archive (a database) for Wrapped to be built from. */
export default function WrappedView({ leagueName, archived = true, ringModels = [] }: { leagueName: string; archived?: boolean; ringModels?: string[] }) {
  RING_MODELS = new Set(ringModels);
  const [season, setSeason] = useState<string | null>(null);
  /** The link has been read: nothing is fetched before, so a shared link's season wins. */
  const [ready, setReady] = useState(false);
  const request = useRef(0);
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState<string | null>(null); // an owner id, or 'league'
  const [me, setMe] = useState<string | null>(null);

  // A shared link opens straight into a story: ?season=2025&m=<owner>.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setSeason(q.get('season'));
    if (q.get('m')) setOpen(q.get('m'));
    setReady(true);
    let pass: string | null = null;
    try { pass = localStorage.getItem('lp_visitor'); } catch { /* none */ }
    if (pass) fetch('/api/account/me', { headers: { 'x-visitor-pass': pass } }).then(r => r.json()).then(d => d?.id && setMe(d.id)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!ready) return;
    // Only the latest request may land: a slow answer for another season can't overwrite this one.
    const id = ++request.current;
    fetch(`/api/wrapped${season ? `?season=${season}` : ''}`).then(r => r.json())
      .then((d: Payload) => { if (id === request.current) setData(d); })
      .catch(() => { if (id === request.current) setData({ seasons: [], wrapped: null, error: 'Wrapped could not be loaded.' }); });
  }, [season, ready]);
  const w = data?.wrapped ?? null;
  const scopeParam = w ? (w.scope === 'all' ? 'all' : String(w.season)) : season ?? '';
  // The story's own music (lib/wrapped/soundtrack), when it has some: fetched now, so it's ready
  // by the time a story is opened. Otherwise, and until then, the synthesized loop.
  useEffect(() => {
    if (!w || !scopeParam) return;
    let live = true;
    fetch(`/api/wrapped/soundtrack?season=${scopeParam}`).then(r => r.json())
      .then((d: { url?: string | null }) => { if (live) music.setTrack(d?.url ?? null); })
      .catch(() => { if (live) music.setTrack(null); });
    return () => { live = false; };
  }, [w, scopeParam]);
  useEffect(() => {
    if (!ready || !data) return;
    const q = new URLSearchParams();
    if (scopeParam) q.set('season', scopeParam);
    if (open) q.set('m', open);
    window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`);
  }, [scopeParam, open, ready, data]);

  const cast = useMemo(() => (data?.cast ?? []).filter(c => c.type !== 'team'), [data]);
  const card = useCallback((m: string) => `/api/wrapped/card?season=${scopeParam}&m=${encodeURIComponent(m)}`, [scopeParam]);
  const order = useMemo(() => (w ? ['league', ...w.managers.map(m => m.ownerId)] : []), [w]);
  const story = useMemo(() => {
    if (!w || !open) return null;
    const latest = String(w.season ?? w.league.seasons[w.league.seasons.length - 1] ?? new Date().getFullYear());
    if (open === 'league') {
      const champ = w.league.champions[0];
      return { slides: leagueSlides(w.league, w, cast, leagueName, card('league')), stadium: champ ? { host: champ.ownerId, team: champ.team, season: latest } : null };
    }
    const m = w.managers.find(x => x.ownerId === open);
    return m ? { slides: managerSlides(m, w, cast, leagueName, card(m.ownerId)), stadium: { host: m.ownerId, team: m.team, season: latest } } : null;
  }, [w, open, leagueName, cast, card]);
  const next = () => { music.unlock(); const k = order.indexOf(open ?? ''); setOpen(order[(k + 1) % order.length] ?? null); };

  if (!data) return <div className="h-80 animate-pulse rounded-3xl bg-card" />;
  if (data.error) return <p className="rounded-2xl border border-border bg-card p-5 text-[14px]">{data.error}</p>;
  if (!data.seasons.length || !w) {
    return <div className="rounded-3xl border border-border bg-card p-8 text-center"><p className="text-[17px] font-bold">Wrapped needs a season on the books.</p><p className="mt-1 text-[14px] text-muted-foreground">{archived
      ? <>Once your league&apos;s history is archived, every season gets its story here.</>
      : <>League Wrapped is built from the league archive, which this site hasn&apos;t set up. Its admin can turn it on with a database (DATABASE_URL).</>}</p></div>;
  }

  const mine = w.managers.find(m => m.ownerId === me);
  const scopeLabel = w.scope === 'all' ? 'All time' : `${w.season}${w.inProgress ? ', so far' : ''}`;
  return (
    <div className="space-y-5">
      {/* Which year: a row to swipe on a phone. */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {[{ key: 'all', label: 'All time' }, ...data.seasons.map(s => ({ key: String(s.season), label: `${s.season}${s.final ? '' : ' (so far)'}` }))].map(o => {
          const on = scopeParam === o.key;
          return <button key={o.key} onClick={() => { setSeason(o.key); setOpen(null); }} aria-pressed={on}
            className={cn('shrink-0 rounded-full border px-4 py-2.5 text-[13.5px] font-bold transition', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>{o.label}</button>;
        })}
      </div>

      {/* The league's story, lit in the league's own color. */}
      <motion.button whileTap={{ scale: 0.98 }} onClick={() => { music.unlock(); setOpen('league'); }}
        className="relative block w-full overflow-hidden rounded-[28px] p-6 text-left text-white shadow-[0_24px_60px_-28px_hsl(var(--primary)/0.7)] sm:p-9"
        style={{ background: `radial-gradient(120% 120% at 0% 0%, ${prim(0.95)} 0%, ${prim(0.35)} 45%, #07090c 100%)` }}>
        <motion.div aria-hidden className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-white/20 blur-3xl" animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.4, 0.25] }} transition={{ duration: 6, repeat: Infinity }} />
        <p className="relative text-[11px] font-bold uppercase tracking-[0.3em] text-white/75">League Wrapped · {scopeLabel}</p>
        <p className="relative mt-2 font-display text-[clamp(32px,9vw,54px)] font-black leading-[0.95] tracking-[-0.03em]">{leagueName}</p>
        <p className="relative mt-3 max-w-xl text-[15px] text-white/85">
          {w.league.champions[0] && w.scope === 'season' ? `${w.league.champions[0].name} won it all. ` : ''}{w.league.games} games, {w.league.trades} trades, {w.league.adds} pickups.
        </p>
        <span className="relative mt-5 inline-flex items-center gap-2.5 rounded-full bg-white py-1.5 pl-1.5 pr-5 text-[14px] font-bold text-black shadow-[0_8px_24px_-8px_rgb(0_0_0/0.5)]">
          <PlayDisc className="h-9 w-9 bg-black text-white" />
          Play the league&apos;s story
        </span>
      </motion.button>

      {mine && (
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => { music.unlock(); setOpen(mine.ownerId); }}
          className="flex w-full items-center gap-4 rounded-[24px] border-2 border-primary bg-primary/10 p-4 text-left sm:p-5">
          <Avatar avatarId={mine.avatar} size={56} className="rounded-2xl" />
          <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-widest text-primary">Your story</span><span className="block text-[18px] font-extrabold leading-tight [overflow-wrap:break-word]">{mine.name}</span><span className="block text-[12.5px] text-muted-foreground">{rec(mine.record)}</span></span>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary py-1.5 pl-1.5 pr-4 text-[13px] font-bold text-primary-foreground">
            <PlayDisc className="h-7 w-7 bg-primary-foreground/20" />Play
          </span>
        </motion.button>
      )}

      {/* Every manager's story, as covers. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {w.managers.map((m, k) => (
          <motion.button key={m.ownerId} onClick={() => { music.unlock(); setOpen(m.ownerId); }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.04 }}
            whileTap={{ scale: 0.97 }} className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-[22px] p-3.5 text-left text-white"
            style={{ background: `linear-gradient(160deg, ${prim(0.85)}, #0b0f14 75%)` }}>
            {/* The thumbnail: the player who carried their season, standing in the league's color. */}
            {m.mvp && <CoverPlayer p={m.mvp.player} />}
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0b0f14] via-[#0b0f14]/70 to-transparent" />
            <div className="absolute right-3 top-3"><Avatar avatarId={m.avatar} size={44} className="rounded-2xl ring-2 ring-white/30" /></div>
            {(m.finish === 1 || (w.scope === 'all' && m.titles > 0)) && (
              <span className="absolute left-3 top-3 rounded-full bg-[#FACC15] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">{w.scope === 'all' ? `${m.titles}x champ` : 'Champion'}</span>
            )}
            <span className="relative block text-[16px] font-extrabold leading-tight [overflow-wrap:break-word]">{m.name}</span>
            <span className="relative mt-0.5 block text-[12px] leading-snug text-white/70 [overflow-wrap:break-word]">{m.team}</span>
            <span className="relative mt-1.5 flex items-center justify-between text-[12px] font-bold"><span className="tabular-nums">{rec(m.record)}</span><PlayDisc className="h-8 w-8 bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-colors group-hover:bg-white group-hover:text-black" /></span>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {story && open && <Story key={`${scopeParam}:${open}`} slides={story.slides} stadium={story.stadium} onClose={() => setOpen(null)} onDone={next} />}
      </AnimatePresence>
    </div>
  );
}
