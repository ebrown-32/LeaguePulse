/**
 * The Desk Weekly: a comedy recap of the league's week, by a panel off the AI Desk.
 *
 *   The panel    three or four of the league's own Desk personalities (writers and fans, the cast
 *                its admin configures), a different random group every episode
 *   The script   Claude writes the banter, in chapters (cold open, the games, the standings, a
 *                move, a hot take, the sign-off), each host in their own voice, from the league brief:
 *                the same complete record every Feed post is written from, and fact-checked the
 *                same way (generate.ts publishable).
 *   The visuals  each chapter names what it's about by reference (a matchup, a team, a move, the
 *                standings) and the numbers on screen are filled in here from the brief, never
 *                written by the model, so a score in the player is always the real score.
 *   The voices   recorded by ElevenLabs when the platform has ELEVENLABS_API_KEY
 *                (api/podcast/audio); without it, read in the listener's browser (Web Speech),
 *                each host a different voice.
 *
 * One episode a week, after the week is final (the AI cron, Tuesdays). Admins can also record any
 * earlier week of the season from the AI Desk admin: a look back, written from that week as it
 * stood (podcastWeek.ts), not from today's table. One episode per week; recording a week again
 * replaces it. A season's worth are kept, per league, latest week first.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { getRedis } from '@/lib/redisClient';
import { claude, GROUNDING_RULES, MODEL_SMART, stripDashes } from './claude';
import { publishable } from './generate';
import { buildLeagueBrief, type BriefMatchup, type BriefMove } from './leagueBrief';
import { weekSnapshot, type SnapshotTeam } from './podcastWeek';
import { personaAvatarUrl } from './avatar';
import type { Personality } from './personalities';
import { DELIVERY_TAGS, EPISODE_CHARS, keepDeliveryTags } from '@/lib/podcastText';

export type Visual =
  | { type: 'matchup'; week: number; home: VisualTeam; away: VisualTeam; margin: number }
  | { type: 'team'; team: string; manager: string; record: string; rank: number; pointsFor: number; top: { name: string; position: string; points: number | null }[] }
  | { type: 'standings'; rows: { rank: number; team: string; record: string; pointsFor: number }[] }
  | { type: 'move'; kind: 'trade' | 'waiver' | 'free_agent'; week: number; summary: string };

/** A side of a game: `userId` and `avatar` (the manager) find its stadium for the highlights. */
export interface VisualTeam { team: string; points: number; userId?: string; avatar?: string }

export interface Host { id: string; name: string; handle: string; avatar: string; accent: string; voiceId?: string }
/** `host`: which of the episode's hosts says it (an index into Episode.hosts). */
export interface Line { host: number; text: string }
export type ChapterKind = 'open' | 'games' | 'standings' | 'move' | 'take' | 'close';
export interface Chapter { title: string; kind: ChapterKind; visual: Visual | null; lines: Line[] }
export interface Episode {
  id: string;
  leagueName: string;
  season: string;
  week: number;
  number: number;
  title: string;
  teaser: string;
  createdAt: string;
  hosts: Host[];
  chapters: Chapter[];
}

const KEY = 'lp_podcast_episodes';
const KEEP = 20;

export async function listEpisodes(): Promise<Episode[]> {
  const { client } = getRedis();
  if (!client) return [];
  try { const raw = await client.get(KEY); return raw ? (JSON.parse(raw) as Episode[]) : []; } catch { return []; }
}

export async function getEpisode(id: string): Promise<Episode | null> {
  return (await listEpisodes()).find(e => e.id === id) ?? null;
}

