'use client';

/**
 * The manager's weekly round, at the foot of the manage page:
 *
 *   Payday       what the franchise earned since the last visit, collected
 *   Promo night  the weekly minigame: a promotion run at the next home game
 *
 * Payday is read from the franchise's own history; a promotion is a decision the
 * economy replays (lib/tycoon/economy), like every other. Building lives with the
 * stadium studio, right under the stadium (FranchiseHQ).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { lockScroll } from '@/lib/scrollLock';
import { Beer, Check, Lock, Receipt, Rocket, Smile, X } from '@/components/icons';
import { cash, PROMOS } from '@/lib/tycoon/economy';
import type { Tycoon } from './FranchiseHQ';

const EASE = [0.22, 1, 0.36, 1] as const;
const SEEN = (id: string) => `lp_hq_seen:${id}`;

export default function GamePlan({ franchiseId, t, url, auth, reload, hue }: {
  franchiseId: string; t: Tycoon; url: string; auth: Record<string, string> | null; reload: () => void; hue: string;
}) {
  const b = t.books!;
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const headers = { 'content-type': 'application/json', ...(auth ?? {}) };

  const post = async (body: object): Promise<{ ok: boolean; data: any }> => {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => null);
    const data = await r?.json().catch(() => null);
    if (!r?.ok) setError(r?.status === 401 ? 'Your editing pass has expired. Open the franchise again from your LeaguePulse account.' : data?.error ?? 'That did not go through.');
    return { ok: Boolean(r?.ok), data };
  };

  return (
    <section aria-label="This week" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Payday franchiseId={franchiseId} t={t} hue={hue} />
        <PromoCard promo={b.promo} onPlay={() => { setError(''); setPlaying(true); }} />
      </div>
      {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}

      <AnimatePresence>
        {playing && (
          <PromoGame key="promo" hue={hue} vc={b.vc} max={b.promo?.max ?? 6}
            onDone={async (promo, score) => { const r = await post({ action: 'promo', promo, score }); if (r.ok) reload(); return r.ok; }}
            onClose={() => setPlaying(false)} />
        )}
      </AnimatePresence>
    </section>
  );
}

function Card({ icon: Icon, kicker, children, glow = false }: { icon: React.ComponentType<{ className?: string }>; kicker: string; children: React.ReactNode; glow?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className={cn('relative flex min-h-[156px] flex-col overflow-hidden rounded-2xl border bg-card p-4',
        glow ? 'border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_16px_40px_-20px_hsl(var(--primary)/0.6)]' : 'border-border')}>
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />{kicker}
      </p>
      {children}
    </motion.div>
  );
}

const vcText = cash;

/** What came in since the last visit, collected with a flourish. Kept per browser. */
function Payday({ franchiseId, t, hue }: { franchiseId: string; t: Tycoon; hue: string }) {
  const vc = t.books!.vc;
  const [seen, setSeen] = useState<{ vc: number; at: number } | null | undefined>(undefined);
  const [collecting, setCollecting] = useState(false);
  useEffect(() => {
    let s: { vc: number; at: number } | null = null;
    try { s = JSON.parse(localStorage.getItem(SEEN(franchiseId)) ?? 'null'); } catch { /* none */ }
    // First visit: nothing to collect yet, just remember where things stand.
    if (!s) { s = { vc, at: Date.now() }; try { localStorage.setItem(SEEN(franchiseId), JSON.stringify(s)); } catch { /* ignore */ } }
    setSeen(s);
  }, [franchiseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const earned = seen ? Math.round(vc - seen.vc) : 0;
  const since = seen ? t.games.filter(g => (g.at ?? 0) > seen.at) : [];
  const wins = since.filter(g => g.result === 'W').length;
  const remember = useCallback(() => {
    const s = { vc, at: Date.now() };
    try { localStorage.setItem(SEEN(franchiseId), JSON.stringify(s)); } catch { /* ignore */ }
    setSeen(s);
  }, [franchiseId, vc]);
  // Spent more than came in (a build, a quiet offseason): nothing to collect, start counting again.
  useEffect(() => { if (seen && earned < 0) remember(); }, [seen, earned, remember]);

  const collect = () => { setCollecting(true); setTimeout(() => { remember(); setCollecting(false); }, 1300); };
  const ready = earned >= 1;

  return (
    <Card icon={Receipt} kicker="Payday" glow={ready}>
      {ready ? (
        <>
          <p className="mt-2 font-display text-[28px] font-extrabold leading-none tabular-nums text-primary">+<Count to={earned} format={cash} /></p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            {since.length ? `${since.length} game${since.length === 1 ? '' : 's'} since you were here${wins ? `, ${wins} win${wins === 1 ? '' : 's'}` : ''}. ` : 'Merch and sponsors since you were here. '}
          </p>
          <div className="mt-auto pt-4">
            <button onClick={collect} disabled={collecting}
              className="relative inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97]">
              {collecting ? 'Collected!' : 'Collect'}
              {collecting && <Coins hue={hue} />}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 font-display text-[24px] font-extrabold leading-none tabular-nums">{vcText(vc)}</p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">In the bank. Every game, win or lose, pays in; come back after the next one to collect.</p>
        </>
      )}
    </Card>
  );
}

/** A number that counts up to `to`. */
function Count({ to, format }: { to: number; format?: (n: number) => string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, v => (format ? format(v) : Math.round(v).toLocaleString('en-US')));
  useEffect(() => { const c = animate(mv, to, { duration: 1.1, ease: EASE }); return c.stop; }, [mv, to]);
  return <motion.span>{text}</motion.span>;
}

/** Coins bursting up out of the button. */
function Coins({ hue }: { hue: string }) {
  const coins = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: (Math.random() - 0.5) * 220, y: -60 - Math.random() * 110, r: Math.random() * 360, d: i * 0.025 })), []);
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {coins.map((c, i) => (
        <motion.span key={i} className="absolute flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-black"
          style={{ background: '#f5c542', borderColor: '#c99a1c', color: '#7a5a00' }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{ x: c.x, y: [0, c.y, c.y + 70], opacity: [1, 1, 0], scale: 1, rotate: c.r }}
          transition={{ duration: 1.1, delay: c.d, ease: 'easeOut' }}>
          {i % 3 ? '' : 'V'}
        </motion.span>
      ))}
      <motion.span className="absolute h-10 w-10 rounded-full" style={{ background: hue }} initial={{ scale: 0, opacity: 0.5 }} animate={{ scale: 5, opacity: 0 }} transition={{ duration: 0.7 }} />
    </span>
  );
}

