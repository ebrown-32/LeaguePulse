/**
 * One chapter of an episode, performed by its panel as a single conversation (ElevenLabs Text to
 * Dialogue), when the platform has ELEVENLABS_API_KEY.
 *
 *   GET ?ep=<episode id>&c=<chapter>&v=<recording version>
 *     audio/mpeg, with `x-lp-segments`: where each line starts and ends, in seconds, as JSON
 *     404 / 429 / 502 / 503  not recorded: the player falls back to line by line, then to the
 *                            browser's voice
 *
 * Served from this origin (stored recordings are read from Blob and passed through), so the
 * player's level meter can analyse it without any cross-origin question, and the CDN caches it.
 *
 * Paid for once: the first play records it and stores it (lib/ai/podcastAudio); every play after
 * is a lookup. Two listeners starting the same chapter at once share one recording. Like the line
 * route, it only ever reads text of an episode this league published, takes only the canonical
 * URL, and a fresh recording costs the visitor's per-IP allowance and the league's and platform's
 * monthly character caps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { elevenLabsKey } from '@/lib/ai/elevenlabs';
import { claimChapter, RECORDING, releaseChapter, storedChapter, waitForChapter, type StoredChapter } from '@/lib/ai/podcastAudio';
import { recordChapter, UnpaidError } from '@/lib/ai/podcastRecord';
import { clientIp, rateLimit } from '@/lib/ai/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const EP_ID = /^[A-Za-z0-9-]{1,80}$/;
const INDEX = /^(0|[1-9]\d?)$/;
const KEEP = { 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable' };

/** `reason`, for the player: 'used_up' (the month's voices: read it in the browser) or 'busy' (try again shortly). */
const refuse = (error: string, status: number, reason?: 'used_up' | 'busy') =>
  NextResponse.json({ error, reason }, { status, headers: { 'cache-control': 'no-store' } });

const audioResponse = (body: BodyInit, segments: unknown) => new NextResponse(body, {
  headers: { 'content-type': 'audio/mpeg', 'x-content-type-options': 'nosniff', 'x-lp-segments': JSON.stringify(segments), ...KEEP },
});

/** A stored recording, passed through from Blob; null if Blob no longer has it. */
async function serveStored(rec: StoredChapter): Promise<NextResponse | null> {
  const r = await fetch(rec.url).catch(() => null);
  return r?.ok && r.body ? audioResponse(r.body, rec.segments) : null;
}

export async function GET(req: NextRequest) {
  if (!elevenLabsKey()) return refuse('Recorded voices are not set up.', 404);
  const q = req.nextUrl.searchParams;
  const epId = q.get('ep') ?? '', c_ = q.get('c') ?? '';
  // `v`: the recording's version (podcastAudio RECORDING). A new one means new addresses, so no
  // cache anywhere serves a chapter recorded the old way.
  if (!EP_ID.test(epId) || !INDEX.test(c_) || q.get('v') !== String(RECORDING) || [...q.keys()].length !== 3) return refuse('Bad request.', 400);
  const c = Number(c_);

  const stored = await storedChapter(epId, c);
  if (stored) { const res = await serveStored(stored); if (res) return res; }

  const { getEpisode } = await import('@/lib/ai/podcast');
  const ep = await getEpisode(epId);
  const chapter = ep?.chapters[c];
  if (!ep || !chapter) return refuse('No such chapter.', 404);

  // Someone else is recording it right now: wait for theirs.
  if (!(await claimChapter(epId, c))) {
    const theirs = await waitForChapter(epId, c);
    const res = theirs && await serveStored(theirs);
    return res || refuse('Still recording.', 503);
  }

  try {
    if (!(await rateLimit('lp_rl_podcast_chapter:', clientIp(req), 24, 10 * 60_000)).ok) return refuse('Slow down.', 429, 'busy');
    // Recorded (tried again if ElevenLabs is busy), stored, and paid for as a whole episode (podcastRecord).
    const { audio, segments } = await recordChapter(ep, c);
    return audioResponse(new Uint8Array(audio), segments);
  } catch (err) {
    if (err instanceof UnpaidError) return refuse(err.message, 429, 'used_up');
    const e = err as { statusCode?: number; message?: string };
    console.error('[api/podcast/chapter]', e.statusCode ?? '', String(e.message ?? err).slice(0, 300));
    return refuse('The chapter could not be recorded.', 502);
  } finally {
    await releaseChapter(epId, c);
  }
}
