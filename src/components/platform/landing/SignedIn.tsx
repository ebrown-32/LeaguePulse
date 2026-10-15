'use client';

/**
 * The landing page for someone already signed in: their avatar in the nav,
 * and in the hero, their leagues one click away instead of a sign-up form.
 *
 * Rendered only when accounts are on (Clerk configured), since it uses
 * Clerk's hooks and those need its provider.
 */

import Link from 'next/link';
import { UserButton, useUser } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Route } from '../marks';
import { STATUS, siteUrl, openAdminHref, useMyLeagues, type LeagueRow } from '../accountClient';

const avatarAppearance = {
  elements: {
    avatarBox: 'h-9 w-9 ring-2 ring-[hsl(var(--background))] shadow-[0_0_0_1px_hsl(var(--border))]',
  },
};

/** A league's mark: its initials on an ink tile, with a status dot. */
function LeagueTile({ l }: { l: LeagueRow }) {
  const initials = (l.name || l.slug).replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-foreground text-[13px] font-extrabold text-background lp-display">
      {initials}
      <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card', STATUS[l.status].dot)} />
    </span>
  );
}

/** Nav: "Sign in" and "Get started" when signed out; the leagues button and avatar when signed in. */
export function NavAccount({ getStarted }: { getStarted: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const { data } = useMyLeagues(Boolean(isSignedIn));
  // Same footprint while Clerk loads, so nothing jumps when it settles.
  if (!isLoaded) return <span className="h-9 w-28 animate-pulse rounded-full bg-muted" aria-hidden />;
  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-4">
        <Link href="/account" className="hidden text-[13.5px] font-semibold text-muted-foreground hover:text-foreground sm:inline">Sign in</Link>
        {getStarted}
      </div>
    );
  }
  const n = data?.leagues.length;
  return (
    <div className="flex items-center gap-3">
      {/* A plain link, like the nav's others: no pill inside the pill. */}
      <Link href="/account"
        className="hidden items-baseline gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">
        My leagues
        {n != null && <span className="tabular-nums text-foreground/45">{n}</span>}
      </Link>
      <UserButton appearance={avatarAppearance}>
        <UserButton.MenuItems>
          <UserButton.Link label="My leagues" href="/account" labelIcon={<img src="/brand/leaguepulse-mark.svg" alt="" width={16} height={16} />} />
          {data?.operator ? <UserButton.Link label="Back office" href="/operator" labelIcon={<span className="block h-3.5 w-3.5 rounded-full border-2 border-current" />} /> : null}
        </UserButton.MenuItems>
      </UserButton>
    </div>
  );
}

/**
 * Hero, signed in: a greeting and their leagues. Returns null while loading or
 * when signed out, and `fallback` (the sign-up form) when they have no
 * leagues yet, so a new account still sees how to start one.
 */
export function WelcomeBack({ fallback }: { fallback: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { data } = useMyLeagues(Boolean(isSignedIn));
  if (!isLoaded || !isSignedIn) return <>{fallback}</>;
  const first = user.firstName || user.username || (user.primaryEmailAddress?.emailAddress.split('@')[0] ?? '');
  const leagues = data?.leagues ?? null;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mt-8 max-w-md rounded-[22px] border border-border bg-card p-4 shadow-[0_1px_0_hsl(var(--border)),0_24px_48px_-30px_hsl(var(--foreground)/0.25)] sm:p-5">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={user.imageUrl} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-background shadow-[0_0_0_1px_hsl(var(--border))]" />
        <div className="min-w-0">
          <p className="lp-display truncate text-[19px] font-bold leading-tight">Welcome back{first ? `, ${first}` : ''}</p>
          <p className="text-[12.5px] text-muted-foreground">
            {leagues === null ? 'Loading your leagues…' : leagues.length === 1 ? 'You run 1 league' : `You run ${leagues.length} leagues`}
          </p>
        </div>
      </div>

      {leagues === null && (
        <div className="mt-4 space-y-2" aria-hidden>
          {[0, 1, 2].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/70" />)}
        </div>
      )}

      {leagues && leagues.length === 0 && <div className="mt-2">{fallback}</div>}

      {leagues && leagues.length > 0 && (
        <>
          <ul className="mt-4 space-y-1.5">
            {leagues.slice(0, 4).map((l, i) => (
              <motion.li key={l.slug} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/60">
                <LeagueTile l={l} />
                <a href={siteUrl(l.slug, l.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{l.name || l.slug}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {STATUS[l.status].label}, {l.role === 'owner' ? 'Owner' : l.role === 'manager' ? 'Manager' : 'Admin'}
                  </p>
                </a>
                {/* A manager has a franchise there, not the league's admin. */}
                <a href={l.role === 'manager' && l.franchise ? l.franchise.edit : openAdminHref(l.slug)}
                  className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] font-semibold opacity-80 transition group-hover:opacity-100 hover:border-foreground/30">
                  {l.role === 'manager' ? 'Franchise' : 'Admin'}
                </a>
              </motion.li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[13px] font-semibold">
            <Link href="/account" className="inline-flex items-center gap-1.5 hover:text-primary">
              {leagues.length > 4 ? `All ${leagues.length} leagues` : 'Manage leagues'} <Route size={14} />
            </Link>
            <Link href="/start" className="text-muted-foreground hover:text-foreground">Start another</Link>
          </div>
        </>
      )}
    </motion.div>
  );
}
