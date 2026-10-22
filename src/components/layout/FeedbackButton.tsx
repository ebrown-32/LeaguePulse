'use client';

/**
 * "Report a bug or share an idea", on every league's site: a short form that lands in the back
 * office's inbox (/api/feedback, lib/ops/feedback). The page they're on and their screen go along
 * with it, so a bug report says where without anyone having to.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Idea, MessageCircle, X } from '@/components/icons';
import { track } from '@/lib/mixpanel';
import { cn } from '@/lib/utils';

type Kind = 'bug' | 'idea';

export default function FeedbackButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-muted-foreground shadow-sm transition hover:border-foreground/30 hover:text-foreground', className)}>
        <MessageCircle className="h-3.5 w-3.5" /> Report a bug or share an idea
      </button>
      <AnimatePresence>{open && <FeedbackDialog onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('bug');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted) first.current?.focus(); }, [mounted]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await fetch('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, title, details, email, page: window.location.pathname + window.location.search, viewport: `${window.innerWidth}×${window.innerHeight}` }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok) { track('feedback_submitted', { kind }); setSent(true); setTimeout(onClose, 2200); }
    else setError(d?.error ?? 'That didn’t send. Try again in a moment.');
  };

  if (!mounted) return null;
  const field = 'w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] outline-none transition focus:border-foreground/40';
  return createPortal(
    <motion.div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div role="dialog" aria-modal="true" aria-label="Send feedback"
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-6"
        initial={{ y: 30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        <AnimatePresence mode="wait" initial={false}>
          {sent ? (
            <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-8 text-center">
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12 text-primary"><Check className="h-7 w-7" /></motion.span>
              <p className="mt-4 text-[17px] font-bold">Thanks, it&apos;s in.</p>
              <p className="mt-1 text-[13.5px] text-muted-foreground">{kind === 'bug' ? 'We’ll look into it.' : 'Every idea gets read.'}</p>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={send} className="space-y-3.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div>
                <h2 className="text-[18px] font-bold tracking-tight">Tell us what you think</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">Something broken, or something you&apos;d love to see. It goes straight to the people who build LeaguePulse.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([['bug', 'Something’s broken', AlertTriangle], ['idea', 'I have an idea', Idea]] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                    className={cn('flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-[13px] font-semibold transition',
                      kind === k ? 'border-primary bg-primary/[0.08] text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
                    <Icon className="h-4 w-4 shrink-0" />{label}
                  </button>
                ))}
              </div>
              <input ref={first} value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={120}
                placeholder={kind === 'bug' ? 'What went wrong, in a line' : 'Your idea, in a line'} className={field} />
              <textarea value={details} onChange={e => setDetails(e.target.value)} rows={4} maxLength={4000}
                placeholder={kind === 'bug' ? 'What were you doing, what did you expect, and what happened instead?' : 'What would it do, and why would your league love it?'}
                className={cn(field, 'resize-none')} />
              <input type="email" data-mp-mask value={email} onChange={e => setEmail(e.target.value)} maxLength={200}
                placeholder="Your email, if you'd like a reply (optional)" className={field} />
              {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] leading-snug text-muted-foreground">The page you&apos;re on and your screen size are sent with it.</p>
                <button disabled={busy || title.trim().length < 3}
                  className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-[13.5px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-50">
                  {busy ? 'Sending…' : 'Send'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
