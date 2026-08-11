/**
 * Server-only persistence for AI posts and admin-defined personalities.
 *
 * Mirrors themeStorage.ts: Redis when REDIS_URL is present (production), a
 * JSON file otherwise (local dev). Posts must persist because they're written
 * on a schedule and read later — nothing is generated at page-view time.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_PERSONALITIES, type Personality } from './personalities';

export interface FeedPost {
  id: string;
  personalityId: string;
  personaName: string;
  personaHandle: string;
  personaAccent: string;
  kind: 'article' | 'tweet' | 'comment' | 'tradeGrade';
  content: any;
  /** When it was generated. */
  createdAt: string;
  /** When readers should first see it. The daily cron writes a whole batch at
   *  once and staggers these across the following day, so a single scheduled
   *  run still produces a feed that trickles in rather than dumping. */
  publishAt: string;
  /** 'cron' when auto-posted, 'admin' when produced from the back office. */
  source: 'cron' | 'admin';
}

const MAX_POSTS = 300;

let redis: any = null;
try {
  const url = process.env.REDIS_URL;
  if (url && !url.includes('your-redis')) {
    const { createClient } = require('redis');
    redis = createClient({ url });
    redis.on('error', () => { redis = null; });
  }
} catch { /* fall back to file storage */ }

const DATA_DIR   = path.join(process.cwd(), 'data');
const POSTS_FILE = path.join(DATA_DIR, 'ai-posts.json');
const PEOPLE_FILE = path.join(DATA_DIR, 'ai-personalities.json');
const POSTS_KEY  = 'lp_ai_posts';
const PEOPLE_KEY = 'lp_ai_personalities';

async function ensureDir() {
  try { await fs.access(DATA_DIR); } catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

async function connect(): Promise<void> {
  await Promise.race([
    redis.connect(),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('redis timeout')), 2000)),
  ]);
}

async function readJson<T>(key: string, file: string, fallback: T): Promise<T> {
  try {
    if (redis) {
      try { if (!redis.isOpen) await connect(); } catch { redis = null; }
    }
    if (redis) {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) as T : fallback;
    }
    await ensureDir();
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class StorageUnavailableError extends Error {
  constructor(cause: string) {
    super(
      `AI storage is not writable (${cause}). On Vercel the filesystem is ` +
      `read-only, so REDIS_URL must be set or nothing will persist.`,
    );
    this.name = 'StorageUnavailableError';
  }
}

/**
 * Throws rather than swallowing. This used to log and return, which meant a
 * deployment without REDIS_URL reported "posted: true" while writing nothing
 * at all: the worst kind of failure, silent and invisible in the UI.
 */
async function writeJson(key: string, file: string, value: unknown): Promise<void> {
  if (redis) {
    try {
      if (!redis.isOpen) await connect();
      await redis.set(key, JSON.stringify(value));
      return;
    } catch (err) {
      throw new StorageUnavailableError(`redis write failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  try {
    await ensureDir();
    await fs.writeFile(file, JSON.stringify(value, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // EROFS / EACCES is the read-only serverless filesystem.
    // Distinguish "never configured" from "configured but the connection
    // dropped". The singleton above nulls itself on any Redis error, so
    // reaching here with REDIS_URL set means the connection failed, not that
    // it was missing. Reporting the latter sends you debugging the wrong thing.
    const readOnly = /EROFS|EACCES|read-only/i.test(msg);
    const configured = Boolean(process.env.REDIS_URL?.trim());
    throw new StorageUnavailableError(
      !readOnly ? msg
        : configured
          ? 'REDIS_URL is set but the Redis connection failed, so writes fell back to the ' +
            'read-only filesystem. Run the diagnostics in /admin/ai-desk for the exact error.'
          : 'read-only filesystem and no REDIS_URL',
    );
  }
}

/** Which backend is live, and can we actually write to it. */
export async function storageHealth(): Promise<{ backend: 'redis' | 'file'; writable: boolean; detail?: string }> {
  const backend = redis ? 'redis' : 'file';
  try {
    const probe = await readJson<unknown>(POSTS_KEY, POSTS_FILE, []);
    await writeJson(POSTS_KEY, POSTS_FILE, probe);
    return { backend, writable: true };
  } catch (err) {
    return { backend, writable: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// ── Posts ──────────────────────────────────────────────────────────────────

export async function getPosts(limit = 60): Promise<FeedPost[]> {
  const all = await readJson<FeedPost[]>(POSTS_KEY, POSTS_FILE, []);
  const now = Date.now();
  return all
    .filter(p => new Date(p.publishAt ?? p.createdAt).getTime() <= now)
    .sort((a, b) =>
      new Date(b.publishAt ?? b.createdAt).getTime() - new Date(a.publishAt ?? a.createdAt).getTime())
    .slice(0, limit);
}

/** Posts written but not yet visible. Surfaced in the admin panel so the queue
 *  is not invisible. */
export async function getQueuedCount(): Promise<number> {
  const all = await readJson<FeedPost[]>(POSTS_KEY, POSTS_FILE, []);
  const now = Date.now();
  return all.filter(p => new Date(p.publishAt ?? p.createdAt).getTime() > now).length;
}

export async function addPost(post: FeedPost): Promise<void> {
  const all = await readJson<FeedPost[]>(POSTS_KEY, POSTS_FILE, []);
  all.unshift(post);
  await writeJson(POSTS_KEY, POSTS_FILE, all.slice(0, MAX_POSTS));
}

export async function deletePost(id: string): Promise<void> {
  const all = await readJson<FeedPost[]>(POSTS_KEY, POSTS_FILE, []);
  await writeJson(POSTS_KEY, POSTS_FILE, all.filter(p => p.id !== id));
}

/** Generation time of the most recently written post, so a re-triggered cron
 *  does not produce a second batch on the same day. */
export async function lastGeneratedAt(): Promise<number> {
  const all = await readJson<FeedPost[]>(POSTS_KEY, POSTS_FILE, []);
  return all.reduce((max, p) => Math.max(max, new Date(p.createdAt).getTime()), 0);
}

/** Latest scheduled publish time, so a new batch queues after the last one. */
export async function lastPublishAt(): Promise<number> {
  const all = await readJson<FeedPost[]>(POSTS_KEY, POSTS_FILE, []);
  return all.reduce((max, p) => Math.max(max, new Date(p.publishAt ?? p.createdAt).getTime()), 0);
}

// ── Personalities ──────────────────────────────────────────────────────────

export async function getPersonalities(): Promise<Personality[]> {
  const saved = await readJson<Personality[] | null>(PEOPLE_KEY, PEOPLE_FILE, null);
  return saved?.length ? saved : DEFAULT_PERSONALITIES;
}

export async function savePersonalities(list: Personality[]): Promise<void> {
  await writeJson(PEOPLE_KEY, PEOPLE_FILE, list);
}
