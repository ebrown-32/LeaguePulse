'use client';

/**
 * The Desk Weekly's studio: the show, staged. High up in a tower, the city behind the panel.
 *
 *   The view      floor-to-ceiling windows on a skyline drawn from the league's name (the same
 *                 city every visit), with a lit stadium among the towers. The sky follows the
 *                 listener's own clock: dawn, day, dusk or night, windows lighting up after dark.
 *   The room      a lighting rig whose spotlights swing to whoever is talking and pulse with their
 *                 voice, the episode's badge, and a video wall: one of LeaguePulse's stadiums, the show's
 *                 logo between segments and the segment on air while it plays.
 *   The desk      the panel (the league's own Desk personalities, their faces and colours) seated
 *                 at a curved anchor desk with the show's logo and the league's, a mic each, name
 *                 plates. The speaker leans in; a laugh in the script shakes the desk.
 *   The chyron    the segment on air, a ticker of the episode's rundown, and the clock.
 *   The sound     the show runs its own soundboard (the engine: the theme, a sting between
 *                 segments, the crowd for a blowout or a nail-biter or a host losing it), and its
 *                 own lights: a party for the open and the sign-off, warm for a hot take.
 *
 * Watched like a video: tap the stage to play or pause, with the controls (`children`) in the
 * frame under it.
 *
 * Highlights: while a segment is about a game, the show cuts to the home team's stadium (the live
 * Game Day stadium, components/matchup/MatchupStadium) replaying the game's best performers,
 * recreated from the box score, the panel in boxes along the bottom still talking over it, and a
 * hype beat under them (lib/trophyBeat, on the player's own audio).
 *
 * Everything that moves with the voice is written straight to CSS variables each frame (no React
 * render a frame). The room is a night-time TV studio in any theme; its accents are the league's.
 * Still for reduced motion: no sweeps, no parallax, no shake.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import { trophyBeat } from '@/lib/trophyBeat';
import { cn } from '@/lib/utils';
import type { Episode } from '@/lib/ai/podcast';
import type { EngineState, PodcastEngine } from './engine';

// The live stadium (Game Day), for a game segment's highlights. Hosted only: it draws a franchise's
// stadium, which a self-hosted copy doesn't have, so there the panel stays at the desk.
const MatchupStadium = dynamic(() => import('@/components/matchup/MatchupStadium'), { ssr: false });
const HOSTED = process.env.NEXT_PUBLIC_LP_HOSTED === '1';
/** Highlights an episode cuts to, at most: the desk is the show. And how long a cut lasts. */
const MAX_CUTS = 2;
const CUT_MS = 7_500;

const ease = [0.22, 1, 0.36, 1] as const;
const STADIUMS = ['bowl', 'cantilever', 'coliseum', 'dome', 'grandstand', 'horseshoe'];
const KIND_LABEL: Record<string, string> = { rivalry: 'Rivalry week', open: 'Cold open', games: 'The games', standings: 'The table', move: 'The move', take: 'Hot take', close: 'Sign-off' };

