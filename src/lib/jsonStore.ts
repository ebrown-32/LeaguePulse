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
import { getRedis } from './redisClient';

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

export async function readJson<T>(key: string, filename: string, fallback: T): Promise<T> {
  try {
    const { client } = getRedis();
    if (client) {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    }
    await ensureDir();
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, filename), 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, filename: string, value: unknown): Promise<void> {
  const { client, backend } = getRedis();
  if (client) {
    try {
      await client.set(key, JSON.stringify(value));
      return;
    } catch (err) {
      throw new StorageUnavailableError(
        `${backend} write failed: ${err instanceof Error ? err.message : err}`,
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

export function storageBackend(): string {
  const { backend } = getRedis();
  return backend === 'none' ? 'file' : backend;
}
