'use client';

/**
 * The Custom tier's way in: a short note about the league and what its
 * commissioner is dreaming of. It lands in the operator's back office, who
 * replies by email. Four fields, nothing more.
 */

import { useEffect, useState } from 'react';
import { lockScroll } from '@/lib/scrollLock';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tick } from '../marks';

const field = 'w-full rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] outline-none transition focus:border-foreground/40';

export default function InquirySheet({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', league: '', message: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const unlock = lockScroll();
    return () => { window.removeEventListener('keydown', onKey); unlock(); };
  }, [onClose]);

  const send = async () => {
    setState('sending'); setError('');
    const r = await fetch('/api/platform/inquiry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok) setState('sent'); else { setState('idle'); setError(d?.error ?? 'Could not send. Try again in a moment.'); }
  };

  return (
    <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-foreground/45 backdrop-blur-[3px]" />
      <motion.div role="dialog" aria-modal="true" aria-label="Tell us about your league"
        initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-card p-6 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-8">
        {state === 'sent' ? (
          <div className="py-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"><Tick size={22} /></span>
            <h3 className="lp-display mt-5 text-[26px] font-extrabold tracking-[-0.02em]">Got it.</h3>
            <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted-foreground">
              We&apos;ll write back to {form.email} within a couple of days to talk about your league.
            </p>
            <button onClick={onClose} className="mt-7 rounded-full bg-foreground px-6 py-3 text-[14px] font-semibold text-background">Done</button>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); send(); }}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Custom</p>
            <h3 className="lp-display mt-2 text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em]">Tell us about your league.</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
              A site designed around it, built with you. Tell us what you&apos;re picturing and we&apos;ll take it from there.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <input required value={form.name} onChange={set('name')} placeholder="Your name" autoComplete="name" className={field} />
              <input required type="email" value={form.email} onChange={set('email')} placeholder="Email" autoComplete="email" className={field} />
              <input value={form.league} onChange={set('league')} placeholder="League name, or a link to it" className={cn(field, 'sm:col-span-2')} />
              <textarea required value={form.message} onChange={set('message')} rows={4} placeholder="What are you dreaming of? A look, a feature, a trophy room…"
                className={cn(field, 'resize-none sm:col-span-2')} />
            </div>
            {error && <p className="mt-3 text-[13px] text-[hsl(var(--signal))]">{error}</p>}
            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-full px-5 py-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
              <button disabled={state === 'sending'} className="rounded-full bg-foreground px-6 py-3 text-[14px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-60">
                {state === 'sending' ? 'Sending' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
