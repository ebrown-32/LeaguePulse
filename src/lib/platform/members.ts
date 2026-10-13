/**
 * Who can run a hosted league: its owner (who pays) and admins the owner
 * invites. Accounts are Clerk users; this is the link between a Clerk user id
 * and the leagues they can manage.
 *
 * Platform records, so `lp_tenant*` keys (shared, not scoped to a league):
 *   lp_tenant_members:<slug>        the league's members
 *   lp_tenant_user:<userId>         the slugs a user belongs to
 *   lp_tenant_invites:<slug>        emails invited and not yet signed in
 *   lp_tenant_invited:<email>       the slugs an email has been invited to
 *
 * Invites need no email service: an invited person signs in to the product
 * site with that address, and the league appears in their account. Clerk
 * verifies the address before it counts.
 */

import { getRedis } from '@/lib/redisClient';
import { listTenants } from './tenants';

export type Role = 'owner' | 'admin';
export interface Member { userId: string; email: string; role: Role; addedAt: string }
export interface Invite { email: string; role: Role; invitedAt: string; invitedBy: string }

const M = (slug: string) => `lp_tenant_members:${slug}`;
const U = (userId: string) => `lp_tenant_user:${userId}`;
const I = (slug: string) => `lp_tenant_invites:${slug}`;
const E = (email: string) => `lp_tenant_invited:${email.toLowerCase()}`;

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

export const getMembers = (slug: string) => readJson<Member[]>(M(slug), []);
export const getInvites = (slug: string) => readJson<Invite[]>(I(slug), []);
export const slugsForUser = (userId: string) => readJson<string[]>(U(userId), []);

export async function roleOf(slug: string, userId: string): Promise<Role | null> {
  return (await getMembers(slug)).find(m => m.userId === userId)?.role ?? null;
}

export async function addMember(slug: string, m: Omit<Member, 'addedAt'>): Promise<void> {
  const members = (await getMembers(slug)).filter(x => x.userId !== m.userId);
  // One owner at a time: adding a new owner makes any previous one an admin.
  if (m.role === 'owner') for (const x of members) if (x.role === 'owner') x.role = 'admin';
  members.push({ ...m, email: m.email.toLowerCase(), addedAt: new Date().toISOString() });
  await write(M(slug), members);
  const slugs = new Set(await slugsForUser(m.userId)); slugs.add(slug);
  await write(U(m.userId), [...slugs]);
}

export async function removeMember(slug: string, userId: string): Promise<void> {
  await write(M(slug), (await getMembers(slug)).filter(x => x.userId !== userId));
  await write(U(userId), (await slugsForUser(userId)).filter(s => s !== slug));
}

export async function addInvite(slug: string, email: string, invitedBy: string, role: Role = 'admin'): Promise<void> {
  const e = email.trim().toLowerCase();
  const invites = (await getInvites(slug)).filter(x => x.email !== e);
  invites.push({ email: e, role, invitedAt: new Date().toISOString(), invitedBy });
  await write(I(slug), invites);
  const slugs = new Set(await readJson<string[]>(E(e), [])); slugs.add(slug);
  await write(E(e), [...slugs]);
}

export async function removeInvite(slug: string, email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  await write(I(slug), (await getInvites(slug)).filter(x => x.email !== e));
  await write(E(e), (await readJson<string[]>(E(e), [])).filter(s => s !== slug));
}

/** Everything about a league's people goes when the league does. */
export async function forgetLeague(slug: string): Promise<void> {
  for (const m of await getMembers(slug)) await write(U(m.userId), (await slugsForUser(m.userId)).filter(s => s !== slug));
  for (const i of await getInvites(slug)) await write(E(i.email), (await readJson<string[]>(E(i.email), [])).filter(s => s !== slug));
  await redis().del(M(slug));
  await redis().del(I(slug));
}

/**
 * Link a signed-in user to the leagues that are theirs but not yet linked:
 * invites to their verified email, and leagues bought with that email at
 * checkout before accounts existed (no owner yet). Returns their slugs.
 */
export async function claimForUser(userId: string, verifiedEmail: string | null): Promise<string[]> {
  if (verifiedEmail) {
    const email = verifiedEmail.toLowerCase();
    for (const slug of await readJson<string[]>(E(email), [])) {
      const invite = (await getInvites(slug)).find(x => x.email === email);
      if (invite && !(await roleOf(slug, userId))) await addMember(slug, { userId, email, role: invite.role });
      await removeInvite(slug, email);
    }
    for (const t of await listTenants()) {
      if (t.ownerEmail?.toLowerCase() !== email) continue;
      const members = await getMembers(t.slug);
      if (!members.some(m => m.role === 'owner')) await addMember(t.slug, { userId, email, role: 'owner' });
    }
  }
  return slugsForUser(userId);
}
