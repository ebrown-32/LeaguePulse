'use client';

/**
 * The Desk Weekly's player: an episode as a show you can watch while you listen.
 *
 *   The stage       the two hosts, the one speaking lit and ringed by a live meter of their voice
 *   The visual      what the chapter is about, drawn from the real numbers (lib/ai/podcast):
 *                   the scoreboard of a game, a team's card, the table, a trade
 *   The transcript  the line being spoken, word by word, with the lines either side; tap a line
 *                   to jump to it
 *   The timeline    the episode in chapters, filling as it plays; tap one to go there
 *
 * Space plays and pauses, the arrows skip chapters. Still for reduced motion (the meter rests).
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Episode, Visual } from '@/lib/ai/podcast';
import { PodcastEngine, type EngineState } from './engine';

const ease = [0.22, 1, 0.36, 1] as const;
const KIND_LABEL: Record<string, string> = { open: 'Cold open', games: 'The games', standings: 'The table', move: 'The move', take: 'Hot take', close: 'Sign-off' };
const HOST_TINT = ['#3DD598', '#F5A35B', '#7AA2FF', '#E879C7'];
const tint = (i: number) => HOST_TINT[i % HOST_TINT.length];

/** Phone width, for sizing a panel of three or four hosts to fit a row. */
function useNarrow(): boolean {
  return useSyncExternalStore(
    l => { const m = matchMedia('(max-width: 639px)'); m.addEventListener('change', l); return () => m.removeEventListener('change', l); },
    () => matchMedia('(max-width: 639px)').matches,
    () => false,
  );
}

function useEngine(engine: PodcastEngine): EngineState {
  return useSyncExternalStore(l => engine.subscribe(l), () => engine.snapshot, () => engine.snapshot);
}

