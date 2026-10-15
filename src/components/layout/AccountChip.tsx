'use client';

/**
 * Your LeaguePulse account, in a league site's footer: a way back to the
 * product and, once signed in, your name and picture with a short menu (your
 * leagues, this league's admin if you run it, your franchise if you manage one).
 *
 * The site never signs anyone in itself. "Sign in" goes to the product site,
 * which returns with a visitor pass (lib/platform/visitorPass) in the URL
 * fragment; it is kept in this browser for thirty days.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const KEY = 'lp_visitor';

interface Me {
  accounts: boolean; signedIn?: boolean; product?: string; signIn?: string;
  name?: string; image?: string | null; role?: 'owner' | 'admin' | null;
  links?: { account: string; admin: string | null; franchise: string | null; editFranchise: string | null };
}

export default function AccountChip() {
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
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-foreground/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/leaguepulse-icon.svg" alt="" className="h-3.5 w-3.5 rounded" />
        Sign in with LeaguePulse
      </a>
    );
  }

  const signOut = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } setMe({ ...me, signedIn: false }); setOpen(false); };
  const items = [
    me.links?.franchise && { label: 'Your franchise', href: me.links.franchise },
    me.links?.editFranchise && { label: 'Manage your franchise', href: me.links.editFranchise },
    me.links?.admin && { label: 'League admin', href: me.links.admin },
    { label: 'My leagues', href: me.links!.account },
    { label: 'LeaguePulse home', href: me.product! },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-xs font-semibold text-foreground transition hover:border-foreground/30">
        {me.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={me.image} alt="" className="h-6 w-6 rounded-full object-cover" />
          : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{me.name?.slice(0, 1)}</span>}
        <span className="max-w-[10rem] truncate">{me.name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-50 mb-2 w-56 sm:left-auto sm:right-0 overflow-hidden rounded-xl border border-border bg-card p-1.5 text-sm shadow-xl">
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