/** Keeps `ep`, in place of any earlier recording of the same week, latest week first. */
async function saveEpisode(ep: Episode): Promise<void> {
  const { client } = getRedis();
  if (!client) throw new Error('The podcast needs storage (REDIS_URL) to keep its episodes.');
  const before = await listEpisodes();
  const all = before.filter(e => e.id !== ep.id && !(e.season === ep.season && e.week === ep.week));
  const sorted = [ep, ...all].sort((a, b) => b.season.localeCompare(a.season) || b.week - a.week || b.createdAt.localeCompare(a.createdAt));
  const kept = sorted.slice(0, KEEP);
  await client.set(KEY, JSON.stringify(kept));
  // Recordings of episodes that were replaced or aged out go with them, so storage doesn't grow.
  const gone = before.filter(e => !kept.some(k => k.id === e.id));
  if (gone.length) {
    const { forgetEpisode } = await import('./podcastAudio');
    await Promise.all(gone.map(e => forgetEpisode(e.id, e.chapters.length)));
  }
}

// ── The script ─────────────────────────────────────────────────────────────

/** How long an episode is written to be, in characters (about ninety seconds), and the most it may be. */
const EPISODE_TARGET = EPISODE_CHARS;
const EPISODE_MAX = 1_900;
const scriptCharacters = (s: Script) => s.chapters.reduce((n, c) => n + c.lines.reduce((m, l) => m + keepDeliveryTags(l.text).length, 0), 0);

/** The script's shape, for a panel of `n` hosts. */
function scriptSchema(n: number) {
  const chapter = z.object({
    title: z.string().describe('Two to five words, punchy, like a segment name on a sports show'),
    kind: z.enum(['open', 'games', 'standings', 'move', 'take', 'close']),
    ref: z.string().describe('What this chapter shows on screen: one of the REFERENCE ids given (e.g. "matchup:2", "team:3", "move:0", "standings"), or "none"'),
    lines: z.array(z.object({
      host: z.number().int().min(0).max(n - 1).describe(`Which host speaks: 0 to ${n - 1}, as numbered in THE PANEL`),
      text: z.string().describe('One spoken turn: a short sentence, or a quick reaction of a few words ("Oh no.", "Wait, what?"). Under about 110 characters. A turn that gets cut off ends with "..." and the next turn starts with [interrupting] or [cuts in]'),
    })).min(2).max(9),
  });
  return z.object({
    title: z.string().describe('The episode title: a headline for the week, under eight words, ideally funny'),
    teaser: z.string().describe('One sentence that makes a manager press play'),
    chapters: z.array(chapter).min(3).max(4),
  });
}
type Script = z.infer<ReturnType<typeof scriptSchema>>;

/** The things a chapter may show, numbered for the model, filled in here from the record. */
function references(games: BriefMatchup[], teamsIn: SnapshotTeam[], movesIn: BriefMove[]): { text: string; resolve: (ref: string) => Visual | null } {
  const teams = [...teamsIn].sort((x, y) => x.rank - y.rank);
  const moves = movesIn.slice(0, 6);
  const text = [
    'REFERENCES (what a chapter can put on screen; use the id):',
    ...games.map((m, i) => `matchup:${i} = week ${m.week}, ${m.home.teamName} ${m.home.points} vs ${m.away.teamName} ${m.away.points}`),
    ...teams.map((t, i) => `team:${i} = ${t.teamName} (${t.manager}), ${t.record}, rank ${t.rank}`),
    ...moves.map((m, i) => `move:${i} = ${m.type}, week ${m.week}: ${m.summary}`),
    'standings = the table, top to bottom',
  ].join('\n');
  const resolve = (ref: string): Visual | null => {
    const [kind, n] = ref.trim().split(':');
    const i = Number(n);
    if (kind === 'matchup' && games[i]) {
      const m = games[i];
      return { type: 'matchup', week: m.week, home: { team: m.home.teamName, points: m.home.points, userId: m.home.userId, avatar: m.home.avatar }, away: { team: m.away.teamName, points: m.away.points, userId: m.away.userId, avatar: m.away.avatar }, margin: m.margin };
    }
    if (kind === 'team' && teams[i]) {
      const t = teams[i];
      return { type: 'team', team: t.teamName, manager: t.manager, record: t.record, rank: t.rank, pointsFor: t.pointsFor, top: t.topPlayers.slice(0, 3) };
    }
    if (kind === 'move' && moves[i]) return { type: 'move', kind: moves[i].type, week: moves[i].week, summary: moves[i].summary };
    if (kind === 'standings') return { type: 'standings', rows: teams.slice(0, 6).map(t => ({ rank: t.rank, team: t.teamName, record: t.record, pointsFor: t.pointsFor })) };
    return null;
  };
  return { text, resolve };
}

