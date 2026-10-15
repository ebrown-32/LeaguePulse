/**
 * Franchises: a league's managers as lasting identities, and the people who
 * run them.
 *
 * A franchise is a manager as the provider knows them (a Sleeper user id, or
 * an ESPN member's id), across every season they played. Someone with a
 * LeaguePulse account can claim one; an admin of the league approves or
 * declines; a claim by one of the league's own admins is approved at once,
 * and an admin can invite someone by email, whose claim is approved when
 * they sign in with that address. Once approved they manage it: its logo,
 * color, motto and bio on its franchise page.
 *
 * One manager per franchise, and one franchise per account per league: a
 * person runs one team in a league, so they can manage only that one.
 *
 * Platform records (`lp_tenant*` keys, shared, not scoped to a league), like
 * members.ts: claims are made on the product site, which has no league context.
 *   lp_tenant_franchise_claims:<slug>            every claim, newest first
 *   lp_tenant_franchise:<slug>:<franchiseId>     a franchise's identity and manager
 *   lp_tenant_franchise_logo:<slug>:<franchiseId> its logo, as a data URI
 *   lp_tenant_franchise_user:<userId>            the franchises an account manages
 *   lp_tenant_franchise_invites:<slug>           invitations not yet taken up, one per franchise
 *   lp_tenant_franchise_ids:<slug>               every franchise with a record, so managers are
 *                                                listed from the franchises themselves, not the claims
 *
 * Server only.
 */

import { randomUUID } from 'node:crypto';
import { getRedis } from '@/lib/redisClient';
import { checkIdentity, type Claim, type ClaimStatus, type FranchiseIdentity } from './model';

export type { Claim, ClaimStatus, FranchiseIdentity } from './model';

const CLAIMS = (slug: string) => `lp_tenant_franchise_claims:${slug}`;
const F = (slug: string, id: string) => `lp_tenant_franchise:${slug}:${id}`;
const LOGO = (slug: string, id: string) => `lp_tenant_franchise_logo:${slug}:${id}`;
const USER = (userId: string) => `lp_tenant_franchise_user:${userId}`;
const INVITES = (slug: string) => `lp_tenant_franchise_invites:${slug}`;
const IDS = (slug: string) => `lp_tenant_franchise_ids:${slug}`;

export interface FranchiseInvite { franchiseId: string; teamName: string; email: string; invitedAt: string }

export interface Franchise extends FranchiseIdentity {
  franchiseId: string;
  /** The account that runs it, once a claim is approved. */
  manager: { userId: string; email: string; name: string } | null;
  logoVersion: string | null;
  updatedAt: string | null;
}

function redis() {
  const r = getRedis().client;
  if (!r) throw new Error('Storage is not configured');
  return r;
}
async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await redis().get(key);
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
const write = (key: string, v: unknown) => redis().set(key, JSON.stringify(v));

/** Save a franchise's record, and list it in the league's index. */
async function put(slug: string, f: Franchise): Promise<void> {
  await write(F(slug, f.franchiseId), f);
  const ids = await readJson<string[]>(IDS(slug), []);
  if (!ids.includes(f.franchiseId)) await write(IDS(slug), [...ids, f.franchiseId]);
}

/** Every franchise of the league that has a record: a manager, or an identity. */
export async function listFranchiseRecords(slug: string): Promise<Franchise[]> {
  const ids = await readJson<string[]>(IDS(slug), []);
  return [...(await getFranchises(slug, ids)).values()];
}

const blank = (franchiseId: string): Franchise => ({
  franchiseId, manager: null, logoVersion: null, updatedAt: null, color: null, motto: null, bio: null, stadiumName: null, look: null,
});

export const getClaims = (slug: string) => readJson<Claim[]>(CLAIMS(slug), []);
export const pendingClaims = async (slug: string) => (await getClaims(slug)).filter(c => c.status === 'pending');

