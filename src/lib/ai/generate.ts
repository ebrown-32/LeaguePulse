/**
 * Typed content generators.
 *
 * Everything goes through generateObject with a zod schema rather than free
 * text: it makes the output renderable without parsing prose, and it lets the
 * trade grader return a real letter grade and per-side reasoning instead of a
 * paragraph we'd have to regex.
 *
 * Server-only.
 */
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { claude, MODEL_FAST, MODEL_SMART, GROUNDING_RULES, stripDashes } from './claude';
import { buildLeagueBrief } from './leagueBrief';
import type { Personality } from './personalities';

function systemFor(p: Personality): string {
  return `${GROUNDING_RULES}

YOUR PERSONA
Name: ${p.name} (${p.handle})
Voice: ${p.voice}

Write entirely in this voice. The persona affects tone and framing only —
never the facts.`;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ArticleSchema = z.object({
  headline: z.string().describe('Punchy headline, under 90 characters'),
  standfirst: z.string().describe('One-sentence summary beneath the headline'),
  body: z.string().describe('3-6 short paragraphs separated by blank lines'),
  tags: z.array(z.string()).max(4).describe('Short topic tags, lowercase'),
});

const TweetSchema = z.object({
  text: z.string().describe('Under 280 characters'),
});

const CommentSchema = z.object({
  text: z.string().describe('1-3 sentences reacting to the subject'),
});

const TradeGradeSchema = z.object({
  verdict: z.string().describe('One-line summary of who won and why'),
  sides: z.array(z.object({
    teamName: z.string(),
    grade: z.enum(['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F']),
    reasoning: z.string().describe('2-3 sentences grounded in the data provided'),
  })).describe('One entry per team in the trade'),
  confidence: z.enum(['low', 'medium', 'high'])
    .describe('low when the league data is thin, e.g. preseason with no games played'),
});

export type Article = z.infer<typeof ArticleSchema>;
export type Tweet = z.infer<typeof TweetSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type TradeGrade = z.infer<typeof TradeGradeSchema>;

// ── Generators ─────────────────────────────────────────────────────────────

async function briefBlock(): Promise<string> {
  const brief = await buildLeagueBrief();
  return `LEAGUE CONTEXT (the complete, authoritative record):\n\n${brief.text}`;
}

export async function writeArticle(p: Personality, topic?: string): Promise<Article> {
  const { object } = await generateObject({
    model: claude(MODEL_SMART),
    schema: ArticleSchema,
    schemaName: 'Article',
    schemaDescription: 'A short league article',
    system: systemFor(p),
    prompt: `${await briefBlock()}

Write a short article for the league feed${topic ? ` about: ${topic}` : ''}.
Pick the most genuinely interesting angle in the data. Reference specific
teams, managers, and numbers from the context.`,
  });
  return stripDashes(object);
}

export async function writeTweet(p: Personality, topic?: string): Promise<Tweet> {
  const { object } = await generateObject({
    model: claude(MODEL_FAST),
    schema: TweetSchema,
    schemaName: 'Post',
    schemaDescription: 'A single short social post',
    system: systemFor(p),
    prompt: `${await briefBlock()}

Write ONE short post for the league feed${topic ? ` about: ${topic}` : ''}.
Under 280 characters. Make it land — a specific number or name beats a
generic take.`,
  });
  return stripDashes(object);
}

export async function writeComment(p: Personality, subject: string): Promise<Comment> {
  const { object } = await generateObject({
    model: claude(MODEL_FAST),
    schema: CommentSchema,
    schemaName: 'Comment',
    schemaDescription: 'A short in-character reaction',
    system: systemFor(p),
    prompt: `${await briefBlock()}

React in 1-3 sentences, in character, to this:

"${subject}"`,
  });
  return stripDashes(object);
}

export interface TradeForGrading {
  season: string;
  week: number;
  sides: { teamName: string; receives: string[]; gives: string[] }[];
}

export async function gradeTrade(p: Personality, trade: TradeForGrading): Promise<TradeGrade> {
  const desc = trade.sides
    .map(s => `${s.teamName} receives: ${s.receives.join(', ') || 'nothing'} | gives up: ${s.gives.join(', ') || 'nothing'}`)
    .join('\n');

  const prompt = `${await briefBlock()}

TRADE TO GRADE (${trade.season}, week ${trade.week}):
${desc}

Grade this trade for each side, based on the production figures and team
situations in the league context above.

IMPORTANT: the rosters in the league context are CURRENT and already reflect
this trade having gone through. Do not treat a player appearing on a team's
roster as evidence they were not traded — the trade description above is the
record of who moved where.

If a player involved does not appear anywhere in the context, say you have
limited information on them rather than guessing, and lower your confidence.

Respond with ONLY a JSON object, no prose and no markdown fences:
{
  "verdict": "one line on who won and why",
  "sides": [
    { "teamName": "<exact team name>", "grade": "<one of A+ A A- B+ B B- C+ C C- D+ D D- F>", "reasoning": "2-3 sentences" }
  ],
  "confidence": "low" | "medium" | "high"
}
Include one entry in "sides" for every team in the trade.`;

  // generateObject is used everywhere else, but this schema (a nested array of
  // objects containing an enum) trips the Anthropic provider, which wraps the
  // result in a literal "parameter name" key and fails validation. Asking for
  // raw JSON and validating it ourselves is deterministic and keeps the same
  // typed guarantee at the boundary.
  const parse = (raw: string): TradeGrade => {
    let t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const first = t.indexOf('{'), last = t.lastIndexOf('}');
    if (first > 0 || last < t.length - 1) t = t.slice(first, last + 1);
    const json = JSON.parse(t);
    // Unwrap the provider's stray envelope if it appears.
    const candidate = json.verdict ? json : (Object.values(json)[0] as unknown);
    return TradeGradeSchema.parse(candidate);
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await generateText({
      model: claude(MODEL_SMART),
      system: systemFor(p),
      prompt: attempt === 0 ? prompt : `${prompt}\n\nYour previous reply was not valid JSON. Return only the JSON object.`,
    });
    try { return stripDashes(parse(text)); } catch (e) { lastErr = e; }
  }
  throw new Error(`Trade grading returned unparseable output: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}