/**
 * The panel: three or four of the Desk's enabled personalities, writers and fans alike, a fresh
 * random group every episode (fewer only when the Desk has fewer).
 */
function pickHosts(people: Personality[]): Personality[] | null {
  const pool = people.filter(p => p.enabled && !p.hidden);
  if (pool.length < 2) return null;
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.min(pool.length, Math.random() < 0.5 ? 3 : 4));
}

interface Brief { context: string; refs: string; focus: string }

async function writeScript(hosts: Personality[], { context, refs, focus }: Brief, correction = ''): Promise<Script> {
  const panel = hosts.map((h, i) => `${i}. ${h.name} (${h.handle}), ${(h.type ?? 'media') === 'fan' ? 'a fan from the group chat' : 'a Desk writer'}. Voice: ${h.voice}`).join('\n');
  const { object } = await generateObject({
    model: claude(MODEL_SMART),
    schema: scriptSchema(hosts.length),
    schemaName: 'Episode',
    system: `${GROUNDING_RULES}

YOU ARE WRITING AN AUDIO COMEDY SHOW, "The Desk Weekly": the league's week, recapped by a panel
that can't stand each other and can't stop talking.

THE PANEL (number each line with the host who says it):
${panel}

Every host sounds like themselves, from their first word. Someone who knows this cast names the
speaker without being told.`,
    prompt: `${context}

${refs}

${focus}

IT HAS TO SOUND LIKE A REAL SHOW. Sports talk radio with three or four friends who've had a
coffee too many: nobody waits their turn politely, nobody reads a paragraph.
- Most turns are short. Mix one-sentence points with quick reactions of two to five words: "Oh
  no.", "Stop it.", "He did not.", "Okay, okay, okay.", "Wait, say that again."
- People cut each other off. A turn trails into "..." mid-thought and the next one starts with
  [interrupting] or [cuts in]. Someone talks over a punchline with [overlapping]. Do this two or
  three times an episode, not every line.
- Laughter is real and uneven: a host [starts laughing] at their own joke, another loses it
  ([laughs harder], [wheezing]) at someone else's, somebody refuses to laugh ([deadpan]).
- Real speech, not writing: "I mean", "look", "here's the thing", "no, because", starting a
  sentence over, repeating a word for emphasis. One or two per host, not in every line.
- Hosts react to each other by name, agree loudly, disagree louder, and somebody always circles
  back to a point that was supposedly settled.

IT HAS TO BE FUNNY. This is a comedy show with real numbers, not a news bulletin with jokes.
- Bits, not one-liners: a running gag that comes back in the sign-off, a callback to the cold open.
- The hosts roast the managers, the lineups and each other. Somebody always takes it personally.
- Interruptions and pile-ons: short turns, people cutting in, a host who keeps getting talked over.
- Specific beats generic. The joke is in the real score, the real benching, the real trade.
- Everyone gets at least one laugh.

KEEP IT SHORT: about ninety seconds, ${EPISODE_TARGET.toLocaleString('en-US')} characters across the whole episode, and
never more than ${EPISODE_MAX.toLocaleString('en-US')}. Count them. Three or four chapters, two to five turns each, one short
sentence a turn. Pick the week's one or two best storylines and leave everything else out: a
ninety-second show that kills beats a long one that sags.

The shape (three or four chapters):
- open: a cold open, straight into the week's best game (the blowout or the nail-biter). No
  "welcome to the show" filler.
- then one or two of these, whichever has the best material this week:
  - games: a second game, only if it's genuinely funny.
  - standings: where the table stands and what it means.
  - move: a trade or a pickup worth arguing about.
  - take: a hot take that splits the panel.
- close: a sign-off in two or three quick turns, ideally landing the running gag.

WRITTEN FOR THE EAR. Short sentences. Contractions. Say numbers the way people say them
("one twenty-four" for 124.3 is fine, or "a hundred and twenty-four"). No lists, no
parentheses, no emoji, no hashtags, no stage directions.

PERFORMED, NOT READ. The voices are recorded by actors who act out bracketed cues. Use them
where a real person would actually do it, at most two in a line and in about half the lines:
${DELIVERY_TAGS.map(t => `[${t}]`).join(' ')}
e.g. "[scoffs] Eighty-eight points. That's not a team, that's a cry for help."
e.g. "So the trade itself was actually..." then "[interrupting] Don't. Do not defend that trade."
Nothing else goes in brackets. The cues count toward the length, so don't pile them up.

Call managers by name. Every claim comes from the league context above: the
scores, records and moves are the real ones. Each chapter's ref must point at the thing it's
about.
${correction}`,
  });
  return stripDashes(object);
}

