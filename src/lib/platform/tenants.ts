/**
 * The hosted product's registry: which league lives at which address, who
 * pays for it, and whether it is active.
 *
 * Platform records, so deliberately global keys (`lp_tenant:<slug>`), not the
 * per-league ones a league's own data will use. One league has at most one
 * site, so a second lookup key maps the Sleeper league id back to its slug.
 */

import { getRedis } from '@/lib/redisClient';
import { validSlug, RESERVED_SLUGS } from './config';
import { parseEspnLeague } from '@/lib/providers/ids';

export type TenantStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface Tenant {
  slug: string;
  /**
   * The league the site was created from (the season current then): a Sleeper
   * league id, or an ESPN one in the form espn-<league>-<season> (see
   * src/lib/providers/ids.ts).
   */
  leagueId: string;
  leagueName: string;
  status: TenantStatus;
  plan: 'monthly' | 'season';
  /** League Pass ('standard', also when absent) or League Pass + AI ('ai'). */
  tier?: 'standard' | 'ai';
  /**
   * How its AI runs, when the operator has said otherwise than its plan (see
   * aiMode below): never set by billing, so a Stripe event can't undo it.
   */
  aiOverride?: AiMode;
  /** When its Stripe trial ends, while it is in one. */
  trialEndsAt?: string | null;
  ownerEmail: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

import type { AiMode } from './plan';
export { aiMode, billedAiMode, type AiMode } from './plan';

const T = (slug: string) => `lp_tenant:${slug}`;
/**
 * A Sleeper league id as is. An ESPN league without its season: ESPN keeps
 * one id for every season, so a site made from one season is that league's
 * site in every other season too.
 */
export function leagueRegistryKey(leagueId: string): string {
  const espn = parseEspnLeague(leagueId);
  return espn ? `espn-${espn.leagueId}` : leagueId;
}
const L = (leagueId: string) => `lp_tenant_league:${leagueRegistryKey(leagueId)}`;
/** A short hold on an address while its buyer is at checkout. */
const H = (slug: string) => `lp_slug_hold:${slug}`;
/** Every league's slug, for work that runs across all of them. */
const INDEX = 'lp_tenant_index';
/** Longer than a checkout session lives (31 minutes), so the hold always outlasts it. */
const HOLD_MS = 35 * 60 * 1000;

function redis() {
  const r = getRedis().client;
  if (!r) throw new Error('The hosted product needs Redis (UPSTASH_REDIS_REST_URL and token, or KV_REST_API_URL and token from a Vercel Marketplace install).');
  return r;
}

export async function getTenant(slug: string): Promise<Tenant | null> {
  const raw = await redis().get(T(slug));
  return raw ? (JSON.parse(raw) as Tenant) : null;
}

export async function tenantForLeague(leagueId: string): Promise<Tenant | null> {
  const slug = await redis().get(L(leagueId));
  return slug ? getTenant(slug) : null;
}

export async function saveTenant(t: Tenant): Promise<void> {
  const r = redis();
  await r.set(T(t.slug), JSON.stringify({ ...t, updatedAt: new Date().toISOString() }));
  await r.set(L(t.leagueId), t.slug);
  // A read, modify and write, which two signups landing in the same instant
  // could race, dropping one from the index. Every later save of that league
  // (each Stripe status update) adds it back, and only the scheduler reads the
  // index, so the cost of a race is a skipped AI run or two, not lost data.
  const slugs = new Set<string>(JSON.parse((await r.get(INDEX)) ?? '[]'));
  if (!slugs.has(t.slug)) { slugs.add(t.slug); await r.set(INDEX, JSON.stringify([...slugs])); }
}

/** Every league on the platform. */
export async function listTenants(): Promise<Tenant[]> {
  const slugs: string[] = JSON.parse((await redis().get(INDEX)) ?? '[]');
  const all = await Promise.all(slugs.map(getTenant));
  return all.filter((t): t is Tenant => Boolean(t));
}

/** Leagues whose subscription is live: on trial, paid, or in a payment retry. */
export const isLive = (t: Tenant) => t.status === 'trialing' || t.status === 'active' || t.status === 'past_due';

/** Remove a league from the registry. Its own data, under t:<slug>:, is left for an operator to purge. */
export async function deleteTenant(slug: string): Promise<void> {
  const r = redis();
  const t = await getTenant(slug);
  await r.del(T(slug));
  if (t) await r.del(L(t.leagueId));
  const slugs = (JSON.parse((await r.get(INDEX)) ?? '[]') as string[]).filter(s => s !== slug);
  await r.set(INDEX, JSON.stringify(slugs));
}

/**
 * Whether an address can be taken, and why not.
 * `forLeague` lets the league that is holding it carry on through checkout.
 */
export async function slugAvailability(slug: string, forLeague?: string): Promise<
  { ok: true } | { ok: false; reason: 'invalid' | 'reserved' | 'taken' | 'held' }
> {
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: 'reserved' };
  if (!validSlug(slug)) return { ok: false, reason: 'invalid' };
  const r = redis();
  if (await r.get(T(slug))) return { ok: false, reason: 'taken' };
  const hold = await r.get(H(slug));
  if (hold) {
    const h = JSON.parse(hold) as { leagueId: string; until: number };
    if (h.until > Date.now() && h.leagueId !== forLeague) return { ok: false, reason: 'held' };
  }
  return { ok: true };
}

export async function holdSlug(slug: string, leagueId: string): Promise<void> {
  await redis().set(H(slug), JSON.stringify({ leagueId, until: Date.now() + HOLD_MS }));
}
