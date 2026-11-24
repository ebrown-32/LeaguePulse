'use client';

/**
 * Sponsorships (lib/tycoon/sponsors), on the franchise's pages.
 *
 *   The partners     for everyone: the brands with their names on the place, under the stadium
 *   The deals desk   for the manager: the five things a franchise can sell. A slot not yet built
 *                    says what it needs; an open one has this week's offers; a sold one shows its
 *                    deal running (home games left, what it's paid, how close a clause is).
 *   The offers       three a slot. Each is a pitch: who they are, what the fans will make of
 *                    them, how long, and three ways to be paid. The numbers under each move with
 *                    the choice: what it pays if the team wins like it has been, if it loses out,
 *                    if it wins out. "On the stadium" tries the deal on in 3D before signing.
 *   The signing      the contract, the signature, the stamp, confetti in the brand's colours; then
 *                    back to a stadium with their name on it.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { lockScroll } from '@/lib/scrollLock';
import { Check, Lock, Star, X } from '@/components/icons';
import { BRAND, LOYALTY_MAX, SLOT, SLOTS, STRUCTURE, WALK_LOSSES, namedStadium, projectDeal, termsOf, type Brand, type Deal, type Offer, type SlotId, type Structure } from '@/lib/tycoon/sponsors';
import type { PastDeal } from '@/lib/tycoon/economy';
import { Section } from '../Section';

const EASE = [0.22, 1, 0.36, 1] as const;
export const usd = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 1 : 2)}M` : `$${Math.round(n / 1000).toLocaleString('en-US')}k`);
const TIER = ['', 'Local', 'Regional', 'National', 'Global'];
/** Slots a deal can be seen in on the stadium. */
const VISIBLE: SlotId[] = ['sideline', 'boards', 'skies', 'naming'];

export interface SponsorBooks {
  slots: { id: SlotId; open: boolean; deal: (Deal & { buyout: number }) | null; offers: Offer[] }[];
  value: number; tier: number; loyalty: Record<string, number>; past: PastDeal[]; earned: number;
  form: { winRate: number; selloutRate: number };
  nextOffersAt: number;
}

// ── A brand, drawn ───────────────────────────────────────────────────────────