// ── Casting ────────────────────────────────────────────────────────────────

const CASTING_KEY = 'lp_podcast_casting';

/** Said up front, because the week after is often under way when an episode is written. */
const GAME_STATUS_NOTE = 'TIMING: this episode is set at the moment its week ended. Games, scores, records and news from later weeks are off limits, even ones you might have heard of.';

/**
 * A speaking voice for every host, matched to who they are. The admin's pick wins; otherwise the
 * personality keeps the voice they were cast with before; otherwise Claude casts them from the
 * ElevenLabs voices on offer, by their description against each voice's (a bellowing 1970s anchor
 * gets a big, warm, older voice, not a soft narrator), and that casting is kept for next time.
 * The kept casting belongs to the voices on offer when it was made: when voices are added to or
 * removed from the account, everyone is cast again from the new pool, so new voices get used.
 * Everyone on a panel sounds different. Returns host id to voice id; anyone it can't cast is left
 * to the recorder's own fallback.
 */
async function castPanel(hosts: Personality[]): Promise<Record<string, string>> {
  const { listVoices } = await import('./elevenlabs');
  const voices = await listVoices().catch(() => []);
  if (!voices.length) return {};
  const offered = new Set(voices.map(v => v.id));
  const { client } = getRedis();
  const pool = [...offered].sort().join(',');
  let kept: Record<string, string> = {};
  try {
    const saved = JSON.parse((await client?.get(CASTING_KEY)) ?? '{}') as { pool?: string; cast?: Record<string, string> };
    if (saved.pool === pool && saved.cast) kept = saved.cast;
  } catch { /* none yet */ }

  const out: Record<string, string> = {};
  const taken = new Set<string>();
  for (const h of hosts) if (h.voiceId && offered.has(h.voiceId) && !taken.has(h.voiceId)) { out[h.id] = h.voiceId; taken.add(h.voiceId); }
  for (const h of hosts) {
    const v = kept[h.id];
    if (!out[h.id] && v && offered.has(v) && !taken.has(v)) { out[h.id] = v; taken.add(v); }
  }

  const uncast = hosts.filter(h => !out[h.id]);
  const free = voices.filter(v => !taken.has(v.id));
  if (uncast.length && free.length >= uncast.length) {
    try {
      const { object } = await generateObject({
        model: claude(MODEL_SMART),
        schema: z.object({ casting: z.array(z.object({ host: z.string(), voice: z.string() })) }),
        schemaName: 'Casting',
        prompt: `You are casting voice actors for a funny fantasy football podcast. Give each host the voice that best fits who they are: age, energy, attitude, accent where it matters. Each host gets a different voice.

HOSTS:
${uncast.map(h => `- id ${h.id}: ${h.name}, ${h.tagline}. ${h.voice.slice(0, 400)}`).join('\n')}

VOICES (id: name, what it sounds like):
${free.map(v => `- ${v.id}: ${v.name}${v.description ? `, ${v.description}` : ''}`).join('\n')}

Answer with one voice id per host id, from the list.`,
      });
      for (const { host, voice } of object.casting) {
        if (uncast.some(h => h.id === host) && !out[host] && offered.has(voice) && !taken.has(voice)) {
          out[host] = voice; taken.add(voice); kept[host] = voice;
        }
      }
      await client?.set(CASTING_KEY, JSON.stringify({ pool, cast: kept })).catch(() => {});
    } catch (err) {
      console.error('[podcast] casting failed; voices fall back to the default casting', err instanceof Error ? err.message : err);
    }
  }
  return out;
}

