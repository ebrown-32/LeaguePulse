'use client';

/**
 * The operator's panel: every league on the platform, at /operator on the
 * product domain.
 *
 * Opens for a signed-in operator account (LP_OPERATOR_EMAILS), or with
 * LP_OPERATOR_SECRET kept for the browser tab only (sessionStorage). Every
 * action goes through the operator API, which checks one or the other on
 * each request.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';
import { UserButton, useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { productDisplay } from './fonts';
import { Logomark, Route, Tick } from './marks';

/** Accounts are on when Clerk is configured (hosted only); the user chip needs its provider. */
const accountsOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

type Status = 'trialing' | 'active' | 'past_due' | 'canceled';
type AiMode = 'off' | 'own' | 'platform';
type Standing = 'beta' | 'trial' | 'paid' | 'paused';
interface League {
  slug: string; url: string; name: string; leagueId: string; status: Status; plan: 'monthly' | 'season'; tier: 'standard' | 'ai';
  /** How its AI runs, and what its plan alone gives it (they differ when overridden here). */
  ai: AiMode; aiBilled: AiMode; standing: Standing; trialEndsAt: string | null;
  owner: string | null; stripeCustomer: string | null; comp: boolean; created: string; updated: string;
  adminSet: boolean; aiKey: boolean; lastPostAt: string | null; aiCost: number;
  ownerAccount: string | null; admins: number; pendingOwner: string | null;
}
interface Conflict { session: string; slug: string; leagueId: string; takenBy: string; email: string | null; at: string }
interface Inquiry { id: string; name: string; email: string; league: string; message: string; at: string }
interface Data {
  rootDomain: string; stripeMode: 'live' | 'test' | 'off'; prices: { monthly: number; season: number }; trialDays: number; conflicts: Conflict[]; inquiries: Inquiry[];
  totals: { all: number; trialing: number; active: number; past_due: number; canceled: number; paying: number; comp: number; mrr: number; ai?: number; aiCost?: number };
  leagues: League[];
}

