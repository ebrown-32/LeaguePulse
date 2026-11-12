/**
 * The podcast's recorded voices (ElevenLabs), server only. Never import this from client code:
 * the key must stay on the server.
 *
 *   ELEVENLABS_API_KEY                   the platform's key; without it the player reads scripts
 *                                        in the browser
 *   ELEVENLABS_VOICES                    optional: a comma list of voice ids to offer and cast
 *                                        from; unset, every voice on the ElevenLabs account
 *   ELEVENLABS_MODEL                     optional, default eleven_v4 (the most human: it performs
 *                                        the script's delivery tags, like [laughs])
 *   ELEVENLABS_MONTHLY_CHARS_PER_LEAGUE  optional, default 12000 (about eight episodes); past it,
 *                                        browsers read that league's episodes
 *   ELEVENLABS_MONTHLY_CHARS_TOTAL       optional, default 36000 (90% of the Starter plan's 40,000):
 *                                        the whole platform's month, every league together, so one
 *                                        league can't spend everyone's. Raise both with the plan.
 *
 * Admins pick a voice per personality in the AI Desk (Personality.voiceId). A pick only counts
 * when it is one of the voices on offer, so a saved id can't reach voices (or prices) outside the
 * account. Hosts without one, or whose pick is already taken on the panel, are cast from the pool:
 * a personality keeps the same automatic voice from episode to episode, chosen by their id.
 */

import 'server-only';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { getRedis } from '@/lib/redisClient';
import { alignWordStarts, EPISODE_CHARS, lineSpans, plainLine } from '@/lib/podcastText';

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
        // "Roger - Laid-Back, Casual, Resonant": the part after the dash is the voice's own blurb.
        description: [v.labels?.gender, v.labels?.age?.replace('_', ' '), v.labels?.accent, (v.name ?? '').split(' - ').slice(1).join(' - ').trim() || v.labels?.descriptive || v.labels?.description, v.labels?.use_case?.replace('_', ' ')]
          .filter(Boolean).join(', ') || (v.description ?? '').slice(0, 80),
        preview: v.previewUrl ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();
  memo = { at: Date.now(), voices };
  voices.catch(() => { memo = null; });
  return voices;
}

/**
 * Stand-ins when the account's voices can't be listed (a key without the voices_read permission,
 * or ElevenLabs briefly down): ElevenLabs' own premade voices, which any key can speak with, so
 * an episode is still recorded rather than silent.
 */
const STAND_INS = ['JBFqnCBsd6RMkjVDRZzb', 'EXAVITQu4vr4xnSDxMaL', 'onwK4e9ZLuTAKqWW03F9', 'XB0fDUnXU5powFXDhCwa'];

let warned = 0;
/** The voice ids to cast from: the ones on offer, or the stand-ins when they can't be listed. */
export async function voicePool(): Promise<string[]> {
  try {
    const ids = (await listVoices()).map(v => v.id);
    if (ids.length) return ids;
  } catch (err) {
    if (Date.now() - warned > 10 * 60_000) {
      warned = Date.now();
      console.warn('[elevenlabs] could not list voices, using stand-ins:', voicesProblem(err));
    }
  }
  return STAND_INS;
}

