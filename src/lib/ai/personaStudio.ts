/**
 * The persona studio: an assistant that designs AI personalities for the
 * league's feed with its admin. From a few words ("a washed-up radio host who
 * still thinks it's 2009") it drafts the whole persona: name, handle, tagline,
 * the voice (the instruction every post is written from), what they write,
 * an avatar style, and sample posts so the admin can hear the voice before
 * saving. It then revises on request ("meaner, but never crude").
 *
 * The voice only ever shapes tone. Facts come from the league's data at
 * writing time (GROUNDING_RULES in claude.ts), so a voice must never carry
 * facts about the league, and the samples here use made-up teams and are
 * never published.
 *
 * Server only.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { claude, MODEL_SMART, stripDashes } from './claude';
import { AVATAR_STYLES } from './avatar';
import type { ContentKind, Personality } from './personalities';

export type Spice = 'clean' | 'cheeky' | 'savage';

const MEDIA_KINDS = ['article', 'tweet', 'comment', 'powerRankings', 'predictions', 'matchupPreview', 'kickoff', 'liveTake'] as const satisfies readonly ContentKind[];
const FAN_KINDS = ['tweet', 'comment'] as const satisfies readonly ContentKind[];

// Lengths are guidance for the model, not hard limits: a draft a few characters
// over is tidied below rather than thrown away (a failed validation costs the
// admin the whole draft and the call).
export const studioDraft = z.object({
  name: z.string().min(1).describe('A memorable character name, under 30 characters. Original, not a real person.'),
  handle: z.string().min(1).describe('Their @handle: starts with @, lowercase, no spaces, under 18 characters.'),
  tagline: z.string().min(1).describe('One punchy line shown under the name in the feed, under 90 characters.'),
  voice: z.string().min(40).describe('The writing instruction every post is generated from, 3 to 6 sentences. See the rules.'),
  kinds: z.array(z.enum(MEDIA_KINDS)).describe('What they should write.'),
  avatarStyle: z.enum(AVATAR_STYLES).describe('The avatar art style that suits them best.'),
  samples: z.array(z.object({
    label: z.string().describe('A few words on what the sample is, e.g. "After a heartbreaking loss".'),
    text: z.string().min(1),
  })).describe('Three short posts in their voice, one per made-up scenario.'),
  note: z.string().describe('One or two sentences to the admin: what you made, or what you changed and why.'),
});
export type StudioDraft = z.infer<typeof studioDraft>;

const SPICE: Record<Spice, string> = {
  clean: 'Clean: warm, playful, family friendly. Gentle ribbing at most.',
  cheeky: 'Cheeky: sharp, teasing, a little smug. Roasts land but nobody leaves hurt.',
  savage: 'Savage: ruthless, cutting trash talk aimed at decisions and results. Still never crude, hateful, sexual or about anyone\'s real life outside fantasy football.',
};

const SCENARIOS = [
  'A manager lost by 0.4 points after benching a player who then scored 31.',
  'Two managers made a trade one side clearly won (Team Taco sent its best receiver to Bench Mob for two backups).',
  'A team that started 0 and 3 just clinched a playoff spot.',
];

const SYSTEM = `
You are the persona designer for LeaguePulse, an app whose fantasy football leagues have an in-app media feed written by AI personalities. You help a league's admin create and refine those personalities.

WHAT A PERSONALITY IS
- media: a columnist, anchor, analyst or pundit. Writes articles, takes, rankings, predictions and game day coverage.
- fan: a league member with opinions. Only reacts, in short takes and replies. Never files columns or rankings.

THE VOICE (the most important field)
The voice is the instruction a writer model follows for every post. Write it in the third person, as a description of the character ("A retired radio host who..."), 3 to 6 sentences, concrete and playable:
- how they talk: sentence length, vocabulary, rhythm, at most two catchphrases or verbal tics;
- what they notice first and what they obsess over (a running bit);
- their attitude to the league and its managers;
- one or two things they never do;
- end with the boundary that fits the spice level (for example "Never crude.").
For a fan, add that they react in one or two sentences and never analyse.
The voice shapes tone only. It must never contain facts, names, scores or history about any league: those come from the league's data when each post is written.

HOUSE STYLE (applies to every field and every sample)
- No emoji. No em dashes or en dashes: use commas, full stops, colons or brackets.
- Comic archetypes and parodies of fictional characters are welcome. Never impersonate a real person: if asked to copy one, create an original character in that spirit, with a new name, and say so in the note.
- Nothing crude, hateful, sexual, or about anyone's life outside fantasy football, at any spice level.
- Make them distinct from the league's existing cast (listed in each request): a different name, handle, angle and rhythm.

SAMPLES
Write three short posts in the new voice, one for each made-up scenario in the request, using the made-up team names given or similar silly ones. Samples are previews for the admin and are never published. Keep each under 60 words for a fan and under 90 for media.

AVATAR
Pick the avatar style that suits them: avataaars (people with clothes, hats, facial hair), personas, micah, notionists, open-peeps, lorelei, adventurer, big-smile, miniavs (people); bottts (robots), pixel-art, fun-emoji, croodles, thumbs (playful or abstract).
`.trim();

export interface StudioRequest {
  type: 'media' | 'fan';
  spice: Spice;
  /** What the admin wants, in their words. */
  idea?: string;
  /** The draft or saved persona being revised, if any. */
  current?: Pick<Personality, 'name' | 'handle' | 'tagline' | 'voice'> & { kinds?: ContentKind[] };
  /** What to change about `current`. Empty with a `current` means "another take". */
  instruction?: string;
  /** The rest of the league's cast, so the new one stands apart. */
  cast: Pick<Personality, 'name' | 'handle' | 'tagline'>[];
}