export async function getFranchise(slug: string, franchiseId: string): Promise<Franchise> {
  return { ...blank(franchiseId), ...(await readJson<Partial<Franchise>>(F(slug, franchiseId), {})), franchiseId };
}

/** Every franchise of a league that has a manager or an identity, by id. */
export async function getFranchises(slug: string, ids: string[]): Promise<Map<string, Franchise>> {
  if (!ids.length) return new Map();
  const raw = await redis().mget(ids.map(id => F(slug, id)));
  return new Map(ids.map((id, i) => {
    let stored: Partial<Franchise> = {};
    try { stored = raw[i] ? JSON.parse(raw[i]!) : {}; } catch { /* blank */ }
    return [id, { ...blank(id), ...stored, franchiseId: id }];
  }));
}

/** The franchises an account manages, as slug and franchise id. */
export const franchisesOf = (userId: string) => readJson<{ slug: string; franchiseId: string }[]>(USER(userId), []);

/** The franchise this account manages in this league, if any. */
export async function managedIn(slug: string, userId: string): Promise<string | null> {
  return (await franchisesOf(userId)).find(x => x.slug === slug)?.franchiseId ?? null;
}

export type ClaimError = 'managed' | 'already' | 'has-team' | 'waiting-elsewhere';

/**
 * File a claim, approved at once when `approvedBy` says why (an admin of the
 * league claiming, or an invitation taken up). Refused when the franchise has
 * a manager, when this person already runs a team in the league, or when they
 * already have a claim waiting, on this franchise or another.
 */
export async function fileClaim(
  slug: string,
  c: { franchiseId: string; teamName: string; userId: string; email: string; name: string; note?: string },
  approvedBy?: string,
): Promise<Claim | ClaimError> {
  const f = await getFranchise(slug, c.franchiseId);
  if (f.manager) return f.manager.userId === c.userId ? 'already' : 'managed';
  if (await managedIn(slug, c.userId)) return 'has-team';
  const claims = await getClaims(slug);
  const waiting = claims.find(x => x.userId === c.userId && x.status === 'pending');
  if (waiting) return waiting.franchiseId === c.franchiseId ? 'already' : 'waiting-elsewhere';
  const claim: Claim = {
    id: randomUUID(), franchiseId: c.franchiseId, teamName: c.teamName.slice(0, 120), userId: c.userId,
    email: c.email.toLowerCase(), name: c.name.slice(0, 120), note: (c.note ?? '').trim().slice(0, 500) || null,
    status: 'pending', at: new Date().toISOString(), decidedAt: null, decidedBy: null,
  };
  await write(CLAIMS(slug), [claim, ...claims].slice(0, 500));
  if (approvedBy) {
    const done = await decideClaim(slug, claim.id, 'approved', approvedBy);
    if (typeof done === 'string') return done;
    return done ?? claim;
  }
  return claim;
}

/**
 * An admin's answer to a claim. Approving makes the claimant the franchise's
 * manager and declines any other claim waiting on it.
 */
export async function decideClaim(slug: string, claimId: string, decision: 'approved' | 'declined', by: string): Promise<Claim | 'has-team' | null> {
  const claims = await getClaims(slug);
  const claim = claims.find(c => c.id === claimId && c.status === 'pending');
  if (!claim) return null;
  // One franchise per account per league, however the claim came to be approved.
  if (decision === 'approved') {
    const theirs = await managedIn(slug, claim.userId);
    if (theirs && theirs !== claim.franchiseId) return 'has-team';
  }
  const now = new Date().toISOString();
  const decide = (c: Claim, status: ClaimStatus) => { c.status = status; c.decidedAt = now; c.decidedBy = by; };
  decide(claim, decision);
  if (decision === 'approved') {
    for (const c of claims) if (c !== claim && c.franchiseId === claim.franchiseId && c.status === 'pending') decide(c, 'declined');
    const f = await getFranchise(slug, claim.franchiseId);
    if (f.manager) await unlinkUser(f.manager.userId, slug, claim.franchiseId);
    await put(slug, { ...f, manager: { userId: claim.userId, email: claim.email, name: claim.name }, updatedAt: now });
    const mine = (await franchisesOf(claim.userId)).filter(x => !(x.slug === slug && x.franchiseId === claim.franchiseId));
    await write(USER(claim.userId), [...mine, { slug, franchiseId: claim.franchiseId }]);
  }
  await write(CLAIMS(slug), claims);
  return claim;
}

