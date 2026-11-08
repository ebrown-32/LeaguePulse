/**
 * League Wrapped's own music: an original instrumental written for a league's season by
 * ElevenLabs Music, in a mood that season earned. Until there is one, and where there can't be,
 * the story plays its synthesized loop (lib/wrapped/music), which is always there.
 *
 *   A finished season   one track, made the first time anyone opens its story, kept for good
 *   All time            one track, made again every few months as the league's story grows
 *   A season underway   no track: its story isn't finished, so it keeps the synthesized loop
 *
 * The mood comes from the season itself: a champion who ran away with it gets a coronation, a
 * champion who barely got in gets an underdog anthem, a season of trades gets chaos, a season of
 * blowouts gets menace. Within a mood the genre varies, so two leagues (or two seasons) rarely
 * sound alike.
 *
 * Paid from the platform's ElevenLabs month (lib/ai/elevenlabs spendPlatform), not the league's
 * podcast allowance; a track is about a minute, which ElevenLabs counts as about 900 credits.
 * Needs ELEVENLABS_API_KEY, Redis and Vercel Blob (BLOB_READ_WRITE_TOKEN): without any of them,
 * the synthesized loop. Server only.
 */

import 'server-only';
import { getRedis } from '@/lib/redisClient';
import type { Wrapped } from './engine';

/** `stale`: the all-time track is due a new one (it still plays until that's made). */
export interface Soundtrack { url: string; mood: Mood; at: string; stale?: boolean }
export type Mood = 'coronation' | 'underdog' | 'chaos' | 'carnage' | 'hype' | 'legacy';

const LENGTH_MS = 60_000;
/** What ElevenLabs counts for a minute of music, charged to the platform's month. */
export const TRACK_CREDITS = 900;
/** How long the all-time story keeps a track before a new one is written. */
const ALL_TIME_DAYS = 120;

const key = (scope: string) => `lp_wrapped_track:${scope}`;
const lockKey = (scope: string) => `lp_wrapped_track_lock:${scope}`;
/** After a failed attempt, a rest before the next: a broken key or an outage isn't retried on every visit. */
const restKey = (scope: string) => `lp_wrapped_track_rest:${scope}`;

/** The track for a story (`scope` a season, or 'all'), if there is one and it's still current. */
export async function storedSoundtrack(scope: string): Promise<Soundtrack | null> {
  const { client } = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(key(scope));
    if (!raw) return null;
    const t = JSON.parse(raw) as Soundtrack;
    return { ...t, stale: scope === 'all' && Date.now() - new Date(t.at).getTime() > ALL_TIME_DAYS * 86_400_000 };
  } catch { return null; }
}

/** Whether a track can be made here at all. */
export function canCompose(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim() && process.env.BLOB_READ_WRITE_TOKEN?.trim() && getRedis().client);
}

// ── The mood ───────────────────────────────────────────────────────────────

const winShare = (record: string) => {
  const [w = 0, l = 0, t = 0] = record.split('-').map(Number);
  return w + l + t ? (w + t / 2) / (w + l + t) : 0.5;
};

export function moodOf(w: Wrapped): Mood {
  if (w.scope === 'all') return 'legacy';
  const L = w.league;
  const champ = L.champions[0];
  const share = champ ? winShare(champ.record) : 0.5;
  if (champ && share >= 0.78) return 'coronation';
  if (champ && share <= 0.56) return 'underdog';
  if (L.trades >= Math.max(6, L.managers * 1.5)) return 'chaos';
  if ((L.blowout?.margin ?? 0) >= 70) return 'carnage';
  return 'hype';
}