/** What went wrong listing voices, in words an admin can act on. */
export function voicesProblem(err: unknown): string {
  const e = err as { statusCode?: number; body?: { detail?: { status?: string; message?: string } } };
  if (e?.body?.detail?.status === 'missing_permissions') return 'The ElevenLabs API key needs the "Voices: Read" permission. Turn it on for the key in ElevenLabs (Settings, API Keys), or make a new key with it.';
  if (e?.statusCode === 401) return 'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.';
  return 'Could not load the voices from ElevenLabs.';
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

const month = () => new Date().toISOString().slice(0, 7);
const leagueCap = () => Number(process.env.ELEVENLABS_MONTHLY_CHARS_PER_LEAGUE || 12_000);
const platformCap = () => Number(process.env.ELEVENLABS_MONTHLY_CHARS_TOTAL || 36_000);

async function charge(redis: NonNullable<ReturnType<typeof getRedis>['client']>, key: string, chars: number, cap: number): Promise<boolean> {
  const total = await redis.incrby(key, chars);
  if (total === chars) await redis.expire(key, 40 * 24 * 3600);
  if (total > cap) { await redis.incrby(key, -chars); return false; }
  return true;
}

/**
 * Charges `chars` to this league's month and the platform's. False when either would go over its
 * cap, and nothing is charged. Without Redis (local dev) there is no cap.
 */
export async function spendCharacters(chars: number): Promise<boolean> {
  const { client: redis } = getRedis();
  if (!redis) return true;
  const m = month();
  if (!(await charge(redis, `lp_tts_platform:${m}`, chars, platformCap()))) return false;
  if (!(await charge(redis, `lp_podcast_tts_chars:${m}`, chars, leagueCap()))) {
    await redis.incrby(`lp_tts_platform:${m}`, -chars);
    return false;
  }
  return true;
}

/**
 * Charges `credits` to the platform's month only, for what isn't a league's podcast (League
 * Wrapped's soundtracks, which are limited by count instead). False, and nothing charged, past the cap.
 */
export async function spendPlatform(credits: number): Promise<boolean> {
  const { client: redis } = getRedis();
  if (!redis) return false;
  return charge(redis, `lp_tts_platform:${month()}`, credits, platformCap());
}

/** Gives back platform credits charged for something that then failed. */
export async function refundPlatform(credits: number): Promise<void> {
  const { client: redis } = getRedis();
  await redis?.incrby(`lp_tts_platform:${month()}`, -credits).catch(() => {});
}

/** An original instrumental from ElevenLabs Music, as MP3. */
export async function composeMusic(prompt: string, lengthMs: number): Promise<Buffer> {
  const el = elevenLabs();
  if (!el) throw new Error('ElevenLabs is not set up');
  const stream = await el.music.compose({ prompt, musicLengthMs: lengthMs, forceInstrumental: true, outputFormat: 'mp3_44100_128' });
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
  return Buffer.concat(chunks);
}

/**
 * Pays for a whole episode up front, the first time any of it is recorded: true if it's paid
 * for (now or before). An episode is either recorded from start to finish or not at all, so a
 * league reaching its cap never hears the panel turn into the browser's voice halfway through;
 * an episode it can't afford is read by the browser from the start. Every recording after the
 * first, of that episode, is already paid for. (What ElevenLabs actually bills is only what gets
 * played, so this is the cautious side of the count.)
 */
export async function payForEpisode(epId: string, chars: number): Promise<boolean> {
  const { client: redis } = getRedis();
  if (!redis) return true;
  const paid = `lp_podcast_paid:${epId}`;
  if (await redis.get(paid)) return true;
  // One payment even when several chapters are asked for at once.
  const lock = `lp_podcast_paying:${epId}`;
  const n = await redis.incrby(lock, 1);
  if (n === 1) await redis.expire(lock, 30);
  else {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await redis.get(paid)) return true;
    }
    return false;
  }
  try {
    const ok = await spendCharacters(chars);
    if (ok) await redis.set(paid, '1', 400 * 24 * 3600);
    return ok;
  } finally {
    await redis.del(lock).catch(() => {});
  }
}

/** The characters a whole episode takes to record. */
export function episodeCharacters(ep: { chapters: { lines: { text: string }[] }[] }): number {
  return ep.chapters.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.text.length, 0), 0);
}

export { EPISODE_CHARS };

/**
 * For the back office's monitor: the ElevenLabs plan as ElevenLabs counts it, and the platform's
 * own count against its caps. `planError` says why the plan couldn't be read (a key without the
 * User: read permission can't see its subscription); the platform's count works regardless.
 * Run outside any league: the platform counter is shared, the per-league ones are read by the caller.
 */
