'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Upload, Trash2, Shuffle, Check, Plus, RotateCcw } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { Personality, ContentKind } from '@/lib/ai/personalities';
import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE, personaAvatarUrl } from '@/lib/ai/avatar';
import { fileToAvatarDataUri } from '@/lib/ai/avatarClient';
import { MAX_AVATAR_BYTES } from '@/lib/ai/avatarUpload';

const ALL_KINDS: ContentKind[] = [
  'article', 'powerRankings', 'predictions', 'tweet', 'comment', 'tradeGrade',
  'matchupPreview', 'kickoff', 'liveTake',
];
const KIND_LABEL: Record<ContentKind, string> = {
  article: 'Article', tweet: 'Post', comment: 'Comment', tradeGrade: 'Trade Grade',
  powerRankings: 'Power Rankings', predictions: 'Predictions',
  matchupPreview: 'Week Preview', kickoff: 'Kickoff', liveTake: 'Live',
};

/** Kinds that only work while real games are on. Publishing one by hand out of
 *  season fails loudly rather than inventing a scoreboard, so the panel says so
 *  up front instead of letting an admin discover it through an error. */
const GAME_DAY_KINDS = new Set<ContentKind>(['kickoff', 'liveTake']);

/**
 * What each format actually publishes.
 *
 * The picker used to be bare labels, so "Predictions" and "Power Rankings"
 * looked like two flavours of the same thing and there was no way to know that
 * one covers the whole league while another needs a subject.
 */
const KIND_HELP: Record<ContentKind, string> = {
  article: 'An opinion column: headline, standfirst and three paragraphs.',
  tweet: 'One short post, under 280 characters.',
  comment: 'A one to three sentence reaction to something specific.',
  tradeGrade: 'Published from a trade itself, not from here.',
  powerRankings: 'Every team ranked with a verdict. Covers the whole league.',
  predictions: 'Projected finish, playoff field and a champion pick. Covers the whole league.',
  matchupPreview: 'A pick and a take for every fixture in the coming week.',
  kickoff: 'A short post for the moment the slate starts.',
  liveTake: 'A reaction to the live scoreboard.',
};

/**
 * Formats that can be pointed at one event or one team.
 *
 * The rest are league-wide by construction: power rankings rank everybody,
 * predictions project everybody, a week preview covers every fixture, and the
 * live posts read whatever is on the scoreboard. Offering an event alongside
 * those would imply a steer that the writer never receives.
 */
const EVENT_KINDS = new Set<ContentKind>(['article', 'tweet', 'comment']);

/** Formats that cannot be published without something to react to. */
const NEEDS_SUBJECT = new Set<ContentKind>(['comment']);

const EVENT_GROUP: Record<string, string> = {
  trade: 'Trades',
  result: 'Results',
  waiver: 'Waiver claims',
  free_agent: 'Signings',
};

interface LeagueEvent {
  id: string;
  type: 'trade' | 'waiver' | 'free_agent' | 'result';
  label: string;
  detail: string;
  subject?: string;
  week: number;
}

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

