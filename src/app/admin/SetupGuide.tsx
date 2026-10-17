'use client';

/**
 * The setup guide at the top of the admin panel (lib/setup): what a new
 * league's owner does once, in order, each step checked off by what is
 * actually saved. Open, it lists the steps; once a step is opened it folds
 * into one line with the progress and the next thing to do, so the editor
 * below gets the room.
 *
 * Shown until every step is done or an admin hides it (for every admin).
 * Arriving from sign-up (/admin?setup=1) it shows even if hidden.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Copy, Share2, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import { SETUP_STEPS, setupLeft, type SetupStatus, type SetupStep } from '@/lib/setup';

type Tab = NonNullable<SetupStep['tab']>;

export default function SetupGuide({ password, tab, onOpen, forced }: {
  password: string; tab: string; onOpen: (tab: Tab) => void; forced: boolean;
}) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  // Once seen unfinished, the guide stays for its "all set" moment.
  const sawUnfinished = useRef(false);

  const call = useCallback(async (init?: RequestInit) => {
    const r = await fetch('/api/admin/setup', { ...init, headers: { 'x-admin-password': password, 'content-type': 'application/json' }, cache: 'no-store' }).catch(() => null);
    const d: SetupStatus | null = r?.ok ? await r.json().catch(() => null) : null;
    if (d) { if (setupLeft(d) > 0) sawUnfinished.current = true; setStatus(d); }
  }, [password]);

  // Checked again on every tab change and on coming back to the window, so a
  // step ticks off soon after it is saved.
  useEffect(() => { call(); }, [call, tab]);
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') call(); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [call]);

  if (!status) return null;
  const left = setupLeft(status);
  const total = status.steps.length;
  const steps = status.steps.map(s => ({ ...SETUP_STEPS.find(x => x.id === s.id)!, done: s.done, marked: s.marked }));
  const next = steps.find(s => !s.done) ?? null;

  if (status.dismissed && !forced) {
    // Hidden with steps still to do: one quiet line to bring it back.
    if (!left) return null;
    return (
      <div className="mb-4 flex justify-end">
        <button onClick={() => { setExpanded(true); call({ method: 'POST', body: JSON.stringify({ action: 'reopened' }) }); }}
          className="text-[12.5px] font-semibold text-muted-foreground transition hover:text-primary">
          Finish setting up: {left} step{left === 1 ? '' : 's'} left
        </button>
      </div>
    );
  }
  if (!left && !sawUnfinished.current && !forced) return null;

  const dismiss = () => call({ method: 'POST', body: JSON.stringify({ action: 'dismissed' }) });
  // Ticking a step off by hand, for what this league doesn't want; or taking that back.
  const mark = (step: SetupStep['id'], done: boolean) => call({ method: 'POST', body: JSON.stringify({ action: 'mark', step, done }) });
  const open = (s: SetupStep) => {
    if (!s.tab) return;
    onOpen(s.tab);
    setExpanded(false);
    requestAnimationFrame(() => document.getElementById('admin-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const site = typeof window === 'undefined' ? '' : window.location.origin;
  const shared = () => call({ method: 'POST', body: JSON.stringify({ action: 'shared' }) });
  const copy = async () => {
    try { await navigator.clipboard.writeText(site); setCopied(true); setTimeout(() => setCopied(false), 2000); shared(); } catch { /* blocked: the address is on screen to copy by hand */ }
  };
  const share = async () => {
    try { await navigator.share({ title: document.title, url: site }); shared(); } catch { /* cancelled */ }
  };
  const pct = Math.round(((total - left) / total) * 100);

  return (
    <section aria-label="Set up your site" className="mb-6 overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-[0_0_0_1px_hsl(var(--primary)/0.05),0_18px_40px_-24px_hsl(var(--primary)/0.45)]">
      {/* The header: always there, and the whole guide when folded. */}
      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
        <Ring pct={pct} />
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-primary">
            {left ? `Set up your site · ${total - left} of ${total}` : 'Set up your site · done'}
          </p>
          <p className="line-clamp-2 font-display text-[16px] font-bold leading-tight sm:text-[17px]">
            {!left ? 'You’re all set. Your league is going to love it.' : expanded ? 'A few minutes, and it’s yours.' : `Next: ${next!.title}`}
          </p>
        </button>
        {!expanded && next?.tab && next.tab !== tab && (
          <button onClick={() => open(next)} className="hidden shrink-0 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground sm:block">
            Open
          </button>
        )}
        <button onClick={() => setExpanded(e => !e)} aria-label={expanded ? 'Fold the setup guide' : 'Show the setup guide'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>
        <button onClick={dismiss} aria-label="Hide the setup guide"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-border">
            {steps.map((s, i) => {
              const here = s.tab === tab;
              const isNext = s === next;
              return (
                <li key={s.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-nowrap sm:px-5', isNext && 'bg-primary/[0.06]')}>
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
                    s.done ? 'bg-primary text-primary-foreground' : isNext ? 'bg-primary/15 text-primary ring-1 ring-primary/50' : 'bg-muted text-muted-foreground')}>
                    {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[14px] font-semibold', s.done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{s.title}</p>
                    <p className="text-[12.5px] text-muted-foreground">{s.blurb}</p>
                    {!s.done ? (
                      <button onClick={() => mark(s.id, true)} className="mt-0.5 text-[12px] font-semibold text-muted-foreground underline-offset-2 transition hover:text-primary hover:underline">
                        Mark as done
                      </button>
                    ) : s.marked && (
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        Marked done.{' '}
                        <button onClick={() => mark(s.id, false)} className="font-semibold underline-offset-2 transition hover:text-primary hover:underline">Undo</button>
                      </p>
                    )}
                  </div>
                  {s.id === 'share' ? (
                    <div className="flex w-full items-center gap-2 pl-10 sm:w-auto sm:pl-0">
                      <span className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background/60 px-2.5 py-2 font-mono text-[12px] sm:max-w-[220px]">{site.replace(/^https?:\/\//, '')}</span>
                      <button onClick={copy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-semibold transition hover:bg-muted sm:min-h-9">
                        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}
                      </button>
                      {typeof navigator !== 'undefined' && 'share' in navigator && (
                        <button onClick={share} aria-label="Share the link" className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-border px-2.5 transition hover:bg-muted sm:min-h-9">
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ) : here ? (
                    <span className="shrink-0 text-[12px] font-semibold text-primary">You’re here</span>
                  ) : (
                    <button onClick={() => open(s)}
                      className={cn('inline-flex min-h-10 shrink-0 items-center rounded-lg px-3.5 text-[12.5px] font-semibold transition sm:min-h-9',
                        isNext ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border hover:bg-muted')}>
                      {s.done && !s.marked ? 'Change' : isNext ? 'Start' : 'Open'}
                    </button>
                  )}
                </li>
              );
            })}
          </motion.ol>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Progress as a small ring. */
function Ring({ pct }: { pct: number }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="h-10 w-10 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="3.5" />
      <motion.circle cx="18" cy="18" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - pct / 100) }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
    </svg>
  );
}
