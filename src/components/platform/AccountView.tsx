'use client';

/**
 * My leagues: every league the signed-in user owns or helps run, with the way
 * into each one's site, admin and billing, and (for owners) its admins.
 *
 * Built phone first: a card per league with its icon and name up top, the
 * two things people come here for (its admin and its site) as full-width
 * buttons, and billing and admins a quieter row below.
 */

import { useState } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { productDisplay } from './fonts';
import { Logomark, Lockup, Route } from './marks';
import { PLATFORM } from '@/lib/platform/config';
import { STATUS, siteUrl, openAdminHref, useMyLeagues, type LeagueRow } from './accountClient';

export default function AccountView() {
  const { data, error, reload: load } = useMyLeagues();
  const count = data?.leagues.length ?? 0;

  return (
    <div className={cn('lp-brand min-h-screen font-body', productDisplay.variable)}>
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:h-16 sm:px-5">
          <Link href="/" className="flex items-center" aria-label={`${PLATFORM.name} home`}>
            <Lockup size={28} text={19} />
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {data?.operator && (
              <Link href="/operator" className="rounded-full border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted sm:px-3.5 sm:py-2 sm:text-[13px]">
                Back office
              </Link>
            )}
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-5 sm:pt-12">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="lp-display text-[32px] font-extrabold leading-none tracking-[-0.03em] sm:text-[42px]">My leagues</h1>
            {data?.account.email && (
              <p className="mt-2 truncate text-[13.5px] text-muted-foreground">
                {count ? `${count} league${count === 1 ? '' : 's'}, ` : ''}{data.account.email}
              </p>
            )}
          </div>
          <Link href="/start" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-[13px] font-semibold text-background transition hover:bg-foreground/85 sm:px-4">
            <span className="text-[16px] leading-none">+</span><span>New<span className="hidden sm:inline"> league</span></span>
          </Link>
        </div>

        {data && !data.account.emailVerified && (
          <p className="mt-5 rounded-2xl border border-[hsl(var(--signal)/0.4)] bg-[hsl(var(--signal)/0.08)] px-4 py-3 text-[13.5px]">
            Verify your email address to see leagues bought or shared with it.
          </p>
        )}
        {error && <p className="mt-6 text-[14px] text-[hsl(var(--signal))]">{error}</p>}

        <div className="mt-7 grid grid-cols-1 gap-4 sm:mt-9 md:grid-cols-2 md:gap-5">
          {!data && !error && [0, 1].map(i => <Skeleton key={i} />)}
          {data && data.leagues.length === 0 && <Empty />}
          {data?.leagues.map((l, i) => <LeagueCard key={l.slug} l={l} i={i} onChange={load} />)}
        </div>
      </main>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="h-[212px] animate-pulse rounded-[24px] border border-border bg-card" aria-hidden />
  );
}

function Empty() {
  return (
    <div className="rounded-[24px] border border-dashed border-border bg-card px-6 py-14 text-center md:col-span-2">
      <Logomark size={44} className="mx-auto" />
      <p className="lp-display mt-4 text-[22px] font-bold">No leagues here yet</p>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-muted-foreground">
        Start one for your Sleeper or ESPN league. If someone added you as an admin, ask them to invite this email address.
      </p>
      <Link href="/start" className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground">
        Start a league <Route size={15} />
      </Link>
    </div>
  );
}

/** The league's icon, or its initials on a tile when it has none (or it fails to load). */
function LeagueIcon({ l }: { l: LeagueRow }) {
  const [failed, setFailed] = useState(false);
  // An uploaded logo lives at the league's own address; locally that is <slug>.localhost.
  const src = l.logo?.startsWith(l.url) ? siteUrl(l.slug, l.url) + l.logo.slice(l.url.length) : l.logo;
  const initials = (l.name || l.slug).split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-border bg-background shadow-[0_1px_0_hsl(var(--border))]">
      {src && !failed
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" className="h-full w-full object-contain p-1.5" onError={() => setFailed(true)} />
        : <span className="lp-display text-[18px] font-extrabold text-primary">{initials || '?'}</span>}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{children}</span>;
}

