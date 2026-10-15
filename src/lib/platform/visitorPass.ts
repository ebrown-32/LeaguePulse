/**
 * Who you are, on a league's site. League sites never load the account system
 * (lib/platform/account), so the product site vouches for a signed-in person
 * with this: a signed pass carrying their id, name and picture, handed over in
 * a URL fragment and kept by the league site in the browser for thirty days.
 *
 * It only says who someone is. What they may do on the site (admin, editing a
 * franchise) still takes its own pass, minted fresh for that purpose.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'lpv.';
export const VISITOR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Visitor { userId: string; name: string; image: string | null }

function key(): Buffer {
  const raw = process.env.LP_SECRETS_KEY?.trim();
  if (!raw) throw new Error('LP_SECRETS_KEY is not set');
  return createHmac('sha256', raw).update('lp-visitor-pass-v1').digest();
}
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url');

export function mintVisitorPass(v: Visitor): string {
  const body = Buffer.from(JSON.stringify({ u: v.userId, n: v.name.slice(0, 80), i: v.image, e: Date.now() + VISITOR_TTL_MS })).toString('base64url');
  return `${PREFIX}${body}.${sign(body)}`;
}

export function verifyVisitorPass(pass: string | null | undefined): Visitor | null {
  if (!pass?.startsWith(PREFIX)) return null;
  const [body, sig] = pass.slice(PREFIX.length).split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { u, n, i, e } = JSON.parse(Buffer.from(body, 'base64url').toString()) as { u: string; n: string; i: string | null; e: number };
    return Date.now() > e ? null : { userId: u, name: n, image: i };
  } catch {
    return null;
  }
}
