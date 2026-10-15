/**
 * A short-lived pass that lets a franchise's manager edit it on the league's
 * site, which signs no one in itself (see lib/platform/adminPass, the same
 * idea for admins). Minted on the product site for a signed-in account that
 * manages the franchise; carried in the URL fragment; checked on every save
 * against who manages the franchise now, so removing a manager ends it at once.
 *
 * A different key from the admin pass: one can never stand in for the other.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getFranchise } from './store';

const PREFIX = 'lpm.';
const TTL_MS = 12 * 60 * 60 * 1000;

function key(): Buffer {
  const raw = process.env.LP_SECRETS_KEY?.trim();
  if (!raw) throw new Error('LP_SECRETS_KEY is not set');
  return createHmac('sha256', raw).update('lp-manager-pass-v1').digest();
}
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url');

export function mintManagerPass(slug: string, franchiseId: string, userId: string): string {
  const body = Buffer.from(JSON.stringify({ s: slug, f: franchiseId, u: userId, e: Date.now() + TTL_MS })).toString('base64url');
  return `${PREFIX}${body}.${sign(body)}`;
}

/** Whether `pass` lets its holder edit this franchise of this league right now. */
export async function verifyManagerPass(pass: string | null | undefined, slug: string, franchiseId: string): Promise<boolean> {
  if (!pass?.startsWith(PREFIX)) return false;
  const [body, sig] = pass.slice(PREFIX.length).split('.');
  if (!body || !sig) return false;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try {
    const { s, f, u, e } = JSON.parse(Buffer.from(body, 'base64url').toString()) as { s: string; f: string; u: string; e: number };
    if (s !== slug || f !== franchiseId || Date.now() > e) return false;
    return (await getFranchise(slug, franchiseId)).manager?.userId === u;
  } catch {
    return false;
  }
}
