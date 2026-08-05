/**
 * Server-only: theme persistence (Redis in prod, JSON file in dev).
 * Do NOT import this in client components. Import themeConfig.ts instead.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { type ThemeConfig, type FontPairKey, DEFAULT_THEME, fontPairs, accentPresets } from './themeConfig';

// Re-export everything from themeConfig for convenience (server-side callers)
export { DEFAULT_THEME, fontPairs, accentPresets };
export type { ThemeConfig, FontPairKey };

// ─── Storage backend ───────────────────────────────────────────────

let redis: any = null;
try {
  const redisUrl = process.env.REDIS_URL;
  if ((process.env.VERCEL || redisUrl) && redisUrl && !redisUrl.includes('your-redis')) {
    const { createClient } = require('redis');
    redis = createClient({ url: redisUrl });
    redis.on('error', () => { redis = null; });
  }
} catch {
  // fall back to file storage
}

const DATA_DIR   = path.join(process.cwd(), 'data');
const THEME_FILE = path.join(DATA_DIR, 'theme.json');
const REDIS_KEY  = 'league_theme';

async function ensureDataDir() {
  try { await fs.access(DATA_DIR); }
  catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

// In-memory cache. Deliberately short-lived: getTheme() runs several times per
// render (root layout, ThemeInjector, Footer), and this collapses those into a
// single read without letting an admin save go unnoticed.
//
// It used to be 5 minutes, which is why saved changes appeared not to apply —
// Next bundles route handlers and server components separately, so saveTheme()
// busting *its* module instance's cache never reached the render path's copy,
// and noStore() doesn't touch a module-level cache.
let memCache: ThemeConfig | null = null;
let memCacheExpiry = 0;
let memCacheMtimeMs = 0;
const MEM_TTL = 1000; // 1s

/** 0 when the file doesn't exist yet (or on the Redis backend). */
async function themeFileMtime(): Promise<number> {
  try {
    return (await fs.stat(THEME_FILE)).mtimeMs;
  } catch {
    return 0;
  }
}

async function connectRedis(): Promise<void> {
  // Hard 2-second timeout so a slow/misconfigured Redis never blocks page loads
  await Promise.race([
    redis.connect(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis connect timeout')), 2000)
    ),
  ]);
}

export async function getTheme(): Promise<ThemeConfig> {
  if (memCache && Date.now() < memCacheExpiry) {
    // On the file backend an mtime change proves another process or bundle
    // wrote a new theme, so the cache is stale no matter how fresh the TTL is.
    if (redis || (await themeFileMtime()) === memCacheMtimeMs) return memCache;
  }

  try {
    if (redis) {
      try {
        if (!redis.isOpen) await connectRedis();
      } catch {
        redis = null; // unreachable or unauthenticated, fall through
      }
    }

    let theme: ThemeConfig | null = null;

    if (redis) {
      const raw = await redis.get(REDIS_KEY);
      if (raw) theme = { ...DEFAULT_THEME, ...JSON.parse(raw) };
    } else {
      await ensureDataDir();
      try {
        const raw = await fs.readFile(THEME_FILE, 'utf-8');
        theme = { ...DEFAULT_THEME, ...JSON.parse(raw) };
      } catch { /* file doesn't exist yet */ }
    }

    const result = theme ?? { ...DEFAULT_THEME };
    memCache = result;
    memCacheExpiry = Date.now() + MEM_TTL;
    memCacheMtimeMs = await themeFileMtime();
    return result;
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export async function saveTheme(theme: Partial<ThemeConfig>): Promise<ThemeConfig> {
  const current = await getTheme();
  const next: ThemeConfig = { ...current, ...theme };
  try {
    if (redis) {
      if (!redis.isOpen) await connectRedis();
      await redis.set(REDIS_KEY, JSON.stringify(next));
    } else {
      await ensureDataDir();
      await fs.writeFile(THEME_FILE, JSON.stringify(next, null, 2));
    }
  } catch (err) {
    console.error('themeStorage.saveTheme error:', err);
  }
  // Bust in-memory cache so the new theme is served immediately
  memCache = next;
  memCacheExpiry = Date.now() + MEM_TTL;
  memCacheMtimeMs = await themeFileMtime();
  return next;
}

export async function resetTheme(): Promise<ThemeConfig> {
  return saveTheme(DEFAULT_THEME);
}
