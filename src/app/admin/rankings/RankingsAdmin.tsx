'use client';

/**
 * Expert rankings from FantasyPros: connect the league's key, choose what to
 * rank, and see what is on hand. Settings save as they are changed.
 *
 * FantasyPros gives keys to people for their own use, on request; a free key
 * allows 50 requests a day and returns the top 10 at each position. The page
 * says so plainly rather than promise more.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, ExternalLink, ListOrdered, Lock, RefreshCw, Settings, X } from '@/components/icons';

type Mode = 'weekly' | 'dynasty';
type Scoring = 'auto' | 'PPR' | 'HALF' | 'STD';
interface Status {
  mode: 'hosted' | 'self-hosted';
  key: { from: 'league' | 'environment'; fingerprint: string } | null;
  settings: { scoring: Scoring; boards: Mode[]; daily: boolean };
  leagueScoring: 'PPR' | 'HALF' | 'STD' | null;
  budget: { perRefresh: number; daily: number; positions: number };
  snapshot: null | {
    fetchedAt: string; season: string; week: number; scoring: string;
    boards: Partial<Record<Mode, Record<string, { returned: number; totalRanked: number; experts: number }>>>;
    failures: string[];
  };
  lastRun: null | { at: string; by: string; ok: boolean; requests: number; error?: string; failures?: string[] };
}

const EASE = [0.22, 1, 0.36, 1] as const;
const REQUEST_URL = 'https://secure.fantasypros.com/api-keys/request/';
const TERMS_URL = 'https://api.fantasypros.com/public/v2/terms-of-use';
const SCORING_LABEL = { PPR: 'PPR', HALF: 'Half PPR', STD: 'Standard' } as const;
const BOARDS: { id: Mode; title: string; about: string }[] = [
  { id: 'weekly', title: 'This week', about: 'The start or sit consensus for the coming games.' },
  { id: 'dynasty', title: 'Dynasty', about: 'Players valued as long-term assets, with ages.' },
];

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function RankingsAdmin({ adminPassword }: { adminPassword: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const headers = useMemo(() => ({ 'x-admin-password': adminPassword, 'content-type': 'application/json' }), [adminPassword]);
  const call = useCallback(async (method: string, body?: unknown) => {
    const r = await fetch('/api/admin/rankings', { method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (d?.settings) setS(d);
    return { ok: Boolean(r?.ok), data: d, status: r?.status };
  }, [headers]);
  useEffect(() => { call('GET').then(r => { if (!r.ok) setFailed(true); }); }, [call]);

  if (failed && !s) return <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Could not load the rankings settings. Reload to try again.</p>;
  if (!s) return <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />;

  return (
    <div className="space-y-4">
      <Overview s={s} />
      <KeyCard s={s} call={call} />
      <AnimatePresence initial={false}>
        {s.key && (
          <motion.div key="more" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: EASE }} className="space-y-4">
            <SettingsCard s={s} call={call} />
            <OnHandCard s={s} call={call} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One line on where things stand. */
function Overview({ s }: { s: Status }) {
  const live = Boolean(s.key && s.snapshot);
  const line = !s.key
    ? 'Connect a FantasyPros key and the league gets expert consensus rankings, matched against who owns whom.'
    : !s.snapshot
      ? 'Connected. Pull the first rankings below.'
      : `Updated ${ago(s.snapshot.fetchedAt)}, ${s.snapshot.week ? `week ${s.snapshot.week}` : 'preseason'}, ${SCORING_LABEL[s.snapshot.scoring as keyof typeof SCORING_LABEL] ?? s.snapshot.scoring}.${s.settings.daily ? ' Refreshes every morning.' : ' Daily refresh is paused.'}`;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <ListOrdered className="h-[18px] w-[18px]" />
          <span className={cn('absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card', live ? 'bg-emerald-500' : s.key ? 'bg-amber-500' : 'bg-muted-foreground/40')}>
            {live && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />}
          </span>
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{live ? 'Rankings are live' : s.key ? 'Connected' : 'Not connected'}</p>
          <p className="text-[12.5px] text-muted-foreground">{line}</p>
        </div>
      </div>
      {/* The rankings page and its menu link stay hidden until a key is connected. */}
      {s.key ? (
        <a href="/rankings" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground">
          View rankings <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="text-[12px] text-muted-foreground">Hidden from the league until connected</span>
      )}
    </motion.div>
  );
}

