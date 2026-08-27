'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Upload, Trash2, Shuffle, Check } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { Personality, ContentKind } from '@/lib/ai/personalities';
import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE, personaAvatarUrl } from '@/lib/ai/avatar';
import { fileToAvatarDataUri } from '@/lib/ai/avatarClient';
import { MAX_AVATAR_BYTES } from '@/lib/ai/avatarUpload';

const ALL_KINDS: ContentKind[] = [
  'article', 'powerRankings', 'predictions', 'tweet', 'comment', 'tradeGrade',
];
const KIND_LABEL: Record<ContentKind, string> = {
  article: 'Article', tweet: 'Post', comment: 'Comment', tradeGrade: 'Trade Grade',
  powerRankings: 'Power Rankings', predictions: 'Predictions',
};

/**
 * Inputs are 16px on small screens and only shrink from `sm` up.
 *
 * iOS Safari zooms the viewport whenever a focused field is under 16px, which
 * on a phone throws away the layout and leaves the admin pinched in on one
 * text box. Desktop keeps the denser 14px.
 */
const FIELD =
  'w-full rounded-md border border-border bg-background px-3 py-2.5 text-base text-foreground ' +
  'focus:border-primary focus:outline-none sm:py-2 sm:text-sm';

/**
 * What the admin should see right now, which is not always what the feed sees.
 *
 * `personaAvatarUrl` points an uploaded portrait at `/api/ai/avatar/<id>`, and
 * that route reads the saved record. Between picking a file and pressing Save
 * there is nothing there to read, so the preview would break at exactly the
 * moment the admin is deciding whether they like the picture. The bytes are
 * already in memory here; show those.
 */
function previewSrc(p: Personality): string {
  return p.avatarImage || personaAvatarUrl(p);
}

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

/**
 * A titled section that collapses.
 *
 * The panel used to render assistant settings, diagnostics, the full cast and
 * the editor as one column. On a phone that is several screens of scrolling
 * before the thing you came to change. Setup lives behind a summary line now,
 * and the editor is what you land on.
 */