function Mark({ brand, size }: { brand: Brand; size: number }) {
  const c = brand.accent, p = { fill: c } as const;
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden>
      {brand.mark === 'ring' && <><circle r="8" fill="none" stroke={c} strokeWidth="2.4" /><circle r="3" {...p} /></>}
      {brand.mark === 'shield' && <path d="M-8 -8 H8 V1 Q7 8 0 10 Q-7 8 -8 1 Z" {...p} />}
      {brand.mark === 'bolt' && <path d="M2.5 -10 L-6 1.5 H-0.5 L-3 10 L6 -2 H0.5 Z" {...p} />}
      {brand.mark === 'hex' && <path d="M8.2 -4.75 V4.75 L0 9.5 L-8.2 4.75 V-4.75 L0 -9.5 Z" {...p} />}
      {brand.mark === 'star' && <path d="M0 -10 L2.5 -3.4 9.5 -3.1 4 1.3 5.9 8.1 0 4.2 -5.9 8.1 -4 1.3 -9.5 -3.1 -2.5 -3.4 Z" {...p} />}
      {brand.mark === 'wave' && [-4.5, 0, 4.5].map(y => <path key={y} d={`M-10 ${y} C-4 ${y - 5} 4 ${y + 5} 10 ${y}`} fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" />)}
    </svg>
  );
}

/** The brand's wordmark on its own colours. */
export function BrandTile({ brand, size = 'md', className }: { brand: Brand; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'lg' ? { h: 'h-20', px: 22, m: 34, fit: 15 } : size === 'sm' ? { h: 'h-10', px: 11.5, m: 14, fit: 9 } : { h: 'h-14', px: 15, m: 22, fit: 13 };
  // A long name is set smaller, and may take two lines, so it's never cut off.
  const fontSize = Math.max(s.px * 0.62, s.px * Math.min(1, s.fit / brand.name.length * 1.6));
  return (
    <span className={cn('relative flex items-center justify-center gap-2 overflow-hidden rounded-xl px-3', s.h, className)}
      style={{ background: `linear-gradient(180deg, ${brand.bg}, color-mix(in srgb, ${brand.bg} 78%, #000))`, color: brand.ink, boxShadow: `inset 0 -3px 0 ${brand.accent}` }}>
      <Mark brand={brand} size={s.m} />
      <span className="line-clamp-2 min-w-0 text-balance text-center font-black uppercase leading-[1.05] tracking-[0.02em]" style={{ fontSize }}>{brand.name}</span>
    </span>
  );
}

function Stars({ n }: { n: number }) {
  if (!n) return null;
  return <span className="inline-flex items-center gap-0.5" title={`${n} deal${n === 1 ? '' : 's'} seen through with them: each is worth 8% on their next offer`}>{Array.from({ length: LOYALTY_MAX }, (_, i) => <Star key={i} className={cn('h-3 w-3', i < n ? 'text-amber-400' : 'text-muted-foreground/30')} />)}</span>;
}

/** The brands with their names on the place: for everyone, under the stadium. */
export function PartnerStrip({ partners, capacity }: { partners: { slot: SlotId; brand: string }[]; capacity: number }) {
  const list = partners.map(p => ({ ...p, b: BRAND[p.brand] })).filter(p => p.b);
  if (!list.length) return null;
  const naming = list.find(p => p.slot === 'naming');
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Official partners{naming ? `, and the name on the building: ${namedStadium(naming.b, capacity)}` : ''}</p>
      <ul className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {list.sort((a, c) => SLOT[c.slot].weight - SLOT[a.slot].weight).map(p => (
          <li key={p.slot}>
            <BrandTile brand={p.b} />
            <p className="mt-1 truncate text-center text-[10.5px] font-semibold text-muted-foreground">{SLOT[p.slot].name}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── The deals desk ───────────────────────────────────────────────────────────

const clauseText = (o: { clause: Offer['clause'] }) =>
  o.clause === 'walk' ? { name: 'Walk-away clause', about: `They pay 15% more, and leave after ${WALK_LOSSES} straight losses.` }
  : o.clause === 'escalator' ? { name: 'Escalator', about: 'Starts 10% lower, and the fee goes up 6% after every win (to 60% over).' }
  : null;

const vibeText = (b: Brand) =>
  b.vibe === 'loved' ? { label: 'Loved in town', about: 'Fans like seeing them: fan interest +2 on signing. They pay a little less.', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
  : b.vibe === 'shady' ? { label: 'Shady', about: 'They pay a third more. The fans will hold it against you: fan interest down 3 on signing.', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' }
  : null;

export function SponsorDesk({ books, scope, index, canManage, capacity, post, reload, onPreview, previewing }: {
  books: SponsorBooks; scope: string; index: number; canManage: boolean; capacity: number;
  post: (body: object) => Promise<{ ok: boolean; data: any; error?: string }>;
  reload: () => void;
  /** Try a deal on in the stadium (null: take it off). */
  onPreview: (p: { slot: SlotId; brand: string } | null) => void;
  previewing: { slot: SlotId; brand: string } | null;
}) {
  const [sheet, setSheet] = useState<SlotId | null>(null);
  const [signed, setSigned] = useState<{ offer: Offer; structure: Structure } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ending, setEnding] = useState<SlotId | null>(null);
  const sold = books.slots.filter(s => s.deal).length, open = books.slots.filter(s => s.open && !s.deal).length;

  const sign = async (offer: Offer, structure: Structure) => {
    setBusy(true); setError('');
    const r = await post({ action: 'sponsor', offer: offer.id, structure });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? r.data?.error ?? 'That did not go through.'); return; }
    onPreview(null); setSheet(null); setSigned({ offer, structure });
  };
  const end = async (slot: SlotId) => {
    setBusy(true); setError('');
    const r = await post({ action: 'sponsor-end', slot });
    setBusy(false); setEnding(null);
    if (!r.ok) setError(r.error ?? r.data?.error ?? 'That did not go through.');
    else reload();
  };

  return (
    <Section scope={scope} id="sponsors" icon={Star} title="Sponsorships" index={index} defaultOpen
      summary={`${sold} deal${sold === 1 ? '' : 's'} running${open ? `, ${open} slot${open === 1 ? '' : 's'} with offers` : ''}, ${usd(books.earned)} earned from sponsors`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-muted-foreground">
          A home game here is worth <b className="text-foreground">{usd(books.value)}</b> to a sponsor today, and <b className="text-foreground">{TIER[books.tier].toLowerCase()}</b> brands are calling. Bigger ones call as the stadium, the crowd and the trophy case grow.
        </p>
        <p className="text-[11.5px] text-muted-foreground">New offers {new Date(books.nextOffersAt).toLocaleDateString(undefined, { weekday: 'long' })}.</p>
      </div>
      {error && <p className="mt-2 text-[12.5px] font-semibold text-red-600 dark:text-red-400">{error}</p>}

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {books.slots.map(s => {
          const slot = SLOT[s.id], d = s.deal, brand = d ? BRAND[d.brand] : null;
          return (
            <li key={s.id} className={cn('flex flex-col rounded-2xl border p-3.5', d ? 'border-border bg-card' : s.open ? 'border-primary/40 bg-primary/[0.04]' : 'border-dashed border-border bg-muted/20')}>
              <p className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {slot.name}
                {d ? <span className="text-emerald-700 dark:text-emerald-300">Sold</span> : s.open ? <span className="text-primary">{s.offers.length} offer{s.offers.length === 1 ? '' : 's'}</span> : <Lock className="h-3.5 w-3.5" />}
              </p>
              {d && brand ? (
                <>
                  <BrandTile brand={brand} className="mt-2.5" />
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${((d.term - d.left) / d.term) * 100}%` }} transition={{ duration: 0.7, ease: EASE }} /></div>
                  <p className="mt-1.5 flex justify-between text-[11.5px] text-muted-foreground"><span>{d.left} of {d.term} home games left</span><span className="lp-num font-bold text-foreground">{usd(d.earned)} paid</span></p>
                  <p className="mt-1.5 text-[12px] text-foreground/85">
                    {STRUCTURE[d.structure].name}: {usd(d.base)} a home game{d.win ? `, ${usd(d.win)} a win` : ''}{d.sellout ? `, ${usd(d.sellout)} a sellout` : ''}{d.statement ? `, ${usd(d.statement)} for a top-two score` : ''}. {d.wins}-{d.losses} since signing.
                  </p>
                  {d.clause === 'walk' && <p className={cn('mt-1 text-[11.5px] font-semibold', d.skid >= WALK_LOSSES - 1 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>Walk-away clause: {d.skid ? `${d.skid} straight loss${d.skid === 1 ? '' : 'es'}, ${WALK_LOSSES - d.skid} more and they leave.` : `they leave after ${WALK_LOSSES} straight losses.`}</p>}
                  {d.clause === 'escalator' && <p className="mt-1 text-[11.5px] text-muted-foreground">Escalator: the fee started at {usd(d.base0)} and goes up 6% with every win.</p>}
                  {canManage && (ending === s.id ? (
                    <p className="mt-auto flex items-center gap-2 pt-2.5 text-[12px]">
                      <span className="text-muted-foreground">Buy them out for {usd(d.buyout)}?</span>
                      <button type="button" disabled={busy} onClick={() => end(s.id)} className="rounded-lg bg-red-600 px-2.5 py-1 font-bold text-white disabled:opacity-50">End it</button>
                      <button type="button" onClick={() => setEnding(null)} className="font-semibold text-muted-foreground hover:text-foreground">Keep it</button>
                    </p>
                  ) : <button type="button" onClick={() => setEnding(s.id)} className="mt-auto self-start pt-2.5 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground">Buy out the deal</button>)}
                </>
              ) : s.open ? (
                <>
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">{slot.about}</p>
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5">{s.offers.map(o => BRAND[o.brand] && <BrandTile key={o.id} brand={BRAND[o.brand]} size="sm" className="px-1.5" />)}</div>
                  {canManage && s.offers.length > 0 && <button type="button" onClick={() => { setError(''); setSheet(s.id); }} className="mt-3 self-start rounded-xl bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.7)]">Hear the offers</button>}
                  {!s.offers.length && <p className="mt-2 text-[12px] text-muted-foreground">Nobody is calling about this one this week.</p>}
                </>
              ) : (
                <>
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">{slot.about}</p>
                  <p className="mt-2 text-[12px] font-semibold text-foreground/80">To sell it: {slot.needs.charAt(0).toLowerCase() + slot.needs.slice(1)}.</p>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {books.past.length > 0 && (
        <div className="mt-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Past deals</p>
          <ul className="mt-1.5 divide-y divide-border/60">
            {books.past.map((p, i) => BRAND[p.brand] && (
              <li key={i} className="flex items-center gap-3 py-2 text-[12.5px]">
                <span className="w-28 shrink-0"><BrandTile brand={BRAND[p.brand]} size="sm" /></span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{SLOT[p.slot].name}, {p.term} games, {p.wins}-{p.losses}. {p.how === 'completed' ? 'Seen through.' : p.how === 'walked' ? 'They walked.' : 'Bought out.'}</span>
                <Stars n={books.loyalty[p.brand] ?? 0} />
                <span className="lp-num font-bold text-foreground">{usd(p.earned)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sheet && !previewing && <OfferSheet slot={sheet} offers={books.slots.find(s => s.id === sheet)?.offers ?? []} form={books.form} busy={busy} error={error}
        onClose={() => setSheet(null)} onSign={sign} onPreview={o => onPreview({ slot: o.slot, brand: o.brand })} />}
      <AnimatePresence>
        {signed && <Signing key="signing" offer={signed.offer} structure={signed.structure} capacity={capacity} onDone={() => { setSigned(null); reload(); }} />}
      </AnimatePresence>
    </Section>
  );
}

// ── The offers ───────────────────────────────────────────────────────────────

function OfferSheet({ slot, offers, form, busy, error, onClose, onSign, onPreview }: {
  slot: SlotId; offers: Offer[]; form: { winRate: number; selloutRate: number }; busy: boolean; error: string;
  onClose: () => void; onSign: (o: Offer, s: Structure) => void; onPreview: (o: Offer) => void;
}) {
  const [pick, setPick] = useState<Record<string, Structure>>({});
  useEffect(() => lockScroll(), []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  if (typeof document === 'undefined') return null;
  const s = SLOT[slot];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Offers for the ${s.name.toLowerCase()}`}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35, ease: EASE }}
        className="relative max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-4 py-3.5 backdrop-blur sm:px-6">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">This week&apos;s offers</p>
            <h2 className="font-display text-[22px] font-black leading-tight">{s.name}</h2>
            <p className="text-[12.5px] text-muted-foreground">{s.about} One deal a slot; a brand can only hold one.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>
        {error && <p className="px-4 pt-3 text-[12.5px] font-semibold text-red-600 dark:text-red-400 sm:px-6">{error}</p>}
        <ul className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
          {offers.map((o, i) => {
            const brand = BRAND[o.brand]; if (!brand) return null;
            const st = pick[o.id] ?? 'balanced', t = termsOf(o, st), cl = clauseText(o), vibe = vibeText(brand);
            const at = (w: number, so: number) => projectDeal(t, o.term, w, so, o.clause);
            const likely = at(form.winRate, form.selloutRate), low = at(0, 0), high = at(1, Math.max(form.selloutRate, 0.5));
            return (
              <motion.li key={o.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i, duration: 0.45, ease: EASE }}
                className="flex flex-col rounded-2xl border border-border bg-background/40 p-3.5">
                <BrandTile brand={brand} size="lg" />
                <p className="mt-2.5 text-[13.5px] font-semibold italic text-foreground">&ldquo;{brand.tagline}&rdquo;</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{TIER[brand.tier]} {brand.category.toLowerCase()}</span>
                  {vibe && <span className={cn('rounded px-1.5 py-0.5', vibe.cls)} title={vibe.about}>{vibe.label}</span>}
                  <Stars n={o.loyalty} />
                </p>
                {vibe && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{vibe.about}</p>}

                <p className="mt-3 text-[12.5px] text-foreground"><b>{o.term} home games</b>{t.signing ? <>, <b>{usd(t.signing)}</b> on signing</> : ''}.</p>
                {cl && <p className="mt-1 rounded-lg bg-amber-500/12 px-2.5 py-1.5 text-[11.5px] text-amber-800 dark:text-amber-300"><b>{cl.name}.</b> {cl.about}</p>}

                <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" role="radiogroup" aria-label="How it pays">
                  {(Object.keys(STRUCTURE) as Structure[]).map(k => (
                    <button key={k} type="button" role="radio" aria-checked={st === k} onClick={() => setPick(p => ({ ...p, [o.id]: k }))} title={STRUCTURE[k].blurb}
                      className={cn('rounded-lg px-1 py-1.5 text-[11.5px] font-bold transition-colors', st === k ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground')}>{STRUCTURE[k].name}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">{STRUCTURE[st].blurb}</p>
                <dl className="mt-2 space-y-1 text-[12.5px]">
                  {[['Every home game', t.base], ['Every win, home or away', t.win], ['Every sellout', t.sellout], ['A top-two score in the league', t.statement]].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="lp-num font-bold tabular-nums">{usd(v as number)}</dd></div>
                  ))}
                </dl>

                <div className="mt-3 rounded-xl border border-border p-2.5">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Over the {o.term} games</p>
                  <p className="lp-num mt-0.5 text-[22px] font-black leading-none text-foreground">{usd(likely)}</p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">if you keep winning {Math.round(form.winRate * 100)}% of the time, as over your last eight. Lose out: <b className="text-foreground">{usd(low)}</b>. Win out: <b className="text-foreground">{usd(high)}</b>.</p>
                </div>

                <div className="mt-auto flex gap-2 pt-3.5">
                  {VISIBLE.includes(o.slot) && <button type="button" onClick={() => onPreview(o)} className="flex-1 rounded-xl border border-border px-2 py-2 text-[12.5px] font-bold text-foreground hover:bg-muted/60">On the stadium</button>}
                  <button type="button" disabled={busy} onClick={() => onSign(o, st)} className="flex-1 rounded-xl px-2 py-2 text-[13px] font-black disabled:opacity-50" style={{ background: brand.bg, color: brand.ink, boxShadow: `inset 0 -3px 0 ${brand.accent}` }}>Sign</button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    </div>,
    document.body,
  );
}

/** While a deal is tried on in the stadium: who, and the way back to the offer. */
export function TryOnBar({ p, capacity, onBack }: { p: { slot: SlotId; brand: string }; capacity: number; onBack: () => void }) {
  const brand = BRAND[p.brand];
  if (!brand) return null;
  return (
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
      className="pointer-events-auto absolute inset-x-3 bottom-3 z-10 flex items-center gap-3 rounded-2xl bg-black/65 p-2.5 text-white backdrop-blur-md sm:inset-x-auto sm:left-1/2 sm:w-[460px] sm:-translate-x-1/2">
      <span className="w-32 shrink-0"><BrandTile brand={brand} size="sm" /></span>
      <span className="min-w-0 flex-1 text-[12px] leading-snug">Trying on: <b>{p.slot === 'naming' ? namedStadium(brand, capacity) : `${brand.name}, ${SLOT[p.slot].name.toLowerCase()}`}</b>{p.slot === 'boards' && '. Watch the screens.'}{p.slot === 'skies' && '. Look up.'}</span>
      <button type="button" onClick={onBack} className="shrink-0 rounded-xl bg-white px-3 py-2 text-[12.5px] font-black text-black">Back to the offer</button>
    </motion.div>
  );
}

// ── The signing ──────────────────────────────────────────────────────────────

function Signing({ offer, structure, capacity, onDone }: { offer: Offer; structure: Structure; capacity: number; onDone: () => void }) {
  const reduce = useReducedMotion();
  const brand = BRAND[offer.brand]!;
  const t = termsOf(offer, structure);
  useEffect(() => lockScroll(), []);
  // Confetti in the brand's colours, the same every time for the same deal.
  const bits = useMemo(() => Array.from({ length: 70 }, (_, i) => {
    const r = (n: number) => { const x = Math.sin((i + 1) * 12.9898 * n) * 43758.5453; return x - Math.floor(x); };
    return { x: r(1) * 100, d: r(2) * 0.9, dur: 2.2 + r(3) * 1.8, rot: r(4) * 720 - 360, w: 6 + r(5) * 7, c: [brand.bg, brand.accent, brand.ink, '#ffffff'][i % 4] };
  }), [brand]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-black/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={`Signed with ${brand.name}`}>
      {!reduce && bits.map((b, i) => (
        <motion.span key={i} className="pointer-events-none absolute top-0 rounded-[2px]" style={{ left: `${b.x}%`, width: b.w, height: b.w * 0.45, background: b.c }}
          initial={{ y: '-6vh', rotate: 0, opacity: 0 }} animate={{ y: '106vh', rotate: b.rot, opacity: [0, 1, 1, 0.8] }} transition={{ delay: 1.5 + b.d, duration: b.dur, ease: 'easeIn' }} />
      ))}
      <motion.div initial={{ scale: 0.9, y: 24, rotate: -1.5 }} animate={{ scale: 1, y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}
        className="relative w-full max-w-md rounded-md bg-[#fbf8f0] p-6 text-[#1c1b19] shadow-[0_40px_90px_-20px_rgba(0,0,0,0.8)]">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.3em] text-[#1c1b19]/55">Partnership agreement</p>
        <BrandTile brand={brand} size="lg" className="mt-3" />
        <h2 className="mt-4 text-center font-display text-[22px] font-black leading-tight">{offer.slot === 'naming' ? namedStadium(brand, capacity) : SLOT[offer.slot].name}</h2>
        <dl className="mt-4 space-y-1.5 border-y border-[#1c1b19]/15 py-3 text-[13px]">
          {[['Term', `${offer.term} home games`], ['Structure', STRUCTURE[structure].name], ['Every home game', usd(t.base)], ...(t.win ? [['Every win', usd(t.win)]] : []), ...(t.sellout ? [['Every sellout', usd(t.sellout)]] : []), ...(t.statement ? [['A top-two score', usd(t.statement)]] : []), ...(t.signing ? [['On signing', usd(t.signing)]] : [])].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-[#1c1b19]/60">{k}</dt><dd className="font-bold tabular-nums">{v}</dd></div>
          ))}
        </dl>
        {/* The signature, written; then the stamp. */}
        <div className="relative mt-5 h-16">
          <svg viewBox="0 0 300 60" className="absolute inset-0 h-full w-full" aria-hidden>
            <motion.path d="M14 42 C30 10 44 12 40 34 C37 50 58 20 68 30 C78 40 70 48 84 36 C98 24 104 46 118 34 C132 22 128 50 146 36 C164 22 170 44 190 38 C214 31 232 44 284 26"
              fill="none" stroke="#1b2a6b" strokeWidth="2.4" strokeLinecap="round" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 1.1, ease: 'easeInOut' }} />
            <line x1="10" y1="52" x2="290" y2="52" stroke="#1c1b19" strokeOpacity="0.35" strokeWidth="1" />
          </svg>
          <motion.span initial={{ scale: 2.6, opacity: 0, rotate: -24 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} transition={{ delay: reduce ? 0 : 1.6, type: 'spring', stiffness: 380, damping: 14 }}
            className="absolute right-1 top-0 rounded-md border-[3px] border-[#b3261e] px-2.5 py-1 text-[15px] font-black uppercase tracking-[0.18em] text-[#b3261e]">Signed</motion.span>
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 2.1 }}>
          <p className="mt-2 text-center text-[12.5px] italic text-[#1c1b19]/70">&ldquo;{brand.tagline}&rdquo;</p>
          <button type="button" onClick={onDone} autoFocus className="mt-4 w-full rounded-xl py-3 text-[14px] font-black" style={{ background: brand.bg, color: brand.ink, boxShadow: `inset 0 -3px 0 ${brand.accent}` }}>
            {VISIBLE.includes(offer.slot) ? 'See it on the stadium' : 'Back to the franchise'}
          </button>
        </motion.div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
