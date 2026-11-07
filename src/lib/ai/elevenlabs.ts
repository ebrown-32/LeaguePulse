/**
 * The podcast's recorded voices (ElevenLabs), server only. Never import this from client code:
 * the key must stay on the server.
 *
 *   ELEVENLABS_API_KEY                   the platform's key; without it the player reads scripts
 *                                        in the browser
 *   ELEVENLABS_VOICES                    optional: a comma list of voice ids to offer and cast
 *                                        from; unset, every voice on the ElevenLabs account
 *   ELEVENLABS_MODEL                     optional, default eleven_multilingual_v2
 *   ELEVENLABS_MONTHLY_CHARS_PER_LEAGUE  optional, default 60000 (about $5 a league a month on
 *                                        the default model); past it, browsers read the episode
 *
 * Admins pick a voice per personality in the AI Desk (Personality.voiceId). A pick only counts
 * when it is one of the voices on offer, so a saved id can't reach voices (or prices) outside the
 * account. Hosts without one, or whose pick is already taken on the panel, are cast from the pool:
 * a personality keeps the same automatic voice from episode to episode, chosen by their id.
 */

import 'server-only';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { getRedis } from '@/lib/redisClient';

export interface SpeakingVoice { id: string; name: string; description: string; preview: string | null }

export function elevenLabsKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

let client: { key: string; c: ElevenLabsClient } | null = null;
function elevenLabs(): ElevenLabsClient | null {
  const key = elevenLabsKey();
  if (!key) return null;
  if (client?.key !== key) client = { key, c: new ElevenLabsClient({ apiKey: key, maxRetries: 2, timeoutInSeconds: 60 }) };
  return client.c;
}

/** A voice id as ElevenLabs issues them. Anything else is never sent on. */
export const VOICE_ID = /^[A-Za-z0-9]{8,40}$/;

let memo: { at: number; voices: Promise<SpeakingVoice[]> } | null = null;

/** The voices on offer, sorted by name. Looked up at most every ten minutes per server. */
export function listVoices(): Promise<SpeakingVoice[]> {
  const el = elevenLabs();
  if (!el) return Promise.resolve([]);
  if (memo && Date.now() - memo.at < 10 * 60_000) return memo.voices;
  const voices = (async () => {
    const { voices = [] } = await el.voices.getAll();
    const only = new Set((process.env.ELEVENLABS_VOICES ?? '').split(',').map(v => v.trim()).filter(Boolean));
    return voices
      .filter(v => VOICE_ID.test(v.voiceId) && (!only.size || only.has(v.voiceId)))
      .map(v => ({
        id: v.voiceId,
        name: (v.name ?? 'Voice').split(' - ')[0].trim(),
        description: [v.labels?.gender, v.labels?.age?.replace('_', ' '), v.labels?.accent, v.labels?.descriptive ?? v.labels?.description, v.labels?.use_case?.replace('_', ' ')]
          .filter(Boolean).join(', ') || (v.description ?? '').slice(0, 80),
        preview: v.previewUrl ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();
  memo = { at: Date.now(), voices };
  voices.catch(() => { memo = null; });
  return voices;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * One voice per host, in panel order. The admin's picks come first (when they're on offer);
 * everyone else is cast from the pool by their id, moved along when theirs is taken.
 */
export function castVoices(hosts: { id: string; voiceId?: string }[], pool: string[]): string[] {
  const offered = new Set(pool);
  const out: (string | null)[] = hosts.map(() => null);
  const taken = new Set<string>();
  hosts.forEach((h, i) => {
    if (h.voiceId && offered.has(h.voiceId) && !taken.has(h.voiceId)) { out[i] = h.voiceId; taken.add(h.voiceId); }
  });
  const ids = [...offered].sort();
  hosts.forEach((h, i) => {
    if (out[i] || !ids.length) return;
    const start = hash(h.id) % ids.length;
    let pick = ids[start];
    for (let k = 0; k < ids.length; k++) {
      const v = ids[(start + k) % ids.length];
      if (!taken.has(v)) { pick = v; break; }
    }
    out[i] = pick;
    taken.add(pick);
  });
  return out.map(v => v ?? '');
}

// ── Spending ────────────────────────────────────────────────────────────────

const monthKey = () => `lp_podcast_tts_chars:${new Date().toISOString().slice(0, 7)}`;
const monthlyCap = () => Number(process.env.ELEVENLABS_MONTHLY_CHARS_PER_LEAGUE || 60_000);

/**
 * Charges `chars` to this league's month (the Redis keys are per league). False when that would
 * go over the cap, and nothing is charged. Without Redis (local dev) there is no cap.
 */
export async function spendCharacters(chars: number): Promise<boolean> {
  const { client: redis } = getRedis();
  if (!redis) return true;
  const key = monthKey();
  const total = await redis.incrby(key, chars);
  if (total === chars) await redis.expire(key, 40 * 24 * 3600);
  if (total > monthlyCap()) { await redis.incrby(key, -chars); return false; }
  return true;
}

/** One line, as MP3. Voice settings follow what the model supports (v4 has no style). */
export async function speak(voiceId: string, text: string, around: { previous?: string; next?: string }): Promise<ReadableStream<Uint8Array>> {
  const el = elevenLabs();
  if (!el) throw new Error('ElevenLabs is not set up');
  if (!VOICE_ID.test(voiceId)) throw new Error('Not a voice id');
  const modelId = process.env.ELEVENLABS_MODEL?.trim() || 'eleven_multilingual_v2';
  const v4 = modelId.startsWith('eleven_v4');
  return el.textToSpeech.convert(voiceId, {
    text,
    modelId,
    outputFormat: 'mp3_44100_128',
    previousText: around.previous,
    nextText: around.next,
    // A sports-radio read: lively, a little loose, the voice's own character up front.
    voiceSettings: v4
      ? { stability: 0.4, similarityBoost: 0.8 }
      : { stability: 0.4, similarityBoost: 0.8, style: 0.35, useSpeakerBoost: true },
  });
}
