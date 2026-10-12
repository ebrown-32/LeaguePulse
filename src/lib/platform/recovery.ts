/**
 * Getting a league owner back into their admin after a lost password.
 *
 * There is no email service, so the operator issues the way back in: a
 * one-time link, valid for a day, that sets a new admin password for one
 * league. The operator sends it to the owner after checking who they are (the
 * email on the Stripe customer is the obvious check).
 *
 * Only a hash of the token is stored, so the database alone cannot be used to
 * reset anyone's password, and a link is deleted the moment it is used.
 */

import { createHash, randomBytes } from 'node:crypto';
import { getRedis } from '@/lib/redisClient';
import { PLATFORM } from './config';

const TTL_SECONDS = 24 * 60 * 60;
/** Platform key, deliberately global (lp_tenant prefix is shared). */
const K = (hash: string) => `lp_tenant_recover:${hash}`;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

function redis() {
  const r = getRedis().client;
  if (!r) throw new Error('Storage is not configured');
  return r;
}

export async function issueRecoveryLink(slug: string): Promise<{ url: string; expiresAt: string }> {
  const token = randomBytes(24).toString('base64url');
  const until = Date.now() + TTL_SECONDS * 1000;
  await redis().set(K(digest(token)), JSON.stringify({ slug, until }), TTL_SECONDS);
  return {
    url: `https://${PLATFORM.rootDomain}/start/recover?token=${token}`,
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
  };
}

/** The league a token is for, without using it up. */
export async function recoverySlug(token: string): Promise<string | null> {
  if (!token) return null;
  const raw = await redis().get(K(digest(token)));
  if (!raw) return null;
  try {
    const { slug, until } = JSON.parse(raw) as { slug: string; until: number };
    if (Date.now() > until) { await redis().del(K(digest(token))); return null; }
    return slug;
  } catch {
    return null;
  }
}

/** Use a token: returns its league and deletes it, or null if it is not valid. */
export async function consumeRecovery(token: string): Promise<string | null> {
  const slug = await recoverySlug(token);
  if (slug) await redis().del(K(digest(token)));
  return slug;
}