export async function voiceAccount() {
  const client = elevenLabs();
  const m = month();
  const { client: redis } = getRedis();
  const platformUsed = Number((await redis?.get(`lp_tts_platform:${m}`).catch(() => null)) ?? 0) || 0;
  let plan: null | { tier: string; used: number; limit: number; resetsAt: string | null; voiceSlots: number; voiceLimit: number } = null;
  let planError: string | null = client ? null : 'No ELEVENLABS_API_KEY';
  if (client) {
    try {
      const s = await client.user.subscription.get();
      plan = {
        tier: s.tier, used: s.characterCount, limit: s.characterLimit,
        resetsAt: s.nextCharacterCountResetUnix ? new Date(s.nextCharacterCountResetUnix * 1000).toISOString() : null,
        voiceSlots: s.voiceSlotsUsed, voiceLimit: s.voiceLimit,
      };
    } catch (err) {
      const e = err as { statusCode?: number };
      planError = e.statusCode === 401 ? 'The key can\'t read its plan (give it User: read)' : `ElevenLabs answered ${e.statusCode ?? 'with an error'}`;
    }
  }
  return { month: m, plan, planError, platformUsed, platformCap: platformCap(), leagueCap: leagueCap(), episodeChars: EPISODE_CHARS };
}

/** This league's characters for a month (yyyy-mm). Run inside the league. */
export async function leagueCharacters(m: string): Promise<number> {
  const { client: redis } = getRedis();
  return Number((await redis?.get(`lp_podcast_tts_chars:${m}`).catch(() => null)) ?? 0) || 0;
}

/** Gives back characters charged for a recording that then failed. */
export async function refundCharacters(chars: number): Promise<void> {
  const { client: redis } = getRedis();
  if (!redis) return;
  const m = month();
  await Promise.all([redis.incrby(`lp_tts_platform:${m}`, -chars), redis.incrby(`lp_podcast_tts_chars:${m}`, -chars)]).catch(() => {});
}

const modelId = () => process.env.ELEVENLABS_MODEL?.trim() || 'eleven_v4';

/** Dialogue takes at most 100 characters of context either side: the end of what came before,
 *  the start of what comes next, cut at a word. */
const CONTEXT = 100;
export function contextBefore(t?: string): string | undefined {
  if (!t) return undefined;
  const plain = plainLine(t);
  if (plain.length <= CONTEXT) return plain;
  const tail = plain.slice(-CONTEXT);
  return tail.slice(tail.indexOf(' ') + 1);
}
export function contextAfter(t?: string): string | undefined {
  if (!t) return undefined;
  const plain = plainLine(t);
  if (plain.length <= CONTEXT) return plain;
  const head = plain.slice(0, CONTEXT);
  return head.slice(0, head.lastIndexOf(' ') > 0 ? head.lastIndexOf(' ') : CONTEXT);
}

/**
 * A whole chapter, performed as one conversation (Text to Dialogue): the voices react to each
 * other, so it plays like a real panel rather than lines read one after another. One request
 * instead of one a line. Returns the MP3 and where each line starts and ends in it.
 *
 * Dialogue takes only the v3 and v4 models; with an older model set this throws, and the caller
 * falls back to recording line by line.
 */