// ── Re-recording ───────────────────────────────────────────────────────────

/**
 * An admin may replace one of the league's episodes once a week. A re-record is a new episode:
 * a new script, and a new recording paid for again when it's played. Recording a week that has
 * no episode yet isn't limited, and neither is the Tuesday episode. Without Redis (local
 * development) there is no limit.
 */
const RERECORD_GAP_S = 7 * 24 * 3600;
const RERECORD_CLAIM = 'lp_podcast_rerecord_claim';
const RERECORD_AT = 'lp_podcast_rerecorded_at';

export class RerecordTooSoon extends Error {
  constructor(public nextAt: string) {
    super(`This league re-recorded an episode in the last week. The next re-record opens ${new Date(nextAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`);
  }
}

/** When this league may next re-record an episode, or null if it may now. */
export async function nextRerecordAt(): Promise<string | null> {
  const { client: redis } = getRedis();
  const at = Number(await redis?.get(RERECORD_AT).catch(() => null));
  if (!at) return null;
  const next = at + RERECORD_GAP_S * 1000;
  return next > Date.now() ? new Date(next).toISOString() : null;
}

/** Takes this week's re-record, or throws RerecordTooSoon. Returns a refund for a failed recording. */
async function claimRerecord(): Promise<() => Promise<void>> {
  const { client: redis } = getRedis();
  if (!redis) return async () => {};
  const next = await nextRerecordAt();
  if (next) throw new RerecordTooSoon(next);
  // Two clicks at once: only the first gets it.
  const n = await redis.incrby(RERECORD_CLAIM, 1);
  if (n === 1) await redis.expire(RERECORD_CLAIM, RERECORD_GAP_S);
  else throw new RerecordTooSoon(new Date(Date.now() + RERECORD_GAP_S * 1000).toISOString());
  await redis.set(RERECORD_AT, String(Date.now()), RERECORD_GAP_S);
  return async () => { await Promise.all([redis.del(RERECORD_CLAIM), redis.del(RERECORD_AT)]).catch(() => {}); };
}

/**
 * Writes, checks and keeps an episode: the latest finished week by default, or `week`, an earlier
 * week of this season, as a look back. `admin`: asked for from the AI Desk admin, where replacing
 * an episode is limited to once a week (claimRerecord).
 */
export async function publishEpisode(week?: number, { admin = false }: { admin?: boolean } = {}): Promise<Episode> {
  const [brief, { getPersonalities }] = await Promise.all([buildLeagueBrief(), import('./store')]);
  const hosts = pickHosts(await getPersonalities());
  if (!hosts) throw new Error('The podcast needs at least two personalities on the Desk.');

  const latest = Math.max(0, ...brief.recentMatchups.map(m => m.week));
  const target = week ?? latest;
  if (!target || !Number.isInteger(target) || target < 1 || target > latest) {
    throw new Error(latest ? `Pick a week from 1 to ${latest}.` : 'No week of this season has finished yet.');
  }

  const replacing = (await listEpisodes()).some(e => e.season === brief.season && e.week === target);
  const refund = admin && replacing ? await claimRerecord() : null;
  try {
    const ep = await writeEpisode(brief, hosts, target);
    await announceEpisode(ep, hosts[0], latest);
    return ep;
  } catch (err) {
    await refund?.();
    throw err;
  }
}

