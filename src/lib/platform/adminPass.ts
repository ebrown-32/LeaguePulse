/**
 * A short-lived pass into one league's admin pages, for a signed-in member.
 *
 * The account page (on the product domain, where Clerk runs) mints it; the
 * league's admin page (on the league's subdomain, where Clerk does not run)
 * takes it in place of the admin password. Signed with a key derived from
 * LP_SECRETS_KEY, bound to one league and one user, valid for twelve hours,
 * and checked against the league's members on every use, so removing an admin
 * cuts off their pass straight away.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { roleOf } from './members';

const PREFIX = 'lpt.';
const TTL_MS = 12 * 60 * 60 * 1000;

function key(): Buffer {
  const raw = process.env.LP_SECRETS_KEY?.trim();
  if (!raw) throw new Error('LP_SECRETS_KEY is not set');
  return createHmac('sha256', raw).update('lp-admin-pass-v1').digest();
}
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url');

export function mintAdminPass(slug: string, userId: string): string {
  const body = Buffer.from(JSON.stringify({ s: slug, u: userId, e: Date.now() + TTL_MS })).toString('base64url');
  return `${PREFIX}${body}.${sign(body)}`;
}

export const looksLikeAdminPass = (v: string) => v.startsWith(PREFIX);

/** Whether `pass` lets its holder administer `slug` right now. */
export async function verifyAdminPass(pass: string, slug: string): Promise<boolean> {
  if (!looksLikeAdminPass(pass)) return false;
  const [body, sig] = pass.slice(PREFIX.length).split('.');
  if (!body || !sig) return false;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try {
    const { s, u, e } = JSON.parse(Buffer.from(body, 'base64url').toString()) as { s: string; u: string; e: number };
    if (s !== slug || Date.now() > e) return false;
    return Boolean(await roleOf(slug, u));
  } catch {
    return false;
  }
}
