'use client';

/**
 * Franchise HQ: the franchise as a business (lib/tycoon). The stadium in 3D
 * leads the page; below it, collapsible sections: for everyone, its crowds,
 * fans and front office log; for its manager, prices with a live forecast,
 * the upgrade shop, the books and the stadium's look. The page's own
 * sections follow in the same list (children).
 */

import { defaultStadiumName } from '@/lib/franchise/stadiumName';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lockScroll } from '@/lib/scrollLock';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AlertTriangle, BarChart3, CalendarDays, Flame, Layers, Maximize2, Megaphone, Receipt, Rocket, Scroll, Tag, Ticket, Trophy, X } from '@/components/icons';
import { Section, Sections } from '../Section';
import { StadiumMark } from '@/components/platform/marks';
import { projectGame, type Prices } from '@/lib/tycoon/economy';
import type { Facilities, TrackId } from '@/lib/tycoon/catalog';
import { normalizeLook, type StadiumLook } from '@/lib/franchise/model';
import { seededLook } from '@/lib/franchise/seededLook';
import { STYLES, styleBuild, type StadiumStyle } from '@/lib/franchise/stadiumStyles';
import { FULLY_BUILT, lookSummary, PreviewControls, StadiumStudio } from './StadiumStudio';
import { CHART_VARS, CrowdsChart, DemandCharts, InterestChart, RevenueChart, VCChart } from './charts';

