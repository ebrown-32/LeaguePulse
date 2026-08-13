'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { Personality, ContentKind } from '@/lib/ai/personalities';
import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE, personaAvatarUrl } from '@/lib/ai/avatar';

const ALL_KINDS: ContentKind[] = [
  'article', 'powerRankings', 'predictions', 'tweet', 'comment', 'tradeGrade',
];
const KIND_LABEL: Record<ContentKind, string> = {
  article: 'Article', tweet: 'Post', comment: 'Comment', tradeGrade: 'Trade Grade',
  powerRankings: 'Power Rankings', predictions: 'Predictions',
};

interface Check {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  fix?: string;
}
interface DiagResult {
  checks: Check[];
  summary: { pass: number; warn: number; fail: number };
  error?: string;
}

const STATUS_STYLE: Record<Check['status'], { dot: string; text: string; word: string }> = {
  pass: { dot: 'bg-emerald-500', text: 'text-emerald-500', word: 'PASS' },
  warn: { dot: 'bg-amber-500',   text: 'text-amber-500',   word: 'WARN' },
  fail: { dot: 'bg-red-500',     text: 'text-red-500',     word: 'FAIL' },
};

/** Status is never colour alone: every row carries the word and a fix. */
function CheckRow({ c }: { c: Check }) {
  const st = STATUS_STYLE[c.status];
  return (
    <li className="flex gap-3 border-b border-border py-2.5 last:border-0">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', st.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-foreground">{c.label}</span>
          <span className={cn('text-[9px] font-bold tracking-widest', st.text)}>{st.word}</span>
        </div>
        <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{c.detail}</p>
        {c.fix && (
          <p className="mt-1 break-words rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground">
            {c.fix}
          </p>
        )}
      </div>
    </li>
  );
}

