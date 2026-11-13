/**
 * Recording The Desk Weekly's chapters (ElevenLabs Text to Dialogue), shared by the chapter route
 * (a listener's first play) and the background recording right after an episode is written, so
 * the first listener never waits for it.
 *
 * Paid for a whole episode at a time (lib/ai/elevenlabs payForEpisode). ElevenLabs being busy (a
 * plan allows only a few recordings at once) or briefly failing is tried again, a few seconds
 * apart, before it counts as a failure: a listener should get the panel's voices, not the browser's.
 * Server only.
 */

import 'server-only';
import type { Episode } from './podcast';
import { castVoices, episodeCharacters, payForEpisode, performChapter, voicePool } from './elevenlabs';
import { claimChapter, releaseChapter, storeChapter, storedChapter } from './podcastAudio';

export class UnpaidError extends Error {}

const retryable = (err: unknown) => {
  const s = (err as { statusCode?: number }).statusCode;
  return s === undefined || s === 408 || s === 409 || s === 429 || s >= 500;
};

/** One chapter, recorded and stored: its MP3 and where each line is. Throws UnpaidError past the caps. */
export async function recordChapter(ep: Episode, c: number) {
  const chapter = ep.chapters[c];
  if (!chapter) throw new Error('No such chapter');
  const voices = castVoices(ep.hosts, await voicePool());
  const lines = chapter.lines.map(l => ({ voiceId: voices[l.host] || voices[0], text: l.text }));
  if (lines.some(l => !l.voiceId)) throw new Error('No ElevenLabs voices to read with');
  if (!(await payForEpisode(ep.id, episodeCharacters(ep)).catch(() => true))) throw new UnpaidError('This month\'s recorded voices are used up.');

  let last: unknown;
  for (const wait of [0, 2_500, 6_000]) {
    if (wait) await new Promise(r => setTimeout(r, wait));
    try {
      const { audio, segments } = await performChapter(lines);
      await storeChapter(ep.id, c, audio, segments).catch(err => {
        console.error('[podcast] could not store chapter', err instanceof Error ? err.message : err);
      });
      return { audio, segments };
    } catch (err) {
      last = err;
      if (!retryable(err)) break;
    }
  }
  throw last;
}

/** Every chapter of an episode not yet recorded, one after another (in the background, after it's written). */
export async function recordEpisode(ep: Episode): Promise<void> {
  for (let c = 0; c < ep.chapters.length; c++) {
    if (await storedChapter(ep.id, c)) continue;
    if (!(await claimChapter(ep.id, c))) continue;
    try { await recordChapter(ep, c); }
    catch (err) {
      const e = err as { statusCode?: number; message?: string };
      console.error('[podcast] background recording', ep.id, c, e.statusCode ?? '', String(e.message ?? err).slice(0, 200));
      if (err instanceof UnpaidError) return;
    } finally { await releaseChapter(ep.id, c); }
  }
}