async function writeEpisode(brief: Awaited<ReturnType<typeof buildLeagueBrief>>, hosts: Personality[], target: number): Promise<Episode> {

  // Every episode, the latest week's included, is written from the week as it stood when it
  // finished (podcastWeek.ts), never from the live brief: that carries the week in progress, and
  // its scores and storylines leaked into last week's episode.
  const snap = await weekSnapshot(brief, target);
  if (!snap.games.length) throw new Error(`Week ${target} has no finished games on record.`);
  const refsOf = references(snap.games, snap.table, snap.moves);
  const ctx: Brief = {
    context: `${GAME_STATUS_NOTE}\n\nLEAGUE CONTEXT FOR THIS EPISODE (the complete, authoritative record of week ${target}):\n\n${snap.text}`,
    refs: refsOf.text,
    focus: `Write the episode for week ${target}: a recap of that week, for the managers in this league, as if it had just been played. Week ${target + 1} and anything after it doesn't exist yet.`,
  };

  // Cast while the script is written: the two don't depend on each other.
  const casting = castPanel(hosts).catch(() => ({} as Record<string, string>));
  const first = await writeScript(hosts, ctx);
  // A look back is checked against the trade record only: the standings and game-status checks
  // compare against today, which a week-3 record would fail while being right.
  // Checked against the trade record only: the standings and game-status checks compare against
  // today, which a record that was right after week 7 would fail.
  let script = await publishable(first, async correction => writeScript(hosts, ctx, `\nFIX THESE BEFORE ANYTHING ELSE:\n${correction}`), { tradesOnly: true });
  // Every character is paid for when it's recorded: a script over the limit is cut once, by the
  // writer, and the shorter of the two is kept.
  if (scriptCharacters(script) > EPISODE_MAX) {
    const cut = `\nTOO LONG: the last draft was ${scriptCharacters(script).toLocaleString('en-US')} characters. Write it again at ${EPISODE_TARGET.toLocaleString('en-US')} or fewer: fewer turns, shorter turns, one storyline fewer. Keep the best jokes.`;
    const shorter = await publishable(await writeScript(hosts, ctx, cut), async correction => writeScript(hosts, ctx, `${cut}\nFIX THESE BEFORE ANYTHING ELSE:\n${correction}`), { tradesOnly: true }).catch(() => null);
    if (shorter && scriptCharacters(shorter) < scriptCharacters(script)) script = shorter;
  }

  const cast = await casting;
  const host = (p: Personality): Host => {
    const voiceId = cast[p.id] ?? p.voiceId;
    return { id: p.id, name: p.name, handle: p.handle, avatar: personaAvatarUrl(p), accent: p.accent, ...(voiceId ? { voiceId } : {}) };
  };
  const ep: Episode = {
    id: `${brief.season}-w${target}-${Date.now().toString(36)}`,
    leagueName: brief.leagueName,
    season: brief.season,
    week: target,
    // One episode a week, numbered by it: week 8's episode is episode 8, whenever it was recorded.
    number: target,
    title: script.title,
    teaser: script.teaser,
    createdAt: new Date().toISOString(),
    hosts: hosts.map(host),
    chapters: script.chapters.map(c => ({
      title: c.title, kind: c.kind, visual: c.ref === 'none' ? null : refsOf.resolve(c.ref),
      lines: c.lines.map(l => ({ host: Math.max(0, Math.min(hosts.length - 1, l.host)), text: keepDeliveryTags(l.text) })).filter(l => l.text),
    })).filter(c => c.lines.length),
  };
  await saveEpisode(ep);
  await recordInBackground(ep);
  return ep;
}