/** A ring of bars around a host, pulsing with their voice. Drawn by hand each frame. */
function VoiceRing({ engine, active, color, size }: { engine: PodcastEngine; active: boolean; color: string; size: number }) {
  const ref = useRef<SVGGElement>(null);
  const reduce = useReducedMotion();
  const BARS = 44;
  useEffect(() => {
    if (!active || reduce) { ref.current?.querySelectorAll('line').forEach(l => l.setAttribute('y2', String(-size / 2 - 3))); return; }
    let raf = 0;
    const seeds = Array.from({ length: BARS }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
    const frame = (t: number) => {
      const lv = engine.level();
      ref.current?.querySelectorAll('line').forEach((l, i) => {
        const wob = 0.55 + 0.45 * Math.sin(t / 120 + i * 0.7 + seeds[i] * 6);
        l.setAttribute('y2', String(-size / 2 - 3 - lv * wob * 18));
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, engine, reduce, size]);
  const r = size / 2 + 3;
  return (
    <svg aria-hidden width={size + 60} height={size + 60} viewBox={`${-(size + 60) / 2} ${-(size + 60) / 2} ${size + 60} ${size + 60}`} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <g ref={ref} style={{ opacity: active ? 1 : 0, transition: 'opacity .4s' }}>
        {Array.from({ length: BARS }, (_, i) => (
          <line key={i} x1="0" y1={-r} x2="0" y2={-r} stroke={color} strokeWidth="3" strokeLinecap="round" transform={`rotate(${(360 / BARS) * i})`} />
        ))}
      </g>
    </svg>
  );
}

function Count({ to, decimals = 2 }: { to: number; decimals?: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 900); setV(to * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, reduce]);
  return <>{v.toFixed(decimals)}</>;
}

/** What the chapter is about, drawn from the real numbers. */
function VisualCard({ v }: { v: Visual }) {
  if (v.type === 'matchup') {
    const homeWon = v.home.points >= v.away.points;
    return (
      <div className="w-full">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Week {v.week} final</p>
        {[v.home, v.away].map((s, i) => {
          const won = i === 0 ? homeWon : !homeWon;
          return (
            <motion.div key={s.team} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.12, duration: 0.5, ease }}
              className={cn('mt-2 flex items-center justify-between gap-3 rounded-2xl px-4 py-3', won ? 'bg-[#3DD598]/15 ring-1 ring-[#3DD598]/40' : 'bg-white/[0.05]')}>
              <span className={cn('min-w-0 truncate text-[15px] font-semibold', won ? 'text-white' : 'text-white/60')}>{s.team}</span>
              <span className={cn('lp-num text-[28px] font-black tabular-nums', won ? 'text-[#3DD598]' : 'text-white/60')}><Count to={s.points} /></span>
            </motion.div>
          );
        })}
        <p className="mt-2 text-right text-[12px] font-semibold text-white/50">Margin <span className="lp-num text-white"><Count to={v.margin} /></span></p>
      </div>
    );
  }
  if (v.type === 'team') {
    return (
      <div className="w-full">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">No. {v.rank} in the table</p>
        <p className="mt-1 text-[22px] font-black leading-tight text-white">{v.team}</p>
        <p className="text-[13px] text-white/55">{v.manager}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/[0.06] p-3"><p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">Record</p><p className="lp-num mt-1 text-[24px] font-black text-white">{v.record}</p></div>
          <div className="rounded-2xl bg-white/[0.06] p-3"><p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">Points for</p><p className="lp-num mt-1 text-[24px] font-black text-white"><Count to={v.pointsFor} decimals={1} /></p></div>
        </div>
        {v.top.length > 0 && (
          <ul className="mt-2 space-y-1">
            {v.top.map((p, i) => (
              <motion.li key={p.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
                className="flex items-center gap-2 text-[13px] text-white/80">
                <span className="w-8 rounded bg-white/10 py-0.5 text-center text-[10px] font-black text-white/60">{p.position}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.points != null && <span className="lp-num font-bold text-white">{p.points.toFixed(1)}</span>}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (v.type === 'standings') {
    const max = Math.max(1, ...v.rows.map(r => r.pointsFor));
    return (
      <div className="w-full">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">The table</p>
        <ol className="mt-2 space-y-1.5">
          {v.rows.map((r, i) => (
            <motion.li key={r.team} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07, duration: 0.45, ease }}
              className="relative overflow-hidden rounded-xl bg-white/[0.05]">
              <motion.span className="absolute inset-y-0 left-0 bg-[#3DD598]/20" initial={{ width: 0 }} animate={{ width: `${(r.pointsFor / max) * 100}%` }} transition={{ delay: 0.2 + i * 0.07, duration: 0.7, ease }} />
              <span className="relative flex items-center gap-3 px-3 py-2 text-[13.5px]">
                <span className="lp-num w-4 text-white/45">{r.rank}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-white">{r.team}</span>
                <span className="lp-num font-black text-white">{r.record}</span>
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    );
  }
  const label = v.kind === 'trade' ? 'Trade' : v.kind === 'waiver' ? 'Waiver claim' : 'Free agent';
  return (
    <div className="w-full">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{label}, week {v.week}</p>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
        className="mt-3 rounded-2xl bg-white/[0.06] p-4 text-[15px] font-semibold leading-snug text-white">{v.summary}</motion.p>
    </div>
  );
}

/** The line being spoken, word by word. */
function Spoken({ text, char }: { text: string; char: number }) {
  const words = useMemo(() => {
    const out: { w: string; at: number }[] = [];
    const re = /\S+\s*/g; let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ w: m[0], at: m.index });
    return out;
  }, [text]);
  return (
    <p className="text-[clamp(19px,2.4vw,26px)] font-semibold leading-snug">
      {words.map((x, i) => (
        <span key={i} className={cn('transition-colors duration-150', x.at <= char ? 'text-white' : 'text-white/30')}>{x.w}</span>
      ))}
    </p>
  );
}

export default function Player({ episode, recorded, autoFocus = false }: { episode: Episode; recorded: boolean; autoFocus?: boolean }) {
  const engine = useMemo(() => new PodcastEngine(episode, recorded), [episode, recorded]);
  useEffect(() => () => engine.destroy(), [engine]);
  const s = useEngine(engine);
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (autoFocus) box.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const ch = episode.chapters[s.chapter];
  const line = ch?.lines[s.line];
  const speaker = line?.host ?? 0;
  const narrow = useNarrow();
  const panel = episode.hosts.length;
  const face = panel > 2 ? (narrow ? (panel > 3 ? 56 : 64) : 76) : 84;
  const totalLines = episode.chapters.reduce((n, c) => n + c.lines.length, 0);
  const done = episode.chapters.slice(0, s.chapter).reduce((n, c) => n + c.lines.length, 0) + s.line + s.progress;
  const pct = s.done ? 1 : done / Math.max(1, totalLines);

  // The transcript follows along: the line being spoken stays in view (inside its own box only).
  const transcript = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = transcript.current, el = list?.querySelector<HTMLElement>('[data-now]');
    if (!list || !el || !s.playing) return;
    const top = el.offsetTop - list.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  }, [s.chapter, s.line, s.playing, reduce]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ') { e.preventDefault(); engine.toggle(); }
    if (e.key === 'ArrowRight') engine.next();
    if (e.key === 'ArrowLeft') engine.prev();
  };
  const share = async () => {
    const url = `${window.location.origin}/podcast?ep=${encodeURIComponent(episode.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${episode.leagueName}: ${episode.title}`, text: episode.teaser, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    } catch { /* dismissed */ }
  };

  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKey} className="lp-ink relative overflow-hidden rounded-[28px] bg-[#0C1013] text-white outline-none ring-1 ring-white/10">
      {/* The room: a slow glow in the speaker's color. */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl"
        animate={{ backgroundColor: tint(speaker), opacity: s.playing ? 0.22 : 0.1 }} transition={{ duration: 1.2 }} />

      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-8">
        {/* Left: the show. */}
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EE5A2E]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M4 13a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-1v-6h3M4 13v4a2 2 0 0 0 2 2h1v-6H4" /></svg>
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#EE5A2E]">The Desk Weekly · Episode {episode.number}</p>
              <p className="truncate text-[13px] text-white/55">{episode.leagueName} · Week {episode.week}, {episode.season}</p>
            </div>
          </div>
          <h2 className="mt-4 text-[clamp(26px,3.4vw,38px)] font-extrabold leading-[1.04] tracking-[-0.03em]">{episode.title}</h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/60">{episode.teaser}</p>

          {/* The hosts. */}
          <div className={`mt-8 flex items-start justify-center ${panel > 2 ? 'gap-3 sm:gap-9' : 'gap-10 sm:gap-14'}`}>
            {episode.hosts.map((h, i) => {
              const on = i === speaker && s.playing;
              return (
                <div key={h.id} className="flex min-w-0 flex-col items-center" style={{ width: face + 24 }}>
                  <motion.div className="relative" animate={{ scale: on ? 1.08 : 0.94, opacity: on || !s.playing ? 1 : 0.55 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
                    <VoiceRing engine={engine} active={on} color={tint(i)} size={face} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={h.avatar} alt="" width={face} height={face} style={{ width: face, height: face, ['--tw-ring-color' as string]: on ? tint(i) : 'rgba(255,255,255,0.15)' }} className="relative rounded-full bg-white/10 object-cover ring-2" />
                  </motion.div>
                  <p className={`mt-4 w-full truncate text-center font-bold ${panel > 2 ? 'text-[12.5px] sm:text-[14px]' : 'text-[14px]'}`}>{h.name}</p>
                  <p className={`w-full truncate text-center text-white/45 ${panel > 2 ? 'text-[11px] sm:text-[12px]' : 'text-[12px]'}`}>{h.handle}</p>
                </div>
              );
            })}
          </div>

          {/* The words. */}
          <div className="mt-8 min-h-[150px]" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div key={`${s.chapter}-${s.line}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease }}>
                <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: tint(speaker) }}>{episode.hosts[speaker]?.name}</p>
                {line && <Spoken text={line.text} char={s.playing || s.progress > 0 ? s.char : -1} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Right: the chapter. */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <AnimatePresence mode="wait">
              <motion.div key={s.chapter} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.45, ease }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#3DD598]">{KIND_LABEL[ch?.kind] ?? 'Chapter'} · {s.chapter + 1} of {episode.chapters.length}</p>
                <p className="mt-1 text-[20px] font-extrabold leading-tight">{ch?.title}</p>
                <div className="mt-4">{ch?.visual ? <VisualCard v={ch.visual} /> : (
                  <div className="flex h-28 items-center justify-center rounded-2xl bg-white/[0.04]">
                    <div className="flex items-end gap-1" aria-hidden>
                      {[0, 1, 2, 3, 4, 5, 6].map(i => (
                        <motion.span key={i} className="w-1.5 rounded-full bg-white/40" animate={s.playing && !reduce ? { height: [8, 30, 12, 24, 8] } : { height: 10 }}
                          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.09 }} />
                      ))}
                    </div>
                  </div>
                )}</div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* The episode, line by line: tap to jump. */}
          <ol ref={transcript} className="max-h-[260px] space-y-1 overflow-y-auto overscroll-contain rounded-[22px] border border-white/10 bg-white/[0.02] p-2 [scrollbar-width:thin]" aria-label="Transcript">
            {episode.chapters.map((c, ci) => c.lines.map((l, li) => {
              const now = ci === s.chapter && li === s.line;
              return (
                <li key={`${ci}-${li}`}>
                  <button type="button" onClick={() => { engine.seek({ chapter: ci, line: li }); if (!s.playing) engine.play(); }}
                    data-now={now || undefined}
                    className={cn('flex w-full gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] leading-snug transition-colors', now ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85')}>
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: tint(l.host) }} />
                    <span>{l.text}</span>
                  </button>
                </li>
              );
            }))}
          </ol>
        </div>
      </div>

      {/* The controls and the timeline. */}
      <div className="relative border-t border-white/10 px-5 pb-5 pt-4 sm:px-7">
        <div className="flex gap-1" role="list" aria-label="Chapters">
          {episode.chapters.map((c, i) => {
            const before = episode.chapters.slice(0, i).reduce((n, x) => n + x.lines.length, 0);
            const fill = Math.max(0, Math.min(1, (done - before) / c.lines.length));
            return (
              <button key={i} type="button" role="listitem" onClick={() => engine.seek({ chapter: i, line: 0 })} title={c.title} aria-label={`Chapter ${i + 1}: ${c.title}`}
                className="group flex-1 py-2" style={{ flexGrow: c.lines.length }}>
                <span className="block h-1.5 overflow-hidden rounded-full bg-white/12 transition-[height] group-hover:h-2">
                  <span className="block h-full rounded-full bg-white" style={{ width: `${(s.done ? 1 : fill) * 100}%` }} />
                </span>
                {/* Every chapter's name on a wide screen; on a phone, the current one's (below). */}
                <span className={cn('mt-1.5 hidden truncate text-left text-[10.5px] font-semibold sm:block', i === s.chapter ? 'text-white' : 'text-white/40')}>{c.title}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 truncate text-[12px] font-semibold text-white/70 sm:hidden">{ch?.title}</p>
        {/* Speed, the transport and sharing: one row on a wide screen; the transport on a row of its own on a phone. */}
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button type="button" onClick={() => engine.setRate(s.rate === 1 ? 1.25 : s.rate === 1.25 ? 1.5 : 1)} aria-label={`Speed ${s.rate}x`}
            className="justify-self-start rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-bold tabular-nums text-white/80 transition hover:bg-white/10">{s.rate}x</button>
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" onClick={() => engine.prev()} aria-label="Previous chapter" className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
            </button>
            <motion.button type="button" onClick={() => engine.toggle()} aria-label={s.playing ? 'Pause' : 'Play'} whileTap={{ scale: 0.92 }}
              className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#EE5A2E] shadow-[0_14px_36px_-10px_rgba(238,90,46,0.8)]">
              {!s.playing && !reduce && <span className="absolute inset-0 animate-ping rounded-full bg-[#EE5A2E] opacity-25" />}
              {s.playing
                ? <svg viewBox="0 0 24 24" className="relative h-6 w-6" fill="#fff" aria-hidden><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
                : <svg viewBox="0 0 24 24" className="relative ml-1 h-7 w-7" fill="#fff" aria-hidden><path d="M7 4.5v15l12.5-7.5Z" /></svg>}
            </motion.button>
            <button type="button" onClick={() => engine.next()} aria-label="Next chapter" className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
            </button>
          </div>
          <button type="button" onClick={share} aria-label="Share this episode" className="justify-self-end rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">
            {copied ? 'Copied' : (
              <span className="flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
                <span className="hidden sm:inline">Share</span>
              </span>
            )}
          </button>
        </div>
        <p className="sr-only">{Math.round(pct * 100)}% played</p>
      </div>
    </div>
  );
}
