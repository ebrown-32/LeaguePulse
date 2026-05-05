/**
 * Server-only: theme persistence (Redis in prod, JSON file in dev).
 * Do NOT import this in client components — import themeConfig.ts instead.
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

export async function getTheme(): Promise<ThemeConfig> {
  try {
    if (redis) {
      if (!redis.isOpen) await redis.connect();
      const raw = await redis.get(REDIS_KEY);
      if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
    } else {
      await ensureDataDir();
      try {
        const raw = await fs.readFile(THEME_FILE, 'utf-8');
        return { ...DEFAULT_THEME, ...JSON.parse(raw) };
      } catch { /* file doesn't exist yet */ }
    }
  } catch (err) {
    console.error('themeStorage.getTheme error:', err);
  }
  return { ...DEFAULT_THEME };
}

export async function saveTheme(theme: Partial<ThemeConfig>): Promise<ThemeConfig> {
  const current = await getTheme();
  const next: ThemeConfig = { ...current, ...theme };
  try {
    if (redis) {
      if (!redis.isOpen) await redis.connect();
      await redis.set(REDIS_KEY, JSON.stringify(next));
    } else {
      await ensureDataDir();
      await fs.writeFile(THEME_FILE, JSON.stringify(next, null, 2));
    }
  } catch (err) {
    console.error('themeStorage.saveTheme error:', err);
  }
  return next;
}

export async function resetTheme(): Promise<ThemeConfig> {
  return saveTheme(DEFAULT_THEME);
}
