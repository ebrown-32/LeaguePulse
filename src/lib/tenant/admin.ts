/**
 * Who may change a league's settings.
 *
 * One check for every admin route. There were twelve copies, and they
 * disagreed: most fell back to a default password when none was set, four
 * left their endpoint open to anyone, and none compared in constant time.
 *
 *   Self-hosted: the request's `x-admin-password` must match ADMIN_PASSWORD.
 *     With none set, the development default "admin123" applies, as it did
 *     for most routes before; set a real one before going public.
 *
 *   Hosted: each league has its own admin password, set once by whoever paid
 *     for the league (see /api/platform/claim). Stored as a salted scrypt hash
 *     under the league's own storage prefix, so it can never be read as a
 *     password and can never answer for another league.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getRedis } from '@/lib/redisClient';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Stored under the league's prefix by the scoped Redis client. */
const KEY = 'lp_admin_auth';
const hosted = () => process.env.LP_HOSTED === '1';

function sameBytes(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function hash(password: string, salt = randomBytes(16)): Promise<string> {
  const key = await scrypt(password, salt, 32);
  return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`;
}

async function verify(password: string, stored: string): Promise<boolean> {
  const [algo, salt, key] = stored.split(':');
  if (algo !== 'scrypt' || !salt || !key) return false;
  const computed = await hash(password, Buffer.from(salt, 'base64'));
  return sameBytes(computed, stored);
}

/** Whether a league admin password has been set. Hosted only. */
export async function adminPasswordSet(): Promise<boolean> {
  const r = getRedis().client;
  return Boolean(r && (await r.get(KEY)));
}

/** Set the league's admin password. Callers must already have proven the right to. */
export async function setAdminPassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  const r = getRedis().client;
  if (!r) throw new Error('Storage is not configured');
  await r.set(KEY, await hash(password));
}

/** Check a password for the current league. */
export async function isAdminPassword(given: string | null | undefined): Promise<boolean> {
  if (!given) return false;
  if (!hosted()) {
    return sameBytes(given, process.env.ADMIN_PASSWORD?.trim() || 'admin123');
  }
  // A member signed in on the product site arrives with a pass instead of
  // the password (see lib/platform/adminPass).
  const { looksLikeAdminPass, verifyAdminPass } = await import('@/lib/platform/adminPass');
  if (looksLikeAdminPass(given)) {
    const { currentTenant } = await import('./context');
    const t = await currentTenant();
    return t ? verifyAdminPass(given, t.slug) : false;
  }
  const r = getRedis().client;
  const stored = r ? await r.get(KEY) : null;
  return stored ? verify(given, stored) : false;
}

/** Wrong guesses allowed per IP, per league, before a 15 minute lockout. */
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Check a password from a request, counting wrong ones. After ten wrong
 * guesses from one IP the league's admin is closed to that IP for fifteen
 * minutes, even for the right password, so it cannot be guessed online.
 */
export async function checkAdmin(req: Request, given: string | null | undefined): Promise<boolean> {
  if (!given) return false;
  const { clientIp, tooManyFailures, recordFailure } = await import('@/lib/ai/rateLimit');
  const ip = clientIp(req);
  if (await tooManyFailures('lp_admin_fail_', ip, MAX_FAILURES)) return false;
  const ok = await isAdminPassword(given);
  if (!ok) await recordFailure('lp_admin_fail_', ip, LOCKOUT_MS);
  return ok;
}

/** The standard check for an admin request. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  return checkAdmin(req, req.headers.get('x-admin-password'));
}