function LeagueCard({ l, i, onChange }: { l: LeagueRow; i: number; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const reduce = useReducedMotion();
  const site = siteUrl(l.slug, l.url);
  const people = l.members.length + l.invites.length;

  const billing = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/platform/account/billing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: l.slug }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) window.location.href = d.url; else { setBusy(false); setMsg(d.error ?? 'Could not open billing'); }
  };

  const plan = (l.comp ? 'Free' : l.plan === 'season' ? 'Season plan' : 'Monthly plan') + (l.tier === 'ai' ? ' + AI' : '');

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(i, 6) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex min-w-0 flex-col rounded-[24px] border border-border bg-card shadow-[0_1px_0_hsl(var(--border)),0_18px_40px_-32px_hsl(var(--foreground)/0.35)]', open && 'md:col-span-2')}>
      <div className="flex items-start gap-3.5 p-4 sm:p-5">
        <LeagueIcon l={l} />
        <div className="min-w-0 flex-1">
          <h2 className="lp-display line-clamp-2 break-words text-[19px] font-bold leading-[1.15] tracking-[-0.01em] sm:text-[20px]">{l.name || l.slug}</h2>
          <a href={site} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[13px] text-muted-foreground hover:text-primary">
            {site.replace(/^https?:\/\//, '')}
          </a>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS[l.status].dot)} />{STATUS[l.status].label}
            </span>
            <Chip>{l.provider === 'espn' ? 'ESPN' : 'Sleeper'}</Chip>
            <Chip><span className="capitalize">{l.role}</span></Chip>
            <Chip>{plan}</Chip>
          </div>
        </div>
      </div>

      {l.franchise && (
        <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3.5 py-2.5 sm:mx-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Your franchise</p>
            <a href={localize(l.franchise.page, l.slug, site)} className="block truncate text-[14px] font-semibold hover:text-primary">{l.franchise.teamName ?? 'Your team'}</a>
          </div>
          <a href={l.franchise.edit} className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted">Edit</a>
        </div>
      )}
      <div className="mt-auto grid grid-cols-2 gap-2 px-4 pb-4 sm:px-5">
        {l.role === 'manager' ? (
          <a href={l.franchise ? localize(l.franchise.page, l.slug, site) : site}
            className="flex h-11 items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background transition hover:bg-foreground/85">
            Your franchise
          </a>
        ) : (
          <a href={openAdminHref(l.slug)}
            className="flex h-11 items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background transition hover:bg-foreground/85">
            Open admin
          </a>
        )}
        <a href={site} target="_blank" rel="noreferrer"
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-[14px] font-semibold transition hover:bg-muted">
          View site <span aria-hidden className="text-muted-foreground">↗</span>
        </a>
      </div>

      {(l.canBill || l.role === 'owner') && (
        <div className="flex items-center gap-1 border-t border-border px-2.5 py-1.5 text-[13px] font-semibold text-muted-foreground sm:px-3.5">
          {l.role === 'owner' && (
            <button onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition hover:bg-muted hover:text-foreground">
              Admins{people > 1 ? <span className="rounded-full bg-muted px-1.5 text-[11px]">{people}</span> : null}
              <motion.span animate={{ rotate: open ? 180 : 0 }} aria-hidden className="text-[10px]">▾</motion.span>
            </button>
          )}
          {l.canBill && (
            <button onClick={billing} disabled={busy}
              className="ml-auto rounded-lg px-2.5 py-2 transition hover:bg-muted hover:text-foreground disabled:opacity-50">
              {busy ? 'Opening…' : 'Billing'}
            </button>
          )}
        </div>
      )}
      {msg && <p className="px-5 pb-3 text-[12.5px] text-[hsl(var(--signal))]">{msg}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <People l={l} onChange={onChange} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/** A link on the league's real address, made local when running locally (see siteUrl). */
function localize(href: string, slug: string, site: string): string {
  return href.replace(/^https:\/\/[^/]+/, site);
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
  const Initial = ({ email }: { email: string }) => (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold uppercase">{email[0] ?? '?'}</span>
  );
  return (
    <div className="border-t border-border px-4 py-4 sm:px-5">
      <ul className="space-y-1 text-[13.5px]">
        {l.members.map(m => (
          <li key={m.userId} className="flex items-center gap-3 py-1.5">
            <Initial email={m.email} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{m.email}{m.you && <span className="text-muted-foreground"> (you)</span>}</span>
              <span className="block text-[11.5px] capitalize text-muted-foreground">{m.role}</span>
            </span>
            {!m.you && <button onClick={() => call('DELETE', { userId: m.userId })} disabled={busy} className="rounded-lg px-2 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Remove</button>}
          </li>
        ))}
        {l.invites.map(i => (
          <li key={i.email} className="flex items-center gap-3 py-1.5">
            <Initial email={i.email} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{i.email}</span>
              <span className="block text-[11.5px] text-muted-foreground">Invited</span>
            </span>
            <button onClick={() => call('DELETE', { email: i.email })} disabled={busy} className="rounded-lg px-2 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Withdraw</button>
          </li>
        ))}
      </ul>
      <form onSubmit={async e => { e.preventDefault(); if (await call('POST', { email })) setEmail(''); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Co-commissioner's email" required
          className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[14px] outline-none focus:border-primary sm:flex-1" />
        <button disabled={busy} className="h-11 rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground disabled:opacity-50">Invite</button>
      </form>
      <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
        They sign in at {PLATFORM.rootDomain} with that email and the league appears in their account. Admins can change the site; only you manage billing and admins.
      </p>
      {msg && <p className="mt-2 text-[12.5px] text-[hsl(var(--signal))]">{msg}</p>}
    </div>
  );
}
