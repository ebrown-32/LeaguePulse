'use client';

/** Shared by the account page and the signed-in parts of the landing page. */

import { useCallback, useEffect, useState } from 'react';

export interface LeagueRow {
  slug: string; name: string; url: string; role: 'owner' | 'admin';
  logo: string | null; provider: 'sleeper' | 'espn';
  status: 'trialing' | 'active' | 'past_due' | 'canceled'; plan: 'monthly' | 'season'; tier?: 'standard' | 'ai'; comp: boolean; canBill: boolean;
  members: { userId: string; email: string; role: 'owner' | 'admin'; you: boolean }[];
  invites: { email: string; role: string }[];
}
export interface AccountData { account: { email: string | null; name: string | null; emailVerified: boolean }; operator?: boolean; leagues: LeagueRow[] }

export const STATUS: Record<LeagueRow['status'], { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'bg-primary' },
  trialing: { label: 'Free trial', dot: 'bg-[#2a78d6]' },
  past_due: { label: 'Payment failing', dot: 'bg-[hsl(var(--signal))]' },
  canceled: { label: 'Paused', dot: 'bg-muted-foreground/50' },
};

/** A league's own address: on the real domain, or <slug>.localhost when running locally. */
export function siteUrl(slug: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const { hostname, port, protocol } = window.location;
  return /^(localhost|127\.0\.0\.1)$/.test(hostname) ? `${protocol}//${slug}.localhost${port ? `:${port}` : ''}` : fallback;
}

export const openAdminHref = (slug: string) => `/api/platform/account/open?slug=${encodeURIComponent(slug)}`;

/** The signed-in user's leagues. `enabled` false skips the request (signed out). */
export function useMyLeagues(enabled = true) {
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/platform/account/leagues', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setData(d); else setError(d.error ?? 'Could not load your leagues');
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  return { data, error, reload: load };
}