const KEY = 'lp_operator_secret';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function OperatorPanel() {
  /** null: not decided yet; '': signed in with an operator account; otherwise the pasted secret. */
  const [secret, setSecret] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  const call = useCallback(async (method: string, body?: unknown, auth = secret) => {
    const r = await fetch('/api/platform/operator/leagues', {
      method, cache: 'no-store',
      headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { try { sessionStorage.removeItem(KEY); } catch {} setSecret(null); throw new Error(auth ? 'That secret was not accepted.' : 'Sign in with an operator account.'); }
    if (!r.ok) throw new Error(d.error ?? `Request failed (${r.status})`);
    return d;
  }, [secret]);

  // A saved secret first; otherwise see whether the signed-in account is an operator.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(KEY); } catch { /* private mode */ }
    if (saved) { setSecret(saved); setChecking(false); return; }
    call('GET', undefined, '').then(d => { setData(d); setSecret(''); }).catch(() => {}).finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (secret === null) return;
    setLoading(true); setError('');
    try { setData(await call('GET')); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
    setLoading(false);
  }, [secret, call]);

  useEffect(() => { if (secret) load(); }, [secret, load]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  if (checking) return <div className={cn('lp-brand min-h-screen', productDisplay.variable)} />;
  if (secret === null) return <SignIn onSecret={s => { try { sessionStorage.setItem(KEY, s); } catch {} setSecret(s); }} error={error} />;

  const lock = () => { try { sessionStorage.removeItem(KEY); } catch {} setSecret(null); setData(null); };

  return (
    <div className={cn('lp-brand min-h-screen overflow-x-clip pb-16 font-body', productDisplay.variable)}>
      {/* App bar and greeting share one dark band; the figures overlap its bottom edge. */}
      <div className="lp-ink relative overflow-hidden">
        <div className="lp-yardlines pointer-events-none absolute inset-0 opacity-60" />
        <header className="relative mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-5">
          <a href="/" className="flex items-center gap-2.5" aria-label={`${'LeaguePulse'} home`}>
            <Logomark size={32} />
            <span className="hidden flex-col leading-none sm:flex">
              <span className="lp-wordmark text-[18px]">League<span className="text-[hsl(var(--signal))]">Pulse</span></span>
              <span className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Back office</span>
            </span>
          </a>
          {/* Only when Stripe is not live: the one case worth a glance (live is the normal state). */}
          {data && data.stripeMode !== 'live' && (
            <span title={data.stripeMode === 'test'
                ? 'STRIPE_SECRET_KEY is a test key: sign-ups and payments here are not real.'
                : 'STRIPE_SECRET_KEY is not set: sign-ups cannot be billed.'}
              className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--signal)/0.18)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[hsl(var(--signal))]">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--signal))]" />
              {data.stripeMode === 'test' ? 'Stripe test mode' : 'Stripe not connected'}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {secret && <button onClick={lock} className="rounded-full border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted">Lock</button>}
            {accountsOn && <AccountChip />}
          </div>
        </header>

        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-5 sm:pt-10">
          <Greeting viaSecret={Boolean(secret)} />
          {data && (
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {summary(data)}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={load} disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold hover:bg-muted disabled:opacity-60">
              <motion.svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"
                animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={loading ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : { duration: 0.3 }}>
                <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
              </motion.svg>
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
            <a href="#add" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground">
              Add a league <Route size={14} />
            </a>
            {!secret && <a href="/account" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">My leagues</a>}
          </div>
        </div>
      </div>

      <main className="relative mx-auto -mt-16 max-w-6xl space-y-5 px-4 sm:px-5">
        {error && <p className="rounded-2xl border border-[hsl(var(--signal)/0.4)] bg-card px-4 py-3 text-[13.5px] shadow-sm">{error}</p>}
        {!data && !error && <div className="h-40 animate-pulse rounded-[22px] bg-card shadow-sm" />}
        {data && (
          <>
            <Kpis data={data} />
            {data.conflicts.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-[22px] border border-[hsl(var(--signal)/0.45)] bg-[hsl(var(--signal)/0.07)] p-5 text-[13px]">
                <p className="font-semibold">Checkouts that lost their address ({data.conflicts.length})</p>
                <p className="mt-0.5 text-muted-foreground">Their subscriptions were cancelled before any charge. Reach out so they can pick another address.</p>
                <ul className="mt-2 space-y-1">
                  {data.conflicts.slice(0, 5).map(c => (
                    <li key={c.session} className="tabular-nums">{new Date(c.at).toLocaleString()}: {c.email ?? 'unknown email'} wanted <b>{c.slug}</b></li>
                  ))}
                </ul>
              </motion.section>
            )}
            {data.inquiries.length > 0 && <Inquiries items={data.inquiries} call={call} onChange={(msg) => { flash(msg); load(); }} />}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Signups leagues={data.leagues} />
              <Health leagues={data.leagues} />
            </div>
            <Leagues data={data} call={call} onChange={(msg) => { flash(msg); load(); }} />
            <AddLeague root={data.rootDomain} call={call} onDone={(msg) => { flash(msg); load(); }} />
          </>
        )}
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
            className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-sm rounded-2xl bg-foreground px-4 py-3 text-center text-[13px] font-medium text-background shadow-xl">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One sentence on how the platform is doing. */
function summary(d: Data): string {
  const t = d.totals;
  if (!t.all) return 'No leagues yet. Sign-ups and beta leagues will show up here as they arrive.';
  const parts = [`${t.all} league${t.all === 1 ? '' : 's'} on the platform`, `${t.paying} paying`];
  if (t.trialing) parts.push(`${t.trialing} on trial`);
  if (t.comp) parts.push(`${t.comp} in beta`);
  const tail = t.past_due ? ` ${t.past_due} payment${t.past_due === 1 ? ' is' : 's are'} failing.` : '';
  return `${parts.join(', ')}, bringing in about $${t.mrr.toFixed(0)} a month.${tail}`;
}

function Greeting(_: { viaSecret: boolean }) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <h1 className="lp-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">
      {part}{accountsOn ? <FirstName /> : null}.
    </h1>
  );
}

function FirstName() {
  const { user } = useUser();
  const name = user?.firstName || user?.username;
  return name ? <>, <span className="text-primary">{name}</span></> : null;
}

/** Who is signed in: avatar, name and email, with Clerk's menu behind the avatar. */
function AccountChip() {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <span className="h-9 w-40 animate-pulse rounded-full bg-muted" />;
  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? '';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || email.split('@')[0];
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-1 sm:pl-3.5">
      <div className="hidden min-w-0 text-right leading-tight sm:block">
        <p className="truncate text-[12.5px] font-semibold">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{email}</p>
      </div>
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary sm:hidden">Operator</span>
      <UserButton appearance={{ elements: { avatarBox: 'h-8 w-8' } }}>
        <UserButton.MenuItems>
          <UserButton.Link label="My leagues" href="/account" labelIcon={<img src="/brand/leaguepulse-mark.svg" alt="" width={16} height={16} />} />
          <UserButton.Link label="LeaguePulse home" href="/" labelIcon={<span className="block h-3.5 w-3.5 rounded-full border-2 border-current" />} />
        </UserButton.MenuItems>
      </UserButton>
    </div>
  );
}

function SignIn({ onSecret, error }: { onSecret: (s: string) => void; error: string }) {
  const [v, setV] = useState('');
  return (
    <div className={cn('lp-brand lp-ink relative flex min-h-screen items-center justify-center overflow-hidden px-4 font-body', productDisplay.variable)}>
      <div className="lp-yardlines pointer-events-none absolute inset-0" />
      <motion.form initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={e => { e.preventDefault(); if (v.trim()) onSecret(v.trim()); }}
        className="relative w-full max-w-sm rounded-[24px] border border-border bg-card p-7 shadow-2xl">
        <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[hsl(48_20%_96%)]">
          <img src="/brand/leaguepulse-mark.svg" alt="" width={28} height={28} />
        </span>
        <h1 className="lp-display mt-5 text-[28px] font-extrabold tracking-[-0.02em]">Back office</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">Every league on the platform, in one place.</p>
        {accountsOn && (
          <>
            <a href="/sign-in?redirect_url=%2Foperator"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[14px] font-semibold text-primary-foreground">
              Sign in with your account <Route size={15} />
            </a>
            <p className="mt-2 text-[12px] text-muted-foreground">Operator accounts are the emails in LP_OPERATOR_EMAILS.</p>
            <div className="my-5 flex items-center gap-3 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" />or use the secret<span className="h-px flex-1 bg-border" /></div>
          </>
        )}
        <label htmlFor="op-secret" className="text-[13px] text-muted-foreground">LP_OPERATOR_SECRET, kept for this tab only.</label>
        <input id="op-secret" type="password" value={v} onChange={e => setV(e.target.value)} autoComplete="off"
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-primary" />
        {error && <p className="mt-2 text-[12.5px] text-[hsl(var(--signal))]">{error}</p>}
        <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-[14px] font-semibold hover:bg-muted">
          Unlock with secret
        </button>
      </motion.form>
    </div>
  );
}

/** A number that counts up to its value once. */
function Count({ to, prefix = '' }: { to: number; prefix?: string }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) { setV(to); return; }
    const c = animate(0, to, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: x => setV(Math.round(x)) });
    return () => c.stop();
  }, [to, reduce]);
  return <>{prefix}{v.toLocaleString()}</>;
}

