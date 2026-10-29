'use client';

/**
 * The back office's Monitor and Feedback tabs (OperatorPanel).
 *
 *   Monitor   live checks of what the platform depends on, the scheduled jobs, every other
 *             service's calls (with errors, rate limits and Sleeper's busiest minute against its
 *             limit), the AI spend of every league, and the server's own errors
 *   Feedback  bugs and ideas sent from the leagues' sites, to triage
 *
 * Both read the operator API with the same sign-in as the rest of the panel.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Auth = string | null;
const headers = (auth: Auth, json = false): Record<string, string> => ({
  ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}),
});

function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const money = (n: number) => (n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);
const bytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const big = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString());

function Card({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[22px] border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="lp-display text-[18px] font-bold tracking-[-0.01em]">{title}</h2>
        {meta && <div className="text-[12px] text-muted-foreground">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

/** A status, never color alone: a mark and a word. */
function State({ level, label }: { level: 'ok' | 'warn' | 'bad'; label: string }) {
  const tone = level === 'ok' ? 'text-primary bg-primary/10' : level === 'warn' ? 'text-amber-600 bg-amber-500/12 dark:text-amber-400' : 'text-[hsl(var(--signal))] bg-[hsl(var(--signal)/0.12)]';
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', tone)}>
      <span aria-hidden>{level === 'ok' ? '✓' : level === 'warn' ? '!' : '✕'}</span>{label}
    </span>
  );
}

/**
 * Calls an hour over the last day: one series, one color, a tooltip on each hour. Errors are not
 * stacked in (a second color would need a legend); they're in the row's numbers.
 */
