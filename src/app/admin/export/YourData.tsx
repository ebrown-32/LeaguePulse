'use client';

/**
 * Your data, in the admin: the league's archive (src/lib/archive) and the
 * way out of it. Everything LeaguePulse has read is kept, and any of it can
 * be downloaded as Excel, CSV or JSON, for one season or all of them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Database, Download, FileCsvIcon, FileExcel, FileJson, RefreshCw, Check } from '@/components/icons';

interface Status {
  configured: boolean;
  seasons?: { season: number; provider: string; final: boolean }[];
  lastArchived?: string | null;
  name?: string | null;
  datasets?: { id: string; title: string; blurb: string }[];
  error?: string;
}

const FORMATS = [
  { id: 'xlsx', title: 'Excel', blurb: 'One sheet per table, ready to sort and filter', Icon: FileExcel },
  { id: 'csv', title: 'CSV', blurb: 'Works anywhere. Several tables come zipped', Icon: FileCsvIcon },
  { id: 'json', title: 'JSON', blurb: 'For building something of your own', Icon: FileJson },
] as const;
type Format = (typeof FORMATS)[number]['id'];

const PROVIDER: Record<string, string> = { sleeper: 'Sleeper', espn: 'ESPN', manual: 'Entered by hand' };

function when(iso: string | null | undefined): string {
  if (!iso) return 'Not yet';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return today ? `Today, ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function YourData({ adminPassword }: { adminPassword: string }) {
  const headers = useMemo(() => ({ 'x-admin-password': adminPassword }), [adminPassword]);
  const [status, setStatus] = useState<Status | null>(null);
  const [updating, setUpdating] = useState(false);
  const [dataset, setDataset] = useState('all');
  const [season, setSeason] = useState('all');
  const [format, setFormat] = useState<Format>('xlsx');
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/export?status=1', { headers, cache: 'no-store' }).catch(() => null);
    const d = await r?.json().catch(() => null);
    setStatus(r?.ok && d ? d : { configured: true, error: d?.error ?? 'Could not reach the archive.' });
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const update = async () => {
    setUpdating(true); setError('');
    const r = await fetch('/api/admin/export', { method: 'POST', headers }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok && d) setStatus(d); else setError(d?.error ?? 'Could not update the archive.');
    setUpdating(false);
  };

  const download = async () => {
    setDownloading(true); setError(''); setDone(null);
    const q = new URLSearchParams({ format, dataset, season });
    const r = await fetch(`/api/admin/export?${q}`, { headers }).catch(() => null);
    if (!r?.ok) {
      const d = await r?.json().catch(() => null);
      setError(d?.error ?? 'The download did not work. Try again in a moment.');
      setDownloading(false);
      return;
    }
    const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? `league.${format}`;
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setDone(name);
    setDownloading(false);
  };

  if (!status) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="h-5 w-56 animate-pulse rounded bg-muted" />
          <p className="mt-3 text-sm text-muted-foreground">Gathering your league&apos;s history. The first time takes a few seconds.</p>
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="font-semibold">Downloads need a database.</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          This copy of LeaguePulse has no archive set up. Add a Postgres database and set <code className="rounded bg-muted px-1">DATABASE_URL</code>,
          and every season will be kept and downloadable here.
        </p>
      </div>
    );
  }

  const seasons = status.seasons ?? [];
  const years = seasons.map(s => s.season);
  const span = years.length ? (years.length === 1 ? `${years[0]}` : `${Math.min(...years)} to ${Math.max(...years)}`) : '';
  const providers = [...new Set(seasons.map(s => PROVIDER[s.provider] ?? s.provider))].join(', ');
  const datasets = status.datasets ?? [];

  return (
    <div className="space-y-4">
      {/* What is kept */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Database className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight">Your league&apos;s history, kept for good.</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Every season, game, lineup, trade and draft pick is stored in your league&apos;s own archive, so it stays even if {providers || 'your platform'} lets it go. Download any of it, any time.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/50 px-3.5 py-3">
            <dt className="text-[11.5px] font-medium text-muted-foreground">Seasons kept</dt>
            <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{seasons.length}{span && <span className="font-normal text-muted-foreground">, {span}</span>}</dd>
          </div>
          <div className="rounded-xl bg-muted/50 px-3.5 py-3">
            <dt className="text-[11.5px] font-medium text-muted-foreground">Last updated</dt>
            <dd className="mt-0.5 text-[15px] font-semibold">{when(status.lastArchived)}</dd>
          </div>
          <div className="col-span-2 flex items-center rounded-xl sm:col-span-1">
            <button onClick={update} disabled={updating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold transition hover:bg-muted disabled:opacity-60">
              <RefreshCw className={cn('h-4 w-4', updating && 'animate-spin')} />{updating ? 'Updating' : 'Update now'}
            </button>
          </div>
        </dl>
        <p className="mt-3 text-[12px] text-muted-foreground">Updates on its own every morning. Finished seasons are kept as they ended.</p>
      </section>

      {/* Download */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold tracking-tight">Download</h3>

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">What</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[{ id: 'all', title: 'Everything', blurb: 'Every table below, together' }, ...datasets].map(d => (
            <button key={d.id} onClick={() => setDataset(d.id)} aria-pressed={dataset === d.id} title={d.blurb}
              className={cn('rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition',
                dataset === d.id ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
              {d.title}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          {[{ id: 'all', blurb: 'Standings, games, lineups, transactions and drafts' }, ...datasets].find(d => d.id === dataset)?.blurb}
        </p>

        <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Seasons</p>
        <select value={season} onChange={e => setSeason(e.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium sm:w-60">
          <option value="all">All seasons</option>
          {seasons.map(s => <option key={s.season} value={s.season}>{s.season}{s.final ? '' : ' (in progress)'}</option>)}
        </select>

        <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Format</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FORMATS.map(f => (
            <button key={f.id} onClick={() => setFormat(f.id)} aria-pressed={format === f.id}
              className={cn('flex items-start gap-3 rounded-xl border p-3.5 text-left transition',
                format === f.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-foreground/30')}>
              <f.Icon className={cn('mt-0.5 h-5 w-5 shrink-0', format === f.id ? 'text-primary' : 'text-muted-foreground')} />
              <span>
                <span className="block text-sm font-semibold">{f.title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{f.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <button onClick={download} disabled={downloading || !seasons.length}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3.5 text-sm font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-60 sm:w-auto">
          <Download className="h-4 w-4" />{downloading ? 'Preparing your file' : 'Download'}
        </button>
        <AnimatePresence>
          {done && (
            <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Check className="h-4 w-4 text-primary" />Saved {done}
            </motion.p>
          )}
        </AnimatePresence>
        {(error || status.error) && <p className="mt-3 text-[13px] text-destructive">{error || status.error}</p>}
      </section>
    </div>
  );
}