function Kpis({ data }: { data: Data }) {
  const t = data.totals;
  const tiles: { label: string; value: number; prefix?: string; sub: string; tone?: 'turf' | 'alert' }[] = [
    { label: 'Monthly revenue', value: Math.round(t.mrr), prefix: '$', sub: 'Season plans over five months', tone: 'turf' },
    { label: 'Paying', value: t.paying, sub: `${t.active} active, ${t.canceled} cancelled` },
    { label: 'On trial', value: t.trialing, sub: 'No card needed to start' },
    { label: 'Beta', value: t.comp, sub: 'Free, added here' },
    { label: 'Payment failing', value: t.past_due, sub: 'Stripe is retrying', tone: t.past_due ? 'alert' : undefined },
    { label: 'AI we pay for', value: Math.round(t.aiCost ?? 0), prefix: '$', sub: `This month, ${t.ai ?? 0} we run` },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map((k, i) => (
        <motion.div key={k.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className={cn('rounded-[20px] border bg-card p-4 shadow-[0_1px_0_hsl(var(--border)),0_18px_40px_-30px_hsl(var(--foreground)/0.4)]',
            k.tone === 'turf' ? 'border-primary/40' : k.tone === 'alert' ? 'border-[hsl(var(--signal)/0.5)]' : 'border-border')}>
          <p className="text-[11.5px] font-semibold text-muted-foreground">{k.label}</p>
          <p className={cn('lp-num mt-2 text-[34px] font-extrabold leading-none tabular-nums',
            k.tone === 'turf' && 'text-primary', k.tone === 'alert' && 'text-[hsl(var(--signal))]')}>
            <Count to={k.value} prefix={k.prefix} />
          </p>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{k.sub}</p>
        </motion.div>
      ))}
    </section>
  );
}