function Section({
  title, summary, children, defaultOpen = false,
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {title}
          </span>
          {summary && (
            <span className="mt-0.5 block truncate text-xs text-foreground">{summary}</span>
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
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
  // Tracked as a flag rather than by diffing against a snapshot: portraits make
  // the record hundreds of kilobytes, and stringifying that on every keystroke
  // to answer "has anything changed" is wasted work.
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Leaving with unsaved edits loses them; the record only persists on save.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

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
  const update = useCallback((patch: Partial<Personality>) => {
    setPeople(ps => ps.map(p => (p.id === activeId ? { ...p, ...patch } : p)));
    setDirty(true);
    setSaved(false);
  }, [activeId]);

  const savePeople = useCallback(async () => {
    setSaving(true); setSaved(false); setSaveError(null);
    try {
      const res = await fetch('/api/ai/personalities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ personalities: people }),
      });
      if (res.ok) {
        setSaved(true); setDirty(false);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const d = await res.json().catch(() => ({}));
        setSaveError(d.error ?? `Save failed (${res.status}).`);
      }
    } catch {
      setSaveError('Could not reach the server.');
    } finally { setSaving(false); }
  }, [people, password]);

  /** Downscale in the browser, then hold it in state until the admin saves. */
  const pickImage = useCallback(async (file: File | undefined) => {
    if (!file || !active) return;
    setUploading(true); setUploadError(null);
    try {
      update({ avatarImage: await fileToAvatarDataUri(file) });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not read that image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [active, update]);

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
      // Sends the admin password: once CRON_SECRET is set in production the
      // route rejects unauthenticated calls, and this button is one.
      const d = await fetch('/api/ai/cron?force=1', {
        headers: { 'x-admin-password': password },
      }).then(r => r.json());
      setResult(d.posted ? `Posted a ${d.kind} as ${d.persona}.` : `Skipped: ${d.skipped ?? d.error}`);
    } catch { setError('Cron run failed'); }
    finally { setBusy(false); }
  }, [password]);

  const enabledCount = people.filter(p => p.enabled).length;

  return (
    <>
      {configured === false && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
          <span className="font-semibold text-amber-500">AI is not configured. </span>
          Add <code className="font-mono text-foreground">ANTHROPIC_API_KEY</code> to <code className="font-mono text-foreground">.env.local</code>.
        </div>
      )}

      {/* Setup collapses out of the way. It is configured once and then rarely
          touched, unlike the cast below it. */}
      <div className="mb-5 space-y-3">
        <Section title="Chat assistant" summary={assistantName || 'Unnamed'}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs text-muted-foreground">Name</span>
              <input
                value={assistantName}
                onChange={e => setAssistantName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveAssistant()}
                maxLength={40}
                placeholder="Captain Mike"
                className={FIELD}
              />
            </label>
            <button
              onClick={saveAssistant}
              disabled={!assistantName.trim()}
              className="min-h-[44px] shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {assistantSaved ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Shown in the chat header and used by the assistant to refer to itself.
          </p>
        </Section>

        <Section
          title="Diagnostics"
          summary={
            diag && !diag.error
              ? `${diag.summary.pass} pass, ${diag.summary.warn} warn, ${diag.summary.fail} fail`
              : 'Key, storage, cron secret and feed'
          }
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => runDiagnostics(false)} disabled={diagBusy}
              className="min-h-[44px] flex-1 rounded-lg border border-border px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50">
              {diagBusy ? 'Checking…' : 'Run checks'}
            </button>
            <button onClick={() => runDiagnostics(true)} disabled={diagBusy}
              title="Also sends a 1-token request to Anthropic to prove the key works"
              className="min-h-[44px] flex-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              Test connections
            </button>
          </div>

          {diag?.error && (
            <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-500">
              {diag.error}
            </p>
          )}
          {diag && !diag.error && <ul className="mt-3">{diag.checks.map(c => <CheckRow key={c.id} c={c} />)}</ul>}
          {!diag && !diagBusy && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Verifies the Anthropic key, the Redis round trip, the cron secret, and what the
              feed currently holds. &ldquo;Test connections&rdquo; additionally spends one token
              proving the API key is live.
            </p>
          )}
        </Section>
      </div>

      <div className="lg:grid lg:grid-cols-[248px_1fr] lg:items-start lg:gap-6">
        {/* The cast.

            One markup, two shapes: a horizontal rail of faces on a phone, a
            vertical list from `lg` up. Stacking the full roster above the
            editor put eighteen full-width rows between the top of the page and
            the thing being edited, and showed initials rather than the faces
            that make one persona tellable from another. */}
        <div className="mb-5 lg:sticky lg:top-24 lg:mb-0">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Cast
            </span>
            <span className="text-[11px] text-muted-foreground">
              {enabledCount} of {people.length} on
            </span>
          </div>

          <div
            className={cn(
              'no-scrollbar flex snap-x gap-2 overflow-x-auto pb-1',
              'lg:max-h-[calc(100vh-14rem)] lg:snap-none lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0',
            )}
          >
            {people.map(p => {
              const on = p.id === activeId;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  aria-current={on || undefined}
                  className={cn(
                    'flex shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors',
                    'w-[84px] lg:w-full lg:flex-row lg:gap-2.5 lg:p-2.5 lg:text-left',
                    on ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80',
                  )}
                >
                  <span className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewSrc(p)}
                      alt=""
                      loading="lazy"
                      className="h-11 w-11 rounded-full border border-border bg-card object-cover lg:h-9 lg:w-9"
                    />
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                        p.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                      )}
                      title={p.enabled ? 'In the rotation' : 'Off'}
                    />
                  </span>
                  <span className="min-w-0 w-full lg:flex-1">
                    <span className="block truncate text-[11px] font-semibold text-foreground lg:text-sm">
                      {p.name}
                    </span>
                    <span className="hidden truncate text-[11px] text-muted-foreground lg:block">
                      {p.handle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {active && (
          <div className="space-y-5">
            <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="font-display text-base font-semibold text-foreground">
                Edit {active.name}
              </h2>

              {/* Portrait: an upload wins, DiceBear is the fallback. */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSrc(active)}
                    alt={`${active.name} avatar`}
                    className="h-16 w-16 shrink-0 rounded-full border border-border bg-card object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {active.avatarImage ? 'Uploaded photo' : 'Generated avatar'}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {active.avatarImage
                        ? 'Used everywhere this persona appears.'
                        : `Built from a seed. Upload a photo to replace it.`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <label
                        className={cn(
                          'inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary',
                          uploading && 'pointer-events-none opacity-50',
                        )}
                      >
                        {uploading ? <LoadingSpinner className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
                        {uploading ? 'Processing…' : active.avatarImage ? 'Replace' : 'Upload photo'}
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                          className="sr-only"
                          onChange={e => pickImage(e.target.files?.[0])}
                        />
                      </label>
                      {active.avatarImage && (
                        <button
                          type="button"
                          onClick={() => { update({ avatarImage: undefined }); setUploadError(null); }}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-rose-500/40 hover:text-rose-500"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {uploadError && <p className="mt-2 text-[11px] text-rose-500">{uploadError}</p>}

                {/* The generated-avatar controls are only meaningful while no
                    photo is set, so they go away rather than sitting there
                    inert and inviting a change with no visible effect. */}
                {!active.avatarImage && (
                  <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-muted-foreground">Style</span>
                      <select
                        value={active.avatarStyle ?? DEFAULT_AVATAR_STYLE}
                        onChange={e => update({ avatarStyle: e.target.value })}
                        className={FIELD}
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
                          className={FIELD}
                        />
                        <button
                          type="button"
                          onClick={() => update({ avatarSeed: Math.random().toString(36).slice(2, 10) })}
                          title="Shuffle"
                          aria-label="Shuffle seed"
                          className="inline-flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary/40 hover:text-primary sm:min-h-0"
                        >
                          <Shuffle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </label>
                  </div>
                )}

                <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                  Photos are cropped square, resized to 256px and re-encoded in your browser,
                  which also strips camera location data. Limit {MAX_AVATAR_BYTES / 1024}KB after
                  compression.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Name</span>
                  <input value={active.name} onChange={e => update({ name: e.target.value })} className={FIELD} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Handle</span>
                  <input value={active.handle} onChange={e => update({ handle: e.target.value })} className={FIELD} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-muted-foreground">Tagline</span>
                  <input value={active.tagline} onChange={e => update({ tagline: e.target.value })} className={FIELD} />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Voice, this is the instruction Claude writes from
                </span>
                <textarea value={active.voice} onChange={e => update({ voice: e.target.value })} rows={5}
                  className={cn(FIELD, 'leading-relaxed')} />
              </label>

              <div>
                <span className="mb-1.5 block text-xs text-muted-foreground">Writes</span>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_KINDS.map(k => {
                    const on = active.kinds.includes(k);
                    return (
                      <button key={k}
                        onClick={() => update({ kinds: on ? active.kinds.filter(x => x !== k) : [...active.kinds, k] })}
                        className={cn('min-h-[36px] rounded-md border px-3 text-xs font-medium transition-colors',
                          on ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                        {KIND_LABEL[k]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex min-h-[44px] items-center gap-2.5">
                <input type="checkbox" checked={active.enabled}
                  onChange={e => update({ enabled: e.target.checked })}
                  className="h-4 w-4 shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Enabled, included in the auto-posting rotation
                </span>
              </label>
            </section>

            <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
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
                    className={cn('min-h-[36px] rounded-md px-3 text-xs font-medium transition-colors',
                      kind === k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>

              <input value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="Optional angle"
                className={cn(FIELD, 'placeholder:text-muted-foreground')} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={generate} disabled={busy || configured === false}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                  {busy && <LoadingSpinner className="h-3.5 w-3.5" />}{busy ? 'Writing…' : 'Publish'}
                </button>
                <button onClick={runCron} disabled={busy}
                  className="min-h-[44px] rounded-md border border-border px-4 text-sm font-semibold text-foreground hover:border-primary/40 disabled:opacity-40">
                  Run scheduler
                </button>
              </div>

              {error && <p className="break-words text-xs text-rose-500">{error}</p>}
              {result && (
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground">{result}</pre>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Save follows you.

          The button used to sit under the roster list, so on a phone saving an
          edit meant scrolling back up past the whole cast, and nothing on
          screen said there was anything to save. */}
      <AnimatePresence>
        {(dirty || saving || saved || saveError) && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur-sm supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            {/* The chat launcher is fixed at bottom-right with a far higher
                z-index, so a button in that corner is unclickable. Keep clear
                of it rather than fighting it: 56px of button plus its inset. */}
            <div className="mx-auto flex max-w-5xl items-center gap-3 pr-[4.5rem] sm:pr-16">
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {saveError
                  ? <span className="text-rose-500">{saveError}</span>
                  : saved
                    ? <span className="inline-flex items-center gap-1 text-emerald-500"><Check className="h-3.5 w-3.5" /> Saved</span>
                    : 'Unsaved changes to the cast'}
              </p>
              <button
                onClick={savePeople}
                disabled={saving || (!dirty && !saveError)}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {saving && <LoadingSpinner className="h-3.5 w-3.5" />}
                {saving ? 'Saving…' : saveError ? 'Retry' : 'Save'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reserve room so the bar never covers the last control. */}
      {(dirty || saving || saved || saveError) && <div className="h-20" aria-hidden />}
    </>
  );
}