export async function performChapter(
  lines: { voiceId: string; text: string }[],
  around: { previous?: string; next?: string } = {},
): Promise<{ audio: Buffer; segments: { line: number; start: number; end: number; words?: number[] }[] }> {
  const el = elevenLabs();
  if (!el) throw new Error('ElevenLabs is not set up');
  const model = modelId();
  if (!/^eleven_v[34]/.test(model)) throw new Error(`${model} can't perform dialogue`);
  if (lines.some(l => !VOICE_ID.test(l.voiceId))) throw new Error('Not a voice id');
  const res = await el.textToDialogue.convertWithTimestamps({
    inputs: lines.map(l => ({ text: l.text, voiceId: l.voiceId })),
    modelId: model,
    // Speech needs far less than music: 96kbps sounds the same and halves what's stored and served.
    outputFormat: 'mp3_44100_96',
    // Lively, a little loose: the panel arguing, not reading.
    settings: { stability: 0.5 },
    previousText: contextBefore(around.previous),
    futureText: contextAfter(around.next),
  });
  const spans = new Map<number, { start: number; end: number; from: number; to: number }>();
  for (const s of res.voiceSegments ?? []) {
    const had = spans.get(s.dialogueInputIndex);
    spans.set(s.dialogueInputIndex, had
      ? { start: Math.min(had.start, s.startTimeSeconds), end: Math.max(had.end, s.endTimeSeconds), from: Math.min(had.from, s.characterStartIndex), to: Math.max(had.to, s.characterEndIndex) }
      : { start: s.startTimeSeconds, end: s.endTimeSeconds, from: s.characterStartIndex, to: s.characterEndIndex });
  }
  // Each line found by its own text in the recording's characters (lineSpans): a line ElevenLabs
  // folded into the turn before (the same voice twice running) still gets its own span. Its turn's
  // span where its text can't be found.
  const al = res.alignment;
  const own = al?.characters?.length ? lineSpans(lines.map(l => l.text), al.characters, al.characterStartTimesSeconds, al.characterEndTimesSeconds) : [];
  for (const [i, sp] of own.entries()) if (sp) spans.set(i, sp);
  const segments: { line: number; start: number; end: number; words?: number[] }[] = lines.map((_, i) => {
    const sp = spans.get(i);
    return { line: i, start: sp?.start ?? -1, end: sp?.end ?? -1 };
  });
  // When each word starts, from the characters' own timings, so the transcript lights each word
  // as it's said (Player). Where they can't be matched up, the player estimates instead.
  if (al?.characters?.length) {
    segments.forEach((seg, i) => {
      const sp = spans.get(i);
      if (!sp || seg.start < 0) return;
      const words = alignWordStarts(plainLine(lines[i].text), al.characters.slice(sp.from, sp.to + 1), al.characterStartTimesSeconds.slice(sp.from, sp.to + 1), seg);
      if (words) seg.words = words;
    });
  }
  // Lines the timings missed get the gap they sit in, so every line can still be found and seeked.
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start >= 0) continue;
    const prev = segments.slice(0, i).reverse().find(x => x.start >= 0);
    const next = segments.slice(i + 1).find(x => x.start >= 0);
    segments[i].start = prev ? prev.end : 0;
    segments[i].end = next ? next.start : segments[i].start;
  }
  return { audio: Buffer.from(res.audioBase64, 'base64'), segments };
}

/** One line, as MP3. Voice settings follow what the model supports (v4 has no style). */
export async function speak(voiceId: string, text: string, around: { previous?: string; next?: string }): Promise<ReadableStream<Uint8Array>> {
  const el = elevenLabs();
  if (!el) throw new Error('ElevenLabs is not set up');
  if (!VOICE_ID.test(voiceId)) throw new Error('Not a voice id');
  const model0 = modelId();
  const read = (model: string) => {
    const v4 = model.startsWith('eleven_v4');
    // Only v4 performs delivery tags; an older model would read "[laughs]" out loud.
    const say = (t?: string) => (t === undefined ? undefined : v4 ? t : plainLine(t));
    return el.textToSpeech.convert(voiceId, {
      text: say(text)!,
      modelId: model,
      outputFormat: 'mp3_44100_128',
      previousText: say(around.previous),
      nextText: say(around.next),
      // A sports-radio read: lively, a little loose, the voice's own character up front. v4 takes
      // only these two; older models also take style and speaker boost.
      voiceSettings: v4
        ? { stability: 0.5, similarityBoost: 0.8 }
        : { stability: 0.4, similarityBoost: 0.8, style: 0.35, useSpeakerBoost: true },
    });
  };
  try {
    return await read(model0);
  } catch (err) {
    // A model the account or voice can't use (400/403/422): the line is still recorded, on the
    // previous generation, rather than falling back to the browser's voice.
    const status = (err as { statusCode?: number }).statusCode;
    if (model0 === 'eleven_multilingual_v2' || !status || ![400, 403, 422].includes(status)) throw err;
    console.warn('[elevenlabs]', model0, 'refused with', status, '; using eleven_multilingual_v2');
    return read('eleven_multilingual_v2');
  }
}