/**
 * The episode's chapters recorded straight after it's written, in the background (podcastRecord),
 * so the first listener hears the panel at once rather than waiting on each chapter. Only with
 * recorded voices set up, and only where there's a request to finish after (a route).
 */
async function recordInBackground(ep: Episode): Promise<void> {
  if (!process.env.ELEVENLABS_API_KEY?.trim()) return;
  try {
    const [{ after }, { currentTenant, runAsTenant }, { recordEpisode }] = await Promise.all([
      import('next/server'), import('@/lib/tenant/context'), import('./podcastRecord'),
    ]);
    const tenant = await currentTenant().catch(() => null);
    after(() => runAsTenant(tenant, () => recordEpisode(ep)));
  } catch (err) {
    console.warn('[podcast] could not record in the background', err instanceof Error ? err.message : err);
  }
}

/**
 * The drop: a new week's episode, posted to The Feed by its first host, with the episode's cover
 * (api/podcast/thumb) and a link to it. Once a week: a re-record, or a look back at an earlier
 * week, doesn't post again. Never fails the episode: a Feed that can't be written to just
 * misses the post.
 */
async function announceEpisode(ep: Episode, host: Personality, latestWeek: number): Promise<void> {
  if (ep.week !== latestWeek) return;
  try {
    const { addPost, getPosts } = await import('./store');
    const posted = (await getPosts(100)).some(p => p.kind === 'episode' && p.content?.season === ep.season && p.content?.week === ep.week);
    if (posted) return;
    const now = new Date().toISOString();
    await addPost({
      id: `ep-${ep.id}`,
      personalityId: host.id,
      personaName: host.name,
      personaHandle: host.handle,
      personaAccent: host.accent,
      personaType: host.type ?? 'media',
      personaAvatar: personaAvatarUrl(host),
      kind: 'episode',
      content: {
        text: `New Desk Weekly is up. ${ep.teaser}`,
        episodeId: ep.id, title: ep.title, teaser: ep.teaser, week: ep.week, season: ep.season,
        hosts: ep.hosts.map(h => ({ name: h.name, avatar: h.avatar })),
      },
      createdAt: now,
      publishAt: now,
      source: 'cron',
    });
  } catch (err) {
    console.error('[podcast] could not post the episode to the Feed', err instanceof Error ? err.message : err);
  }
}

/** For the admin: the season's finished weeks, each with its episode if it has one. */
export async function episodeWeeks(): Promise<{ season: string; nextRerecordAt: string | null; weeks: { week: number; episode: { id: string; title: string; createdAt: string } | null }[] }> {
  const [brief, nextAt] = await Promise.all([buildLeagueBrief(), nextRerecordAt()]);
  const latest = Math.max(0, ...brief.recentMatchups.map(m => m.week));
  const eps = (await listEpisodes()).filter(e => e.season === brief.season);
  return {
    season: brief.season,
    nextRerecordAt: nextAt,
    weeks: Array.from({ length: latest }, (_, i) => latest - i).map(week => {
      const e = eps.find(x => x.week === week);
      return { week, episode: e ? { id: e.id, title: e.title, createdAt: e.createdAt } : null };
    }),
  };
}

/** For the cron: once a week, on Tuesday (Eastern) after the week is final, if there isn't one yet. */
export async function maybePublishWeekly(): Promise<{ published?: string; skipped?: string }> {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date());
  if (weekday !== 'Tue') return { skipped: 'not-tuesday' };
  const brief = await buildLeagueBrief();
  const week = Math.max(0, ...brief.recentMatchups.map(m => m.week));
  if (!week) return { skipped: 'no-games-yet' };
  const latest = (await listEpisodes())[0];
  if (latest && latest.season === brief.season && latest.week >= week) return { skipped: 'already-published' };
  const ep = await publishEpisode();
  return { published: ep.id };
}