export default function AIDeskAdmin({ adminPassword }: { adminPassword: string }) {
  const password = adminPassword;
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [queued, setQueued] = useState(0);
  const [diag, setDiag] = useState<DiagResult | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [assistantName, setAssistantName] = useState('');
  const [assistantSaved, setAssistantSaved] = useState(false);

  const [people, setPeople] = useState<Personality[]>([]);
  const [activeId, setActiveId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [kind, setKind] = useState<ContentKind>('tweet');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ai/status').then(r => r.json()).then(d => { setConfigured(d.configured); setQueued(d.queued ?? 0); }).catch(() => setConfigured(false));
    fetch('/api/ai/personalities').then(r => r.json()).then(d => {
      setPeople(d.personalities ?? []);
      setActiveId(d.personalities?.[0]?.id ?? '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/ai/assistant').then(r => r.json())
      .then(d => setAssistantName(d?.name ?? '')).catch(() => {});
  }, []);

  const saveAssistant = useCallback(async () => {
    setAssistantSaved(false);
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ name: assistantName }),
      });
      if (res.ok) {
        const d = await res.json();
        setAssistantName(d.name);
        setAssistantSaved(true);
        setTimeout(() => setAssistantSaved(false), 2500);
      }
    } catch { /* surfaced by the unchanged field */ }
  }, [assistantName, password]);

  const runDiagnostics = useCallback(async (live: boolean) => {
    setDiagBusy(true);
    try {
      const res = await fetch(`/api/ai/diagnostics${live ? '?live=1' : ''}`, {
        headers: { 'x-admin-password': password },
      });
      setDiag(await res.json());
    } catch (e) {
      setDiag({ checks: [], summary: { pass: 0, warn: 0, fail: 0 },
        error: e instanceof Error ? e.message : String(e) });
    } finally {
      setDiagBusy(false);
    }
  }, [password]);

  const active = people.find(p => p.id === activeId);
  const update = (patch: Partial<Personality>) =>
    setPeople(ps => ps.map(p => (p.id === activeId ? { ...p, ...patch } : p)));

  const savePeople = useCallback(async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/ai/personalities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ personalities: people }),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    } finally { setSaving(false); }
  }, [people, password]);

  const generate = useCallback(async () => {
    if (!active) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ personalityId: active.id, kind, topic: topic.trim() || undefined, subject: topic.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.setup ? `${d.error}, ${d.setup}` : d.error); return; }
      const c = d.post?.content ?? d.content;
      setResult(c.text ?? c.headline ?? JSON.stringify(c, null, 2));
      setTopic('');
    } catch { setError('Generation failed'); }
    finally { setBusy(false); }
  }, [active, kind, topic, password]);

  const runCron = useCallback(async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const d = await fetch('/api/ai/cron?force=1').then(r => r.json());
      setResult(d.posted ? `Posted a ${d.kind} as ${d.persona}.` : `Skipped: ${d.skipped ?? d.error}`);
    } catch { setError('Cron run failed'); }
    finally { setBusy(false); }
  }, []);


  return (
    <>
      {configured === false && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
          <span className="font-semibold text-amber-500">AI is not configured. </span>
          Add <code className="font-mono text-foreground">ANTHROPIC_API_KEY</code> to <code className="font-mono text-foreground">.env.local</code>.
        </div>
      )}

      {/* ── Chat assistant ── */}
      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Chat assistant
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Name</span>
            <input
              value={assistantName}
              onChange={e => setAssistantName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveAssistant()}
              maxLength={40}
              placeholder="Captain Mike"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </label>
          <button
            onClick={saveAssistant}
            disabled={!assistantName.trim()}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {assistantSaved ? 'Saved' : 'Save name'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Shown in the chat header and used by the assistant to refer to itself.
        </p>
      </section>

      {/* ── Diagnostics ─────────────────────────────────────────────────
          Everything the desk depends on, tested for real rather than inferred
          from whether an env var happens to be present. */}
      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Diagnostics
            </h2>
            {diag && !diag.error && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <span className="font-semibold text-emerald-500">{diag.summary.pass} pass</span>
                {' · '}
                <span className="font-semibold text-amber-500">{diag.summary.warn} warn</span>
                {' · '}
                <span className="font-semibold text-red-500">{diag.summary.fail} fail</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => runDiagnostics(false)} disabled={diagBusy}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50">
              {diagBusy ? 'Checking…' : 'Run checks'}
            </button>
            <button onClick={() => runDiagnostics(true)} disabled={diagBusy}
              title="Also sends a 1-token request to Anthropic to prove the key works"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              Test connections
            </button>
          </div>
        </div>

        {diag?.error && (
          <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-500">
            {diag.error}
          </p>
        )}
        {diag && !diag.error && (
          <ul className="mt-3">{diag.checks.map(c => <CheckRow key={c.id} c={c} />)}</ul>
        )}
        {!diag && !diagBusy && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Verifies the Anthropic key, the Redis round trip, the cron secret, and what the
            feed currently holds. &ldquo;Test connections&rdquo; additionally spends one token
            proving the API key is live.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Roster of personalities */}
        <div className="space-y-2">
          {people.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg border p-3 text-left transition-colors',
                p.id === activeId ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold text-muted-foreground">
                {p.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{p.handle}</span>
              </span>
              <span className={cn('h-2 w-2 rounded-full', p.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
            </button>
          ))}
          <button
            onClick={savePeople}
            disabled={saving}
            className="w-full rounded-md border border-border py-2 text-xs font-semibold text-foreground hover:border-primary/40 disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save personalities'}
          </button>
        </div>

        {/* Editor + publishing */}
        {active && (
          <div className="space-y-5">
            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-display text-base font-semibold text-foreground">Edit personality</h2>

              {/* Avatar: DiceBear, previewed live so you can shuffle seeds
                  until the face fits the character. */}
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/30 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={personaAvatarUrl(active)}
                  alt={`${active.name} avatar`}
                  className="h-16 w-16 shrink-0 rounded-full border border-border bg-card"
                />
                <div className="grid min-w-[16rem] flex-1 gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Avatar style</span>
                    <select
                      value={active.avatarStyle ?? DEFAULT_AVATAR_STYLE}
                      onChange={e => update({ avatarStyle: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {AVATAR_STYLES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Seed</span>
                    <div className="flex gap-1.5">
                      <input
                        value={active.avatarSeed ?? active.id}
                        onChange={e => update({ avatarSeed: e.target.value })}
                        className="w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => update({ avatarSeed: Math.random().toString(36).slice(2, 10) })}
                        title="Shuffle"
                        className="shrink-0 rounded-md border border-border px-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
                      >
                        Shuffle
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Name</span>
                  <input value={active.name} onChange={e => update({ name: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Handle</span>
                  <input value={active.handle} onChange={e => update({ handle: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Tagline</span>
                  <input value={active.tagline} onChange={e => update({ tagline: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Voice, this is the instruction Claude writes from
                </span>
                <textarea value={active.voice} onChange={e => update({ voice: e.target.value })} rows={5}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none" />
              </label>

              <div>
                <span className="mb-1.5 block text-xs text-muted-foreground">Writes</span>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_KINDS.map(k => {
                    const on = active.kinds.includes(k);
                    return (
                      <button key={k}
                        onClick={() => update({ kinds: on ? active.kinds.filter(x => x !== k) : [...active.kinds, k] })}
                        className={cn('rounded-md border px-2.5 py-1 text-xs font-medium',
                          on ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                        {KIND_LABEL[k]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={active.enabled} onChange={e => update({ enabled: e.target.checked })} />
                <span className="text-xs text-muted-foreground">Enabled, included in the auto-posting rotation</span>
              </label>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-foreground">Publish now</h2>
              <p className="text-xs text-muted-foreground">
                Publishes straight to the public feed, immediately. The scheduler writes one
                batch a day and releases it gradually.
                {queued > 0 && (
                  <> <span className="font-semibold text-foreground">{queued} queued</span> and
                  waiting to go live.</>
                )}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {active.kinds.filter(k => k !== 'tradeGrade').map(k => (
                  <button key={k} onClick={() => setKind(k)}
                    className={cn('rounded-md px-2.5 py-1 text-xs font-medium',
                      kind === k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="Optional angle"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                <button onClick={generate} disabled={busy || configured === false}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                  {busy && <LoadingSpinner className="h-3.5 w-3.5" />}{busy ? 'Writing…' : 'Publish'}
                </button>
                <button onClick={runCron} disabled={busy}
                  className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary/40 disabled:opacity-40">
                  Run scheduler
                </button>
              </div>

              {error && <p className="text-xs text-rose-500">{error}</p>}
              {result && (
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground">{result}</pre>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
