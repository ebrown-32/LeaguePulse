'use client';

/**
 * Your LeaguePulse account, at the bottom left of a league site's footer and
 * at the foot of its menus (`compact`): the way into the rest of LeaguePulse. Signed out, an invitation to sign in;
 * signed in, your name and picture with a short menu (your leagues, this
 * league's admin if you run it, your franchise if you manage one).
 *
 * The site never signs anyone in itself. "Sign in" goes to the product site,
 * which returns with a visitor pass (lib/platform/visitorPass) in the URL
 * fragment; it is kept in this browser for thirty days.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { identify, resetIdentity } from '@/lib/mixpanel';

const KEY = 'lp_visitor';

interface Me {
  accounts: boolean; signedIn?: boolean; id?: string; product?: string; signIn?: string;
  name?: string; image?: string | null; role?: 'owner' | 'admin' | null;
  links?: { account: string; admin: string | null; franchise: string | null; editFranchise: string | null };
}

export default function AccountChip({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A pass handed back from the product site: keep it, and take it out of the address bar.
    const m = /[#&]lpv=([^&]+)/.exec(window.location.hash);
    if (m) {
      try { localStorage.setItem(KEY, m[1]); } catch { /* still used for this view */ }
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    let pass = m?.[1] ?? null;
    try { pass ??= localStorage.getItem(KEY); } catch { /* none */ }
    fetch('/api/account/me', { headers: pass ? { 'x-visitor-pass': pass } : {}, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Me | null) => {
        if (!d) return;
        // An expired or foreign pass: forget it.
        if (pass && d.signedIn === false) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
        if (d.signedIn && d.id) identify(d.id, { league_role: d.role ?? 'member' });
        setMe(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  if (!me?.accounts) return null;

  if (!me.signedIn) {
    return (
      <a href={`${me.signIn}${encodeURIComponent(window.location.href.split('#')[0])}`}
        className={`group inline-flex items-center gap-3 rounded-2xl border border-border bg-card/60 py-2 pl-2 text-left transition hover:border-foreground/30 hover:bg-card ${compact ? 'pr-3' : 'pr-4'} ${className ?? ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/leaguepulse-icon.svg" alt="" className={compact ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-lg'} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[13px] font-semibold text-foreground">Sign in with LeaguePulse</span>
          {!compact && <span className="block text-[11.5px] text-muted-foreground">Your leagues, franchise and admin, all in one place</span>}
        </span>
        <span aria-hidden className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground">&rarr;</span>
      </a>
    );
  }

  const signOut = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } resetIdentity(); setMe({ ...me, signedIn: false }); setOpen(false); };
  const items = [
    me.links?.franchise && { label: 'Your franchise', href: me.links.franchise },
    me.links?.editFranchise && { label: 'Manage your franchise', href: me.links.editFranchise },
    me.links?.admin && { label: 'League admin', href: me.links.admin },
    { label: 'My leagues', href: me.links!.account },
    { label: 'LeaguePulse home', href: me.product! },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <div ref={box} className={`relative ${className ?? ''}`}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu"
        className={`group inline-flex items-center gap-3 rounded-2xl border border-border bg-card/60 py-2 pl-2 pr-3.5 text-left transition hover:border-foreground/30 hover:bg-card ${className ? 'w-full' : ''}`}>
        <span className="relative shrink-0">
          {me.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={me.image} alt="" className="h-8 w-8 rounded-full object-cover" />
            : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-[13px] font-bold text-primary">{me.name?.slice(0, 1)}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/leaguepulse-icon.svg" alt="" className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded ring-2 ring-card" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block max-w-[12rem] truncate text-[13px] font-semibold text-foreground">{me.name}</span>
          <span className="block text-[11.5px] text-muted-foreground">Your LeaguePulse</span>
        </span>
        <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} className="text-[11px] text-muted-foreground">&#9650;</motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-border bg-card p-1.5 text-sm shadow-xl">
            <p className="truncate px-2.5 pb-1.5 pt-1 text-[11px] text-muted-foreground">Signed in as {me.name}{me.role ? `, ${me.role === 'owner' ? 'owner' : 'admin'}` : ''}</p>
            {items.map(it => (
              <a key={it.label} role="menuitem" href={it.href} className="block rounded-lg px-2.5 py-2 font-medium text-foreground hover:bg-muted">{it.label}</a>
            ))}
            <button role="menuitem" onClick={signOut} className="block w-full rounded-lg px-2.5 py-2 text-left font-medium text-muted-foreground hover:bg-muted">Sign out here</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