export async function designPersona(r: StudioRequest): Promise<StudioDraft> {
  const cast = r.cast.length
    ? r.cast.map(p => `- ${p.name} (${p.handle}): ${p.tagline}`).join('\n')
    : '(none yet)';
  const task = r.current
    ? r.instruction?.trim()
      ? `Revise this ${r.type} personality as the admin asks, keeping what they did not ask to change (including the name and handle unless asked).\nAdmin's request: ${r.instruction.trim()}`
      : `Give the admin a fresh take on this ${r.type} personality: same idea, a noticeably different execution. A new name is fine.`
    : `Create a new ${r.type} personality.\nAdmin's idea: ${r.idea?.trim() || 'Surprise me: something the league will love and does not have yet.'}`;
  const current = r.current
    ? `\n\nCURRENT PERSONALITY\nName: ${r.current.name}\nHandle: ${r.current.handle}\nTagline: ${r.current.tagline}\nVoice: ${r.current.voice}${r.current.kinds?.length ? `\nWrites: ${r.current.kinds.join(', ')}` : ''}`
    : '';

  const { object } = await generateObject({
    model: claude(MODEL_SMART),
    schema: studioDraft,
    system: SYSTEM,
    prompt: [
      task,
      `Type: ${r.type}. Spice level: ${SPICE[r.spice]}`,
      `${current}`,
      `\nTHE LEAGUE'S EXISTING CAST\n${cast}`,
      `\nSCENARIOS FOR THE SAMPLES (made up)\n${SCENARIOS.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    ].join('\n'),
  });

  const cut = (v: string, max: number) => (v.length > max ? `${v.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : v);
  const raw = stripDashes(object);
  const draft = {
    ...raw,
    name: cut(raw.name.trim(), 40), tagline: cut(raw.tagline.trim(), 120), voice: cut(raw.voice.trim(), 1600), note: cut(raw.note.trim(), 300),
    samples: raw.samples.slice(0, 3).map(x => ({ label: cut(x.label.trim(), 50), text: cut(x.text.trim(), 700) })),
  };
  // Fans react; they never write the long forms, whatever the model picked.
  const kinds = r.type === 'fan'
    ? draft.kinds.filter((k): k is (typeof FAN_KINDS)[number] => (FAN_KINDS as readonly string[]).includes(k))
    : draft.kinds;
  const handle = `@${draft.handle.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) || 'newvoice'}`;
  return { ...draft, handle, kinds: kinds.length ? kinds : r.type === 'fan' ? ['tweet', 'comment'] : ['article', 'tweet', 'comment'] };
}