/** Each mood's feel, and a few genres to dress it in. No artists or songs named: original only. */
const MOODS: Record<Mood, { feel: string; genres: string[] }> = {
  coronation: {
    feel: 'triumphant and victorious, a coronation: a champion who ran away with it. Confident swagger, huge payoff energy',
    genres: ['stadium anthem with massive marching drums and bold brass', 'triumphant orchestral hybrid trailer with pounding percussion and choir-like synth pads', 'hard-hitting victory hip-hop beat with brass stabs and 808s'],
  },
  underdog: {
    feel: 'an underdog story: tense and hungry at first, then breaking through into euphoric, against-the-odds triumph',
    genres: ['cinematic rising anthem with driving toms, pulsing synths and a big euphoric lift', 'anthemic indie rock with stomping drums, claps and soaring guitars', 'uplifting progressive house with a long build and a massive drop'],
  },
  chaos: {
    feel: 'pure chaos and mayhem, a season of wild trades and nobody knowing what happens next. Playful, frantic, unpredictable but still hype',
    genres: ['frantic trap with glitchy hi-hat rolls, distorted 808s and stuttering synth hooks', 'high-energy breakbeat with chopped samples and wobbling bass', 'punchy electro-funk with slap bass, synth brass and quick fills'],
  },
  carnage: {
    feel: 'aggressive and menacing, a season of blowouts and nobody shown mercy. Heavy, dark, hard-hitting swagger',
    genres: ['dark aggressive hip-hop with heavy 808s, ominous brass and hard snares', 'heavy rock-trap hybrid with distorted guitar riffs and booming drums', 'menacing drum and bass with reese bass and a relentless beat'],
  },
  hype: {
    feel: 'a sports arena at full volume before kickoff: bright, punchy, high-energy hype that makes you want to run through a wall',
    genres: ['sports arena hype with big drums, crowd-chant style synth hooks and claps', 'festival electro house with a punchy kick and bright supersaw leads', 'upbeat funk-rock with tight drums, horn section hits and a driving bassline'],
  },
  legacy: {
    feel: 'an epic look back at a whole league history: nostalgic for a moment, then proud and huge, like a career highlight montage',
    genres: ['epic cinematic sports montage anthem with soaring strings, pounding drums and a heroic melody', 'anthemic arena rock with big guitars, stomps and a triumphant lead', 'emotional yet hype orchestral hip-hop with strings, piano and heavy drums'],
  },
};

const pick = <T,>(xs: T[], seed: string) => {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return xs[h % xs.length];
};

export function promptFor(mood: Mood, seed: string): string {
  const m = MOODS[mood];
  return [
    `Instrumental only, no vocals. ${pick(m.genres, seed)}.`,
    `Mood: ${m.feel}.`,
    'Background music for a fast, punchy end-of-season highlights story about a fantasy football league.',
    'Around 120 to 130 BPM, a strong steady beat from the first second, consistent energy all the way through,',
    'no long intro, no fade out and no big ending, so it loops cleanly. Clean modern mix, punchy low end.',
  ].join(' ');
}

// ── Making one ─────────────────────────────────────────────────────────────

/**
 * Writes the track for a story, once: the first caller gets the lock, everyone else keeps the
 * synthesized loop meanwhile. Charged before it's made and given back if it fails.
 */
export async function composeSoundtrack(scope: string, w: Wrapped, site: string): Promise<Soundtrack | null> {
  const { client } = getRedis();
  if (!client || !canCompose()) return null;
  if (await client.get(restKey(scope)).catch(() => null)) return null;
  const n = await client.incrby(lockKey(scope), 1);
  if (n === 1) await client.expire(lockKey(scope), 600);
  else return null;
  const { spendPlatform, refundPlatform, composeMusic } = await import('@/lib/ai/elevenlabs');
  let paid = false;
  try {
    if (!(await spendPlatform(TRACK_CREDITS))) { await client.set(restKey(scope), '1', 24 * 3600); return null; }
    paid = true;
    const mood = moodOf(w);
    const at = new Date().toISOString();
    const audio = await composeMusic(promptFor(mood, `${site}:${scope}:${at.slice(0, 7)}`), LENGTH_MS);
    const { put, del } = await import('@vercel/blob');
    const { currentTenant } = await import('@/lib/tenant/context');
    const slug = (await currentTenant().catch(() => null))?.slug ?? 'league';
    const blob = await put(`wrapped/${slug}/${scope}.mp3`, audio, { access: 'public', contentType: 'audio/mpeg', addRandomSuffix: true, cacheControlMaxAge: 31536000 });
    const track: Soundtrack = { url: blob.url, mood, at };
    const old = await storedSoundtrack(scope);
    await client.set(key(scope), JSON.stringify(track));
    if (old?.url) await del(old.url).catch(() => {});
    return track;
  } catch (err) {
    if (paid) await refundPlatform(TRACK_CREDITS);
    await client.set(restKey(scope), '1', 6 * 3600).catch(() => {});
    const e = err as { statusCode?: number; message?: string };
    console.error('[wrapped/soundtrack]', e.statusCode ?? '', String(e.message ?? err).slice(0, 300));
    return null;
  } finally {
    await client.del(lockKey(scope)).catch(() => {});
  }
}
