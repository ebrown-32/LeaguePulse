'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { Personality, ContentKind } from '@/lib/ai/personalities';

const ALL_KINDS: ContentKind[] = ['article', 'tweet', 'comment', 'tradeGrade'];
const KIND_LABEL: Record<ContentKind, string> = {
  article: 'Article', tweet: 'Post', comment: 'Comment', tradeGrade: 'Trade Grade',
};

export default function AIDeskAdmin() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [queued, setQueued] = useState(0);

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

  const login = async () => {
    setAuthError('');
    const res = await fetch('/api/admin/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) setAuthed(true);
    else setAuthError('Incorrect password');
  };

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

  if (!authed) {
    return (
      <PageLayout title="AI Desk" subtitle="Back office, personalities and manual publishing.">
        <div className="mx-auto max-w-sm rounded-xl border border-border bg-card p-6">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">Admin password</label>
          <input
            type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          {authError && <p className="mt-2 text-xs text-rose-500">{authError}</p>}
          <button onClick={login} className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground">
            Unlock
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="AI Desk" subtitle="Back office, personalities and manual publishing.">
      {configured === false && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
          <span className="font-semibold text-amber-500">AI is not configured. </span>
          Add <code className="font-mono text-foreground">ANTHROPIC_API_KEY</code> to <code className="font-mono text-foreground">.env.local</code>.
        </div>
      )}

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
    </PageLayout>
  );
}
