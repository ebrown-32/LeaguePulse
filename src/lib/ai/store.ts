/**
 * Server-only persistence for AI posts and admin-defined personalities.
 *
 * Mirrors themeStorage.ts: Redis when REDIS_URL is present (production), a
 * JSON file otherwise (local dev). Posts must persist because they're written
 * on a schedule and read later — nothing is generated at page-view time.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { getRedis, isRedisConfigured } from '../redisClient';
import { DEFAULT_PERSONALITIES, type Personality, type ContentKind } from './personalities';

export interface FeedPost {
  id: string;
  personalityId: string;
  personaName: string;
  personaHandle: string;
  personaAccent: string;
  /** Media or fan, so the feed can separate writers from the group chat. */
  personaType?: 'media' | 'fan';
  /** Resolved DiceBear URL, stored with the post so an avatar change does not
   *  retroactively restyle old bylines. */
  personaAvatar?: string;
  kind: 'article' | 'tweet' | 'comment' | 'tradeGrade' | 'powerRankings' | 'predictions'
      | 'matchupPreview' | 'kickoff' | 'liveTake';
  content: any;
  /** When it was generated. */
  createdAt: string;
  /** When readers should first see it. The daily cron writes a whole batch at
   *  once and staggers these across the following day, so a single scheduled
   *  run still produces a feed that trickles in rather than dumping. */
  publishAt: string;
  /** 'cron' when auto-posted, 'admin' when produced from the back office. */
  source: 'cron' | 'admin';
  /** The team a piece was commissioned about, so coverage can be rotated
   *  around the league instead of piling onto whoever is most newsworthy. */
  subject?: string;
}

/**
 * How many posts the feed keeps.
 *
 * Everything past this is dropped on the next write. The whole record lives in
 * one Redis value, so an unbounded feed is a value that grows forever and a
 * payload that gets slower to read on every publish.
 */
const MAX_POSTS = 100;

const DATA_DIR   = path.join(process.cwd(), 'data');
const POSTS_FILE = path.join(DATA_DIR, 'ai-posts.json');
const PEOPLE_FILE = path.join(DATA_DIR, 'ai-personalities.json');
const POSTS_KEY  = 'lp_ai_posts';
const PEOPLE_KEY = 'lp_ai_personalities';