/** A seeded generator, so a league's city is the same every visit. */
function seeded(seed: string) {
  let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  s ||= 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

type Sky = 'dawn' | 'day' | 'dusk' | 'night';
const SKIES: Record<Sky, { top: string; horizon: string; far: string; near: string; lit: number; stars: boolean }> = {
  night: { top: '#050816', horizon: '#1d2552', far: '#141a3a', near: '#0b0f24', lit: 0.42, stars: true },
  dusk: { top: '#1b1640', horizon: '#e0785c', far: '#3a2a55', near: '#1c1531', lit: 0.3, stars: false },
  dawn: { top: '#26386e', horizon: '#f2a865', far: '#4a4f78', near: '#262a4a', lit: 0.16, stars: false },
  day: { top: '#3f8fd6', horizon: '#cfe6fb', far: '#8fb0cf', near: '#5f7f9f', lit: 0.05, stars: false },
};
function skyNow(): Sky {
  const h = new Date().getHours();
  return h >= 20 || h < 5 ? 'night' : h < 7 ? 'dawn' : h < 17 ? 'day' : 'dusk';
}

type Lights = 'show' | 'party' | 'warm';

// ── The show's logo ─────────────────────────────────────────────────────────

/** The Desk Weekly's logo: a mic on the league's colour, the name stacked beside it. */
export function DeskWeeklyLogo({ size = 40, words = true, className }: { size?: number; words?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
        <rect width="48" height="48" rx="12" fill="hsl(var(--primary))" />
        <circle cx="24" cy="24" r="17" fill="none" stroke="hsl(var(--primary-foreground))" strokeOpacity="0.22" strokeWidth="2" strokeDasharray="2 4" />
        <rect x="18.5" y="9.5" width="11" height="19" rx="5.5" fill="hsl(var(--primary-foreground))" />
        <path d="M14 23.5a10 10 0 0 0 20 0M24 33.5v5M18.5 38.5h11" fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="35.5" cy="12.5" r="3.6" fill="#FF4D3D" />
      </svg>
      {words && (
        <span className="flex flex-col leading-none">
          <span className="text-[0.55em] font-bold uppercase tracking-[0.32em] opacity-80">The Desk</span>
          <span className="font-display text-[1.05em] font-black uppercase italic tracking-[-0.01em]">Weekly</span>
        </span>
      )}
    </span>
  );
}

// ── The city ────────────────────────────────────────────────────────────────

interface Tower { x: number; w: number; top: number; antenna: boolean; windows: { x: number; y: number; roll: number; twinkle: boolean; delay: number }[] }

function useCity(seed: string) {
  return useMemo(() => {
    const r = seeded(seed);
    const far: { x: number; w: number; top: number }[] = [];
    for (let x = -20; x < 1020;) { const w = 22 + r() * 46; far.push({ x, w, top: 150 + r() * 90 }); x += w + r() * 6; }
    const near: Tower[] = [];
    for (let x = -30; x < 1030;) {
      const w = 48 + r() * 70, top = 205 + r() * 110;
      const windows: Tower['windows'] = [];
      for (let wy = top + 10; wy < 400; wy += 12) for (let wx = x + 6; wx < x + w - 8; wx += 10) {
        const roll = r();
        windows.push({ x: wx, y: wy, roll, twinkle: roll < 0.06, delay: r() * 6 });
      }
      near.push({ x, w, top, antenna: r() < 0.3, windows });
      x += w + 4 + r() * 18;
    }
    const stadiumX = 160 + r() * 620;
    return { far, near, stadiumX, stadium: STADIUMS[Math.floor(r() * STADIUMS.length)] };
  }, [seed]);
}

function Skyline({ seed, sky, motionOn }: { seed: string; sky: Sky; motionOn: boolean }) {
  const city = useCity(seed);
  const c = SKIES[sky];
  const stars = useMemo(() => { const r = seeded(`${seed}:stars`); return Array.from({ length: 60 }, () => ({ x: r() * 1000, y: r() * 170, s: 0.6 + r() * 1.2, d: r() * 4 })); }, [seed]);
  return (
    <>
      <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="lp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.top} /><stop offset="0.75" stopColor={c.horizon} />
          </linearGradient>
          <radialGradient id="lp-stadium-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity={sky === 'day' ? 0.15 : 0.55} /><stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1000" height="400" fill="url(#lp-sky)" />
        {c.stars && stars.map((st, i) => <circle key={i} cx={st.x} cy={st.y} r={st.s} fill="#fff" className={motionOn ? 'lp-twinkle' : undefined} style={{ animationDelay: `${st.d}s`, opacity: 0.7 }} />)}
        {sky !== 'day' && <circle cx={sky === 'night' ? 830 : 120} cy={sky === 'night' ? 70 : 200} r={sky === 'night' ? 20 : 34} fill={sky === 'night' ? '#f4f1e6' : '#ffd08a'} opacity={sky === 'night' ? 0.9 : 0.75} />}
        {/* Far towers, hazed by distance. */}
        <g style={{ transform: 'translateX(calc(var(--px, 0) * -6px))' }}>
          {city.far.map((b, i) => <rect key={i} x={b.x} y={b.top} width={b.w} height={400 - b.top} fill={c.far} />)}
          {/* The stadium, lit up among the towers: the league's colour in its glow. */}
          <ellipse cx={city.stadiumX} cy={238} rx={120} ry={60} fill="url(#lp-stadium-glow)" />
          <path d={`M${city.stadiumX - 70} 262 Q${city.stadiumX} 220 ${city.stadiumX + 70} 262 L${city.stadiumX + 74} 290 L${city.stadiumX - 74} 290 Z`} fill={c.far} stroke="hsl(var(--primary))" strokeOpacity={sky === 'day' ? 0.3 : 0.8} strokeWidth="2" />
          {[-60, -20, 20, 60].map(d => (
            <g key={d}>
              <line x1={city.stadiumX + d} y1={226 + Math.abs(d) / 3} x2={city.stadiumX + d} y2={250} stroke={c.far} strokeWidth="2" />
              <rect x={city.stadiumX + d - 5} y={222 + Math.abs(d) / 3} width="10" height="4" rx="1" fill="#fffbe6" opacity={sky === 'day' ? 0.5 : 1} className={motionOn ? 'lp-flicker' : undefined} />
            </g>
          ))}
        </g>
        {/* Near towers: we're above most of them, looking out and down. */}
        <g style={{ transform: 'translateX(calc(var(--px, 0) * -14px))' }}>
          {city.near.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={b.top} width={b.w} height={400 - b.top} fill={c.near} />
              {b.antenna && <><line x1={b.x + b.w / 2} y1={b.top} x2={b.x + b.w / 2} y2={b.top - 22} stroke={c.near} strokeWidth="2" /><circle cx={b.x + b.w / 2} cy={b.top - 23} r="2.4" fill="#ff3b30" className={motionOn ? 'lp-blink' : undefined} /></>}
              {b.windows.map((w, k) => (w.roll < c.lit)
                ? <rect key={k} x={w.x} y={w.y} width="5" height="6" fill="#ffd98a" opacity={sky === 'day' ? 0.25 : 0.85} className={w.twinkle && motionOn ? 'lp-twinkle' : undefined} style={w.twinkle ? { animationDelay: `${w.delay}s` } : undefined} />
                : null)}
            </g>
          ))}
        </g>
      </svg>
      {/* The glass: mullions and a sheen. */}
      <div className="absolute inset-0" aria-hidden style={{ background: 'linear-gradient(115deg, transparent 0 30%, rgba(255,255,255,0.07) 38%, transparent 46% 62%, rgba(255,255,255,0.05) 68%, transparent 74%)' }} />
      <div className="absolute inset-0 flex justify-between" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => <span key={i} className="h-full w-[5px] bg-[#0b0d16] shadow-[1px_0_0_rgba(255,255,255,0.06)]" />)}
      </div>
      <div className="absolute inset-x-0 top-[48%] h-[4px] bg-[#0b0d16]/90" aria-hidden />
    </>
  );
}