/** First readable line of a post, whatever shape its content takes. */
function postPreview(post: { content: any }): string {
  const c = post.content ?? {};
  return c.text || c.headline || c.standfirst || c.verdict || '';
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

  const [feed, setFeed] = useState<any[] | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [kind, setKind] = useState<ContentKind>('tweet');
  const [angle, setAngle] = useState('');
  const [events, setEvents] = useState<LeagueEvent[] | null>(null);
  const [eventId, setEventId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ai/status').then(r => r.json()).then(d => { setConfigured(d.configured); setQueued(d.queued ?? 0); }).catch(() => setConfigured(false));
    fetch('/api/ai/personalities', { headers: { 'x-admin-password': password } })
      .then(r => r.json()).then(d => {
      setPeople(d.personalities ?? []);
      setActiveId(d.personalities?.[0]?.id ?? '');
    }).catch(() => {});
  }, [password]);

  useEffect(() => {
    fetch('/api/ai/assistant').then(r => r.json())
      .then(d => setAssistantName(d?.name ?? '')).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/ai/events', { headers: { 'x-admin-password': password } })
      .then(r => r.json()).then(d => setEvents(d.events ?? [])).catch(() => setEvents([]));
  }, [password]);

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

  /** Everything the admin can see, including built-ins they have deleted. */
  const visible = people.filter(p => !p.hidden);
  const active = people.find(p => p.id === activeId);

  /** Formats the selected writer will actually accept. Typed wide rather than
   *  narrowed by the filter, so it can be compared against the current kind. */
  const publishable = useMemo<ContentKind[]>(
    () => (active ? active.kinds.filter(k => k !== 'tradeGrade') : []),
    [active],
  );

  /**
   * Keep the chosen format on something this writer writes.
   *
   * The format was plain component state and never followed the selection, so
   * switching to a writer who does not post short takes left `tweet` selected
   * with no button lit, and Publish came back "X does not write tweet". That
   * is the whole of the inconsistency: the panel was asking for something the
   * writer had never been given.
   */
  useEffect(() => {
    if (publishable.length && !publishable.includes(kind)) setKind(publishable[0]);
  }, [publishable, kind]);

  /**
   * Publishing reads the saved cast, not what is on screen.
   *
   * So an unsaved writer does not exist to the publish route at all, and an
   * unsaved edit to a voice is not the voice that gets used. Both cases used
   * to publish something other than what the panel was showing, so the button
   * waits for the save rather than guessing.
   */
  const unsaved = dirty || saving;

  const selectedEvent = events?.find(e => e.id === eventId) ?? null;
  // An event only reaches the writer for the formats that take one; leaving a
  // stale selection visible on a power ranking would promise a steer that is
  // never sent.
  const eventApplies = EVENT_KINDS.has(kind);
  const missingSubject = NEEDS_SUBJECT.has(kind) && !selectedEvent && !angle.trim();

  const addPersona = useCallback((type: 'media' | 'fan') => {
    const id = `custom-${Date.now().toString(36)}`;
    const fresh: Personality = {
      id,
      name: type === 'fan' ? 'New fan' : 'New personality',
      handle: `@${type}${Math.random().toString(36).slice(2, 6)}`,
      tagline: type === 'fan' ? 'One opinion, held far too hard' : 'Describe them in one line',
      accent: 'text-primary',
      type,
      custom: true,
      voice: type === 'fan'
        ? 'A league member with exactly one opinion. Reacts, never analyses. Two sentences at most.'
        : 'Describe how this person talks: their tone, their tics, what they always notice first.',
      // Fans react; they do not file columns or rank the league.
      kinds: type === 'fan' ? ['tweet', 'comment'] : ['article', 'tweet', 'comment'],
      enabled: true,
      avatarStyle: 'avataaars',
      avatarSeed: id,
    };
    setPeople(ps => [...ps, fresh]);
    setActiveId(id);
    setDirty(true);
    setSaved(false);
  }, []);

  const removePersona = useCallback((persona: Personality) => {
    setPeople(ps => persona.custom
      // A persona the admin made has no default to come back from, so it goes.
      ? ps.filter(p => p.id !== persona.id)
      // A built-in would be merged straight back in on the next read, so it is
      // marked instead of dropped.
      : ps.map(p => (p.id === persona.id ? { ...p, hidden: true, enabled: false } : p)));
    setActiveId(prev => (prev === persona.id ? '' : prev));
    setDirty(true);
    setSaved(false);
  }, []);

  const restoreHidden = useCallback(() => {
    setPeople(ps => ps.map(p => (p.hidden ? { ...p, hidden: false } : p)));
    setDirty(true);
  }, []);
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
    setBusy(true); setError(null); setResult(null); setPosted(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({
          personalityId: active.id,
          kind,
          // Sent as an id, not as text: the server resolves it against the
          // same league record the writer reads, so a piece can only be
          // commissioned about something that genuinely happened.
          eventId: eventId || undefined,
          angle: angle.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.setup ? `${d.error}, ${d.setup}` : d.error); return; }
      const p = d.published;
      setPosted(
        `Published ${KIND_LABEL[p.kind as ContentKind].toLowerCase()} as ${p.persona}`
        + (p.event ? `, on ${p.event}` : p.subject ? `, about ${p.subject}` : '')
        + '.',
      );
      setResult(d.summary || '');
      setAngle('');
    } catch { setError('Generation failed'); }
    finally { setBusy(false); }
  }, [active, kind, eventId, angle, password]);

  const loadFeed = useCallback(async () => {
    setFeedBusy(true); setFeedError(null);
    try {
      const d = await fetch('/api/ai/posts?limit=100').then(r => r.json());
      setFeed(d.posts ?? []);
    } catch {
      setFeed([]); setFeedError('Could not read the feed.');
    } finally { setFeedBusy(false); }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const removePost = useCallback(async (id: string) => {
    setRemoving(id); setFeedError(null);
    try {
      const res = await fetch(`/api/ai/posts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFeedError(d.error ?? `Could not remove that post (${res.status}).`);
        return;
      }
      // Dropped locally rather than refetched: the store is read-modify-write,
      // so an immediate re-read can still serve the copy that was just removed.
      setFeed(f => (f ?? []).filter(p => p.id !== id));
    } catch {
      setFeedError('Could not reach the server.');
    } finally { setRemoving(null); }
  }, [password]);

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
              {visible.filter(p => p.enabled).length} of {visible.length} on
            </span>
          </div>

          <div
            className={cn(
              'no-scrollbar flex snap-x gap-2 overflow-x-auto pb-1',
              'lg:max-h-[calc(100vh-14rem)] lg:snap-none lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0',
            )}
          >
            {visible.map(p => {
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
                    {p.type === 'fan' && (
                      <span className="mt-0.5 hidden rounded bg-muted px-1 py-px text-[8px] font-bold uppercase tracking-wider text-muted-foreground lg:inline-block">
                        Fan
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => addPersona('media')}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-3 w-3" /> Personality
            </button>
            <button
              onClick={() => addPersona('fan')}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-3 w-3" /> Fan
            </button>
            {people.some(p => p.hidden) && (
              <button
                onClick={restoreHidden}
                title="Bring back every built-in you have deleted"
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <RotateCcw className="h-3 w-3" /> Restore {people.filter(p => p.hidden).length}
              </button>
            )}
          </div>
        </div>

        {active && (
          <div className="space-y-5">
            <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold text-foreground">
                    Edit {active.name}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {active.type === 'fan' ? 'Fan' : 'Media personality'}
                    {active.custom ? ', added by you' : ', built in'}
                  </p>
                </div>
                <button
                  onClick={() => removePersona(active)}
                  title={active.custom
                    ? 'Delete this persona'
                    : 'Remove this built-in. You can restore it from the roster.'}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-rose-500/40 hover:text-rose-500"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>

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

              {/* Who it goes out as. The writer is chosen in the list above,
                  and with the roster scrolled away it was possible to publish
                  as someone other than the person you thought you had open. */}
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewSrc(active)} alt="" loading="lazy"
                    className="mr-0.5 h-6 w-6 shrink-0 rounded-full border border-border bg-card object-cover" />
                  Publishing as <span className="font-semibold text-foreground">{active.name}</span>
                  <span className="text-muted-foreground">{active.handle}</span>
                </p>
                {!active.enabled && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Not in the auto rotation, so they only post when published from here.
                  </p>
                )}
              </div>

              <div>
                <span className="mb-1.5 block text-xs text-muted-foreground">Format</span>
                {publishable.length === 0 ? (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    {active.name} has no formats selected. Turn one on under Writes above.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {publishable.map(k => (
                      <button key={k} onClick={() => setKind(k)}
                        className={cn('min-h-[36px] rounded-md border px-3 text-xs font-medium transition-colors',
                          kind === k
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground')}>
                        {KIND_LABEL[k]}
                      </button>
                    ))}
                  </div>
                )}
                {publishable.includes(kind) && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{KIND_HELP[kind]}</p>
                )}
                {GAME_DAY_KINDS.has(kind) && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Reads the live scoreboard. Outside a game window there is nothing to
                    report and this will fail rather than invent one.
                  </p>
                )}
              </div>

              {/* What to cover. */}
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground" htmlFor="lp-event">
                  Cover a league event
                </label>
                <select
                  id="lp-event"
                  value={eventApplies ? eventId : ''}
                  onChange={e => setEventId(e.target.value)}
                  disabled={!eventApplies || !events?.length}
                  className={cn(FIELD, 'disabled:opacity-50')}
                >
                  <option value="">
                    {events === null ? 'Loading recent events…'
                      : events.length ? 'Nothing specific, let them pick'
                      : 'No recent events on record'}
                  </option>
                  {Object.entries(EVENT_GROUP).map(([type, label]) => {
                    const group = (events ?? []).filter(e => e.type === type);
                    if (!group.length) return null;
                    return (
                      <optgroup key={type} label={label}>
                        {group.map(e => (
                          <option key={e.id} value={e.id}>{e.label}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                {!eventApplies ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {KIND_LABEL[kind]} covers the whole league, so it is not written about one event.
                  </p>
                ) : selectedEvent ? (
                  // Exactly what the writer will be handed, so there is no
                  // guessing about what "cover this" means. Capped and
                  // scrollable: a five team trade runs long enough to push the
                  // publish button off a phone screen.
                  <p className="mt-1.5 max-h-32 overflow-y-auto rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground">
                    {selectedEvent.detail}
                  </p>
                ) : null}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Angle, optional{NEEDS_SUBJECT.has(kind) && !selectedEvent
                    ? ', or what to react to' : ''}
                </span>
                <input value={angle} onChange={e => setAngle(e.target.value)}
                  placeholder={NEEDS_SUBJECT.has(kind)
                    ? 'Something for them to react to'
                    : 'Steer the piece, or leave blank'}
                  className={cn(FIELD, 'placeholder:text-muted-foreground')} />
              </label>

              {missingSubject && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  A comment needs something to react to. Pick an event or write an angle.
                </p>
              )}
              {unsaved && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Save the cast first. Publishing uses the saved writer, so anything unsaved
                  here would not be what goes out.
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={generate}
                  disabled={busy || configured === false || !publishable.length || missingSubject || unsaved}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                  {busy && <LoadingSpinner className="h-3.5 w-3.5" />}
                  {busy ? 'Writing…' : `Publish ${publishable.includes(kind) ? KIND_LABEL[kind].toLowerCase() : ''}`}
                </button>
                <button onClick={runCron} disabled={busy}
                  className="min-h-[44px] rounded-md border border-border px-4 text-sm font-semibold text-foreground hover:border-primary/40 disabled:opacity-40">
                  Run scheduler
                </button>
              </div>

              {error && <p className="break-words text-xs text-rose-500">{error}</p>}
              {posted && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {posted}
                  <a href="/desk" target="_blank" rel="noreferrer"
                    className="font-semibold text-primary underline">
                    Open the feed
                  </a>
                </p>
              )}
              {result && (
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground">{result}</pre>
              )}
            </section>

            {/* What is actually live, and a way to take it down.
                Publishing was one way: a piece that came out wrong stayed up
                until it aged past the retention cap. */}
            <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-foreground">On the feed</h2>
                <button onClick={loadFeed} disabled={feedBusy}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
                  <RotateCcw className={cn('h-3 w-3', feedBusy && 'animate-spin')} />
                  Refresh
                </button>
              </div>

              {feed === null ? (
                <p className="text-xs text-muted-foreground">Loading the feed…</p>
              ) : !feed.length ? (
                <p className="text-xs text-muted-foreground">Nothing published yet.</p>
              ) : (
                <ul className="space-y-2">
                  {feed.map(post => (
                    <li key={post.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background p-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground">{post.personaName}</span>
                          <span>{KIND_LABEL[post.kind as ContentKind] ?? post.kind}</span>
                          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-foreground">
                          {postPreview(post)}
                        </span>
                      </span>
                      <button
                        onClick={() => removePost(post.id)}
                        disabled={removing === post.id}
                        aria-label={`Remove ${post.personaName}'s post`}
                        className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:border-rose-500/40 hover:text-rose-500 disabled:opacity-40"
                      >
                        {removing === post.id
                          ? <LoadingSpinner className="h-3 w-3" />
                          : <Trash2 className="h-3 w-3" />}
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {feedError && <p className="text-xs text-rose-500">{feedError}</p>}
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
