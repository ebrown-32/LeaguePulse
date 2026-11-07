/**
 * One spoken line of an episode, recorded by ElevenLabs, when the platform has ELEVENLABS_API_KEY.
 * Without it the player reads the script in the browser instead (components/podcast/engine).
 *
 *   GET ?ep=<episode id>&c=<chapter>&l=<line>   audio/mpeg
 *
 * Public (listeners aren't signed in), so it is built so a stranger can't spend the key:
 *   - it only ever reads lines of an episode this league already published, never text from the
 *     request
 *   - the URL must be exactly the canonical one (the player's), or it's refused: junk parameters
 *     would otherwise slip past the CDN's cache and force a fresh recording each time
 *   - recordings are cached by the CDN for a year (a line never changes once published)
 *   - a cache miss costs a visitor from their per-IP allowance, and the league from its monthly
 *     character cap (lib/ai/elevenlabs spendCharacters). Past either, a 429, and the player reads
 *     that line in the browser instead.
 *
 * Voices: the admin's pick for each personality, or one cast for them. Each host on an episode
 * speaks with a different voice. The lines either side go with each request, so a host's delivery
 * follows the conversation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { castVoices, elevenLabsKey, speak, spendCharacters, voicePool } from '@/lib/ai/elevenlabs';
import { clientIp, rateLimit } from '@/lib/ai/rateLimit';

export const dynamic = 'force-dynamic';

const EP_ID = /^[A-Za-z0-9-]{1,80}$/;
const INDEX = /^(0|[1-9]\d?)$/;

const refuse = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } });

export async function GET(req: NextRequest) {
  if (!elevenLabsKey()) return refuse('Recorded voices are not set up.', 404);

  const q = req.nextUrl.searchParams;
  const epId = q.get('ep') ?? '', c_ = q.get('c') ?? '', l_ = q.get('l') ?? '';
  if (!EP_ID.test(epId) || !INDEX.test(c_) || !INDEX.test(l_) || [...q.keys()].length !== 3) return refuse('Bad request.', 400);

  const { getEpisode } = await import('@/lib/ai/podcast');
  const ep = await getEpisode(epId);
  const c = Number(c_), l = Number(l_);
  const line = ep?.chapters[c]?.lines[l];
  if (!ep || !line) return refuse('No such line.', 404);

  // Only cache misses get here (the CDN answers the rest). The player fetches a line ahead, so the
  // first listener asks for a whole episode (up to 70 lines) in a few minutes: two episodes' worth
  // per visitor every ten minutes, which a real listener never reaches.
  if (!(await rateLimit('lp_rl_podcast_audio:', clientIp(req), 140, 10 * 60_000)).ok) return refuse('Slow down.', 429);

  const pool = await voicePool();
  const voices = castVoices(ep.hosts, pool);
  const voice = voices[line.host] || voices[0];
  if (!voice) return refuse('No ElevenLabs voices to read with.', 502);

  if (!(await spendCharacters(line.text.length).catch(() => true))) return refuse('This month\'s recorded voices are used up.', 429);

  // The conversation around this line, for delivery: the turn before and the turn after.
  const flat = ep.chapters.flatMap(ch => ch.lines);
  const at = ep.chapters.slice(0, c).reduce((n, ch) => n + ch.lines.length, 0) + l;

  try {
    const audio = await speak(voice, line.text, { previous: flat[at - 1]?.text, next: flat[at + 1]?.text });
    return new NextResponse(audio, {
      headers: {
        'content-type': 'audio/mpeg',
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    });
  } catch (err) {
    // The status and a short message only: never the request, which carries the key in its headers.
    const e = err as { statusCode?: number; message?: string };
    console.error('[api/podcast/audio]', e.statusCode ?? '', String(e.message ?? err).slice(0, 300));
    return refuse('The line could not be recorded.', 502);
  }
}