function Sparkline({ hours, label }: { hours: { hour: string; calls: number; err: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...hours.map(h => h.calls));
  const when = (h: string) => new Date(`${h}:00:00Z`).toLocaleTimeString(undefined, { hour: 'numeric' });
  return (
    <div className="relative h-10 w-full min-w-[140px]" onPointerLeave={() => setHover(null)} aria-label={`${label}: calls an hour, last 24 hours`}>
      <div className="flex h-full items-end gap-[2px]">
        {hours.map((h, i) => (
          <span key={h.hour} onPointerEnter={() => setHover(i)} className="flex h-full flex-1 items-end">
            <span className={cn('block w-full rounded-t-[2px]', h.calls ? 'bg-primary' : 'bg-muted')}
              style={{ height: h.calls ? `${Math.max(6, (h.calls / max) * 100)}%` : 2, opacity: hover == null || hover === i ? 1 : 0.45 }} />
          </span>
        ))}
      </div>
      {hover != null && (
        <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-card px-2 py-1 text-[11px] shadow-md"
          style={{ left: `${((hover + 0.5) / hours.length) * 100}%` }}>
          <span className="font-semibold">{when(hours[hover].hour)}</span> <span className="text-muted-foreground">{hours[hover].calls.toLocaleString()} calls{hours[hover].err ? `, ${hours[hover].err} failed` : ''}</span>
        </div>
      )}
    </div>
  );
}

interface Ops {
  at: string;
  checks: { id: string; label: string; ok: boolean; ms: number | null; detail: string }[];
  crons: { id: string; label: string; every: number; last: { at: string; ms: number; status: number; ok: boolean } | null; lastFailure: { at: string; status: number } | null }[];
  providers: { id: string; label: string; limit?: string; hourly: { hour: string; calls: number; err: number; r429: number; ms: number }[]; day: { calls: number; err: number; r429: number; avgMs: number }; week: { calls: number; err: number; r429: number } }[];
  sleeper: { thisMinute: number; limit: number; peakMinute24h: number };
  appErrors: { hour: string; err: number }[];
  errors: { at: string; message: string; path: string; route: string; kind: string; digest?: string }[];
  ai: null | {
    month: string; dayOfMonth: number; daysInMonth: number; total: number; projected: number; lastMonth: number; calls: number; tokens: number;
    platform: { leagues: number; month: number; projected: number; pricePerYear: number };
    leagues: { slug: string; name: string; mode: string; tier: string; month: number; calls: number; tokens: number; lastMonth: number }[];
  };
  storage?: Record<'redis' | 'postgres', Store | null>;
}

interface Store { used: number; limit: number | null; detail: string; parts: { label: string; bytes: number }[] }

export function Monitor({ auth }: { auth: Auth }) {
  const [data, setData] = useState<Ops | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/platform/operator/ops', { headers: headers(auth), cache: 'no-store' });
      if (!r.ok) throw new Error(`Could not load (${r.status})`);
      setData(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
    setLoading(false);
  }, [auth]);
  useEffect(() => { load(); }, [load]);
  // Every minute while it's open: a monitor that goes stale isn't one.
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  if (error && !data) return <p className="rounded-2xl border border-[hsl(var(--signal)/0.4)] bg-card px-4 py-3 text-[13.5px]">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-[22px] bg-card shadow-sm" />;

  const failing = data.checks.filter(c => !c.ok).length;
  const now = Date.now();
  const cronState = (c: Ops['crons'][number]): ['ok' | 'warn' | 'bad', string] => {
    if (!c.last) return ['warn', 'No run seen yet'];
    if (!c.last.ok) return ['bad', `Failed (${c.last.status})`];
    const late = now - new Date(c.last.at).getTime() > c.every * 2.5 * 60_000;
    return late ? ['warn', 'Overdue'] : ['ok', 'On schedule'];
  };
  const sl = data.sleeper, slShare = sl.peakMinute24h / sl.limit;
  const active = data.providers.filter(p => p.week.calls > 0);
  const errs24 = data.appErrors.reduce((s, h) => s + h.err, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
        <span>{failing ? <State level="bad" label={`${failing} check${failing === 1 ? '' : 's'} failing`} /> : <State level="ok" label="Everything reachable" />} <span className="ml-2">Checked {ago(data.at)}, refreshes every minute</span></span>
        <button onClick={load} disabled={loading} className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-muted disabled:opacity-60">{loading ? 'Checking' : 'Check now'}</button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Live checks" meta="What the platform depends on">
          <ul className="mt-4 divide-y divide-border">
            {data.checks.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{c.label}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{c.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.ms != null && <span className="text-[11.5px] tabular-nums text-muted-foreground">{c.ms} ms</span>}
                  <State level={c.ok ? (c.ms != null && c.ms > 2500 ? 'warn' : 'ok') : 'bad'} label={c.ok ? (c.ms != null && c.ms > 2500 ? 'Slow' : 'Up') : 'Down'} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Scheduled jobs" meta="Vercel cron">
          <ul className="mt-4 divide-y divide-border">
            {data.crons.map(c => {
              const [level, label] = cronState(c);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold">{c.label}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      Every {c.every >= 60 * 24 ? 'day' : c.every >= 60 ? `${c.every / 60}h` : `${c.every} min`}, last {ago(c.last?.at)}{c.last ? ` in ${(c.last.ms / 1000).toFixed(1)}s` : ''}
                      {c.lastFailure && c.last?.ok ? `, last failed ${ago(c.lastFailure.at)}` : ''}
                    </p>
                  </div>
                  <State level={level} label={label} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card title="Sleeper rate limit" meta="1,000 calls a minute, platform-wide">
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'This minute', v: sl.thisMinute },
            { label: 'Busiest minute, last 24h', v: sl.peakMinute24h },
            { label: 'Headroom at the peak', v: Math.max(0, sl.limit - sl.peakMinute24h) },
          ].map(k => (
            <div key={k.label}>
              <p className="text-[11.5px] font-semibold text-muted-foreground">{k.label}</p>
              <p className="lp-num mt-1 text-[28px] font-extrabold tabular-nums leading-none">{k.v.toLocaleString()}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="relative h-2.5 rounded-full bg-muted">
            <motion.div className={cn('h-full rounded-full', slShare > 0.8 ? 'bg-[hsl(var(--signal))]' : slShare > 0.6 ? 'bg-amber-500' : 'bg-primary')}
              initial={{ width: 0 }} animate={{ width: `${Math.min(100, slShare * 100)}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
            {/* Where background jobs stop on their own (LP_SLEEPER_JOB_RPM, 600 by default). */}
            <span className="absolute -top-1 bottom-[-4px] w-px bg-foreground/40" style={{ left: '60%' }} title="Background jobs pause at 600" />
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            {Math.round(slShare * 100)}% of the limit at the day&apos;s busiest minute. Background jobs pause at 600 a minute, the line, so pages always have room.
          </p>
        </div>
      </Card>

      <Card title="Calls to other services" meta="Last 24 hours, from every server">
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Service</th>
                <th className="py-2 pr-3 font-semibold">Calls an hour</th>
                <th className="py-2 pr-3 text-right font-semibold">24h</th>
                <th className="py-2 pr-3 text-right font-semibold">Failed</th>
                <th className="py-2 pr-3 text-right font-semibold">Rate limited</th>
                <th className="py-2 text-right font-semibold">Avg time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(active.length ? active : data.providers.slice(0, 4)).map(p => {
                const errRate = p.day.calls ? p.day.err / p.day.calls : 0;
                return (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3 align-middle">
                      <p className="font-semibold">{p.label}</p>
                      {p.limit && <p className="text-[11px] text-muted-foreground">{p.limit}</p>}
                    </td>
                    <td className="w-[34%] py-2.5 pr-3"><Sparkline hours={p.hourly} label={p.label} /></td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{big(p.day.calls)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {p.day.err ? <span className={cn(errRate > 0.05 ? 'font-semibold text-[hsl(var(--signal))]' : '')}>{p.day.err} ({(errRate * 100).toFixed(1)}%)</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{p.day.r429 ? <span className="font-semibold text-[hsl(var(--signal))]">{p.day.r429}</span> : <span className="text-muted-foreground">0</span>}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{p.day.calls ? `${p.day.avgMs} ms` : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!active.length && <p className="mt-3 text-[12.5px] text-muted-foreground">No calls counted yet. Counting starts when the server does.</p>}
        </div>
      </Card>

      {data.storage && <Storage storage={data.storage} />}

      {data.ai && <AiSpend ai={data.ai} />}

      <Card title="Server errors" meta={`${errs24} in the last 24 hours`}>
        <div className="mt-4"><Sparkline hours={data.appErrors.map(h => ({ hour: h.hour, calls: h.err, err: 0 }))} label="Server errors" /></div>
        <ul className="mt-4 divide-y divide-border">
          {data.errors.slice(0, 12).map((e, i) => (
            <li key={`${e.at}${i}`} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-mono text-[12.5px]">{e.message}</p>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">{ago(e.at)}</span>
              </div>
              <p className="truncate text-[11.5px] text-muted-foreground">{e.path} · {e.route} ({e.kind}){e.digest ? ` · ${e.digest}` : ''}</p>
            </li>
          ))}
          {!data.errors.length && <li className="py-3 text-[13px] text-muted-foreground">None recorded. Errors Next reports land here as they happen.</li>}
        </ul>
      </Card>
    </div>
  );
}

function Storage({ storage }: { storage: NonNullable<Ops['storage']> }) {
  const stores = [
    { id: 'redis', label: 'Redis (Upstash)', about: 'The whole database, every namespace. Limit from Upstash.', s: storage.redis },
    { id: 'postgres', label: 'Postgres (archive)', about: 'History, matchups and franchises. Limit from LP_POSTGRES_LIMIT_MB.', s: storage.postgres },
  ];
  return (
    <Card title="Storage" meta="Space used against each plan's limit">
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {stores.map(({ id, label, about, s }) => {
          const share = s?.limit ? s.used / s.limit : 0;
          const level = share > 0.9 ? 'bad' : share > 0.7 ? 'warn' : 'ok';
          return (
            <div key={id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{label}</p>
                  <p className="text-[11.5px] text-muted-foreground">{about}</p>
                </div>
                {s ? <State level={level} label={level === 'ok' ? 'Plenty of room' : level === 'warn' ? 'Filling up' : 'Nearly full'} /> : <State level="warn" label="Not readable" />}
              </div>
              {s && (
                <>
                  <p className="mt-3 tabular-nums">
                    <span className="lp-num text-[26px] font-extrabold leading-none">{bytes(s.used)}</span>
                    {s.limit && <span className="ml-1.5 text-[12.5px] text-muted-foreground">of {bytes(s.limit)} ({(share * 100).toFixed(share < 0.1 ? 1 : 0)}%)</span>}
                  </p>
                  {s.limit && (
                    <div className="mt-2 h-2.5 rounded-full bg-muted">
                      <motion.div className={cn('h-full rounded-full', level === 'bad' ? 'bg-[hsl(var(--signal))]' : level === 'warn' ? 'bg-amber-500' : 'bg-primary')}
                        initial={{ width: 0 }} animate={{ width: `${Math.max(1, Math.min(100, share * 100))}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
                    </div>
                  )}
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">{s.detail}</p>
                  {s.parts.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {s.parts.map(p => (
                        <li key={p.label} className="flex items-baseline justify-between gap-3 text-[12px]">
                          <span className="min-w-0 truncate font-mono text-muted-foreground">{p.label}</span>
                          <span className="shrink-0 tabular-nums">{bytes(p.bytes)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AiSpend({ ai }: { ai: NonNullable<Ops['ai']> }) {
  // What platform-run leagues pay a month (a year's price over twelve), against what their AI costs.
  const revenue = (ai.platform.leagues * ai.platform.pricePerYear) / 12;
  const share = revenue ? ai.platform.projected / revenue : 0;
  const top = ai.leagues.filter(l => l.month > 0 || l.calls > 0).slice(0, 10);
  return (
    <Card title="AI usage" meta={`${new Date(`${ai.month}-01T12:00:00Z`).toLocaleDateString(undefined, { month: 'long' })}, day ${ai.dayOfMonth} of ${ai.daysInMonth}, at list prices`}>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Spent this month', v: money(ai.total), sub: `${ai.calls.toLocaleString()} calls, ${big(ai.tokens)} tokens` },
          { label: 'On pace for', v: money(ai.projected), sub: `Last month ${money(ai.lastMonth)}` },
          { label: 'On our key', v: money(ai.platform.month), sub: `${ai.platform.leagues} League Pass + AI league${ai.platform.leagues === 1 ? '' : 's'}` },
          { label: 'Of what they pay', v: revenue ? `${Math.round(share * 100)}%` : '-', sub: revenue ? `On pace ${money(ai.platform.projected)} against ${money(revenue)} a month` : 'No league on our key yet' },
        ].map(k => (
          <div key={k.label}>
            <p className="text-[11.5px] font-semibold text-muted-foreground">{k.label}</p>
            <p className={cn('lp-num mt-1 text-[26px] font-extrabold tabular-nums leading-none', k.label === 'Of what they pay' && share > 0.5 && 'text-[hsl(var(--signal))]')}>{k.v}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">League</th>
                <th className="py-2 pr-3 font-semibold">Whose key</th>
                <th className="py-2 pr-3 text-right font-semibold">Calls</th>
                <th className="py-2 pr-3 text-right font-semibold">This month</th>
                <th className="py-2 text-right font-semibold">Last month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {top.map(l => (
                <tr key={l.slug || 'root'}>
                  <td className="py-2 pr-3"><span className="font-semibold">{l.name}</span>{l.slug && <span className="ml-1.5 text-[11.5px] text-muted-foreground">{l.slug}</span>}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{l.mode === 'platform' ? 'Ours' : l.mode === 'off' ? 'Off' : 'Theirs'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.calls.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">{money(l.month)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{money(l.lastMonth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

interface Feedback {
  id: string; at: string; kind: 'bug' | 'idea'; title: string; details: string; email: string | null; league: string | null;
  page: string | null; userAgent: string | null; viewport: string | null; build: string | null; status: 'new' | 'planned' | 'done' | 'wontfix'; note: string | null;
}
const STATUS_LABEL = { new: 'New', planned: 'Planned', done: 'Done', wontfix: 'Won’t do' } as const;

/** How many are waiting, for the tab's badge. */
export function useNewFeedback(auth: Auth) {
  const [n, setN] = useState(0);
  useEffect(() => {
    fetch('/api/platform/operator/feedback', { headers: headers(auth), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => setN((d?.items ?? []).filter((f: Feedback) => f.status === 'new').length)).catch(() => {});
  }, [auth]);
  return [n, setN] as const;
}

export function FeedbackInbox({ auth, onCount }: { auth: Auth; onCount?: (n: number) => void }) {
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [kind, setKind] = useState<'all' | 'bug' | 'idea'>('all');
  const [status, setStatus] = useState<'open' | Feedback['status'] | 'all'>('open');
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch('/api/platform/operator/feedback', { headers: headers(auth), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => setItems(d?.items ?? [])).catch(() => setItems([]));
  }, [auth]);
  useEffect(load, [load]);
  useEffect(() => { if (items) onCount?.(items.filter(f => f.status === 'new').length); }, [items, onCount]);

  const patch = async (id: string, change: { status?: Feedback['status']; note?: string }) => {
    setItems(xs => xs?.map(f => (f.id === id ? { ...f, ...change } : f)) ?? xs);
    await fetch('/api/platform/operator/feedback', { method: 'PATCH', headers: headers(auth, true), body: JSON.stringify({ id, ...change }) }).catch(() => {});
  };
  const remove = async (id: string) => {
    if (!confirm('Delete this for good?')) return;
    setItems(xs => xs?.filter(f => f.id !== id) ?? xs);
    await fetch('/api/platform/operator/feedback', { method: 'DELETE', headers: headers(auth, true), body: JSON.stringify({ id }) }).catch(() => {});
  };

  const shown = useMemo(() => (items ?? []).filter(f =>
    (kind === 'all' || f.kind === kind) && (status === 'all' || (status === 'open' ? f.status === 'new' || f.status === 'planned' : f.status === status))), [items, kind, status]);
  const counts = useMemo(() => ({ bug: (items ?? []).filter(f => f.kind === 'bug' && f.status === 'new').length, idea: (items ?? []).filter(f => f.kind === 'idea' && f.status === 'new').length }), [items]);
  const pill = (on: boolean) => cn('rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition', on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground');

  if (!items) return <div className="h-64 animate-pulse rounded-[22px] bg-card shadow-sm" />;
  return (
    <Card title="Bugs and ideas" meta={<>{counts.bug} new bug{counts.bug === 1 ? '' : 's'}, {counts.idea} new idea{counts.idea === 1 ? '' : 's'}</>}>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {(['all', 'bug', 'idea'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={pill(kind === k)}>{k === 'all' ? 'Everything' : k === 'bug' ? 'Bugs' : 'Ideas'}</button>)}
        <span className="mx-1 h-4 w-px bg-border" />
        {(['open', 'new', 'planned', 'done', 'wontfix', 'all'] as const).map(s => <button key={s} onClick={() => setStatus(s)} className={pill(status === s)}>{s === 'open' ? 'Open' : s === 'all' ? 'All' : STATUS_LABEL[s]}</button>)}
      </div>
      <ul className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {shown.map(f => (
            <motion.li key={f.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
              className="rounded-2xl border border-border bg-background">
              <button onClick={() => setOpen(o => (o === f.id ? null : f.id))} className="flex w-full items-start gap-3 p-3.5 text-left">
                <span className={cn('mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider',
                  f.kind === 'bug' ? 'bg-[hsl(var(--signal)/0.12)] text-[hsl(var(--signal))]' : 'bg-primary/10 text-primary')}>{f.kind}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{f.title}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{f.league ?? 'Product site'} · {ago(f.at)}{f.email ? ` · ${f.email}` : ''}</span>
                </span>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{STATUS_LABEL[f.status]}</span>
              </button>
              <AnimatePresence initial={false}>
                {open === f.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="space-y-3 border-t border-border p-3.5">
                      {f.details ? <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{f.details}</p> : <p className="text-[13px] text-muted-foreground">No details.</p>}
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground sm:grid-cols-2">
                        {f.page && <div className="truncate"><dt className="inline font-semibold">Page </dt><dd className="inline">{f.page}</dd></div>}
                        {f.viewport && <div><dt className="inline font-semibold">Screen </dt><dd className="inline">{f.viewport}</dd></div>}
                        {f.build && <div><dt className="inline font-semibold">Build </dt><dd className="inline font-mono">{f.build}</dd></div>}
                        {f.userAgent && <div className="truncate sm:col-span-2"><dt className="inline font-semibold">Browser </dt><dd className="inline">{f.userAgent}</dd></div>}
                      </dl>
                      <textarea defaultValue={f.note ?? ''} placeholder="Your note (only you see it)" rows={2}
                        onBlur={e => { if ((e.target.value || null) !== f.note) patch(f.id, { note: e.target.value }); }}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-foreground/40" />
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(['new', 'planned', 'done', 'wontfix'] as const).map(s => (
                          <button key={s} onClick={() => patch(f.id, { status: s })} className={pill(f.status === s)}>{STATUS_LABEL[s]}</button>
                        ))}
                        {f.email && <a href={`mailto:${f.email}?subject=${encodeURIComponent(`Re: ${f.title}`)}`} className="ml-auto rounded-full border border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">Reply</a>}
                        <button onClick={() => remove(f.id)} className={cn('rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-[hsl(var(--signal))]', !f.email && 'ml-auto')}>Delete</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </AnimatePresence>
        {!shown.length && <li className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-[13.5px] text-muted-foreground">Nothing here.</li>}
      </ul>
    </Card>
  );
}

// ── Moving subscribers to today's prices ────────────────────────────────────

interface Move {
  id: string; slug: string | null; tier: 'standard' | 'ai'; plan: 'monthly' | 'season';
  status: string; from: number | null; to: number; renews: string | null; endsInstead: boolean;
}

/**
 * Subscriptions still on an old price (api/platform/operator/reprice), and the button that moves
 * them to today's. Shown only while there are some. Nothing is charged now: each one pays the new
 * price from its next renewal.
 */
export function Reprice({ auth, onDone }: { auth: Auth; onDone?: (msg: string) => void }) {
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/platform/operator/reprice', { headers: headers(auth), cache: 'no-store' }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) { setError(d?.error ?? 'Could not read Stripe'); return; }
    setMoves(d.moves ?? []); setMissing(d.missing ?? []);
  }, [auth]);
  useEffect(() => { load(); }, [load]);

  const move = async () => {
    if (!moves?.length) return;
    if (!window.confirm(`Move ${moves.length} subscription${moves.length === 1 ? '' : 's'} to today's prices? Each pays the new price from its next renewal.`)) return;
    setBusy(true); setError('');
    const r = await fetch('/api/platform/operator/reprice', { method: 'POST', headers: headers(auth, true), body: '{}' }).catch(() => null);
    const d = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setError(d?.error ?? 'Nothing was moved'); return; }
    const failed = (d.results ?? []).filter((x: { ok: boolean }) => !x.ok).length;
    onDone?.(`Moved ${d.moved}${failed ? `, ${failed} failed` : ''}.`);
    load();
  };

  if (error) return <p className="rounded-2xl border border-[hsl(var(--signal)/0.4)] bg-card px-4 py-3 text-[13.5px]">Old prices: {error}</p>;
  if (!moves?.length && !missing.length) return null;
  const label = (m: Move) => `${m.tier === 'ai' ? 'League Pass + AI' : 'League Pass'}, ${m.plan === 'monthly' ? 'monthly' : 'yearly'}`;
  const per = (m: Move) => (m.plan === 'monthly' ? '/mo' : '/yr');
  return (
    <Card title="Subscriptions on old prices" meta={`${moves?.length ?? 0} to move`}>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Moved to today&apos;s price for the same plan. Nothing is charged or credited now; each pays the new price from its next renewal.
      </p>
      {missing.length > 0 && (
        <p className="mt-2 text-[12.5px] text-[hsl(var(--signal))]">No current Stripe price set for: {missing.join(', ')}. Those can&apos;t move until it is.</p>
      )}
      <ul className="mt-3 divide-y divide-border">
        {(moves ?? []).map(m => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-[13px]">
            <div className="min-w-0">
              <p className="font-semibold">{m.slug ?? m.id}</p>
              <p className="text-[12px] text-muted-foreground">{label(m)}, {m.status}{m.renews ? `, renews ${new Date(m.renews).toLocaleDateString()}` : ''}{m.endsInstead ? ', set to cancel' : ''}</p>
            </div>
            <p className="shrink-0 tabular-nums">
              <span className="text-muted-foreground line-through">{m.from != null ? `$${m.from}` : '?'}</span> <span className="font-semibold">${m.to}</span>{per(m)}
            </p>
          </li>
        ))}
      </ul>
      {(moves?.length ?? 0) > 0 && (
        <button onClick={move} disabled={busy}
          className="mt-3 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background disabled:opacity-60">
          {busy ? 'Moving' : `Move ${moves!.length} to today's prices`}
        </button>
      )}
    </Card>
  );
}