function Card({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold tracking-tight">{title}</p>
        {note && <p className="text-[12px] text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

type Call = (method: string, body?: unknown) => Promise<{ ok: boolean; data: { error?: string } | null; status?: number }>;

function KeyCard({ s, call }: { s: Status; call: Call }) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const connect = async () => {
    setBusy(true); setError('');
    const r = await call('PUT', { key });
    setBusy(false);
    if (r.ok) { setKey(''); setReplacing(false); } else setError(r.status === 401 ? 'Your admin sign-in has expired. Sign in again.' : r.data?.error ?? 'That did not work. Try again.');
  };

  if (s.mode === 'self-hosted') {
    return (
      <Card title="FantasyPros key" note="Self-hosted">
        <p className="text-[13.5px] text-muted-foreground">
          {s.key
            ? <>Reading the key from <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">FANTASY_PROS</code> in the environment ({s.key.fingerprint}).</>
            : <>Set <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">FANTASY_PROS</code> in the deployment&apos;s environment and redeploy. Secrets stay out of the database on a self-hosted copy.</>}
        </p>
        {!s.key && <Steps />}
      </Card>
    );
  }

  const form = (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type={show ? 'text' : 'password'} value={key} onChange={e => { setKey(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && key.trim() && connect()}
            placeholder="Paste your FantasyPros API key" autoComplete="off" spellCheck={false}
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-16 font-mono text-base outline-none sm:text-[13.5px] transition focus:border-foreground/40" />
          <button onClick={() => setShow(v => !v)} className="absolute right-2 top-1/2 min-h-10 sm:min-h-0 -translate-y-1/2 rounded-md px-2 py-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground">{show ? 'Hide' : 'Show'}</button>
        </div>
        <button onClick={connect} disabled={!key.trim() || busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-[13.5px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-50">
          {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}{busy ? 'Checking the key' : 'Connect'}
        </button>
      </div>
      <AnimatePresence>
        {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[13px] text-destructive">{error}</motion.p>}
      </AnimatePresence>
      <p className="text-[12px] text-muted-foreground">Checking the key uses one of its 50 requests for today. It is stored encrypted and never shown again.</p>
    </div>
  );

  return (
    <Card title="FantasyPros key" note={s.key ? 'Encrypted, never shown' : undefined}>
      {s.key && !replacing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-3">
            <span className="flex items-center gap-2.5 text-[13.5px]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /></span>
              Key <code className="font-mono text-[12.5px]">{s.key.fingerprint}</code> is connected
            </span>
            <span className="flex gap-1.5">
              <button onClick={() => setReplacing(true)} className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-background hover:text-foreground">Replace</button>
              <button onClick={() => setConfirmRemove(true)} className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-background hover:text-destructive">Disconnect</button>
            </span>
          </div>
          <AnimatePresence>
            {confirmRemove && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/5 px-3.5 py-2.5 text-[13px]">
                <span>Disconnect? The rankings on hand stay, but stop updating.</span>
                <span className="flex gap-2">
                  <button onClick={async () => { await call('DELETE'); setConfirmRemove(false); }} className="rounded-full bg-destructive px-3.5 py-1.5 font-semibold text-white">Disconnect</button>
                  <button onClick={() => setConfirmRemove(false)} className="rounded-full px-3 py-1.5 font-semibold text-muted-foreground hover:text-foreground">Keep it</button>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-5">
          {!s.key && <Steps />}
          {form}
          {replacing && <button onClick={() => { setReplacing(false); setKey(''); setError(''); }} className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">Keep the current key</button>}
        </div>
      )}
    </Card>
  );
}

/** How to get a key: FantasyPros grants them on request. */
function Steps() {
  const steps = [
    <>Request a free key from FantasyPros. You sign in with a FantasyPros account and say what it is for, such as rankings for your league&apos;s site.</>,
    <>FantasyPros reviews the request and sends the key. Keys are for personal, non-commercial use; see their <a href={TERMS_URL} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline underline-offset-2">terms</a>.</>,
    <>Paste it here. LeaguePulse checks it works, then pulls the first rankings.</>,
  ];
  return (
    <div className="space-y-3">
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07, ease: EASE }} className="flex gap-3 text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold text-foreground">{i + 1}</span>
            <span>{step}</span>
          </motion.li>
        ))}
      </ol>
      <a href={REQUEST_URL} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold transition hover:border-foreground/30">
        Request a key from FantasyPros <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-foreground' : 'bg-muted-foreground/30')}>
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-background shadow', on ? 'right-0.5' : 'left-0.5')} />
    </button>
  );
}

function SettingsCard({ s, call }: { s: Status; call: Call }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const save = async (patch: Partial<Status['settings']>) => {
    setError('');
    const r = await call('PATCH', patch);
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 1600); } else setError(r.data?.error ?? 'That did not save.');
  };
  const pct = Math.min(100, (s.budget.perRefresh / s.budget.daily) * 100);
  const scoringOptions: [Scoring, string][] = [
    ['auto', `Match the league${s.leagueScoring ? ` (${SCORING_LABEL[s.leagueScoring]})` : ''}`], ['PPR', 'PPR'], ['HALF', 'Half PPR'], ['STD', 'Standard'],
  ];

  return (
    <Card title="What to rank" note={<AnimatePresence mode="wait">{saved
      ? <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1 font-semibold text-primary"><Check className="h-3.5 w-3.5" /> Saved</motion.span>
      : error ? <motion.span key="e" className="text-destructive">{error}</motion.span> : <motion.span key="n">Saves as you change it</motion.span>}</AnimatePresence>}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Boards</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {BOARDS.map(b => {
              const on = s.settings.boards.includes(b.id);
              const only = on && s.settings.boards.length === 1;
              return (
                <button key={b.id} disabled={only} title={only ? 'Keep at least one board' : undefined}
                  onClick={() => save({ boards: on ? s.settings.boards.filter(x => x !== b.id) : [...s.settings.boards, b.id] })}
                  className={cn('relative rounded-xl border p-3.5 text-left transition', on ? 'border-foreground/60 bg-foreground/[0.03]' : 'border-border hover:border-foreground/25', only && 'cursor-not-allowed')}>
                  <span className={cn('absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border transition', on ? 'border-foreground bg-foreground text-background' : 'border-border')}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <p className="text-[14px] font-semibold">{b.title}</p>
                  <p className="pr-6 text-[12.5px] text-muted-foreground">{b.about}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Scoring</p>
          <div className="flex flex-wrap gap-1.5">
            {scoringOptions.map(([v, label]) => (
              <button key={v} onClick={() => save({ scoring: v })} aria-pressed={s.settings.scoring === v}
                className={cn('relative rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  s.settings.scoring === v ? 'border-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
                {s.settings.scoring === v && <motion.span layoutId="fp-scoring" className="absolute inset-0 -z-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 px-3.5 py-3">
          <div>
            <p className="text-[14px] font-semibold">Refresh every morning</p>
            <p className="text-[12.5px] text-muted-foreground">Once a day, so the free key never runs out. Refresh by hand any time below.</p>
          </div>
          <Toggle on={s.settings.daily} onChange={daily => save({ daily })} label="Refresh every morning" />
        </div>

        <div>
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className="font-medium text-muted-foreground">Each refresh uses</span>
            <span className="font-semibold tabular-nums">{s.budget.perRefresh} of {s.budget.daily} daily requests</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-foreground" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: EASE }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">One request per position ({s.budget.positions}) for each board.</p>
        </div>
      </div>
    </Card>
  );
}

function OnHandCard({ s, call }: { s: Status; call: Call }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const seconds = Math.round(s.budget.perRefresh * 1.7);

  const refresh = async () => {
    setBusy(true); setResult(null);
    const r = await call('POST');
    setBusy(false);
    const res = (r.data as { result?: { ok: boolean; error?: string; refreshed?: string[]; failures?: string[] } } | null)?.result;
    if (r.ok && res?.ok) setResult({ ok: true, text: `Pulled ${res.refreshed?.length ?? 0} boards${res.failures?.length ? `, ${res.failures.length} failed and kept their last copy` : ''}.` });
    else setResult({ ok: false, text: res?.error ?? r.data?.error ?? 'The refresh did not finish. Try again in a minute.' });
  };

  const positions = ['ALL', 'QB', 'RB', 'WR', 'TE'];
  const shown = BOARDS.filter(b => s.settings.boards.includes(b.id));

  return (
    <Card title="Rankings on hand" note={s.snapshot ? `Taken ${new Date(s.snapshot.fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Nothing pulled yet'}>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-left text-[11.5px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Board</th>
                {positions.map(p => <th key={p} className="px-2 py-2 text-center font-medium">{p === 'ALL' ? 'Overall' : p}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map(b => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2.5 font-semibold">{b.title}</td>
                  {positions.map((p, i) => {
                    const cell = s.snapshot?.boards[b.id]?.[p];
                    return (
                      <td key={p} className="px-2 py-2.5 text-center">
                        {cell ? (
                          <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.04 }}
                            title={`${cell.returned} shown of ${cell.totalRanked} ranked, ${cell.experts} experts`}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                            <Check className="h-3 w-3" />{cell.returned}
                          </motion.span>
                        ) : <span className="text-muted-foreground/50">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-muted-foreground">A free key returns the top 10 at each position. The numbers are how many players each board holds.</p>

        <AnimatePresence>
          {busy && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <p className="text-[12.5px] text-muted-foreground">Pulling {s.budget.perRefresh} boards, spaced out so FantasyPros does not turn us away. About {seconds} seconds.</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div className="h-full rounded-full bg-foreground" initial={{ width: '2%' }} animate={{ width: '92%' }} transition={{ duration: seconds, ease: 'linear' }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.p key="r" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn('flex items-center gap-1.5 text-[13px]', result.ok ? 'text-primary' : 'text-destructive')}>
                {result.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}{result.text}
              </motion.p>
            ) : s.lastRun ? (
              <motion.p key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12.5px] text-muted-foreground">
                Last run {ago(s.lastRun.at)}{s.lastRun.by === 'admin' ? ', by hand' : ''}: {s.lastRun.ok ? 'worked' : `failed (${s.lastRun.error?.slice(0, 120)})`}
              </motion.p>
            ) : <span />}
          </AnimatePresence>
          <button onClick={refresh} disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-60">
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> {busy ? 'Refreshing' : 'Refresh now'}
          </button>
        </div>
        {s.settings.daily ? null : (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Settings className="h-3.5 w-3.5" /> The daily refresh is paused, so these stay as they are until you refresh.</p>
        )}
      </div>
    </Card>
  );
}
