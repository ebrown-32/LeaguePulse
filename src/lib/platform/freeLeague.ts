/**
 * A league site made without Stripe: by the operator, for free.
 *
 * Used by the back office's "Add a league" and by sign-up when the operator
 * is the one signing up. Either way the league is active straight away, has
 * no subscription (the operator panel counts it as comp), and, when the
 * operator's account made it, belongs to that account from the first second.
 */

import { PLATFORM, slugify } from './config';
import { saveTenant, slugAvailability, tenantForLeague, type Tenant } from './tenants';
import type { Account } from './account';
import { parseEspnLeague } from '@/lib/providers/ids';

export type FreeLeagueResult =
  | { ok: true; tenant: Tenant; url: string }
  | { ok: false; status: number; error: string };

export async function createFreeLeague(o: {
  leagueId: string;
  name: string;
  slug?: string;
  owner: Account | null;
}): Promise<FreeLeagueResult> {
  const slug = slugify(o.slug || o.name || '');
  const existing = await tenantForLeague(o.leagueId);
  if (existing && existing.status !== 'canceled') {
    return { ok: false, status: 409, error: `That league already lives at ${existing.slug}.${PLATFORM.rootDomain}.` };
  }
  const avail = await slugAvailability(slug, o.leagueId);
  if (!avail.ok) return { ok: false, status: 409, error: `The address "${slug}" is ${avail.reason}.` };

  const now = new Date().toISOString();
  const tenant: Tenant = {
    slug, leagueId: o.leagueId, leagueName: o.name.slice(0, 200),
    status: 'active', plan: 'season', ownerEmail: o.owner?.email ?? null,
    stripeCustomerId: null, stripeSubscriptionId: null, createdAt: now, updatedAt: now,
  };
  await saveTenant(tenant);

  // ESPN cookies given at sign-up are kept for two days unless a site is made.
  const espn = parseEspnLeague(o.leagueId);
  if (espn) {
    const { keepEspnCredentials } = await import('@/lib/providers/espn/credentials');
    await keepEspnCredentials(espn.leagueId);
  }
  if (o.owner) {
    const { addMember } = await import('./members');
    await addMember(slug, { userId: o.owner.userId, email: o.owner.email ?? '', role: 'owner' });
  }
  return { ok: true, tenant, url: `https://${slug}.${PLATFORM.rootDomain}` };
}
