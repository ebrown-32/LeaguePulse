'use client';

/**
 * My leagues: every league the signed-in user owns or helps run, with the way
 * into each one's site, admin and billing, and (for owners) its admins.
 */

import { useState } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { productDisplay } from './fonts';
import { Lockup, Route } from './marks';
import { PLATFORM } from '@/lib/platform/config';
import { STATUS, siteUrl, openAdminHref, useMyLeagues, type LeagueRow } from './accountClient';

export default function AccountView() {
  const { data, error, reload: load } = useMyLeagues();

  return (
    <div className={cn('lp-brand min-h-screen font-body', productDisplay.variable)}>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Lockup size={30} text={20} />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            {data?.operator && (
              <Link href="/operator" className="rounded-full border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-muted">Back office</Link>
            )}
            <Link href="/start" className="hidden rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background sm:inline-flex sm:items-center sm:gap-1.5">
              New league <Route size={14} />
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-5">
        <h1 className="lp-display text-[34px] font-extrabold tracking-[-0.03em] sm:text-[42px]">My leagues</h1>
        {data?.account.email && <p className="mt-1 text-[14px] text-muted-foreground">Signed in as {data.account.email}</p>}
        {data && !data.account.emailVerified && (
          <p className="mt-4 rounded-xl border border-[hsl(var(--signal)/0.4)] bg-[hsl(var(--signal)/0.08)] px-4 py-3 text-[13.5px]">
            Verify your email address to see leagues bought or shared with it.
          </p>
        )}
        {error && <p className="mt-6 text-[14px] text-[hsl(var(--signal))]">{error}</p>}

        <div className="mt-8 space-y-4">
          {!data && !error && <p className="py-16 text-center text-[14px] text-muted-foreground">Loading your leagues…</p>}
          {data && data.leagues.length === 0 && <Empty />}
          {data?.leagues.map(l => <LeagueCard key={l.slug} l={l} onChange={load} />)}
        </div>
      </main>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-[22px] border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="lp-display text-[22px] font-bold">No leagues here yet</p>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-muted-foreground">
        Start one for your Sleeper league. If someone added you as an admin, ask them to invite this email address.
      </p>
      <Link href="/start" className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground">
        Start a league <Route size={15} />
      </Link>
    </div>
  );
}

function LeagueCard({ l, onChange }: { l: LeagueRow; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const site = siteUrl(l.slug, l.url);

  const billing = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/platform/account/billing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: l.slug }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) window.location.href = d.url; else { setBusy(false); setMsg(d.error ?? 'Could not open billing'); }
  };

  return (
    <section className="rounded-[22px] border border-border bg-card">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="lp-display truncate text-[21px] font-bold">{l.name || l.slug}</h2>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold capitalize">{l.role}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <a href={site} target="_blank" rel="noreferrer" className="hover:text-primary">{site.replace(/^https?:\/\//, '')}</a>
            <span className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', STATUS[l.status].dot)} />{STATUS[l.status].label}</span>
            <span>{l.comp ? 'Beta' : l.plan === 'season' ? 'Season plan' : 'Monthly plan'}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          <a href={site} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 hover:bg-muted">View site</a>
          <a href={openAdminHref(l.slug)} className="rounded-lg bg-foreground px-3 py-2 text-background hover:bg-foreground/85">Open admin</a>
          {l.canBill && <button onClick={billing} disabled={busy} className="rounded-lg border border-border px-3 py-2 hover:bg-muted disabled:opacity-50">{busy ? 'Opening…' : 'Billing'}</button>}
          {l.role === 'owner' && (
            <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="rounded-lg border border-border px-3 py-2 hover:bg-muted">
              Admins {l.members.length + l.invites.length > 1 ? `(${l.members.length + l.invites.length})` : ''}
            </button>
          )}
        </div>
      </div>
      {msg && <p className="px-5 pb-4 text-[12.5px] text-[hsl(var(--signal))]">{msg}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <People l={l} onChange={onChange} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function People({ l, onChange }: { l: LeagueRow; onChange: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const call = async (method: 'POST' | 'DELETE', body: object) => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/platform/account/members', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: l.slug, ...body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error ?? 'Something went wrong'); return false; }
    onChange(); return true;
  };
  return (
    <div className="border-t border-border px-5 py-4">
      <ul className="divide-y divide-border/70 text-[13.5px]">
        {l.members.map(m => (
          <li key={m.userId} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 truncate">{m.email}{m.you && <span className="text-muted-foreground"> (you)</span>}</span>
            <span className="text-[12px] capitalize text-muted-foreground">{m.role}</span>
            {!m.you && <button onClick={() => call('DELETE', { userId: m.userId })} disabled={busy} className="text-[12px] font-semibold text-muted-foreground hover:text-foreground">Remove</button>}
          </li>
        ))}
        {l.invites.map(i => (
          <li key={i.email} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 truncate">{i.email}</span>
            <span className="text-[12px] text-muted-foreground">Invited</span>
            <button onClick={() => call('DELETE', { email: i.email })} disabled={busy} className="text-[12px] font-semibold text-muted-foreground hover:text-foreground">Withdraw</button>
          </li>
        ))}
      </ul>
      <form onSubmit={async e => { e.preventDefault(); if (await call('POST', { email })) setEmail(''); }} className="mt-3 flex gap-2">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Co-commissioner's email" required
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] outline-none focus:border-primary" />
        <button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Invite</button>
      </form>
      <p className="mt-2 text-[12px] text-muted-foreground">
        They sign in at {PLATFORM.rootDomain} with that email, and the league appears in their account. Admins can change the site; only you can manage billing and admins.
      </p>
      {msg && <p className="mt-2 text-[12.5px] text-[hsl(var(--signal))]">{msg}</p>}
    </div>
  );
}