/** Take a franchise's manager away (the identity they set stays). */
export async function removeManager(slug: string, franchiseId: string): Promise<void> {
  const f = await getFranchise(slug, franchiseId);
  if (!f.manager) return;
  await unlinkUser(f.manager.userId, slug, franchiseId);
  await put(slug, { ...f, manager: null, updatedAt: new Date().toISOString() });
}

export const getInvites = (slug: string) => readJson<FranchiseInvite[]>(INVITES(slug), []);

/** Invite someone, by email, to manage a franchise. One invitation per franchise: a new one replaces the old. */
export async function inviteManager(slug: string, franchiseId: string, teamName: string, email: string): Promise<FranchiseInvite> {
  const invite = { franchiseId, teamName: teamName.slice(0, 120), email: email.trim().toLowerCase(), invitedAt: new Date().toISOString() };
  await write(INVITES(slug), [...(await getInvites(slug)).filter(i => i.franchiseId !== franchiseId), invite]);
  return invite;
}

export async function cancelInvite(slug: string, franchiseId: string): Promise<void> {
  await write(INVITES(slug), (await getInvites(slug)).filter(i => i.franchiseId !== franchiseId));
}

/** The invitation to this franchise for this (verified) email, if there is one. */
export async function inviteFor(slug: string, franchiseId: string, email: string | null): Promise<FranchiseInvite | null> {
  if (!email) return null;
  return (await getInvites(slug)).find(i => i.franchiseId === franchiseId && i.email === email.toLowerCase()) ?? null;
}

/** A person withdrawing their own pending claim. */
export async function withdrawClaim(slug: string, claimId: string, userId: string): Promise<boolean> {
  const claims = await getClaims(slug);
  const c = claims.find(x => x.id === claimId && x.userId === userId && x.status === 'pending');
  if (!c) return false;
  c.status = 'withdrawn'; c.decidedAt = new Date().toISOString(); c.decidedBy = userId;
  await write(CLAIMS(slug), claims);
  return true;
}

async function unlinkUser(userId: string, slug: string, franchiseId: string) {
  await write(USER(userId), (await franchisesOf(userId)).filter(x => !(x.slug === slug && x.franchiseId === franchiseId)));
}

/** The manager's edit of their franchise's identity. Returns an error message, or null when saved. */
export async function saveIdentity(slug: string, franchiseId: string, input: unknown): Promise<string | null> {
  const checked = checkIdentity(input);
  if (typeof checked === 'string') return checked;
  const f = await getFranchise(slug, franchiseId);
  await put(slug, { ...f, ...checked, updatedAt: new Date().toISOString() });
  return null;
}

export async function setLogo(slug: string, franchiseId: string, dataUri: string | null, version: string | null): Promise<void> {
  if (dataUri) await redis().set(LOGO(slug, franchiseId), dataUri); else await redis().del(LOGO(slug, franchiseId));
  const f = await getFranchise(slug, franchiseId);
  await put(slug, { ...f, logoVersion: version, updatedAt: new Date().toISOString() });
}

export const getLogo = (slug: string, franchiseId: string) => redis().get(LOGO(slug, franchiseId));

/** Everything about a league's franchises goes when the league does. */
export async function forgetLeagueFranchises(slug: string): Promise<void> {
  for (const c of await getClaims(slug)) {
    if (c.status === 'approved') await unlinkUser(c.userId, slug, c.franchiseId);
  }
  await redis().del(CLAIMS(slug));
  await redis().del(INVITES(slug));
}