async function ensureDir() {
  try { await fs.access(DATA_DIR); } catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

async function readJson<T>(key: string, file: string, fallback: T): Promise<T> {
  try {
    const { client } = getRedis();
    if (client) {
      const raw = await client.get(key);
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
  const { client, backend } = getRedis();
  if (client) {
    try {
      await client.set(key, JSON.stringify(value));
      return;
    } catch (err) {
      throw new StorageUnavailableError(
        `${backend} write failed: ${err instanceof Error ? err.message : err}`);
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
    const configured = isRedisConfigured();
    throw new StorageUnavailableError(
      !readOnly ? msg
        : configured
          ? 'Redis is configured but the connection failed, so writes fell back to the ' +
            'read-only filesystem. Run the diagnostics in /admin/ai-desk for the exact error.'
          : 'read-only filesystem and no Redis configured',
    );
  }
}

/** Which backend is live, and can we actually write to it. */
export async function storageHealth(): Promise<{ backend: string; writable: boolean; detail?: string }> {
  const { backend, reason } = getRedis();
  const label = backend === 'none' ? 'file' : backend;
  try {
    const probe = await readJson<unknown>(POSTS_KEY, POSTS_FILE, []);
    await writeJson(POSTS_KEY, POSTS_FILE, probe);
    return { backend: label, writable: true };
  } catch (err) {
    return {
      backend: label,
      writable: false,
      detail: (reason ? `${reason} ` : '') + (err instanceof Error ? err.message : String(err)),
    };
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

/** Subjects of recent pieces, newest first. Used to spread coverage. */
export async function getRecentSubjects(limit = 30): Promise<string[]> {
  const all = await readJson<FeedPost[]>(POSTS_KEY, POSTS_FILE, []);
  return all
    .slice(0, limit)
    .map(p => p.subject)
    .filter((s): s is string => Boolean(s));
}

// ── Assistant ──────────────────────────────────────────────────────────────

export interface AssistantConfig {
  /** Shown in the chat header and used by the model to refer to itself. */
  name: string;
}

const ASSISTANT_KEY = 'lp_ai_assistant';
const ASSISTANT_FILE = 'ai-assistant.json';

export const DEFAULT_ASSISTANT: AssistantConfig = { name: 'Captain Mike' };

export async function getAssistant(): Promise<AssistantConfig> {
  const saved = await readJson<AssistantConfig | null>(ASSISTANT_KEY, ASSISTANT_FILE, null);
  const name = saved?.name?.trim();
  return name ? { name } : DEFAULT_ASSISTANT;
}

export async function saveAssistant(config: AssistantConfig): Promise<void> {
  await writeJson(ASSISTANT_KEY, ASSISTANT_FILE, {
    name: config.name.trim().slice(0, 40) || DEFAULT_ASSISTANT.name,
  });
}

// ── Personalities ──────────────────────────────────────────────────────────

/** Kinds added after personalities were first persisted. Anything saved before
 *  they existed cannot have opted in, so they are granted to whoever already
 *  writes long-form. Pre-existing kinds are left exactly as saved, so an admin
 *  who deliberately unchecked one keeps that choice. */
const NEW_KINDS: ContentKind[] = [
  'powerRankings', 'predictions', 'matchupPreview', 'kickoff', 'liveTake',
];

/**
 * Drops saved entries that a current default has replaced.
 *
 * When a character is re-homed under a new id the old entry is left behind
 * holding the same person, so the cast ends up with two writers sharing a name
 * and a handle. Those leftovers are removed outright rather than kept and
 * explained: nothing downstream wants them, and an entry that exists but can
 * never post is worse than one that is simply gone.
 *
 * Identity is name or handle, not id, since the id is exactly what changed.
 * An entry under a retired id that collides with nothing is the admin's own
 * persona and is left completely alone.
 */
function withoutSupersededCopies(saved: Personality[]): Personality[] {
  const norm = (s: string) => (s ?? '').trim().toLowerCase();
  const byId = new Map(DEFAULT_PERSONALITIES.map(p => [p.id, p]));
  const names = new Set(DEFAULT_PERSONALITIES.map(p => norm(p.name)));
  const handles = new Set(DEFAULT_PERSONALITIES.map(p => norm(p.handle)));

  return saved.filter(p =>
    p.custom || byId.has(p.id) || !(names.has(norm(p.name)) || handles.has(norm(p.handle))));
}

/**
 * Reads the saved cast, clearing out superseded copies on the way.
 *
 * The cleaned list is written back when it differs, so the leftovers actually
 * leave storage instead of being filtered out on every read forever. It is
 * idempotent, so a concurrent read repeating the write costs nothing.
 */
async function readCast(): Promise<Personality[] | null> {
  const saved = await readJson<Personality[] | null>(PEOPLE_KEY, PEOPLE_FILE, null);
  if (!saved?.length) return saved;
  const cleaned = withoutSupersededCopies(saved);
  if (cleaned.length !== saved.length) {
    await writeJson(PEOPLE_KEY, PEOPLE_FILE, cleaned).catch(() => { /* next read retries */ });
  }
  return cleaned;
}

export async function getPersonalities(): Promise<Personality[]> {
  const saved = await readCast();
  if (!saved?.length) return DEFAULT_PERSONALITIES;

  const defaultsById = new Map(DEFAULT_PERSONALITIES.map(p => [p.id, p]));
  const merged = saved.map(p => {
    const base = defaultsById.get(p.id);
    if (!base) return p;
    const grants = NEW_KINDS.filter(k => base.kinds.includes(k) && !p.kinds.includes(k));
    return grants.length ? { ...p, kinds: [...p.kinds, ...grants] } : p;
  });

  // Personalities added to the defaults since the last save should appear too.
  //
  // Deleting one is recorded with `hidden` rather than by dropping the entry,
  // because the defaults are merged back in right here and a dropped one would
  // simply reappear.
  //
  // Nothing else is filtered. Whether a writer takes part in the auto rotation
  // is the `enabled` checkbox's job and the scheduler's to read, so a saved
  // writer is in this list on the admin's say so and no other condition.
  const savedIds = new Set(saved.map(p => p.id));
  return [...merged, ...DEFAULT_PERSONALITIES.filter(p => !savedIds.has(p.id))]
    .filter(p => !p.hidden);
}

/**
 * Every persona including deleted built-ins, for the admin panel only.
 *
 * The public read filters hidden entries; without this the admin could delete
 * a built-in and then have no way to bring it back short of clearing storage.
 */
export async function getPersonalitiesForAdmin(): Promise<Personality[]> {
  const saved = await readCast();
  if (!saved?.length) return DEFAULT_PERSONALITIES;
  const savedIds = new Set(saved.map(p => p.id));
  return [...saved, ...DEFAULT_PERSONALITIES.filter(p => !savedIds.has(p.id))];
}

export async function savePersonalities(list: Personality[]): Promise<void> {
  await writeJson(PEOPLE_KEY, PEOPLE_FILE, list);
}
