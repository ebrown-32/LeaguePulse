/**
 * One chapter of an episode, performed by its panel as a single conversation (ElevenLabs Text to
 * Dialogue), when the platform has ELEVENLABS_API_KEY.
 *
 *   GET ?ep=<episode id>&c=<chapter>
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
import { castVoices, elevenLabsKey, episodeCharacters, payForEpisode, performChapter, voicePool } from '@/lib/ai/elevenlabs';
import { claimChapter, releaseChapter, storeChapter, storedChapter, waitForChapter, type StoredChapter } from '@/lib/ai/podcastAudio';
import { clientIp, rateLimit } from '@/lib/ai/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const EP_ID = /^[A-Za-z0-9-]{1,80}$/;
const INDEX = /^(0|[1-9]\d?)$/;
const KEEP = { 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable' };

const refuse = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } });

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
  if (!EP_ID.test(epId) || !INDEX.test(c_) || [...q.keys()].length !== 2) return refuse('Bad request.', 400);
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
    if (!(await rateLimit('lp_rl_podcast_chapter:', clientIp(req), 24, 10 * 60_000)).ok) return refuse('Slow down.', 429);

    const voices = castVoices(ep.hosts, await voicePool());
    const lines = chapter.lines.map(l => ({ voiceId: voices[l.host] || voices[0], text: l.text }));
    if (lines.some(l => !l.voiceId)) return refuse('No ElevenLabs voices to read with.', 502);

    // The whole episode is paid for with its first recording, or none of it is recorded.
    if (!(await payForEpisode(epId, episodeCharacters(ep)).catch(() => true))) return refuse('This month\'s recorded voices are used up.', 429);

    const before = ep.chapters[c - 1]?.lines.at(-1)?.text;
    const after = ep.chapters[c + 1]?.lines[0]?.text;
    const { audio, segments } = await performChapter(lines, { previous: before, next: after });

    await storeChapter(epId, c, audio, segments).catch(err => {
      console.error('[api/podcast/chapter] could not store', err instanceof Error ? err.message : err);
    });
    return audioResponse(new Uint8Array(audio), segments);
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    console.error('[api/podcast/chapter]', e.statusCode ?? '', String(e.message ?? err).slice(0, 300));
    return refuse('The chapter could not be recorded.', 502);
  } finally {
    await releaseChapter(epId, c);
  }
}
