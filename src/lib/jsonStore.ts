/**
 * Generic JSON persistence: Redis when REDIS_URL is set, a local file otherwise.
 *
 * Same contract as lib/ai/store.ts, which predates this and keeps its own copy
 * so a change here cannot destabilise the AI feed. New callers should use this.
 *
 * Writes throw rather than swallow. On Vercel the filesystem is read-only, so a
 * deployment missing REDIS_URL would otherwise report success while persisting
 * nothing, which is the worst kind of failure: silent and invisible in the UI.
 */
import { promises as fs } from 'fs';
import path from 'path';

let redis: any = null;
try {
  const url = process.env.REDIS_URL;
  if (url && !url.includes('your-redis')) {
    const { createClient } = require('redis');
    redis = createClient({ url });
    redis.on('error', () => { redis = null; });
  }
} catch { /* fall back to file storage */ }

const DATA_DIR = path.join(process.cwd(), 'data');

export class StorageUnavailableError extends Error {
  constructor(cause: string) {
    super(
      `Storage is not writable (${cause}). On Vercel the filesystem is ` +
      `read-only, so REDIS_URL must be set or nothing will persist.`,
    );
    this.name = 'StorageUnavailableError';
  }
}

async function ensureDir() {
  try { await fs.access(DATA_DIR); } catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

async function connect(): Promise<void> {
  await Promise.race([
    redis.connect(),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('redis timeout')), 2000)),
  ]);
}

export async function readJson<T>(key: string, filename: string, fallback: T): Promise<T> {
  try {
    if (redis) {
      try { if (!redis.isOpen) await connect(); } catch { redis = null; }
    }
    if (redis) {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    }
    await ensureDir();
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, filename), 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, filename: string, value: unknown): Promise<void> {
  if (redis) {
    try {
      if (!redis.isOpen) await connect();
      await redis.set(key, JSON.stringify(value));
      return;
    } catch (err) {
      throw new StorageUnavailableError(
        `redis write failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  try {
    await ensureDir();
    await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(value, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new StorageUnavailableError(
      /EROFS|EACCES|read-only/i.test(msg) ? 'read-only filesystem and no REDIS_URL' : msg,
    );
  }
}

export function storageBackend(): 'redis' | 'file' {
  return redis ? 'redis' : 'file';
}
