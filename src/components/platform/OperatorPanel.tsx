'use client';

/**
 * The operator's panel: every league on the platform, at /operator on the
 * product domain.
 *
 * Signed in with LP_OPERATOR_SECRET, kept for the browser tab only
 * (sessionStorage), so closing the tab signs out. Every action goes through
 * the operator API, which checks the secret on each request.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { productDisplay } from './fonts';
import { Logomark, Route } from './marks';

type Status = 'trialing' | 'active' | 'past_due' | 'canceled';
interface League {
  slug: string; url: string; name: string; leagueId: string; status: Status; plan: 'monthly' | 'season';
  owner: string | null; stripeCustomer: string | null; comp: boolean; created: string; updated: string;
  adminSet: boolean; aiKey: boolean; lastPostAt: string | null;
  ownerAccount: string | null; admins: number; pendingOwner: string | null;
}
interface Conflict { session: string; slug: string; leagueId: string; takenBy: string; email: string | null; at: string }
interface Data {
  rootDomain: string; stripeMode: 'live' | 'test'; prices: { monthly: number; season: number }; conflicts: Conflict[];
  totals: { all: number; trialing: number; active: number; past_due: number; canceled: number; paying: number; comp: number; mrr: number };
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
  const [secret, setSecret] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    try { setSecret(sessionStorage.getItem(KEY)); } catch { /* private mode: sign in each time */ }
  }, []);

  const call = useCallback(async (method: string, body?: unknown) => {
    const r = await fetch('/api/platform/operator/leagues', {
      method, cache: 'no-store',
      headers: { authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { try { sessionStorage.removeItem(KEY); } catch {} setSecret(null); throw new Error('That secret was not accepted.'); }
    if (!r.ok) throw new Error(d.error ?? `Request failed (${r.status})`);
    return d;
  }, [secret]);

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true); setError('');
    try { setData(await call('GET')); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
    setLoading(false);
  }, [secret, call]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  if (!secret) return <SignIn onSecret={s => { try { sessionStorage.setItem(KEY, s); } catch {} setSecret(s); }} error={error} />;

  return (
    <div className={cn('lp-brand min-h-screen font-body', productDisplay.variable)}>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-5">
          <Logomark size={28} />
          <span className="lp-display text-[18px] font-extrabold">Operator</span>
          {data && (
            <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
              data.stripeMode === 'live' ? 'bg-primary/10 text-primary' : 'bg-[hsl(var(--signal)/0.12)] text-[hsl(var(--signal))]')}>
              Stripe {data.stripeMode}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} disabled={loading} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted disabled:opacity-50">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button onClick={() => { try { sessionStorage.removeItem(KEY); } catch {} setSecret(null); setData(null); }}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-5">
        {error && <p className="rounded-xl border border-[hsl(var(--signal)/0.4)] bg-[hsl(var(--signal)/0.08)] px-4 py-3 text-[13.5px]">{error}</p>}
        {data && (
          <>
            {data.conflicts.length > 0 && (
              <section className="rounded-[18px] border border-[hsl(var(--signal)/0.45)] bg-[hsl(var(--signal)/0.07)] p-4 text-[13px]">
                <p className="font-semibold">Checkouts that lost their address ({data.conflicts.length})</p>
                <p className="mt-0.5 text-muted-foreground">Their subscriptions were cancelled before any charge. Reach out so they can pick another address.</p>
                <ul className="mt-2 space-y-1">
                  {data.conflicts.slice(0, 5).map(c => (
                    <li key={c.session} className="tabular-nums">{new Date(c.at).toLocaleString()}: {c.email ?? 'unknown email'} wanted <b>{c.slug}</b> for league {c.leagueId}</li>
                  ))}
                </ul>
              </section>
            )}
            <Kpis data={data} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Signups leagues={data.leagues} />
              <AddLeague root={data.rootDomain} call={call} onDone={(msg) => { flash(msg); load(); }} />
            </div>
            <Leagues data={data} call={call} onChange={(msg) => { flash(msg); load(); }} />
          </>
        )}
        {!data && !error && <p className="py-20 text-center text-[14px] text-muted-foreground">Loading leagues…</p>}
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-medium text-background shadow-lg">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SignIn({ onSecret, error }: { onSecret: (s: string) => void; error: string }) {
  const [v, setV] = useState('');
  return (
    <div className={cn('lp-brand flex min-h-screen items-center justify-center px-4 font-body', productDisplay.variable)}>
      <form onSubmit={e => { e.preventDefault(); if (v.trim()) onSecret(v.trim()); }}
        className="w-full max-w-sm rounded-[22px] border border-border bg-card p-7">
        <Logomark size={34} />
        <h1 className="lp-display mt-5 text-[26px] font-extrabold">Operator</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">Paste LP_OPERATOR_SECRET. It is kept for this tab only.</p>
        <input type="password" value={v} onChange={e => setV(e.target.value)} autoFocus aria-label="Operator secret"
          className="mt-5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-primary" />
        {error && <p className="mt-2 text-[12.5px] text-[hsl(var(--signal))]">{error}</p>}
        <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-[14px] font-semibold text-background">
          Sign in <Route size={15} />
        </button>
      </form>
    </div>
  );
}

function Kpis({ data }: { data: Data }) {
  const t = data.totals;
  const tiles = [
    { label: 'Est. monthly revenue', value: `$${t.mrr.toFixed(0)}`, sub: 'Season plans spread over five months' },
    { label: 'Paying', value: t.paying, sub: `${t.active} active in total` },
    { label: 'On trial', value: t.trialing, sub: 'No card needed to start' },
    { label: 'Beta (free)', value: t.comp, sub: 'Added here, no Stripe' },
    { label: 'Payment failing', value: t.past_due, sub: 'Stripe is retrying', alert: t.past_due > 0 },
    { label: 'Cancelled', value: t.canceled, sub: 'Site shows as paused' },
  ];
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-border bg-border md:grid-cols-3 lg:grid-cols-6">
      {tiles.map(k => (
        <div key={k.label} className="bg-card p-4">
          <p className="text-[11.5px] font-semibold text-muted-foreground">{k.label}</p>
          <p className={cn('lp-num mt-1.5 text-[32px] font-extrabold leading-none', k.alert && 'text-[hsl(var(--signal))]')}>{k.value}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{k.sub}</p>
        </div>
      ))}
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
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <section className="rounded-[18px] border border-border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="lp-display text-[17px] font-bold">New leagues per week</h2>
        <p className="text-[12px] text-muted-foreground">Last 12 weeks</p>
      </div>
      <div className="relative mt-7 h-40">
        <div className="absolute inset-0 flex items-end gap-[2px]" onPointerLeave={() => setHover(null)}>
          {weeks.map((w, i) => (
            <div key={i} className="relative flex h-full flex-1 items-end" onPointerEnter={() => setHover(i)}>
              <motion.div className={cn('w-full rounded-t-[4px]', w.n ? 'bg-primary' : 'bg-muted')}
                initial={{ height: 0 }} animate={{ height: w.n ? `${(w.n / max) * 100}%` : '3px' }}
                transition={{ duration: 0.6, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                style={{ opacity: hover == null || hover === i ? 1 : 0.55 }} />
              {w.n > 0 && (
                <span className="absolute inset-x-0 text-center text-[11px] font-semibold tabular-nums"
                  style={{ bottom: `calc(${(w.n / max) * 100}% + 4px)` }}>{w.n}</span>
              )}
            </div>
          ))}
        </div>
        {hover != null && (
          <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] shadow-md"
            style={{ left: `${((hover + 0.5) / 12) * 100}%` }}>
            <p className="font-semibold">Week of {fmt(weeks[hover].from)}</p>
            <p className="text-muted-foreground">{weeks[hover].n} new</p>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{fmt(weeks[0].from)}</span><span>{fmt(weeks[11].from)}</span>
      </div>
    </section>
  );
}

function AddLeague({ root, call, onDone }: { root: string; call: (m: string, b?: unknown) => Promise<any>; onDone: (msg: string) => void }) {
  const [leagueId, setLeagueId] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const add = async () => {
    setBusy(true); setError(''); setLink(null);
    try {
      const d = await call('POST', { leagueId: leagueId.trim(), slug: slug.trim() });
      setLink(d.setupLink); setLeagueId(''); setSlug('');
      onDone(`Added ${d.slug}.${root}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add'); }
    setBusy(false);
  };
  return (
    <section className="rounded-[18px] border border-border bg-card p-5">
      <h2 className="lp-display text-[17px] font-bold">Add a beta league</h2>
      <p className="mt-1 text-[12.5px] text-muted-foreground">Free, no Stripe. You get a one-time link for the owner to set their admin password.</p>
      <form onSubmit={e => { e.preventDefault(); add(); }} className="mt-4 space-y-2">
        <input value={leagueId} onChange={e => setLeagueId(e.target.value)} placeholder="Sleeper league ID" inputMode="numeric"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] outline-none focus:border-primary" />
        <div className="flex items-center rounded-xl border border-border bg-background pr-3 focus-within:border-primary">
          <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="address (optional)"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[13.5px] outline-none" />
          <span className="text-[12.5px] text-muted-foreground">.{root}</span>
        </div>
        <button disabled={busy || !leagueId.trim()} className="w-full rounded-xl bg-primary py-2 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? 'Adding…' : 'Add league'}
        </button>
      </form>
      {error && <p className="mt-2 text-[12.5px] text-[hsl(var(--signal))]">{error}</p>}
      {link && <CopyLine label="Owner setup link (24 hours, one use)" value={link} />}
    </section>
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

const STATUS: Record<Status, { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'bg-primary' },
  trialing: { label: 'Trial', dot: 'bg-[#2a78d6]' },
  past_due: { label: 'Payment failing', dot: 'bg-[hsl(var(--signal))]' },
  canceled: { label: 'Cancelled', dot: 'bg-muted-foreground/50' },
};

function Leagues({ data, call, onChange }: { data: Data; call: (m: string, b?: unknown) => Promise<any>; onChange: (msg: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [recovery, setRecovery] = useState<{ slug: string; url: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const rows = data.leagues.filter(l =>
    (filter === 'all' || l.status === filter) &&
    (!q || `${l.name} ${l.slug} ${l.owner ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const stripeBase = data.stripeMode === 'live' ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';

  const recover = async (slug: string) => {
    try {
      const r = await fetch('/api/platform/recover', {
        method: 'POST', headers: { authorization: (await currentAuth()), 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRecovery({ slug, url: d.url });
    } catch (e) { onChange(e instanceof Error ? e.message : 'Could not issue a link'); }
  };
  const handOver = async (slug: string) => {
    const email = window.prompt(`Hand ${slug} to which email? They become owner when they sign in with it; the current owner becomes an admin.`);
    if (!email) return;
    try { await call('PATCH', { slug, ownerEmail: email }); onChange(`${slug} will go to ${email} when they sign in`); }
    catch (e) { onChange(e instanceof Error ? e.message : 'Could not hand over'); }
  };
  const setStatus = async (slug: string, status: 'active' | 'canceled') => {
    try { await call('PATCH', { slug, status }); onChange(status === 'active' ? `Resumed ${slug}` : `Paused ${slug}`); }
    catch (e) { onChange(e instanceof Error ? e.message : 'Could not change status'); }
  };
  const remove = async (slug: string) => {
    try { await call('DELETE', { slug }); setConfirm(null); onChange(`Removed ${slug}`); }
    catch (e) { onChange(e instanceof Error ? e.message : 'Could not remove'); }
  };

  return (
    <section className="rounded-[18px] border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <h2 className="lp-display mr-2 text-[17px] font-bold">Leagues</h2>
        {(['all', 'active', 'trialing', 'past_due', 'canceled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('rounded-full px-3 py-1 text-[12px] font-semibold', filter === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
            {f === 'all' ? `All ${data.totals.all}` : STATUS[f].label}
          </button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, address, email"
          className="ml-auto w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] outline-none focus:border-primary sm:w-64" />
      </div>
      {recovery && <div className="px-4"><CopyLine label={`Recovery link for ${recovery.slug} (24 hours, one use)`} value={recovery.url} /></div>}
      {rows.length === 0 ? (
        <p className="px-4 py-14 text-center text-[13.5px] text-muted-foreground">
          {data.leagues.length ? 'No leagues match.' : 'No leagues yet. Sign-ups and beta leagues show up here.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5">League</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Plan</th>
                <th className="px-3 py-2.5">Owner</th><th className="px-3 py-2.5">Setup</th><th className="px-3 py-2.5">Last post</th>
                <th className="px-3 py-2.5">Created</th><th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.slug} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{l.name || l.slug}</p>
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-[12px] text-muted-foreground hover:text-primary">{l.slug}.{data.rootDomain}</a>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={cn('h-2 w-2 rounded-full', STATUS[l.status].dot)} />{STATUS[l.status].label}</span>
                  </td>
                  <td className="px-3 py-3 capitalize">{l.comp ? 'Beta' : l.plan}</td>
                  <td className="max-w-[200px] px-3 py-3 text-muted-foreground">
                    <p className="truncate">{l.ownerAccount ?? l.owner ?? '—'}</p>
                    {l.pendingOwner && <p className="truncate text-[11.5px] text-primary">Handing to {l.pendingOwner}</p>}
                    {l.admins > 0 && <p className="text-[11.5px]">+{l.admins} admin{l.admins === 1 ? '' : 's'}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex gap-1.5 text-[11.5px]">
                      <Flag ok={l.adminSet} label="Admin" />
                      <Flag ok={l.aiKey} label="AI key" />
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{ago(l.lastPostAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{new Date(l.created).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap text-[12px] font-semibold">
                      {l.stripeCustomer && <a href={`${stripeBase}/customers/${l.stripeCustomer}`} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 hover:bg-muted">Stripe</a>}
                      <button onClick={() => recover(l.slug)} className="rounded-md px-2 py-1 hover:bg-muted">Reset link</button>
                      <button onClick={() => handOver(l.slug)} className="rounded-md px-2 py-1 hover:bg-muted">Hand over</button>
                      {l.comp && (l.status === 'canceled'
                        ? <button onClick={() => setStatus(l.slug, 'active')} className="rounded-md px-2 py-1 hover:bg-muted">Resume</button>
                        : <button onClick={() => setStatus(l.slug, 'canceled')} className="rounded-md px-2 py-1 hover:bg-muted">Pause</button>)}
                      {confirm === l.slug
                        ? <button onClick={() => remove(l.slug)} className="rounded-md bg-[hsl(var(--signal))] px-2 py-1 text-white">Confirm remove</button>
                        : <button onClick={() => setConfirm(l.slug)} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">Remove</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 font-semibold', ok ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground line-through decoration-1')}>
      {label}
    </span>
  );
}

/** The stored secret as an Authorization header, for the one call outside the leagues API. */
async function currentAuth(): Promise<string> {
  try { return `Bearer ${sessionStorage.getItem(KEY) ?? ''}`; } catch { return 'Bearer '; }
}