function Panel({ title, meta, children, id }: { title: string; meta?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-[22px] border border-border bg-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="lp-display text-[18px] font-bold tracking-[-0.01em]">{title}</h2>
        {meta && <div className="text-[12px] text-muted-foreground">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

/** New leagues per week, last twelve weeks. One series, so one colour. */
function Signups({ leagues }: { leagues: League[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const weeks = useMemo(() => {
    const WEEK = 7 * 864e5;
    const start = Date.now() - 12 * WEEK;
    const out = Array.from({ length: 12 }, (_, i) => ({ from: new Date(start + i * WEEK), n: 0 }));
    for (const l of leagues) {
      const i = Math.floor((new Date(l.created).getTime() - start) / WEEK);
      if (i >= 0 && i < 12) out[i].n += 1;
    }
    return out;
  }, [leagues]);
  const max = Math.max(1, ...weeks.map(w => w.n));
  const total = weeks.reduce((s, w) => s + w.n, 0);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <Panel title="New leagues" meta={<>{total} in the last 12 weeks</>}>
      <div className="relative mt-8 h-40">
        <div className="absolute inset-0 flex items-end gap-1" onPointerLeave={() => setHover(null)}>
          {weeks.map((w, i) => (
            <button key={i} type="button" aria-label={`Week of ${fmt(w.from)}: ${w.n} new`}
              className="relative flex h-full flex-1 items-end" onPointerEnter={() => setHover(i)} onClick={() => setHover(h => (h === i ? null : i))}>
              <motion.span className={cn('block w-full rounded-t-[5px]', w.n ? 'bg-primary' : 'bg-muted')}
                initial={{ height: 0 }} animate={{ height: w.n ? `${(w.n / max) * 100}%` : '4px' }}
                transition={{ duration: 0.7, delay: i * 0.035, ease: [0.22, 1, 0.36, 1] }}
                style={{ opacity: hover == null || hover === i ? 1 : 0.5 }} />
              {w.n > 0 && (
                <span className="absolute inset-x-0 text-center text-[11px] font-semibold tabular-nums"
                  style={{ bottom: `calc(${(w.n / max) * 100}% + 4px)` }}>{w.n}</span>
              )}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {hover != null && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute -top-3 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] shadow-md"
              style={{ left: `${((hover + 0.5) / 12) * 100}%` }}>
              <p className="whitespace-nowrap font-semibold">Week of {fmt(weeks[hover].from)}</p>
              <p className="text-muted-foreground">{weeks[hover].n} new</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{fmt(weeks[0].from)}</span><span>This week</span>
      </div>
    </Panel>
  );
}

/** How set up the leagues are: the three things a league needs to be lively. */
function Health({ leagues }: { leagues: League[] }) {
  const live = leagues.filter(l => l.status !== 'canceled');
  const n = Math.max(1, live.length);
  const dayAgo = Date.now() - 864e5;
  const rows = [
    { label: 'Someone can run it', hint: 'An owner account or an admin password', count: live.filter(l => l.adminSet || l.ownerAccount).length },
    { label: 'AI key added', hint: 'Needed for the desk and AI questions', count: live.filter(l => l.aiKey).length },
    { label: 'Desk posted in the last day', hint: 'The feed feels alive', count: live.filter(l => l.lastPostAt && new Date(l.lastPostAt).getTime() > dayAgo).length },
  ];
  return (
    <Panel title="League health" meta={<>{live.length} live</>}>
      <ul className="mt-5 space-y-4">
        {rows.map((r, i) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="font-semibold">{r.label}</span>
              <span className="tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{r.count}</span> of {live.length}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(r.count / n) * 100}%` }}
                transition={{ duration: 0.9, delay: 0.15 + i * 0.1, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">{r.hint}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AddLeague({ root, call, onDone }: { root: string; call: (m: string, b?: unknown) => Promise<any>; onDone: (msg: string) => void }) {
  const [provider, setProvider] = useState<'sleeper' | 'espn'>('sleeper');
  const [tier, setTier] = useState<'standard' | 'ai'>('standard');
  const [leagueId, setLeagueId] = useState('');
  const [slug, setSlug] = useState('');
  const [swid, setSwid] = useState('');
  const [s2, setS2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const add = async () => {
    setBusy(true); setError(''); setLink(null);
    try {
      const d = await call('POST', provider === 'espn'
        ? { provider, tier, leagueId: leagueId.trim(), slug: slug.trim(), swid: swid.trim() || undefined, s2: s2.trim() || undefined }
        : { tier, leagueId: leagueId.trim(), slug: slug.trim() });
      setLink(d.setupLink); setLeagueId(''); setSlug(''); setSwid(''); setS2('');
      onDone(d.owner ? `Added ${d.slug}.${root} to My leagues` : `Added ${d.slug}.${root}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add'); }
    setBusy(false);
  };
  return (
    <Panel id="add" title="Add a league" meta="Free, no Stripe">
      <p className="mt-1 text-[13px] text-muted-foreground">It goes straight into your My leagues. Hand it to its commissioner from the league&apos;s menu whenever you like.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="inline-flex rounded-full border border-border bg-background p-0.5 text-[12.5px] font-semibold">
          {(['sleeper', 'espn'] as const).map(p => (
            <button key={p} type="button" onClick={() => { setProvider(p); setError(''); }}
              className={cn('rounded-full px-3.5 py-1.5 transition', provider === p ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
              {p === 'espn' ? 'ESPN' : 'Sleeper'}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-full border border-border bg-background p-0.5 text-[12.5px] font-semibold">
          {(['standard', 'ai'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTier(t)}
              className={cn('rounded-full px-3.5 py-1.5 transition', tier === t ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
              {t === 'ai' ? 'League Pass + AI' : 'League Pass'}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={e => { e.preventDefault(); add(); }} className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
        <input value={leagueId} onChange={e => setLeagueId(e.target.value)}
          placeholder={provider === 'espn' ? 'ESPN league ID or league URL' : 'Sleeper league ID'} inputMode={provider === 'espn' ? 'url' : 'numeric'}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-primary" />
        <div className="flex items-center rounded-xl border border-border bg-background pr-3 focus-within:border-primary">
          <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="address (optional)"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[14px] outline-none" />
          <span className="shrink-0 text-[12.5px] text-muted-foreground">.{root}</span>
        </div>
        <button disabled={busy || !leagueId.trim()} className="rounded-xl bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? 'Adding…' : 'Add league'}
        </button>
        {provider === 'espn' && (
          <div className="grid grid-cols-1 gap-2 md:col-span-3 md:grid-cols-2">
            <input value={swid} onChange={e => setSwid(e.target.value)} placeholder="SWID (private leagues)" autoComplete="off" spellCheck={false}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[12.5px] outline-none focus:border-primary" />
            <input value={s2} onChange={e => setS2(e.target.value)} placeholder="espn_s2 (private leagues)" autoComplete="off" spellCheck={false}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[12.5px] outline-none focus:border-primary" />
          </div>
        )}
      </form>
      {error && <p className="mt-2 text-[12.5px] text-[hsl(var(--signal))]">{error}</p>}
      {link && <CopyLine label="Owner setup link (24 hours, one use)" value={link} />}
    </Panel>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
      <p className="text-[11.5px] font-semibold text-primary">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-[12px]">{value}</code>
        <button onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1 text-[12px] font-semibold">{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

const STATUS: Record<Status, { label: string; dot: string; pill: string }> = {
  active: { label: 'Active', dot: 'bg-primary', pill: 'bg-primary/10 text-primary' },
  trialing: { label: 'Trial', dot: 'bg-[#2a78d6]', pill: 'bg-[#2a78d6]/10 text-[#2a78d6]' },
  past_due: { label: 'Payment failing', dot: 'bg-[hsl(var(--signal))]', pill: 'bg-[hsl(var(--signal)/0.12)] text-[hsl(var(--signal))]' },
  canceled: { label: 'Paused', dot: 'bg-muted-foreground/60', pill: 'bg-muted text-muted-foreground' },
};

function Pill({ s }: { s: Status }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold', STATUS[s].pill)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS[s].dot)} />{STATUS[s].label}
    </span>
  );
}

function Leagues({ data, call, onChange }: { data: Data; call: (m: string, b?: unknown) => Promise<any>; onChange: (msg: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [recovery, setRecovery] = useState<{ slug: string; url: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [handing, setHanding] = useState<League | null>(null);
  // By address, so the sheet shows the league as it is after each change.
  const [managing, setManaging] = useState<string | null>(null);
  const managed = managing ? data.leagues.find(l => l.slug === managing) ?? null : null;
  const rows = data.leagues.filter(l =>
    (filter === 'all' || l.status === filter) &&
    (!q || `${l.name} ${l.slug} ${l.owner ?? ''} ${l.ownerAccount ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const stripeBase = data.stripeMode === 'test' ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
  const counts = (f: 'all' | Status) => (f === 'all' ? data.leagues.length : data.leagues.filter(l => l.status === f).length);

  const recover = async (slug: string) => {
    try {
      const r = await fetch('/api/platform/recover', {
        method: 'POST', headers: { ...(await currentAuth()), 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRecovery({ slug, url: d.url });
    } catch (e) { onChange(e instanceof Error ? e.message : 'Could not issue a link'); }
  };
  const handOver = async (slug: string, email: string) => {
    try { await call('PATCH', { slug, ownerEmail: email }); setHanding(null); onChange(`${slug} goes to ${email} when they sign in`); }
    catch (e) { onChange(e instanceof Error ? e.message : 'Could not hand over'); }
  };
  // Into its admin as the operator. The tab opens first, so a phone's popup blocker lets it through.
  const openAdmin = async (slug: string) => {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const { url } = await call('PATCH', { slug, openAdmin: true });
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) { tab?.close(); onChange(e instanceof Error ? e.message : 'Could not open its admin'); }
  };
  const remove = async (slug: string) => {
    try { await call('DELETE', { slug }); setConfirm(null); onChange(`Removed ${slug}`); }
    catch (e) { onChange(e instanceof Error ? e.message : 'Could not remove'); }
  };

  const actions = (l: League, compact = false, inMenu = false) => {
    const btn = cn('font-semibold transition-colors',
      inMenu ? 'block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-muted'
        : compact ? 'rounded-lg border border-border px-3 py-2 text-[12.5px] active:bg-muted' : 'rounded-lg px-2 py-1 text-[12px] hover:bg-muted');
    return (
      <>
        {!inMenu && <a href={l.url} target="_blank" rel="noreferrer" className={btn}>Open</a>}
        {!inMenu && <button onClick={() => openAdmin(l.slug)} className={btn}>Admin</button>}
        {l.stripeCustomer && <a href={`${stripeBase}/customers/${l.stripeCustomer}`} target="_blank" rel="noreferrer" className={btn}>Stripe</a>}
        <button onClick={() => recover(l.slug)} className={btn}>Reset link</button>
        <button onClick={() => setHanding(l)} className={btn}>Hand over</button>
        <button onClick={() => setManaging(l.slug)} className={btn}>Plan &amp; AI</button>
        {confirm === l.slug
          ? <button onClick={() => remove(l.slug)} className={cn(btn, 'border-transparent bg-[hsl(var(--signal))] text-white hover:bg-[hsl(var(--signal))]')}>Confirm remove</button>
          : <button onClick={e => { e.stopPropagation(); setConfirm(l.slug); }} className={cn(btn, 'text-muted-foreground')}>Remove</button>}
      </>
    );
  };

  return (
    <Panel title="Leagues" meta={<>{rows.length} shown</>}>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:pb-0">
          {(['all', 'active', 'trialing', 'past_due', 'canceled'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('relative shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                filter === f ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
              {filter === f && <motion.span layoutId="op-filter" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="relative">{f === 'all' ? 'All' : STATUS[f].label} <span className="opacity-60">{counts(f)}</span></span>
            </button>
          ))}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, address or email" type="search"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] outline-none focus:border-primary md:ml-auto md:w-72" />
      </div>
      {recovery && <CopyLine label={`Recovery link for ${recovery.slug} (24 hours, one use)`} value={recovery.url} />}

      {rows.length === 0 ? (
        <p className="py-14 text-center text-[13.5px] text-muted-foreground">
          {data.leagues.length ? 'No leagues match.' : 'No leagues yet. Sign-ups and beta leagues show up here.'}
        </p>
      ) : (
        <>
          {/* Phones: one card per league. */}
          <ul className="mt-4 space-y-3 md:hidden">
            {rows.map((l, i) => (
              <motion.li key={l.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
                className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="lp-display truncate text-[17px] font-bold">{l.name || l.slug}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{l.slug}.{data.rootDomain}</p>
                  </div>
                  <Pill s={l.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
                  <div><dt className="text-muted-foreground">Owner</dt><dd className="truncate font-medium">{l.ownerAccount ?? l.owner ?? '—'}</dd></div>
                  <div><dt className="text-muted-foreground">Plan</dt><dd className="font-medium capitalize"><PlanLabel l={l} /></dd></div>
                  <div><dt className="text-muted-foreground">Last post</dt><dd className="font-medium">{ago(l.lastPostAt)}</dd></div>
                  <div><dt className="text-muted-foreground">Created</dt><dd className="font-medium">{new Date(l.created).toLocaleDateString()}</dd></div>
                </dl>
                {l.pendingOwner && <p className="mt-2 text-[12px] text-primary">Handing to {l.pendingOwner}</p>}
                <div className="mt-3 flex gap-1.5 text-[11.5px]"><Flag ok={l.adminSet || Boolean(l.ownerAccount)} label="Admin" /><Flag ok={l.aiKey} label="AI key" /></div>
                <div className="mt-3 flex flex-wrap gap-1.5">{actions(l, true)}</div>
              </motion.li>
            ))}
          </ul>

          {/* Wider screens: the table. */}
          <div className="mt-4 hidden overflow-x-auto md:block lg:overflow-visible">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3">League</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Plan</th>
                  <th className="px-3 py-2.5">Owner</th><th className="px-3 py-2.5">Setup</th><th className="px-3 py-2.5">Last post</th>
                  <th className="px-3 py-2.5">Created</th><th className="py-2.5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(l => (
                  <tr key={l.slug} className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40">
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{l.name || l.slug}</p>
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-[12px] text-muted-foreground hover:text-primary">{l.slug}.{data.rootDomain}</a>
                    </td>
                    <td className="px-3 py-3"><Pill s={l.status} /></td>
                    <td className="px-3 py-3 capitalize"><PlanLabel l={l} /></td>
                    <td className="max-w-[200px] px-3 py-3 text-muted-foreground">
                      <p className="truncate">{l.ownerAccount ?? l.owner ?? '—'}</p>
                      {l.pendingOwner && <p className="truncate text-[11.5px] text-primary">Handing to {l.pendingOwner}</p>}
                      {l.admins > 0 && <p className="text-[11.5px]">+{l.admins} admin{l.admins === 1 ? '' : 's'}</p>}
                    </td>
                    <td className="px-3 py-3"><span className="flex gap-1.5 text-[11.5px]"><Flag ok={l.adminSet || Boolean(l.ownerAccount)} label="Admin" /><Flag ok={l.aiKey} label="AI key" /></span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{ago(l.lastPostAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{new Date(l.created).toLocaleDateString()}</td>
                    <td className="py-3 pl-3">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <a href={l.url} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold hover:bg-muted">Open</a>
                        <button onClick={() => openAdmin(l.slug)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold hover:bg-muted">Admin</button>
                        <RowMenu>{actions(l, false, true)}</RowMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <AnimatePresence>
        {handing && <HandOver league={handing} onCancel={() => setHanding(null)} onSubmit={email => handOver(handing.slug, email)} />}
        {managed && <ManageLeague league={managed} trialDays={data.trialDays} stripeMode={data.stripeMode} call={call} onChange={onChange} onClose={() => setManaging(null)} />}
      </AnimatePresence>
    </Panel>
  );
}

/** A league's plan in a word, and how its AI runs when that isn't the plan's default. */
function PlanLabel({ l }: { l: League }) {
  const cycle = l.standing === 'beta' || (l.standing === 'paused' && l.comp) ? 'Beta' : l.plan === 'season' ? 'Yearly' : 'Monthly';
  const overridden = l.ai !== l.aiBilled && !l.comp;
  return (
    <>
      {cycle}
      {l.ai === 'platform' && (
        <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-bold normal-case text-primary">
          + AI{overridden && ' (on us)'}{l.aiCost > 0 && `, $${l.aiCost.toFixed(2)}`}
        </span>
      )}
      {l.ai === 'off' && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-bold normal-case text-muted-foreground">AI off</span>}
      {l.standing === 'trial' && l.trialEndsAt && (
        <span className="block text-[11.5px] font-normal normal-case text-muted-foreground">Trial ends {new Date(l.trialEndsAt).toLocaleDateString()}</span>
      )}
    </>
  );
}

const STANDING_COPY: Record<Standing, { title: string; body: (l: League) => string }> = {
  beta: { title: 'Beta', body: () => 'Free, with no billing. Added here, or moved here from a plan.' },
  trial: { title: 'Trial', body: l => `On its free trial${l.trialEndsAt ? ` until ${new Date(l.trialEndsAt).toLocaleDateString()}` : ''}. It becomes paid if the owner adds a card from the admin's billing, and cancels quietly if not.` },
  paid: { title: 'Paid', body: l => (l.status === 'past_due' ? 'Subscribed, but its last payment failed and Stripe is retrying.' : `Subscribed, ${l.plan === 'season' ? 'yearly' : 'monthly'}.`) },
  paused: { title: 'Paused', body: l => (l.comp ? 'Paused by you. Its site shows as paused until you resume it.' : 'Its subscription ended. Its site shows as paused.') },
};

const AI_OPTIONS: { id: AiMode; label: string; body: string }[] = [
  { id: 'off', label: 'Off', body: 'Nothing AI runs: no desk, chat or analytics, even on a key of its own.' },
  { id: 'own', label: 'Own key', body: 'Runs on a key the league adds in its admin, billed to them.' },
  { id: 'platform', label: 'We run it', body: 'Runs on the platform’s key: what League Pass + AI pays for.' },
];

/**
 * A league's plan and its AI, for the operator: move it between beta, trial
 * and paid, and say how its AI runs. Anything that touches Stripe asks first.
 */
function ManageLeague({ league: l, trialDays, stripeMode, call, onChange, onClose }: {
  league: League; trialDays: number; stripeMode: Data['stripeMode'];
  call: (m: string, b?: unknown) => Promise<any>; onChange: (msg: string) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The one Stripe change waiting on a second tap.
  const [asking, setAsking] = useState<'beta' | 'trial' | null>(null);
  const [days, setDays] = useState(trialDays);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setError('');
    try { await call('PATCH', { slug: l.slug, ...body }); setAsking(null); onChange(done); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(false); }
  };
  const name = l.name || l.slug;
  const extending = l.standing === 'trial';
  const canTrial = l.standing === 'beta' || extending;
  const canBeta = l.standing !== 'beta' && !(l.standing === 'paused' && l.comp);
  const live = stripeMode === 'live';
  const btn = 'rounded-xl border border-border px-3.5 py-2.5 text-[13px] font-semibold transition hover:bg-muted disabled:opacity-50';

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />
      <motion.div role="dialog" aria-modal="true" aria-label={`Plan and AI for ${name}`}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[24px] border border-border bg-card p-6 pb-8 shadow-2xl sm:rounded-[24px] sm:pb-6">
        <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-muted sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="lp-display truncate text-[22px] font-extrabold tracking-[-0.02em]">{name}</h3>
            <p className="text-[12.5px] text-muted-foreground">Plan and AI</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-muted-foreground hover:bg-muted">Done</button>
        </div>

        {/* Standing */}
        <section className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Standing</p>
          <div className="mt-2 rounded-2xl border border-border bg-background p-4">
            <p className="flex items-center gap-2 text-[15px] font-bold">{STANDING_COPY[l.standing].title}<Pill s={l.status} /></p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{STANDING_COPY[l.standing].body(l)}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {canTrial && asking !== 'trial' && (
                <button disabled={busy} onClick={() => setAsking('trial')} className={btn}>{extending ? 'Extend trial' : 'Start a trial'}</button>
              )}
              {canBeta && asking !== 'beta' && (
                <button disabled={busy} onClick={() => setAsking('beta')} className={btn}>Move to beta (free)</button>
              )}
              {l.comp && l.standing === 'beta' && (
                <button disabled={busy} onClick={() => run({ status: 'canceled' }, `Paused ${l.slug}`)} className={cn(btn, 'text-muted-foreground')}>Pause</button>
              )}
              {l.comp && l.standing === 'paused' && (
                <button disabled={busy} onClick={() => run({ status: 'active' }, `Resumed ${l.slug}`)} className={btn}>Resume</button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {asking && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-3 rounded-xl border border-primary/30 bg-primary/[0.05] p-3.5">
                    {asking === 'trial' ? (
                      <>
                        <label className="flex items-center gap-2 text-[13px] font-semibold">
                          {extending ? 'End it' : 'A trial of'}
                          <input type="number" min={1} max={90} value={days} onChange={e => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                            className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-[14px] outline-none focus:border-primary" />
                          {extending ? 'days from now' : 'days'}
                        </label>
                        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                          {extending
                            ? 'Moves its trial end in Stripe. Nothing is charged until it ends.'
                            : `Starts a ${l.tier === 'ai' ? 'League Pass + AI' : 'League Pass'} ${l.plan === 'season' ? 'yearly' : 'monthly'} trial in Stripe${live ? '' : ' (test mode)'}, billed to the owner. No card needed; if none is added by the end, it cancels and the league goes paused.`}
                        </p>
                      </>
                    ) : (
                      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                        {l.standing === 'trial' ? 'Cancels its trial in Stripe now. Nothing has been charged.'
                          : l.standing === 'paid' ? 'Cancels its subscription in Stripe now, so it is never billed again. Nothing already paid is refunded; do that in Stripe if it is owed.'
                          : 'Brings it back as a free league. Its old subscription stays ended.'}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button disabled={busy} onClick={() => setAsking(null)} className={btn}>Cancel</button>
                      <button disabled={busy}
                        onClick={() => asking === 'trial'
                          ? run({ standing: 'trial', days }, extending ? `${l.slug}'s trial now ends in ${days} days` : `${l.slug} is on a ${days}-day trial`)
                          : run({ standing: 'beta' }, `${l.slug} is in beta, free`)}
                        className="rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
                        {busy ? 'Working…' : asking === 'trial' ? (extending ? 'Extend' : 'Start trial') : 'Move to beta'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* AI */}
        <section className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">AI</p>
          <div role="radiogroup" aria-label="How its AI runs" className="mt-2 grid gap-2">
            {AI_OPTIONS.map(o => {
              const on = l.ai === o.id;
              return (
                <button key={o.id} role="radio" aria-checked={on} disabled={busy || on}
                  onClick={() => run({ ai: o.id }, o.id === 'off' ? `${l.slug}'s AI is off` : o.id === 'own' ? `${l.slug}'s AI runs on its own key` : `We run ${l.slug}'s AI`)}
                  className={cn('flex items-start gap-3 rounded-2xl border p-3.5 text-left transition',
                    on ? 'border-primary bg-primary/[0.06]' : 'border-border hover:bg-muted/60')}>
                  <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-primary' : 'border-muted-foreground/40')}>
                    {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold">
                      {o.label}
                      {!l.comp && l.aiBilled === o.id && <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-bold text-muted-foreground">Its plan</span>}
                    </span>
                    <span className="block text-[12.5px] leading-snug text-muted-foreground">{o.body}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            {l.comp
              ? 'A beta league’s plan follows this.'
              : l.ai !== l.aiBilled
                ? 'Overridden by you. Its billing is unchanged, and Stripe won’t undo this. Pick “Its plan” to go back.'
                : 'Its billing is never changed here. A different choice is kept as your override.'}
            {l.ai === 'own' && !l.aiKey && ' It has no key of its own yet, so nothing runs until it adds one.'}
          </p>
        </section>

        {error && <p className="mt-4 text-[13px] font-medium text-[hsl(var(--signal))]">{error}</p>}
      </motion.div>
    </motion.div>
  );
}

/** Hand a league to someone: a sheet from the bottom on phones, a dialog elsewhere. */
function HandOver({ league, onCancel, onSubmit }: { league: League; onCancel: () => void; onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button aria-label="Close" onClick={onCancel} className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />
      <motion.form role="dialog" aria-modal="true" aria-label={`Hand over ${league.name}`}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        onSubmit={e => { e.preventDefault(); if (valid) onSubmit(email.trim()); }}
        className="relative w-full max-w-md rounded-t-[24px] border border-border bg-card p-6 pb-8 shadow-2xl sm:rounded-[24px] sm:pb-6">
        <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-muted sm:hidden" />
        <h3 className="lp-display text-[22px] font-extrabold tracking-[-0.02em]">Hand over {league.name || league.slug}</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          They become owner when they sign in with this email. The current owner stays on as an admin. Billing stays with whoever subscribed.
        </p>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="new.owner@example.com" autoFocus
          className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-3 text-[15px] outline-none focus:border-primary" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-border py-3 text-[14px] font-semibold hover:bg-muted">Cancel</button>
          <button disabled={!valid} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-[14px] font-semibold text-primary-foreground disabled:opacity-50">
            <Tick size={16} style={{ ['--primary' as string]: '0 0% 100%' }} /> Hand over
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

/** Custom tier inquiries, newest first: reply by email, then dismiss. */
function Inquiries({ items, call, onChange }: { items: Inquiry[]; call: (m: string, b?: unknown) => Promise<any>; onChange: (msg: string) => void }) {
  return (
    <Panel title="Custom inquiries" meta={<>{items.length} waiting</>}>
      <ul className="mt-3 divide-y divide-border">
        {items.map(q => (
          <li key={q.id} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-start sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">{q.name}{q.league && <span className="font-normal text-muted-foreground">, {q.league}</span>}</p>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{q.message}</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{ago(q.at)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a href={`mailto:${q.email}?subject=${encodeURIComponent('Your LeaguePulse custom site')}`}
                className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground">Reply</a>
              <button onClick={async () => { await call('PATCH', { dismissInquiry: q.id }); onChange('Inquiry dismissed'); }}
                className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted">Dismiss</button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The rest of a row's actions, behind a "more" button. */
function RowMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="More actions"
        className={cn('flex h-7 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted', open && 'bg-muted')}>
        <span className="flex gap-[3px]">{[0, 1, 2].map(i => <span key={i} className="h-[3px] w-[3px] rounded-full bg-foreground" />)}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }} onClick={() => setOpen(false)}
            className="absolute right-0 top-9 z-20 w-44 origin-top-right rounded-xl border border-border bg-card p-1 text-left shadow-xl">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('whitespace-nowrap rounded-md px-1.5 py-0.5 font-semibold', ok ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground line-through decoration-1')}>
      {label}
    </span>
  );
}

/** The stored secret as an Authorization header (none when signed in with an account), for the one call outside the leagues API. */
async function currentAuth(): Promise<Record<string, string>> {
  try { const k = sessionStorage.getItem(KEY); return k ? { authorization: `Bearer ${k}` } : {}; } catch { return {}; }
}
