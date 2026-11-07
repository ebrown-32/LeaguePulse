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
 * One episode a week, after the week is final (the AI cron, Tuesdays), or when the admin asks.
 * The last eight are kept, per league.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { getRedis } from '@/lib/redisClient';
import { claude, GROUNDING_RULES, MODEL_SMART, stripDashes } from './claude';
import { briefBlock, publishable } from './generate';
import { buildLeagueBrief, type LeagueBrief } from './leagueBrief';
import { personaAvatarUrl } from './avatar';
import type { Personality } from './personalities';

export type Visual =
  | { type: 'matchup'; week: number; home: { team: string; points: number }; away: { team: string; points: number }; margin: number }
  | { type: 'team'; team: string; manager: string; record: string; rank: number; pointsFor: number; top: { name: string; position: string; points: number | null }[] }
  | { type: 'standings'; rows: { rank: number; team: string; record: string; pointsFor: number }[] }
  | { type: 'move'; kind: 'trade' | 'waiver' | 'free_agent'; week: number; summary: string };

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
const KEEP = 8;

export async function listEpisodes(): Promise<Episode[]> {
  const { client } = getRedis();
  if (!client) return [];
  try { const raw = await client.get(KEY); return raw ? (JSON.parse(raw) as Episode[]) : []; } catch { return []; }
}

export async function getEpisode(id: string): Promise<Episode | null> {
  return (await listEpisodes()).find(e => e.id === id) ?? null;
}

async function saveEpisode(ep: Episode): Promise<void> {
  const { client } = getRedis();
  if (!client) throw new Error('The podcast needs storage (REDIS_URL) to keep its episodes.');
  const all = (await listEpisodes()).filter(e => e.id !== ep.id);
  await client.set(KEY, JSON.stringify([ep, ...all].slice(0, KEEP)));
}

// ── The script ─────────────────────────────────────────────────────────────

/** The script's shape, for a panel of `n` hosts. */
function scriptSchema(n: number) {
  const chapter = z.object({
    title: z.string().describe('Two to five words, punchy, like a segment name on a sports show'),
    kind: z.enum(['open', 'games', 'standings', 'move', 'take', 'close']),
    ref: z.string().describe('What this chapter shows on screen: one of the REFERENCE ids given (e.g. "matchup:2", "team:3", "move:0", "standings"), or "none"'),
    lines: z.array(z.object({
      host: z.number().int().min(0).max(n - 1).describe(`Which host speaks: 0 to ${n - 1}, as numbered in THE PANEL`),
      text: z.string().describe('One spoken turn: one to three sentences, written to be heard, not read'),
    })).min(3).max(10),
  });
  return z.object({
    title: z.string().describe('The episode title: a headline for the week, under eight words, ideally funny'),
    teaser: z.string().describe('One sentence that makes a manager press play'),
    chapters: z.array(chapter).min(4).max(7),
  });
}
type Script = z.infer<ReturnType<typeof scriptSchema>>;

/** The things a chapter may show, numbered for the model, filled in from the brief here. */
function references(b: LeagueBrief): { text: string; resolve: (ref: string) => Visual | null } {
  const lastWeek = Math.max(0, ...b.recentMatchups.map(m => m.week));
  const games = b.recentMatchups.filter(m => m.week === lastWeek);
  const teams = [...b.teams].sort((x, y) => x.rank - y.rank);
  const moves = b.recentMoves.slice(0, 6);
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
      return { type: 'matchup', week: m.week, home: { team: m.home.teamName, points: m.home.points }, away: { team: m.away.teamName, points: m.away.points }, margin: m.margin };
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

async function writeScript(hosts: Personality[], refs: string, correction = ''): Promise<Script> {
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
    prompt: `${await briefBlock()}

${refs}

Write this week's episode: a recap of the week just played, for the managers in this league.

IT HAS TO BE FUNNY. This is a comedy show with real numbers, not a news bulletin with jokes.
- Bits, not one-liners: a running gag that comes back in the sign-off, a callback to the cold open.
- The hosts roast the managers, the lineups and each other. Somebody always takes it personally.
- Interruptions and pile-ons: short turns, people cutting in, a host who keeps getting talked over.
- Specific beats generic. The joke is in the real score, the real benching, the real trade.
- Everyone gets laughs, and everyone speaks in every chapter or close to it.

The shape:
- open: a cold open, straight into the week's best storyline. No "welcome to the show" filler.
- games: the week's results, the blowout and the nail-biter. One chapter per game worth it (one or two).
- standings: where the table stands and what it means.
- move: a trade or a pickup worth arguing about, if there was one.
- take: a hot take that splits the panel and turns into an argument.
- close: sign off and look ahead to next week, in a line or two each.

WRITTEN FOR THE EAR. Short sentences. Contractions. Say numbers the way people say them
("one twenty-four" for 124.3 is fine, or "a hundred and twenty-four"). No lists, no
parentheses, no emoji, no hashtags, no stage directions, no sound effects in brackets.
Call managers by name. Every claim comes from the league context above: the
scores, records and moves are the real ones. Each chapter's ref must point at the thing it's
about.
${correction}`,
  });
  return stripDashes(object);
}

/** Writes, checks and keeps this week's episode. */
export async function publishEpisode(): Promise<Episode> {
  const [brief, { getPersonalities }] = await Promise.all([buildLeagueBrief(), import('./store')]);
  const hosts = pickHosts(await getPersonalities());
  if (!hosts) throw new Error('The podcast needs at least two personalities on the Desk.');
  const { text: refs, resolve } = references(brief);

  const first = await writeScript(hosts, refs);
  const script = await publishable(first, async correction => writeScript(hosts, refs, `\nFIX THESE BEFORE ANYTHING ELSE:\n${correction}`));

  const week = Math.max(0, ...brief.recentMatchups.map(m => m.week)) || brief.week;
  const past = await listEpisodes();
  const host = (p: Personality): Host => ({ id: p.id, name: p.name, handle: p.handle, avatar: personaAvatarUrl(p), accent: p.accent, ...(p.voiceId ? { voiceId: p.voiceId } : {}) });
  const ep: Episode = {
    id: `${brief.season}-w${week}-${Date.now().toString(36)}`,
    leagueName: brief.leagueName,
    season: brief.season,
    week,
    number: (past[0]?.number ?? 0) + 1,
    title: script.title,
    teaser: script.teaser,
    createdAt: new Date().toISOString(),
    hosts: hosts.map(host),
    chapters: script.chapters.map(c => ({
      title: c.title, kind: c.kind, visual: c.ref === 'none' ? null : resolve(c.ref),
      lines: c.lines.map(l => ({ host: Math.max(0, Math.min(hosts.length - 1, l.host)), text: l.text.trim() })).filter(l => l.text),
    })).filter(c => c.lines.length),
  };
  await saveEpisode(ep);
  return ep;
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