// ── The studio ──────────────────────────────────────────────────────────────

const LAUGH = /\[(laughs|laughing|laughs harder|starts laughing|wheezing|chuckles|snorts)\]/i;
const CUT = /\[(interrupting|cuts in|overlapping)\]/i;
const HYPE = /\[(shouting|excited)\]|!/;

export default function Studio({ episode, s, engine, tint, logoUrl, leagueName, children }: {
  episode: Episode; s: EngineState; engine: PodcastEngine; tint: (i: number) => string; logoUrl?: string | null; leagueName: string; children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const motionOn = !reduce;
  const root = useRef<HTMLDivElement>(null);
  const [sky, setSky] = useState<Sky>('night');
  const [poked, setPoked] = useState<number | null>(null);
  const [clock, setClock] = useState('');
  const [size, setSize] = useState({ w: 800, h: 400 });
  useEffect(() => {
    setSky(skyNow());
    const tick = () => setClock(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    tick();
    const t = window.setInterval(() => { tick(); setSky(skyNow()); }, 30_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The voice, every frame, into --lv: the lights and the speaker move with it.
  useEffect(() => {
    let raf = 0, lv = 0;
    const frame = () => {
      const target = reduce ? (s.playing ? 0.5 : 0) : engine.level();
      lv += (target - lv) * (target > lv ? 0.5 : 0.15);
      root.current?.style.setProperty('--lv', lv.toFixed(3));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine, reduce, s.playing]);

  const onPointer = (e: React.PointerEvent) => {
    if (reduce || e.pointerType === 'touch') return;
    const r = root.current!.getBoundingClientRect();
    root.current!.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
  };

  const ch = episode.chapters[s.chapter];
  const raw = ch?.lines[s.line]?.text ?? '';
  const speaker = ch?.lines[s.line]?.host ?? 0;
  const live = s.playing;
  // A game segment, with both managers known, on a site with stadiums: highlights.
  const v = ch?.visual;
  const game = HOSTED && v?.type === 'matchup' && v.home.userId && v.away.userId ? v : null;
  // The desk is the show; a highlight is a cut away from it, used sparingly. A game segment stages
  // its stadium out of sight behind the desk; once it's drawn and the panel is a line into the
  // game, the show cuts to it for that game's biggest play (the Game Day replay), then back to the
  // desk when the play is over. One cut a segment, two an episode.
  const cuts = useRef<Set<number>>(new Set());
  const staged = Boolean(live && game && (cuts.current.size < MAX_CUTS || cuts.current.has(s.chapter)));
  const [hlReady, setHlReady] = useState(false);
  const [cut, setCut] = useState(false);
  useEffect(() => { setHlReady(false); setCut(false); }, [s.chapter]);
  useEffect(() => { if (!live) setCut(false); }, [live]);
  useEffect(() => {
    if (!staged || !hlReady || cut || cuts.current.has(s.chapter) || s.line < 1) return;
    cuts.current.add(s.chapter);
    setCut(true);
  }, [staged, hlReady, cut, s.chapter, s.line]);
  // Back to the desk when the replay's done: long enough for a touchdown to land and be celebrated.
  useEffect(() => { if (!cut) return; const t = setTimeout(() => setCut(false), CUT_MS); return () => clearTimeout(t); }, [cut]);
  // Rivalry week's trailer: the show opens on next week's grudge match, like a film's.
  const rival = live && ch?.kind === 'rivalry' && v?.type === 'rivalry' ? v : null;
  // The beat, under a cut or the trailer.
  const beat = cut || Boolean(rival);
  useEffect(() => {
    if (beat) trophyBeat.start({ ctx: engine.audioContext(), volume: 0.16 });
    else trophyBeat.stop();
  }, [beat, engine]);
  useEffect(() => () => trophyBeat.stop(), []);
  // The room's lights follow the show: a party for the open and the sign-off, warm for a hot take.
  const lights: Lights = !live ? 'show' : ch?.kind === 'open' || ch?.kind === 'close' ? 'party' : ch?.kind === 'take' ? 'warm' : 'show';
  const mood = !live ? null : LAUGH.test(raw) ? 'laugh' : CUT.test(raw) ? 'cut' : HYPE.test(raw) ? 'hype' : 'talk';
  const n = episode.hosts.length;
  const narrow = size.w < 560;
  const head = narrow ? (n > 3 ? 44 : 50) : n > 3 ? 64 : 74;
  const hostX = (i: number) => 12 + (76 * (i + 0.5)) / n; // percent across
  const deskTop = 0.71; // where the desk's top edge sits, of the stage's height
  const lamps = [0.14, 0.38, 0.62, 0.86];

  /** Each lamp's angle, to point at a spot (percent across, fraction down). */
  const aim = (lx: number, tx: number, ty: number) => {
    const dx = ((tx - lx * 100) / 100) * size.w, dy = ty * size.h - 0.06 * size.h;
    return (Math.atan2(dx, dy) * -180) / Math.PI;
  };
  const beamColor = (k: number) => lights === 'warm' ? '#ffd9a0' : lights === 'party' ? tint(k) : live ? tint(speaker) : '#cfe0ff';

  const rundown = useMemo(() => episode.chapters.map(c => c.title).join('   •   '), [episode]);
  const stadium = useCity(`${leagueName}:${episode.season}`).stadium;

  return (
    <div className="overflow-hidden rounded-xl border border-black/40 bg-[#07080f] text-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
      <style>{`
        @keyframes lp-twinkle { 0%,100% { opacity: .85 } 50% { opacity: .15 } }
        @keyframes lp-blink { 0%,60%,100% { opacity: 1 } 70%,90% { opacity: .1 } }
        @keyframes lp-flicker { 0%,100% { opacity: 1 } 45% { opacity: .82 } 50% { opacity: .95 } }
        @keyframes lp-sweep { 0%,100% { transform: rotate(var(--a0)) } 50% { transform: rotate(var(--a1)) } }
        @keyframes lp-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .lp-twinkle { animation: lp-twinkle 3.2s ease-in-out infinite }
        .lp-blink { animation: lp-blink 1.6s linear infinite }
        .lp-flicker { animation: lp-flicker 2.4s ease-in-out infinite }
      `}</style>

      {/* The stage. */}
      <div ref={root} onPointerMove={onPointer} onPointerLeave={() => root.current?.style.setProperty('--px', '0')}
        onClick={() => engine.toggle()} role="button" tabIndex={-1} aria-label={live ? 'Pause' : 'Play'}
        className="relative h-[280px] cursor-pointer select-none min-[400px]:h-[310px] sm:h-[clamp(320px,calc(100vh-380px),430px)]" style={{ ['--lv' as string]: 0, ['--px' as string]: 0 }}>
        {/* The window wall. */}
        <div className="absolute inset-x-0 top-0 h-[69%] overflow-hidden">
          <Skyline seed={leagueName} sky={sky} motionOn={motionOn} />
          {/* The room's own light falls across the glass. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" aria-hidden />
        </div>

        {/* The rig: a truss across the ceiling, a lamp head at each point. */}
        <div className="absolute inset-x-0 top-0 h-[7%] bg-gradient-to-b from-[#1a1c26] to-[#0e0f16]" aria-hidden>
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[repeating-linear-gradient(90deg,#3a3d4a_0_6px,transparent_6px_12px)]" />
        </div>
        {lamps.map((lx, k) => {
          const target = live ? hostX(speaker) : lights === 'party' ? hostX(k % n) : (lx * 100 + (k % 2 ? 6 : -6));
          const a = aim(lx, target, deskTop - 0.08);
          const sweep = motionOn && (lights === 'party' || !live);
          return (
            <div key={k} className="pointer-events-none absolute top-[5%]" style={{ left: `${lx * 100}%` }} aria-hidden>
              {/* The beam. */}
              <div className="absolute left-0 top-0 origin-top"
                style={{
                  width: size.w * 0.26, height: size.h * 0.85, marginLeft: -size.w * 0.13,
                  transform: `rotate(${a}deg)`,
                  transition: 'transform 0.7s cubic-bezier(0.22,1,0.36,1)',
                  ['--a0' as string]: `${a - 9}deg`, ['--a1' as string]: `${a + 9}deg`,
                  animation: sweep ? `lp-sweep ${lights === 'party' ? 2.2 + k * 0.4 : 7 + k}s ease-in-out infinite` : undefined,
                  clipPath: 'polygon(47% 0, 53% 0, 100% 100%, 0 100%)',
                  background: `linear-gradient(to bottom, ${beamColor(k)} 0%, transparent 92%)`,
                  mixBlendMode: 'screen',
                  opacity: live ? 'calc(0.16 + var(--lv) * 0.34)' : 0.12,
                }} />
              {/* The lamp. */}
              <div className="absolute -left-3 -top-1 h-5 w-6 rounded-b-lg bg-[#22242f] ring-1 ring-white/10">
                <div className="absolute inset-x-1 bottom-0.5 h-1.5 rounded-full" style={{ background: beamColor(k), boxShadow: `0 0 12px 2px ${beamColor(k)}`, opacity: live ? 0.95 : 0.5 }} />
              </div>
            </div>
          );
        })}

        {/* The episode's badge: one episode a week, numbered by its week. */}
        <div className="absolute left-[3%] top-[11%] rounded-md border border-white/10 bg-black/60 px-2 py-1 leading-none backdrop-blur-sm sm:left-[4%] sm:px-2.5 sm:py-1.5">
          <span className="block text-[8px] font-bold uppercase tracking-[0.22em] text-white/55 sm:text-[9.5px]">{episode.season}</span>
          <span className="mt-0.5 block font-display text-[12px] font-black uppercase tracking-[0.04em] text-white sm:text-[15px]">Week {episode.week}</span>
        </div>

        {/* The video wall: a stadium, and the show's logo or the segment on air. */}
        <div className="absolute left-1/2 top-[10%] w-[46%] -translate-x-1/2 sm:w-[30%]">
          <div className="relative aspect-video overflow-hidden rounded-md border-[3px] border-[#16171f] bg-black shadow-[0_0_40px_-6px_hsl(var(--primary)/0.55)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/landing/stadiums/${stadium}${narrow ? '-thumb' : ''}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.18)_0_1px,transparent_1px_3px)] mix-blend-multiply" aria-hidden />
            <motion.div key={live ? `seg-${s.chapter}` : 'logo'} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease }}
              className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
              {live && ch ? (
                <>
                  <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-primary-foreground sm:text-[10px]">{KIND_LABEL[ch.kind] ?? 'Segment'}</span>
                  <span className="mt-1 line-clamp-2 font-display text-[12px] font-black uppercase leading-tight sm:text-[18px]">{ch.title}</span>
                </>
              ) : <DeskWeeklyLogo size={narrow ? 26 : 38} className="text-[13px] sm:text-[19px]" />}
            </motion.div>
          </div>
        </div>

        {/* The floor, glossy under the lights. */}
        <div className="absolute inset-x-0 bottom-0 top-[69%] bg-gradient-to-b from-[#11131c] to-[#07080d]" aria-hidden>
          <div className="absolute inset-x-[10%] top-0 h-1/2 rounded-[50%] opacity-60 blur-2xl" style={{ background: live ? tint(speaker) : 'hsl(var(--primary))', opacity: 'calc(0.12 + var(--lv) * 0.25)', transition: 'background 0.8s' }} />
        </div>

        {/* The panel, seated. */}
        {episode.hosts.map((h, i) => {
          const on = live && i === speaker;
          const others = live && !on && mood === 'laugh';
          const react = on ? mood : others ? 'giggle' : null;
          return (
            <button key={h.id} type="button" aria-label={`${h.name}, ${h.handle}`}
              onClick={e => { e.stopPropagation(); setPoked(i); window.setTimeout(() => setPoked(p => (p === i ? null : p)), 1600); }}
              className="absolute -translate-x-1/2 focus:outline-none" style={{ left: `${hostX(i)}%`, bottom: `${(1 - deskTop) * 100 - 1}%` }}>
              <motion.div className="relative flex flex-col items-center"
                animate={
                  !motionOn ? {} :
                  poked === i ? { y: [0, -14, 0, -8, 0], rotate: [0, -8, 8, -4, 0] } :
                  react === 'laugh' ? { rotate: [0, -5, 5, -5, 5, 0], y: [0, -3, 0, -3, 0] } :
                  react === 'giggle' ? { y: [0, -3, 0, -2, 0] } :
                  react === 'cut' ? { x: [0, i < n / 2 ? 8 : -8, 0], scale: [1, 1.06, 1] } :
                  react === 'hype' ? { y: [0, -9, 0, -5, 0] } :
                  on ? { scale: 1.06 } : { scale: live ? 0.96 : 1 }
                }
                transition={poked === i || react ? { duration: react === 'laugh' ? 0.9 : 0.7, repeat: react === 'laugh' || react === 'giggle' ? Infinity : 0, repeatDelay: 0.5 } : { type: 'spring', stiffness: 220, damping: 18 }}>
                {poked === i && (
                  <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="absolute -top-8 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold text-black shadow-lg">
                    {h.handle}
                  </motion.span>
                )}
                {/* Head, moving with the voice when it's theirs. */}
                <div style={on && motionOn ? { transform: 'translateY(calc(var(--lv) * -4px)) scale(calc(1 + var(--lv) * 0.05))' } : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.avatar} alt="" width={head} height={head} draggable={false}
                    className="relative z-10 rounded-full bg-[#22242f] object-cover"
                    style={{ width: head, height: head, boxShadow: on ? `0 0 0 3px ${tint(i)}, 0 0 28px 4px ${tint(i)}` : '0 0 0 2px rgba(255,255,255,0.12)', transition: 'box-shadow 0.4s' }} />
                </div>
                {/* Shoulders, in their colour. */}
                <div className="-mt-2 rounded-t-[999px]" style={{ width: head * 1.35, height: head * 0.5, background: `linear-gradient(to bottom, ${tint(i)}, color-mix(in srgb, ${tint(i)} 55%, #000))`, opacity: on || !live ? 1 : 0.75 }} />
              </motion.div>
              {/* The mic, on its arm. */}
              <svg width={head * 0.6} height={head * 0.55} viewBox="0 0 30 28" className="absolute -bottom-1 left-1/2 z-20 -translate-x-[110%]" aria-hidden>
                <path d="M26 28 L22 12 L12 9" fill="none" stroke="#2c2f3b" strokeWidth="2.4" strokeLinecap="round" />
                <rect x="4" y="3" width="9" height="13" rx="4.5" transform="rotate(-20 8 9)" fill="#1b1d26" stroke={on ? tint(i) : '#3b3e4b'} strokeWidth="1.5" />
              </svg>
            </button>
          );
        })}

        {/* The desk: curved, lit along its edge, the show's logo and the league's on its front. */}
        <div className="pointer-events-none absolute inset-x-[6%] bottom-0" style={{ top: `${deskTop * 100}%` }} aria-hidden>
          <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="lp-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#262937" /><stop offset="1" stopColor="#0d0e14" /></linearGradient>
              <linearGradient id="lp-desk-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b3f52" /><stop offset="1" stopColor="#23263a" /></linearGradient>
            </defs>
            <path d="M0 18 Q500 -14 1000 18 L1000 200 L0 200 Z" fill="url(#lp-desk)" />
            <path d="M0 18 Q500 -14 1000 18 L1000 34 Q500 2 0 34 Z" fill="url(#lp-desk-top)" />
          </svg>
          {/* The LED strip. */}
          <div className="absolute inset-x-[3%] top-[22%] h-[3px] rounded-full bg-primary"
            style={{ boxShadow: '0 0 calc(8px + var(--lv) * 16px) calc(1px + var(--lv) * 3px) hsl(var(--primary))', opacity: 'calc(0.55 + var(--lv) * 0.45)' }} />
          <div className="absolute inset-x-0 top-[34%] flex items-center justify-center gap-4 sm:gap-8">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-7 w-7 rounded-md object-contain opacity-90 sm:h-10 sm:w-10" />
            )}
            <DeskWeeklyLogo size={narrow ? 26 : 36} className="text-[12px] text-white sm:text-[17px]" />
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="hidden h-10 w-10 rounded-md object-contain opacity-90 sm:block" />
            )}
          </div>
        </div>
        {/* Name plates. */}
        {episode.hosts.map((h, i) => (
          <span key={h.id} className="pointer-events-none absolute z-20 -translate-x-1/2 truncate rounded-sm border border-white/10 bg-black/70 px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.08em] text-white/85 sm:text-[10.5px]"
            style={{ left: `${hostX(i)}%`, top: `${deskTop * 100 + 3}%`, maxWidth: `${76 / n}%`, borderBottom: `2px solid ${tint(i)}` }}>
            {/* A phone has room for a first name. */}
            {narrow && h.name.length > 9 ? h.name.split(' ')[0] : h.name}
          </span>
        ))}

        {/* Rivalry week: the trailer. Letterboxed, both sides squaring up, the series between them. */}
        {rival && (
          <div key={`rv-${s.chapter}`} className="pointer-events-none absolute inset-0 z-[24] overflow-hidden bg-black" data-trailer="1">
            <div className="absolute inset-0" style={{ background: `radial-gradient(60% 90% at 0% 50%, ${rival.a.color}66, transparent 70%), radial-gradient(60% 90% at 100% 50%, ${rival.b.color}66, transparent 70%)` }} />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.03)_0_1px,transparent_1px_3px)]" aria-hidden />
            {/* A slow push in, the whole chapter long. */}
            <motion.div className="absolute inset-0 flex items-center justify-between px-[6%]" initial={{ scale: 1 }} animate={motionOn ? { scale: 1.07 } : {}} transition={{ duration: 14, ease: 'linear' }}>
              {[rival.a, rival.b].map((t, i) => (
                <motion.div key={t.userId} className="flex w-[30%] flex-col items-center gap-2 text-center"
                  initial={motionOn ? { x: i ? 120 : -120, opacity: 0 } : false} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.25 + i * 0.35, duration: 0.8, ease }}>
                  {t.avatar
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={t.avatar} alt="" className="aspect-square w-[min(110px,60%)] rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${t.color}, 0 0 50px 6px ${t.color}` }} />
                    : <span className="aspect-square w-[min(110px,60%)] rounded-full" style={{ background: t.color, boxShadow: `0 0 50px 6px ${t.color}` }} />}
                  <span className="line-clamp-2 font-display text-[12px] font-black uppercase leading-tight tracking-[0.04em] text-white sm:text-[17px]">{t.team}</span>
                  <span className="lp-num text-[22px] font-black leading-none sm:text-[34px]" style={{ color: t.color, textShadow: `0 0 18px ${t.color}` }}>{t.wins}</span>
                </motion.div>
              ))}
            </motion.div>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <motion.span initial={motionOn ? { opacity: 0, letterSpacing: '0.6em' } : false} animate={{ opacity: 1, letterSpacing: '0.28em' }} transition={{ delay: 1.1, duration: 1.6, ease }}
                className="text-[9px] font-bold uppercase text-white/70 sm:text-[11px]">Next week · {rival.label}</motion.span>
              <motion.span initial={motionOn ? { opacity: 0, scale: 1.6 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.6, duration: 0.5, ease }}
                className="lp-flicker mt-1 font-display text-[26px] font-black uppercase italic leading-none text-white sm:text-[46px]" style={{ textShadow: '0 0 30px rgba(255,255,255,0.35)' }}>
                Rivalry<br />Week
              </motion.span>
              <motion.span initial={motionOn ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 2.4, duration: 0.8 }}
                className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60 sm:text-[12px]">All-time {rival.a.wins} to {rival.b.wins}</motion.span>
            </div>
            {/* The letterbox. */}
            <motion.div className="absolute inset-x-0 top-0 bg-black" initial={{ height: 0 }} animate={{ height: '11%' }} transition={{ duration: 0.6, ease }} />
            <motion.div className="absolute inset-x-0 bottom-0 bg-black" initial={{ height: 0 }} animate={{ height: '11%' }} transition={{ duration: 0.6, ease }} />
            {/* Who's narrating. */}
            <div className="absolute bottom-[13%] right-3 flex gap-1.5">
              {episode.hosts.map((h, i) => (
                <div key={h.id} className="overflow-hidden rounded-md transition-all duration-300"
                  style={{ opacity: i === speaker ? 1 : 0.35, boxShadow: i === speaker ? `0 0 0 2px ${tint(i)}` : 'none' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.avatar} alt={h.name} width={narrow ? 26 : 34} height={narrow ? 26 : 34} className="block bg-[#22242f] object-cover" style={{ width: narrow ? 26 : 34, height: narrow ? 26 : 34 }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Highlights: the cut to the stadium, the panel in boxes, still talking. */}
        {game && staged && (
            // A CSS fade, run by the browser itself: a scripted one stalls while the stadium draws,
            // which is exactly when it has to run.
            <div key={`hl-${s.chapter}`}
              className={cn('absolute inset-0 z-[25] bg-black transition-[opacity,transform] duration-[450ms] ease-out', cut && hlReady ? 'scale-100 opacity-100' : 'pointer-events-none scale-[1.04] opacity-0')}
              data-ready={hlReady ? '1' : '0'} data-cut={cut ? '1' : '0'}
              // The stadium's own buttons stay its own; anywhere else, a tap pauses the show as usual.
              onClick={e => { if ((e.target as HTMLElement).closest('button')) e.stopPropagation(); }}>
              <MatchupStadium highlights compact week={game.week} className="h-full w-full" onReady={() => setHlReady(true)}
                hold={!cut}
                a={{ userId: game.home.userId!, teamName: game.home.team, avatar: game.home.avatar ?? '' }}
                b={{ userId: game.away.userId!, teamName: game.away.team, avatar: game.away.avatar ?? '' }} />
              <span className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-[#e0352b] px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg sm:text-[11px]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Highlights
              </span>
              <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex gap-1.5">
                {episode.hosts.map((h, i) => {
                  const on = i === speaker;
                  return (
                    <div key={h.id} className="overflow-hidden rounded-lg bg-black/70 backdrop-blur-sm transition-all duration-300"
                      style={{ boxShadow: on ? `0 0 0 2px ${tint(i)}, 0 0 18px 2px ${tint(i)}` : '0 0 0 1px rgba(255,255,255,0.15)', transform: on ? 'translateY(-4px)' : undefined }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.avatar} alt={h.name} width={narrow ? 34 : 46} height={narrow ? 34 : 46} className="block bg-[#22242f] object-cover" style={{ width: narrow ? 34 : 46, height: narrow ? 34 : 46 }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* Before it plays (and paused): the episode, like a video's poster, with a big play button. */}
        {!live && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-gradient-to-t from-black/90 via-black/30 to-black/10">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_14px_40px_-8px_hsl(var(--primary)/0.85)] ring-4 ring-white/15 sm:h-20 sm:w-20">
              {s.buffering ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-current border-t-transparent" /> : <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 sm:h-9 sm:w-9" fill="currentColor" aria-hidden><path d="M7 4.5v15l12.5-7.5Z" /></svg>}
            </span>
            <span className="absolute inset-x-0 bottom-0 p-3 text-left sm:p-5">
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 sm:text-[11px]">{s.progress > 0 || s.chapter > 0 || s.line > 0 ? 'Paused' : `Week ${episode.week}, ${episode.season}`}</span>
              <span className="mt-0.5 line-clamp-2 block font-display text-[18px] font-black leading-tight text-white sm:text-[26px]">{episode.title}</span>
            </span>
          </motion.div>
        )}
      </div>

      {/* The chyron. */}
      <div className="flex h-9 items-stretch border-t border-white/10 bg-[#0d0e15] text-[11px] sm:h-10 sm:text-[12.5px]">
        <span className="flex items-center gap-1.5 bg-white/10 px-2.5 font-black uppercase tracking-[0.14em] text-white/80 sm:px-3">
          Wk {episode.week}
        </span>
        <span className="flex min-w-0 items-center bg-primary px-2.5 font-display font-black uppercase text-primary-foreground sm:px-3">
          <span className="truncate">{ch?.title ?? episode.title}</span>
        </span>
        <span className="relative min-w-0 flex-1 overflow-hidden">
          <span className="absolute inset-y-0 left-0 flex items-center whitespace-nowrap font-semibold text-white/70"
            style={{ animation: motionOn ? 'lp-ticker 38s linear infinite' : undefined }}>
            <span className="px-4">{leagueName.toUpperCase()}   •   WEEK {episode.week}   •   {rundown}</span>
            <span className="px-4">{leagueName.toUpperCase()}   •   WEEK {episode.week}   •   {rundown}</span>
          </span>
        </span>
        <span className="hidden items-center bg-black/50 px-2.5 font-bold tabular-nums text-white/80 sm:flex sm:px-3">{clock}</span>
      </div>

      {children}
    </div>
  );
}
