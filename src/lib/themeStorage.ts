/**
 * Server-only: theme persistence (Redis in prod, JSON file in dev).
 * Do NOT import this in client components. Import themeConfig.ts instead.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { type ThemeConfig, type FontPairKey, DEFAULT_THEME, fontPairs, accentPresets } from './themeConfig';
import { getRedis } from './redisClient';
import { perLeague } from '@/lib/tenant/perLeague';

// Re-export everything from themeConfig for convenience (server-side callers)
export { DEFAULT_THEME, fontPairs, accentPresets };
export type { ThemeConfig, FontPairKey };

// ─── Storage backend ───────────────────────────────────────────────

// Transport selection lives in redisClient.ts, shared with the AI desk, so
// Upstash REST and plain TCP both work here without a second copy of the setup.
const redis = getRedis().client;

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
// One per league on the hosted product, where a single server renders many.
const memCaches = perLeague<{ theme: ThemeConfig; expiry: number; mtimeMs: number }>();
const MEM_TTL = 1000; // 1s

/** 0 when the file doesn't exist yet (or on the Redis backend). */
async function themeFileMtime(): Promise<number> {
  try {
    return (await fs.stat(THEME_FILE)).mtimeMs;
  } catch {
    return 0;
  }
}

export async function getTheme(): Promise<ThemeConfig> {
  const mem = await memCaches.get();
  if (mem && Date.now() < mem.expiry) {
    // On the file backend an mtime change proves another process or bundle
    // wrote a new theme, so the cache is stale no matter how fresh the TTL is.
    if (redis || (await themeFileMtime()) === mem.mtimeMs) return mem.theme;
  }

  try {
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
    await memCaches.set({ theme: result, expiry: Date.now() + MEM_TTL, mtimeMs: await themeFileMtime() });
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
      await redis.set(REDIS_KEY, JSON.stringify(next));
    } else {
      await ensureDataDir();
      await fs.writeFile(THEME_FILE, JSON.stringify(next, null, 2));
    }
  } catch (err) {
    console.error('themeStorage.saveTheme error:', err);
  }
  // Bust in-memory cache so the new theme is served immediately
  await memCaches.set({ theme: next, expiry: Date.now() + MEM_TTL, mtimeMs: await themeFileMtime() });
  return next;
}

export async function resetTheme(): Promise<ThemeConfig> {
  return saveTheme(DEFAULT_THEME);
}