function until(at: number): string {
  const h = Math.max(1, Math.ceil((at - Date.now()) / 3_600_000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`;
}

function PromoCard({ promo, onPlay }: { promo: NonNullable<Tycoon['books']>['promo']; onPlay: () => void }) {
  const ready = !promo || Date.now() >= promo.nextAt;
  const booked = promo?.pending ?? null;
  const max = promo?.max ?? 6;
  return (
    <Card icon={Beer} kicker="Promo night" glow={ready}>
      {ready ? (
        <>
          <p className="mt-2 font-display text-[19px] font-extrabold leading-tight">Book a promotion</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Dollar beer, fireworks or bobbleheads at your next home game. Run it well and the fans remember.</p>
          <div className="mt-auto pt-4">
            <button onClick={onPlay}
              className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition hover:bg-foreground/85 active:scale-[0.97]">
              Plan it
            </button>
          </div>
        </>
      ) : (
        <>
          {booked ? (
            <>
              <p className="mt-2 font-display text-[19px] font-extrabold leading-tight">{PROMOS[booked.id].name}</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{booked.score} of {max} on the setup: +{(booked.score * PROMOS[booked.id].interest).toFixed(1)} fan interest at your next home game.</p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">This week’s promotion has run. It showed at your last home game.</p>
          )}
          <p className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[12.5px] font-semibold text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Next one in {until(promo!.nextAt)}</p>
        </>
      )}
    </Card>
  );
}

/** Confetti over the whole screen. */
function Confetti({ hue, count = 60 }: { hue: string; count?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (Math.random() - 0.5) * 900, y: 300 + Math.random() * 500, r: (Math.random() - 0.5) * 900, d: Math.random() * 0.25,
    w: 6 + Math.random() * 6, color: [hue, '#f5c542', '#ffffff', 'hsl(var(--primary))'][i % 4],
  })), [hue, count]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[121] flex items-start justify-center overflow-hidden">
      {bits.map((c, i) => (
        <motion.span key={i} className="absolute top-[38%] rounded-[2px]" style={{ width: c.w, height: c.w * 0.45, background: c.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: c.x, y: [0, -c.y * 0.55, c.y], opacity: [1, 1, 0], rotate: c.r }}
          transition={{ duration: 1.9, delay: c.d, ease: 'easeOut' }} />
      ))}
    </div>
  );
}

/** A build, celebrated. */
export function LevelUp({ title, detail, hue, onDone }: { title: string; detail: string; hue: string; onDone: () => void }) {
  useEffect(() => { const id = setTimeout(onDone, 2400); return () => clearTimeout(id); }, [onDone]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]" onClick={onDone}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Confetti hue={hue} />
      <motion.div initial={{ scale: 0.6, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }} className="text-center text-white">
        <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-white/75">Level up</p>
        <p className="mt-2 font-display text-[34px] font-extrabold leading-none drop-shadow sm:text-[44px]">{title}</p>
        <p className="mt-2 text-[14px] text-white/80">{detail}. Watch it go up.</p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}


/**
 * Promotion night: pick a promotion, then run it. One mechanic, three looks: hold to fill and let
 * go inside the band. Pour a beer to the line, send a rocket to the burst zone, wind a bobblehead
 * to just the right tension. Six goes; the band narrows and the fill quickens each time.
 */
type PromoId = keyof typeof PROMOS;
const PROMO_ART: Record<PromoId, { icon: React.ComponentType<{ className?: string }>; verb: string; hit: string[]; miss: string; over: string; how: string }> = {
  beer: { icon: Beer, verb: 'Pour', hit: ['Cheers!', 'Perfect pour!', 'Right to the line!'], miss: 'Short pour', over: 'Foam everywhere!', how: 'Hold to pour. Let go when the beer reaches the line, before it foams over.' },
  fireworks: { icon: Rocket, verb: 'Launch', hit: ['Boom!', 'Beautiful!', 'Ooooh!'], miss: 'Fizzled', over: 'Too high!', how: 'Hold to send the rocket up. Let go inside the glowing band and it bursts.' },
  bobblehead: { icon: Smile, verb: 'Wind', hit: ['Nodding away!', 'Perfect wind!', 'Fans love it!'], miss: 'Barely nods', over: 'Sprung loose!', how: 'Hold to wind the spring. Let go in the band and the bobblehead nods just right.' },
};

function PromoGame({ hue, vc, max, onDone, onClose }: { hue: string; vc: number; max: number; onDone: (promo: PromoId, score: number) => Promise<boolean>; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [promo, setPromo] = useState<PromoId | null>(null);
  const [phase, setPhase] = useState<'pick' | 'intro' | 'play' | 'judged' | 'done'>('pick');
  const [results, setResults] = useState<('hit' | 'miss' | 'over')[]>([]);
  const [zone, setZone] = useState({ lo: 0.55, hi: 0.75 });
  const [saved, setSaved] = useState<boolean | null>(null);
  const level = useMotionValue(0);
  const holding = useRef(false);
  const done = useRef<('hit' | 'miss' | 'over')[]>([]);
  const score = results.filter(r => r === 'hit').length;

  useEffect(() => {
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { unlock(); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const newRound = useCallback((n: number) => {
    const width = 0.22 - n * 0.02;
    const lo = 0.35 + Math.random() * (0.88 - width - 0.35);
    setZone({ lo, hi: lo + width });
    level.set(0);
  }, [level]);

  const judge = useCallback((forced?: 'over') => {
    if (!holding.current && !forced) return;
    holding.current = false;
    const v = level.get();
    const r = forced ?? (v >= zone.lo && v <= zone.hi ? 'hit' : 'miss');
    if (r === 'hit' && 'vibrate' in navigator) navigator.vibrate?.(25);
    done.current = [...done.current, r];
    setResults(done.current);
    setPhase('judged');
    setTimeout(() => {
      if (done.current.length >= max) {
        setPhase('done');
        onDone(promo!, done.current.filter(x => x === 'hit').length).then(setSaved);
      } else { newRound(done.current.length); setPhase('play'); }
    }, 950);
  }, [level, zone, max, onDone, promo, newRound]);

  // While held, the level rises; past the top it's over.
  useEffect(() => {
    if (phase !== 'play') return;
    let raf = 0, last = performance.now();
    const speed = (reduce ? 0.35 : 0.5) + done.current.length * (reduce ? 0.05 : 0.09);
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      if (holding.current) {
        const v = level.get() + dt * speed;
        if (v >= 1) { level.set(1); judge('over'); return; }
        level.set(v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, level, judge, reduce]);

  const press = () => { if (phase === 'play') holding.current = true; };
  const release = () => judge();
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); press(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); release(); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  const art = promo ? PROMO_ART[promo] : null;
  const last = results.at(-1);
  const callout = phase === 'judged' && art ? (last === 'hit' ? art.hit[results.length % art.hit.length] : last === 'over' ? art.over : art.miss) : null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div role="dialog" aria-modal="true" aria-label="Promotion night" className="fixed inset-0 z-[110] flex flex-col bg-[#0b1116] text-white"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ backgroundImage: `radial-gradient(110% 60% at 50% 0%, ${hue}44, transparent 60%)` }}>
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/60">{promo ? PROMOS[promo].name : 'Promotion night'}</p>
          {promo && (
            <div className="mt-1 flex gap-1.5">
              {Array.from({ length: max }, (_, i) => {
                const r = results[i];
                return <span key={i} className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-[11px]',
                  !r ? 'border-white/25 text-white/40' : r === 'hit' ? 'border-transparent bg-white text-black' : 'border-white/25 bg-white/10 text-white/50')}>
                  {r === 'hit' ? <Check className="h-3 w-3" /> : r ? '×' : i + 1}
                </span>;
              })}
            </div>
          )}
        </div>
        <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-5 w-5" /></button>
      </div>

      {phase === 'pick' ? (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 overflow-y-auto px-4 pb-6">
          <p className="font-display text-[26px] font-extrabold leading-tight">Pick tonight’s promotion</p>
          <p className="-mt-1 text-[14px] text-white/65">It runs at your next home game. One a week.</p>
          {(Object.keys(PROMOS) as PromoId[]).map((id, i) => {
            const p = PROMOS[id], Icon = PROMO_ART[id].icon, short = p.cost > vc;
            return (
              <motion.button key={id} disabled={short} onClick={() => { setPromo(id); setPhase('intro'); }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }} whileTap={{ scale: 0.97 }}
                className="flex items-start gap-3 rounded-2xl border border-white/15 bg-white/[0.06] p-4 text-left transition hover:bg-white/10 disabled:opacity-45">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: hue }}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[16px] font-bold">{p.name}</span>
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11.5px] font-semibold">{p.cost ? cash(p.cost) : 'Free'}</span>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-white/65">{p.blurb}</span>
                  <span className="mt-1 block text-[12px] font-semibold" style={{ color: hue }}>Up to +{(p.interest * max).toFixed(1)} fan interest{short ? ` · need ${cash(p.cost - vc)} more` : ''}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <>
          {/* The stage: one tube, dressed for the promotion. */}
          <div className="relative flex flex-1 select-none touch-none items-center justify-center"
            onPointerDown={press} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}>
            {promo && <PromoStage promo={promo} level={level} zone={zone} hue={hue} result={phase === 'judged' ? last ?? null : null} />}
            <AnimatePresence>
              {callout && (
                <motion.p key={results.length} className="pointer-events-none absolute inset-x-0 top-[12%] text-center font-display text-[30px] font-extrabold drop-shadow"
                  initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>
                  {callout}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <div className="p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {phase === 'intro' && art && (
              <div className="mx-auto max-w-sm text-center">
                <p className="font-display text-[22px] font-extrabold">{PROMOS[promo!].name}</p>
                <p className="mt-1 text-[14px] text-white/70">{art.how} Six goes.</p>
                <button onClick={() => { newRound(0); setPhase('play'); }} className="mt-4 min-h-12 w-full rounded-2xl bg-white text-[16px] font-extrabold text-black active:scale-[0.98]">Start</button>
              </div>
            )}
            {(phase === 'play' || phase === 'judged') && art && (
              <button onPointerDown={press} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} disabled={phase !== 'play'}
                className="mx-auto flex min-h-14 w-full max-w-sm touch-none select-none items-center justify-center gap-2 rounded-2xl text-[18px] font-extrabold text-white transition active:scale-[0.97] disabled:opacity-60"
                style={{ background: hue }}>
                <art.icon className="h-5 w-5" /> Hold to {art.verb.toLowerCase()}
              </button>
            )}
            {phase === 'done' && promo && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto max-w-sm text-center">
                {score >= 4 && <Confetti hue={hue} count={score === max ? 80 : 40} />}
                <p className="font-display text-[44px] font-extrabold leading-none tabular-nums">{score}<span className="text-[22px] text-white/60"> / {max}</span></p>
                <p className="mt-1 font-display text-[20px] font-bold">{score === max ? 'A night they’ll talk about.' : score >= 4 ? 'A great night.' : score ? 'It went fine.' : 'Not your night.'}</p>
                <p className="mt-1 text-[13.5px] text-white/70">
                  {saved === null ? 'Booking it…' : saved ? `${PROMOS[promo].name} is booked: +${(score * PROMOS[promo].interest).toFixed(1)} fan interest at your next home game.` : 'That promotion could not be booked.'}
                </p>
                <button onClick={onClose} className="mt-4 min-h-12 w-full rounded-2xl bg-white text-[16px] font-extrabold text-black active:scale-[0.98]">Done</button>
              </motion.div>
            )}
          </div>
        </>
      )}
    </motion.div>,
    document.body,
  );
}

/** The tube each promotion fills, with the band to stop in. */
function PromoStage({ promo, level, zone, hue, result }: { promo: PromoId; level: ReturnType<typeof useMotionValue<number>>; zone: { lo: number; hi: number }; hue: string; result: 'hit' | 'miss' | 'over' | null }) {
  const pct = useTransform(level, v => `${v * 100}%`);
  const bottom = useTransform(level, v => `calc(${v * 100}% - 18px)`);
  const band = (
    <div className="absolute inset-x-0 border-y-2 border-dashed border-white/80" style={{ bottom: `${zone.lo * 100}%`, height: `${(zone.hi - zone.lo) * 100}%`, background: `${hue}40`, boxShadow: `0 0 24px ${hue}` }} />
  );
  if (promo === 'beer') {
    return (
      <div className="relative h-[52%] max-h-[340px] w-[150px]">
        {/* The cup: wider at the rim. */}
        <div className="absolute inset-0 overflow-hidden border-x-4 border-b-4 border-white/70 bg-white/[0.04]" style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 12% 100%)', borderRadius: '0 0 18px 18px' }}>
          <motion.div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-amber-600 to-amber-400" style={{ height: pct }}>
            <span className="absolute inset-x-0 -top-3 h-4 rounded-full bg-white/95" />
          </motion.div>
          {band}
        </div>
        <AnimatePresence>
          {result === 'over' && (
            <motion.div className="absolute -inset-x-3 -top-4 h-10 rounded-full bg-white" initial={{ scaleY: 0.3, opacity: 0 }} animate={{ scaleY: 1, opacity: 1, y: [0, 20, 60] }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} />
          )}
          {result === 'hit' && (
            <motion.div className="absolute inset-0" initial={{ x: 0, rotate: 0 }} animate={{ x: [0, 0, 260], rotate: [0, -6, 8] }} transition={{ duration: 0.9 }} />
          )}
        </AnimatePresence>
      </div>
    );
  }
  if (promo === 'fireworks') {
    return (
      <div className="relative h-[64%] max-h-[440px] w-[min(260px,70vw)]">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/15" />
        {band}
        <motion.span className="absolute left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full" style={{ bottom, background: hue }}>
          <Rocket className="h-5 w-5 -rotate-45" />
        </motion.span>
        <AnimatePresence>
          {result === 'hit' && (
            <motion.div className="pointer-events-none absolute left-1/2" style={{ bottom: `${level.get() * 100}%` }} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.1, delay: 0.3 }}>
              {Array.from({ length: 16 }, (_, i) => {
                const a = (i / 16) * Math.PI * 2;
                return <motion.span key={i} className="absolute h-2.5 w-2.5 rounded-full" style={{ background: i % 2 ? hue : '#f5c542' }}
                  initial={{ x: 0, y: 0, scale: 0.4 }} animate={{ x: Math.cos(a) * 110, y: Math.sin(a) * 110, scale: 1 }} transition={{ duration: 0.8, ease: 'easeOut' }} />;
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
  // Bobblehead: a spring tube, the figure riding its top; it nods when wound just right.
  return (
    <div className="relative h-[56%] max-h-[380px] w-[120px]">
      <div className="absolute inset-x-[30%] inset-y-0 rounded-full border-2 border-white/30 bg-white/[0.04]" />
      {band}
      <motion.div className="absolute inset-x-[30%] bottom-0 rounded-full opacity-60"
        style={{ height: pct, backgroundImage: `repeating-linear-gradient(0deg, ${hue} 0 6px, transparent 6px 12px)` }} />
      <motion.div className="absolute left-1/2 -translate-x-1/2" style={{ bottom }}>
        <motion.span className="block h-12 w-12 rounded-full border-2 border-white/80 bg-[#f1c7a1]" style={{ originY: 1 }}
          animate={result === 'hit' ? { rotate: [0, 18, -14, 10, -6, 0] } : result ? { y: [0, 30], opacity: [1, 0.4] } : {}} transition={{ duration: 0.9 }}>
          <span className="absolute left-2.5 top-4 h-1.5 w-1.5 rounded-full bg-black/70" /><span className="absolute right-2.5 top-4 h-1.5 w-1.5 rounded-full bg-black/70" />
          <span className="absolute left-1/2 top-7 h-1 w-4 -translate-x-1/2 rounded-full bg-black/60" />
        </motion.span>
        <span className="mx-auto -mt-1 block h-7 w-9 rounded-t-xl" style={{ background: hue }} />
      </motion.div>
    </div>
  );
}
