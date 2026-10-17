/**
 * A short-lived pass into one league's admin pages, for a signed-in member.
 *
 * The account page (on the product domain, where Clerk runs) mints it; the
 * league's admin page (on the league's subdomain, where Clerk does not run)
 * takes it in place of the admin password. Signed with a key derived from
 * LP_SECRETS_KEY, bound to one league and one user, valid for twelve hours,
 * and checked against the league's members on every use, so removing an admin
 * cuts off their pass straight away.
 *
 * The operator gets one into any league from the back office: bound to the
 * operator instead of a member (their email, or "secret" when they came in
 * with LP_OPERATOR_SECRET), valid for two hours, and checked against the
 * operator list on every use the same way.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { roleOf } from './members';

const PREFIX = 'lpt.';
const TTL_MS = 12 * 60 * 60 * 1000;
const OPERATOR_TTL_MS = 2 * 60 * 60 * 1000;

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

/** A pass for the operator, into any league: `who` is their operator email, or "secret". */
export function mintOperatorPass(slug: string, who: string): string {
  const body = Buffer.from(JSON.stringify({ s: slug, u: 'operator', op: who.toLowerCase(), e: Date.now() + OPERATOR_TTL_MS })).toString('base64url');
  return `${PREFIX}${body}.${sign(body)}`;
}

/** Where a league's admin lives: its own address, or <slug>.localhost on this port locally. */
export function leagueAdminUrl(slug: string, from: URL, rootDomain: string): string {
  // Locally that is whatever localhost port this runs on; anywhere else it
  // is always the configured root domain, never a host taken from headers.
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(from.host);
  return local ? `http://${slug}.localhost${from.port ? `:${from.port}` : ''}/admin` : `https://${slug}.${rootDomain}/admin`;
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
    const { s, u, e, op } = JSON.parse(Buffer.from(body, 'base64url').toString()) as { s: string; u: string; e: number; op?: string };
    if (s !== slug || Date.now() > e) return false;
    // The operator's: still an operator, by the same rules the back office uses.
    if (op) {
      const { operatorEmails } = await import('./operator');
      if (op === 'secret') return (process.env.LP_OPERATOR_SECRET?.trim().length ?? 0) >= 24;
      return operatorEmails().includes(op);
    }
    return Boolean(await roleOf(slug, u));
  } catch {
    return false;
  }
}
