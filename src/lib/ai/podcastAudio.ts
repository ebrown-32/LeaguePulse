/**
 * Where The Desk Weekly's recordings live, so each chapter is paid for once.
 *
 *   With Vercel Blob (BLOB_READ_WRITE_TOKEN, set by connecting a Blob store to the project): the
 *   MP3 goes to Blob and its address and line timings to Redis. Every later play, in any region,
 *   for as long as the episode is kept, is served from there: no second recording, ever.
 *
 *   Without it: only the CDN keeps the recording. That works, but a CDN can drop a cold file, and
 *   the next listener then pays for it again.
 *
 * When an episode is replaced or ages out, its recordings are deleted with it (forgetEpisode).
 * Server only.
 */

import 'server-only';
import { getRedis } from '@/lib/redisClient';

/** Where a line is in its chapter's recording, in seconds, and when each of its words starts. */
export interface ChapterTimings { line: number; start: number; end: number; words?: number[] }
export interface StoredChapter { url: string; segments: ChapterTimings[] }

// The recording version (lib/podcastText RECORDING): a new one records every chapter again.
import { RECORDING } from '@/lib/podcastText';
export { RECORDING };
const recKey = (ep: string, c: number) => `lp_podcast_rec${RECORDING > 1 ? `_v${RECORDING}` : ''}:${ep}:${c}`;
const oldRecKey = (ep: string, c: number) => `lp_podcast_rec:${ep}:${c}`;
const lockKey = (ep: string, c: number) => `lp_podcast_lock:${ep}:${c}`;

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

async function folder(ep: string): Promise<string> {
  const { currentTenant } = await import('@/lib/tenant/context');
  const slug = (await currentTenant().catch(() => null))?.slug ?? 'league';
  return `podcast/${slug}/${ep}/`;
}

export async function storedChapter(ep: string, c: number): Promise<StoredChapter | null> {
  const { client } = getRedis();
  if (!client) return null;
  try { const raw = await client.get(recKey(ep, c)); return raw ? JSON.parse(raw) as StoredChapter : null; } catch { return null; }
}

export async function storeChapter(ep: string, c: number, audio: Buffer, segments: ChapterTimings[]): Promise<StoredChapter | null> {
  const { client } = getRedis();
  if (!client || !blobConfigured()) return null;
  const { put } = await import('@vercel/blob');
  const blob = await put(`${await folder(ep)}c${c}.mp3`, audio, {
    access: 'public',
    contentType: 'audio/mpeg',
    addRandomSuffix: true,
    cacheControlMaxAge: 31536000,
  });
  const rec: StoredChapter = { url: blob.url, segments };
  // Kept as long as an episode can be (a season and a bit); forgetEpisode clears it sooner.
  await client.set(recKey(ep, c), JSON.stringify(rec), 400 * 24 * 3600);
  return rec;
}

/**
 * One recording at a time per chapter: true for the first caller. The others wait for its result
 * (waitForChapter) rather than paying for the same chapter again.
 */
export async function claimChapter(ep: string, c: number): Promise<boolean> {
  const { client } = getRedis();
  if (!client) return true;
  const n = await client.incrby(lockKey(ep, c), 1);
  if (n === 1) await client.expire(lockKey(ep, c), 150);
  return n === 1;
}

export async function releaseChapter(ep: string, c: number): Promise<void> {
  await getRedis().client?.del(lockKey(ep, c)).catch(() => {});
}

export async function waitForChapter(ep: string, c: number, ms = 45_000): Promise<StoredChapter | null> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, 1500));
    const rec = await storedChapter(ep, c);
    if (rec) return rec;
  }
  return null;
}

/** Deletes an episode's recordings: its Blob files and their records. Best effort. */
export async function forgetEpisode(ep: string, chapters: number): Promise<void> {
  const { client } = getRedis();
  await Promise.all(Array.from({ length: chapters }, (_, c) => Promise.all([client?.del(recKey(ep, c)), client?.del(oldRecKey(ep, c))]))).catch(() => {});
  if (!blobConfigured()) return;
  try {
    const { list, del } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: await folder(ep) });
    if (blobs.length) await del(blobs.map(b => b.url));
  } catch (err) {
    console.warn('[podcast] could not delete recordings for', ep, err instanceof Error ? err.message : err);
  }
}
