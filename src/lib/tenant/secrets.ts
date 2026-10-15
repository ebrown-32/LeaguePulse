/**
 * A league's own API keys, on the hosted product.
 *
 * Each league brings its own Anthropic key and pays Anthropic directly for its
 * AI, and its own FantasyPros key for expert rankings (FantasyPros grants keys
 * to people, for their own use, and a free key's 50 requests a day cover one
 * league). Self-hosted copies keep using ANTHROPIC_API_KEY and FANTASY_PROS
 * from the environment, unchanged: secrets there stay env-only, deliberately.
 *
 * ── How a key is kept ────────────────────────────────────────────────────────
 *
 * Encrypted with AES-256-GCM under LP_SECRETS_KEY, a platform key that lives
 * only in the deployment's environment, and stored under the league's own
 * storage prefix. A copy of the database alone reveals no key. A key is
 * written by an admin of that league and read only by the server when it
 * calls Anthropic; no route ever returns it, only a fingerprint (first four,
 * last two characters) so an admin can tell which key is set.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getRedis } from '@/lib/redisClient';

const KEY = 'lp_secrets';

interface Stored { anthropic?: string; fantasypros?: string }
type Which = keyof Stored;

function masterKey(): Buffer {
  const raw = process.env.LP_SECRETS_KEY?.trim();
  if (!raw) throw new Error('LP_SECRETS_KEY is not set. Generate one with: openssl rand -base64 32');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('LP_SECRETS_KEY must be 32 bytes, base64 encoded.');
  return key;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

export function decrypt(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(':');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
}

/** Same shape the diagnostics panel already uses: never enough to reuse. */
export function fingerprint(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-2)}` : '…';
}

async function read(): Promise<Stored> {
  const raw = await getRedis().client?.get(KEY);
  return raw ? (JSON.parse(raw) as Stored) : {};
}

async function getKey(which: Which): Promise<string | null> {
  const sealed = (await read())[which];
  if (!sealed) return null;
  try { return decrypt(sealed); } catch { return null; }
}

async function setKey(which: Which, key: string | null): Promise<void> {
  const r = getRedis().client;
  if (!r) throw new Error('Storage is not configured');
  const next = { ...(await read()) };
  if (key) next[which] = encrypt(key); else delete next[which];
  await r.set(KEY, JSON.stringify(next));
}

/** The league's Anthropic key, decrypted, or null. Server use only. */
export const tenantAnthropicKey = () => getKey('anthropic');
export const setTenantAnthropicKey = (key: string | null) => setKey('anthropic', key);

/** The league's FantasyPros key, for its expert rankings. Server use only. */
export const tenantFantasyProsKey = () => getKey('fantasypros');
export const setTenantFantasyProsKey = (key: string | null) => setKey('fantasypros', key);
/** Whether the league has a FantasyPros key, without decrypting it: cheap enough for every page. */
export const hasTenantFantasyProsKey = async () => Boolean((await read()).fantasypros);