const Stadium3D = dynamic(() => import('./Stadium3D'), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted/40" /> });

interface Game {
  key: string; season: number; week: number; result: 'W' | 'L' | 'T'; points: number; oppPoints: number; opponent: string; postseason: boolean;
  attendance: number; capacity: number; interest: number;
  /** Hosted, or on the road (lib/franchise/venue). */
  home?: boolean;
  prices?: Prices; fairTicket?: number; revenue?: Record<string, number>; costs?: { operations: number }; profit?: number; interestChange?: number;
}
interface ShopItem {
  track: TrackId; name: string; about: string; level: number; max: number; blocked: string | null;
  next: { name: string; cost: number; upkeep: number; blurb: string; level: number; affordable: boolean } | null;
}
interface Tycoon {
  available: boolean; canManage: boolean;
  stadium: { stadiumName: string; capacity: number; parking: number; appeal: number; upkeep: number; facilities: Facilities };
  interest: number; value: number; games: Game[];
  story: { at: number; kind: string; title: string; detail: string }[];
  books: null | {
    vc: number; prices: Prices; fair: Prices; autopilot: boolean; form: number; resentment: number;
    days: { at: number; vc: number; interest: number; merch: number; sponsors: number; upkeep: number }[];
    shop: ShopItem[];
  };
}

const EASE = [0.22, 1, 0.36, 1] as const;
const money = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000).toLocaleString('en-US')}k`);

function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, v => `${Math.round(v).toLocaleString('en-US')}${suffix}`);
  useEffect(() => { const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] }); return c.stop; }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  start: CalendarDays, title: Trophy, build: Layers, sellout: Ticket, record: Megaphone, unrest: AlertTriangle, streak: Flame, milestone: Rocket, prices: Tag,
};

/**
 * `public`: the stadium, crowds, fans and log, on the franchise page.
 * `manage`: the stadium and the control room, on the manager's page (auth required for the books).
 */
export default function FranchiseHQ({ franchiseId, mode, auth = null, color, teamName, logo = null, look = null, stadiumName = null, onLookSaved, identity, children }: {
  franchiseId: string; mode: 'public' | 'manage'; auth?: Record<string, string> | null; color: string | null; teamName: string;
  /** For midfield; same-origin (see fieldLogo). */
  logo?: string | null;
  look?: StadiumLook | null; stadiumName?: string | null; onLookSaved?: () => void;
  /** The franchise's identity editor, right under the stadium studio (manage). */
  identity?: React.ReactNode;
  /** The page's own sections, after these. */
  children?: React.ReactNode;
}) {
  // On the manage page the studio below the stadium changes these live, before saving.
  // Nobody has dressed it yet: the franchise's own stadium, picked from its id (the same every time).
  const savedLook = useMemo(() => (look ? normalizeLook(look) : seededLook(franchiseId)), [look, franchiseId]);
  const [draftLook, setDraftLook] = useState<StadiumLook>(savedLook);
  const [fullBuild, setFullBuild] = useState(false);
  const [draftName, setDraftName] = useState(stadiumName ?? '');
  const [hour, setHour] = useState<number | undefined>(undefined);
  useEffect(() => { setDraftLook(savedLook); }, [savedLook]);
  useEffect(() => { setDraftName(stadiumName ?? ''); }, [stadiumName]);
  const [t, setT] = useState<Tycoon | null>(null);
  const url = `/api/tycoon/${encodeURIComponent(franchiseId)}`;
  const load = useCallback(() => {
    fetch(url, { headers: auth ?? {}, cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => d && setT(d)).catch(() => {});
  }, [url, auth]);
  useEffect(load, [load]);

  const [hint, setHint] = useState(true);
  // A link to the franchise's #stadium (the franchises list) opens the stadium fullscreen.
  const available = t?.available ?? false;
  useEffect(() => { if (available && window.location.hash === '#stadium') setFull(true); }, [available]);
  // Fullscreen: the stadium fills the screen, with the studio beside it (below it on a phone) for its manager.
  const [full, setFull] = useState(false);
  // Closing, the overlay fades out over the page; it lets clicks through from the start.
  const overlay = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    overlay.current?.style.setProperty('pointer-events', 'none');
    setFull(false);
    // Opened from a link to #stadium: closing leaves the page, not the link.
    if (window.location.hash === '#stadium') history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  // The one 3D stadium, mounted once into a node of its own that moves between
  // the page and fullscreen (StadiumSlot). Remounting it on every toggle built a
  // new WebGL context each time, which stalls the browser and, a few toggles
  // in, runs into the browser's limit on contexts.
  const [host] = useState(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'h-full w-full';
    return el;
  });
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const unlock = lockScroll();
    window.addEventListener('keydown', onKey);
    return () => { unlock(); window.removeEventListener('keydown', onKey); };
  }, [full, close]);
  useEffect(() => { const id = setTimeout(() => setHint(false), 4500); return () => clearTimeout(id); }, []);

  if (!t) return <div className="h-[440px] animate-pulse rounded-3xl border border-border bg-card sm:h-[540px]" />;
  if (!t.available) return identity || children ? <Sections>{identity}{children}</Sections> : null;
  // The last crowd it drew: road games filled the other team's stadium.
  const last = [...t.games].reverse().find(g => g.home !== false);
  // The economy plays every archived season; the charts and the books show the latest one.
  const seasonNow = last?.season ?? null;
  const thisSeason = t.games.filter(g => g.season === seasonNow);
  const seasons = new Set(t.games.map(g => g.season)).size;
  const tSeason = { ...t, games: thisSeason };
  const hue = color ?? '#2a78d6';
  const scope = mode === 'manage' ? 'manage' : 'team';
  // The manager's name for it, or the franchise's own until they pick one; the tier (Sandlot to Monolith) underneath.
  const shownName = (mode === 'manage' ? draftName : stadiumName) || defaultStadiumName(franchiseId, teamName);
  const lookNow = mode === 'manage' ? draftLook : savedLook;
  const previewing = mode === 'manage' && fullBuild;
  const stadium = (
    <Stadium3D facilities={previewing ? FULLY_BUILT : t.stadium.facilities} fill={last ? last.attendance / last.capacity : 0.6} color={hue} name={t.stadium.stadiumName}
      teamName={teamName} logo={logo} look={lookNow} hour={hour} />
  );
  const studio = (compact: boolean) => (
    <StadiumStudio franchiseId={franchiseId} auth={auth} look={draftLook} name={draftName} hour={hour}
      color={hue} teamName={teamName} facilities={t.stadium.facilities} fullBuild={fullBuild} compact={compact}
      onLook={setDraftLook} onName={setDraftName} onHour={setHour} onFullBuild={setFullBuild}
      onFullscreen={compact ? undefined : () => setFull(true)}
      saved={{ look: savedLook, name: stadiumName ?? '' }} onSaved={onLookSaved} />
  );

  return (
    <div className={cn('space-y-3', CHART_VARS)}>
      {/* The stadium */}
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: EASE }}
        className="relative h-[440px] overflow-hidden rounded-3xl border border-border bg-muted/40 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)] sm:h-[540px]">
        {/* One stadium at a time: while fullscreen has it, this spot holds still. */}
        <StadiumSlot host={host} active={!full} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/55 via-black/25 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 text-white sm:p-5">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6, ease: EASE }}>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/75">{teamName}</p>
            <p className="font-display text-xl font-bold leading-tight tracking-tight drop-shadow sm:text-2xl">{shownName}</p>
            <p className="text-[12.5px] text-white/85 drop-shadow">{t.stadium.stadiumName}, {t.stadium.capacity.toLocaleString('en-US')} seats</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6, ease: EASE }} className="text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/75">Franchise value</p>
            <p className="font-display text-xl font-bold tabular-nums drop-shadow sm:text-2xl">{money(t.value)}</p>
            {mode === 'manage' && t.books && <p className="text-[12.5px] font-semibold tabular-nums text-white/85"><Counter value={t.books.vc} /> VC</p>}
          </motion.div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-5">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6, ease: EASE }} className="flex gap-5 sm:gap-8">
            <Gauge label="Fan interest" value={t.interest} />
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/75">Last crowd</p>
              <p className="text-[15px] font-bold tabular-nums">{last ? `${last.attendance.toLocaleString('en-US')}, ${Math.round(100 * last.attendance / last.capacity)}% full` : 'No games yet'}</p>
            </div>
          </motion.div>
          <div className="flex items-center gap-2">
          <AnimatePresence>
            {previewing ? (
              <motion.p key="preview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-semibold backdrop-blur-md">
                Preview: fully built
              </motion.p>
            ) : hint && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
                className="hidden rounded-full bg-black/40 px-3 py-1.5 text-[12px] font-semibold backdrop-blur-md sm:block">
                Drag to look around
              </motion.p>
            )}
          </AnimatePresence>
          <button onClick={() => setFull(true)} aria-label="Open the stadium fullscreen" title="Fullscreen"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/60">
            <Maximize2 className="h-4 w-4" />
          </button>
          </div>
        </div>
      </motion.div>

      <Sections>
        {mode === 'public' && thisSeason.length > 0 && (
          <Section scope={scope} id="crowds" icon={BarChart3} title="Crowds and fans" index={0}
            summary={`${seasonNow} season, ${thisSeason.length} game day${thisSeason.length === 1 ? '' : 's'}${last ? `, last crowd ${Math.round(100 * last.attendance / last.capacity)}% full` : ''}${seasons > 1 ? `, ${seasons} seasons in all` : ''}`}>
            <div className="grid gap-3 md:grid-cols-2">
              <CrowdsChart games={thisSeason.filter(g => g.home !== false)} />
              <InterestChart games={thisSeason} />
            </div>
          </Section>
        )}
        {mode === 'public' && t.story.length > 0 && (
          <Section scope={scope} id="log" icon={Scroll} title="Front office log" index={1} summary={t.story.at(-1)!.title}>
            <Story events={t.story} />
          </Section>
        )}

        {mode === 'manage' && (
          <Section scope={scope} id="look" icon={StadiumMark} title="Stadium studio" index={0} defaultOpen
            summary={`${shownName}: ${lookSummary(draftLook)}`}>
            {full ? <p className="text-[12.5px] text-muted-foreground">Open in fullscreen.</p> : studio(false)}
          </Section>
        )}
        {identity}
        {mode === 'manage' && t.books && <ControlRoom t={tSeason} url={url} auth={auth} reload={load} canManage={t.canManage} scope={scope} style={draftLook.style} />}

        {children}
      </Sections>

      {host && createPortal(stadium, host)}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {full && (
            <motion.div key="full" role="dialog" aria-modal="true" aria-label={`${shownName}, fullscreen`}
              ref={overlay} style={{ pointerEvents: 'auto' }}
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3, ease: EASE }}
              className={cn('fixed inset-0 z-[100] flex flex-col bg-background lg:flex-row', CHART_VARS)}>
              <div className={cn('relative shrink-0 lg:h-auto lg:flex-1', mode === 'manage' ? 'h-[46dvh]' : 'h-full')}>
                <StadiumSlot host={host} active />
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/55 to-transparent p-4 pb-10 text-white">
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/75">{teamName}</p>
                    <p className="truncate font-display text-lg font-bold leading-tight drop-shadow sm:text-xl">{shownName}</p>
                  </div>
                  <button onClick={close} aria-label="Close fullscreen" autoFocus
                    className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/60">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {mode === 'manage' && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-3 pt-8">
                    <PreviewControls overlay hour={hour} fullBuild={fullBuild} onHour={setHour} onFullBuild={setFullBuild} />
                  </div>
                )}
              </div>
              {mode === 'manage' && (
                <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.4, ease: EASE }}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border lg:w-[460px] lg:flex-none lg:border-l lg:border-t-0">
                  <div className="px-4 pt-4 sm:px-5">{studio(true)}</div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/** A place the stadium can show: while active, it holds the stadium's node (see `host` in FranchiseHQ). */
function StadiumSlot({ host, active }: { host: HTMLDivElement | null; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (active && host && ref.current && host.parentElement !== ref.current) ref.current.appendChild(host);
  }, [active, host]);
  return <div ref={ref} className="h-full w-full" />;
}

function Gauge({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-32 sm:w-40">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/75">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
          <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        <span className="text-sm font-bold tabular-nums">{Math.round(value)}</span>
      </div>
    </div>
  );
}

function Story({ events }: { events: Tycoon['story'] }) {
  if (!events.length) return null;
  return (
    <div className="pl-2.5">
      <ol className="relative space-y-4 border-l border-border pl-5">
        {[...events].reverse().slice(0, 12).map((e, i) => (
          <motion.li key={`${e.at}-${i}`} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}>
            {(() => { const Icon = KIND_ICON[e.kind] ?? Trophy; return (
              <span className={cn('absolute -left-[10.5px] flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card', e.kind === 'unrest' ? 'text-amber-600' : 'text-primary')}>
                <Icon className="h-3 w-3" />
              </span>
            ); })()}
            <p className="text-sm font-semibold">{e.title}</p>
            <p className="text-[12.5px] text-muted-foreground">{e.detail}</p>
            <p className="text-[11px] text-muted-foreground/70">{new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** The manager's sections: prices, building, and the books. */
function ControlRoom({ t, url, auth, reload, canManage, scope, style }: { t: Tycoon; url: string; auth: Record<string, string> | null; reload: () => void; canManage: boolean; scope: string; style: StadiumStyle }) {
  const b = t.books!;
  const [prices, setPrices] = useState<Prices>(b.prices);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; where: string } | null>(null);
  useEffect(() => setPrices(b.prices), [b.prices]);

  const state = { interest: t.interest, facilities: t.stadium.facilities };
  const now = useMemo(() => projectGame(state, b.prices), [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => projectGame(state, prices), [prices, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const curve = useMemo(() => {
    const lo = Math.max(5, Math.round(b.fair.ticket * 0.4 / 5) * 5), hi = Math.round(b.fair.ticket * 2 / 5) * 5;
    return Array.from({ length: Math.floor((hi - lo) / 5) + 1 }, (_, i) => {
      const price = lo + i * 5;
      const p = projectGame(state, { ...prices, ticket: price });
      return { price, profit: p.profit, attendance: p.attendance };
    });
  }, [prices, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const greedy = prices.ticket > b.fair.ticket * 1.15;
  const changed = prices.ticket !== b.prices.ticket || prices.concession !== b.prices.concession || prices.parking !== b.prices.parking;
  const headers = { 'content-type': 'application/json', ...(auth ?? {}) };

  const post = async (key: string, where: string, body: object, ok: string) => {
    setBusy(key); setMsg(null);
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok) { setMsg({ ok: true, where, text: d?.built ? `Built: ${d.built}. Watch it go up.` : ok }); reload(); }
    else setMsg({ ok: false, where, text: r?.status === 401 ? 'Your editing pass has expired. Open the franchise again from your LeaguePulse account.' : d?.error ?? 'That did not go through.' });
    setBusy(null);
  };
  const note = (where: string) => (
    <AnimatePresence>
      {msg?.where === where && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('text-[13px] font-medium', msg.ok ? 'text-primary' : 'text-destructive')}>{msg.text}</motion.p>
      )}
    </AnimatePresence>
  );
  const ready = b.shop.filter(i => i.next?.affordable).length;
  const lastBooks = [...t.games].reverse().find(g => g.profit !== undefined);

  return (
    <>
      <Section scope={scope} id="prices" icon={Ticket} title="Prices" index={0}
        summary={`Ticket $${b.prices.ticket} (fair is $${b.fair.ticket}), food $${b.prices.concession}, parking $${b.prices.parking}${canManage ? '' : ', view only'}`}>
        <div className="space-y-4">
          {b.autopilot && (
            <p className="rounded-xl border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground">
              The old front office is still setting prices. Set your own and they are yours from the next game.
            </p>
          )}
          <p className="text-[12.5px] text-muted-foreground">Fans think about ${b.fair.ticket} is fair for a ticket right now. Charge much more and they will remember.</p>
          <div className="grid gap-5 sm:grid-cols-3">
            <Slider label="Ticket" value={prices.ticket} min={5} max={Math.max(150, b.fair.ticket * 2.5)} step={1} fair={b.fair.ticket} onChange={v => setPrices(p => ({ ...p, ticket: v }))} disabled={!canManage} />
            <Slider label="Concessions (per item)" value={prices.concession} min={1} max={30} step={0.5} fair={b.fair.concession} onChange={v => setPrices(p => ({ ...p, concession: v }))} disabled={!canManage} />
            <Slider label="Parking" value={prices.parking} min={0} max={80} step={1} fair={b.fair.parking} onChange={v => setPrices(p => ({ ...p, parking: v }))} disabled={!canManage} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Forecast label="Crowd" now={now.attendance} next={preview.attendance} fmt={n => n.toLocaleString('en-US')} />
            <Forecast label="Game day revenue" now={now.profit + now.operations} next={preview.profit + preview.operations} fmt={money} />
            <Forecast label="Profit" now={now.profit} next={preview.profit} fmt={money} />
          </div>
          <AnimatePresence>
            {greedy && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="rounded-lg bg-amber-500/12 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
                That is well above fair. Fans will resent it, and resentment costs fan interest every game until prices come down.
              </motion.p>
            )}
          </AnimatePresence>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => post('prices', 'prices', { action: 'prices', prices }, 'Prices set. They apply from the next game.')} disabled={!changed || busy === 'prices'}
                className="rounded-full bg-foreground px-5 py-2.5 text-[13.5px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-50">
                {busy === 'prices' ? 'Saving' : 'Set prices'}
              </button>
              <button onClick={() => setPrices({ ticket: b.fair.ticket, concession: b.fair.concession, parking: b.fair.parking })}
                className="rounded-full border border-border px-4 py-2.5 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground">Match fair prices</button>
              {note('prices')}
            </div>
          )}
          <DemandCharts curve={curve} current={prices.ticket} fair={b.fair.ticket} />
        </div>
      </Section>

      <Section scope={scope} id="build" icon={Layers} title="Build" index={1}
        summary={`${b.vc.toLocaleString('en-US')} VC to spend${ready ? `, ${ready} upgrade${ready === 1 ? '' : 's'} ready` : ''}`}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-3xl font-extrabold tabular-nums tracking-tight"><Counter value={b.vc} /> <span className="text-base font-bold text-muted-foreground">VC</span></p>
            <p className="text-[12px] text-muted-foreground">Upkeep {money(t.stadium.upkeep)} a week. Profit becomes VC: one for every $4,000.</p>
          </div>
          {note('build')}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {b.shop.map(item => <ShopCard key={item.track} item={item} vc={b.vc} busy={busy === item.track} canManage={canManage} style={style}
              onBuild={() => post(item.track, 'build', { action: 'build', track: item.track }, 'Built.')} />)}
          </div>
        </div>
      </Section>

      <Section scope={scope} id="books" icon={Receipt} title="The books" index={2}
        summary={lastBooks ? `Last game: ${money(lastBooks.profit!)} profit on ${money((lastBooks.profit ?? 0) + (lastBooks.costs?.operations ?? 0))} revenue` : 'No game days yet'}>
        <div className="space-y-3">
          {t.games.some(g => g.revenue) && (
            <div className="grid gap-3 lg:grid-cols-2">
              <RevenueChart games={t.games.filter(g => g.revenue) as { week: number; revenue: Record<string, number> }[]} />
              <VCChart days={b.days} />
            </div>
          )}
          <Ledger games={t.games} />
        </div>
      </Section>
    </>
  );
}

function Slider({ label, value, min, max, step, fair, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; fair: number; onChange: (v: number) => void; disabled: boolean }) {
  const pct = ((value - min) / (max - min)) * 100, fairPct = ((fair - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[12.5px]">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="text-[17px] font-bold tabular-nums text-foreground">${value % 1 ? value.toFixed(2) : value}</span>
      </span>
      <span className="relative mt-2 block">
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))}
          className="lp-range w-full" style={{ ['--fill' as string]: `${pct}%` }} aria-label={label} />
        <span aria-hidden className="pointer-events-none absolute -bottom-3 text-[9.5px] font-semibold text-muted-foreground" style={{ left: `calc(${fairPct}% - 10px)` }}>▲ fair</span>
      </span>
    </label>
  );
}

function Forecast({ label, now, next, fmt }: { label: string; now: number; next: number; fmt: (n: number) => string }) {
  const diff = next - now;
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-bold tabular-nums">{fmt(next)}</p>
      {Math.abs(diff) > 0.5 && <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">{diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))} vs now</p>}
    </div>
  );
}

function ShopCard({ item, vc, busy, canManage, style, onBuild }: { item: ShopItem; vc: number; busy: boolean; canManage: boolean; style: StadiumStyle; onBuild: () => void }) {
  const next = item.next;
  const build = styleBuild(style, item.track);
  const progress = next ? Math.min(1, vc / next.cost) : 1;
  return (
    <motion.div layout className="flex flex-col rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold">{item.name}</p>
          <p className="text-[11.5px] leading-snug text-muted-foreground">{item.about}</p>
        </div>
        <div className="flex shrink-0 gap-0.5 pt-1" aria-label={`Level ${item.level} of ${item.max}`}>
          {Array.from({ length: item.max }, (_, i) => (
            <motion.span key={i} initial={false} animate={{ scale: i < item.level ? 1 : 0.85 }} className={cn('h-2 w-2 rounded-full', i < item.level ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
      </div>
      {next ? (
        <div className="mt-3">
          <p className="text-[13px] font-semibold">{next.name}</p>
          <p className="text-[11.5px] text-muted-foreground">{next.blurb} Upkeep {money(next.upkeep)} a week.</p>
          {build && <p className="mt-1 text-[11.5px] leading-snug text-primary/90">On your {STYLES[style].name}: {build.charAt(0).toLowerCase() + build.slice(1)}</p>}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.8 }} />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-bold tabular-nums">{next.cost.toLocaleString('en-US')} VC</span>
            {canManage && (
              <button onClick={onBuild} disabled={!next.affordable || busy}
                className="rounded-full bg-foreground px-3.5 py-1.5 text-[12.5px] font-semibold text-background hover:bg-foreground/85 disabled:bg-muted disabled:text-muted-foreground">
                {busy ? 'Building' : next.affordable ? 'Build' : `${Math.round(progress * 100)}% saved`}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] font-semibold text-muted-foreground">{item.blocked ?? 'Fully built.'}</p>
      )}
    </motion.div>
  );
}

/** Every game's books, as a table: the exact numbers behind the charts. */
function Ledger({ games }: { games: Game[] }) {
  const rows = games.filter(g => g.revenue);
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">Game by game, {rows[0]?.season}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px] tabular-nums">
          <thead className="text-left text-muted-foreground">
            <tr>{['Week', 'Result', 'Ticket', 'Crowd', 'Tickets', 'Food', 'Parking', 'Suites', 'Sponsors', 'Home date', 'Road', 'Costs', 'Profit', 'Fans'].map(h => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {[...rows].reverse().map(g => (
              <tr key={g.key} className="border-t border-border">
                <td className="py-1.5 pr-3">{g.week}</td>
                <td className="pr-3">{g.result} {g.points.toFixed(1)}</td>
                <td className="pr-3">${g.prices!.ticket}</td>
                <td className="pr-3">{g.home === false ? 'Away' : `${Math.round(100 * g.attendance / g.capacity)}%`}</td>
                {(['tickets', 'concessions', 'parking', 'suites', 'sponsors', 'premium', 'road'] as const).map(k => <td key={k} className="pr-3">{money(g.revenue![k] ?? 0)}</td>)}
                <td className="pr-3">{money(g.costs!.operations)}</td>
                <td className="pr-3 font-semibold">{money(g.profit!)}</td>
                <td>{g.interestChange! > 0 ? '+' : ''}{g.interestChange}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
