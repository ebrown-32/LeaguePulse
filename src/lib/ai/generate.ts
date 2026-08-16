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
import { resolvePhase } from './seasonPhase';
import { getLeagueInfo, getNFLState } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { generateObject, generateText, streamText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { buildChatTools } from './chatTools';
import { z } from 'zod';
import { claude, MODEL_FAST, MODEL_SMART, GROUNDING_RULES, stripDashes } from './claude';
import { buildLeagueBrief } from './leagueBrief';
import type { Personality } from './personalities';

function systemFor(p: Personality): string {
  return `${GROUNDING_RULES}

YOUR PERSONA
Name: ${p.name} (${p.handle})
Voice: ${p.voice}

FANTASY FOOTBALL EXPERTISE
You know the game properly: PPR versus standard scoring, snap share and target
share as better signals than raw points, positional scarcity, strength of
schedule, bye weeks, handcuffs, streaming defenses and kickers, buy-low and
sell-high windows, and dynasty age curves (running backs fall off around 26,
receivers and tight ends around 29, quarterbacks hold value far longer). Use
that understanding to make the analysis genuinely sharp, and pitch it to
whatever phase of the season the context says we are in.

Write entirely in this voice. The persona affects tone and framing only,
never the facts.`;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ArticleSchema = z.object({
  headline: z.string().describe('Punchy headline, under 90 characters'),
  standfirst: z.string().describe('One-sentence summary beneath the headline'),
  body: z.string().describe('3-6 short paragraphs separated by blank lines'),
  tags: z.array(z.string()).max(4).describe('Short topic tags, lowercase'),
});

/** What the model is actually asked to emit. Paragraphs arrive as an array so
 *  no raw newline ever has to survive inside a JSON string literal, which is
 *  what made every article fail to parse. */
const ArticleWireSchema = z.object({
  headline: z.string(),
  standfirst: z.string(),
  paragraphs: z.array(z.string()).min(1),
  // Trim rather than reject: an extra tag is not a reason to throw away an
  // otherwise good article, and the model routinely returns five.
  tags: z.array(z.string()).default([]),
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

/**
 * Ask for raw JSON and validate it ourselves.
 *
 * generateObject with Anthropic intermittently returns the payload wrapped in a
 * stray envelope key, which fails schema validation with "No object generated".
 * gradeTrade hit this first; articles hit it too, which is why long-form posts
 * were the only kind failing in production. Deterministic parse plus one retry.
 */
async function generateJson<T>(opts: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** A required key, used to spot the provider's stray wrapper object. */
  probe: string;
  /** Let the writer pull live league data and search the web before writing. */
  research?: boolean;
  /** Ranked formats emit a row per team and truncate at the default cap. */
  maxOutputTokens?: number;
  /** Override the model. The ranked formats emit a lot of JSON and Sonnet is
   *  too slow for a serverless function's time budget. */
  model?: string;
}): Promise<T> {
  const parse = (raw: string): T => {
    let t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const first = t.indexOf('{'), last = t.lastIndexOf('}');
    if (first > 0 || last < t.length - 1) t = t.slice(first, last + 1);
    // Escape any raw control characters the model left inside string literals.
    let inString = false, escaped = false, cleaned = '';
    for (const ch of t) {
      if (escaped) { cleaned += ch; escaped = false; continue; }
      if (ch === '\\') { cleaned += ch; escaped = true; continue; }
      if (ch === '"') { inString = !inString; cleaned += ch; continue; }
      if (inString && ch === '\n') { cleaned += '\\n'; continue; }
      if (inString && ch === '\r') { cleaned += '\\r'; continue; }
      if (inString && ch === '\t') { cleaned += '\\t'; continue; }
      cleaned += ch;
    }
    const json = JSON.parse(cleaned);
    const candidate = json[opts.probe] !== undefined ? json : (Object.values(json)[0] as unknown);
    return opts.schema.parse(candidate);
  };

  // Research tools are the difference between a piece that restates the brief
  // and one that actually digs. The budget is deliberately tight: Vercel caps a
  // function at 60s, and an unbounded research loop blew straight past it.
  const research = opts.research
    ? {
        tools: {
          ...(await buildChatTools()),
          web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
        },
        stopWhen: stepCountIs(2),
      }
    : {};

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const useResearch = attempt === 0 ? research : {};
    // Streamed rather than a single blocking call. Sonnet's extended thinking
    // shares the output budget, so the cap has to be large enough for both,
    // and a non-streaming request that long had the connection dropped
    // ("other side closed") before it could finish.
    const result = streamText({
      model: claude(opts.model ?? MODEL_SMART),
      maxOutputTokens: opts.maxOutputTokens ?? 16000,
      // Extended thinking is on by default and shares the output budget. It
      // was consuming the entire allowance before a single character of JSON:
      // 2000 tokens returned finishReason 'length' with an empty string, and
      // raising the cap enough to fit both made requests long enough for the
      // connection to drop. These calls want structured output, not visible
      // reasoning, so the budget goes entirely to the answer.
      providerOptions: { anthropic: { thinking: { type: 'disabled' } } },
      system: opts.system,
      prompt: attempt === 0
        ? opts.prompt
        : `${opts.prompt}\n\nYour previous reply was not usable. Do not call any tools. Return only the JSON object.`,
      ...useResearch,
    });
    const text = await result.text;
    // Running out of steps mid-research leaves the last step as a tool call and
    // the text empty, so retry without tools rather than failing the piece.
    if (!text.trim()) {
      console.error('[generate] empty text', {
        attempt,
        finishReason: await (result as any).finishReason,
      });
      lastErr = new Error('model returned no text');
      continue;
    }
    try { return parse(text); } catch (e) {
      lastErr = e;
      console.error('[generate] unparseable output',
        { chars: text.length, tail: text.slice(-160) });
    }
  }
  throw new Error(`Unparseable model output: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

/** A ranked league table with a take attached to every team. */
const PowerRankingsSchema = z.object({
  headline: z.string(),
  standfirst: z.string(),
  teams: z.array(z.object({
    rank: z.number(),
    teamName: z.string(),
    verdict: z.string().describe('One punchy line, an actual opinion'),
    reasoning: z.string().describe('2-3 sentences citing real players, numbers or moves'),
  })).min(2),
  boldestTake: z.string().describe('The single most contentious claim in the piece'),
});

/** Full-season forecast: final standings, playoff field, champion. */
const PredictionsSchema = z.object({
  headline: z.string(),
  standfirst: z.string(),
  standings: z.array(z.object({
    rank: z.number(),
    teamName: z.string(),
    projectedRecord: z.string().describe('e.g. 10-4'),
    note: z.string().describe('One line on why they land there'),
  })).min(2),
  playoffTeams: z.array(z.string()),
  champion: z.object({
    teamName: z.string(),
    reasoning: z.string().describe('3-4 sentences, specific and committed'),
  }),
  bustPick: z.object({
    teamName: z.string(),
    reasoning: z.string(),
  }),
  boldestTake: z.string(),
});

export type PowerRankings = z.infer<typeof PowerRankingsSchema>;
export type Predictions = z.infer<typeof PredictionsSchema>;

export type Article = z.infer<typeof ArticleSchema>;
export type Tweet = z.infer<typeof TweetSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type TradeGrade = z.infer<typeof TradeGradeSchema>;

// ── Generators ─────────────────────────────────────────────────────────────

async function briefBlock(): Promise<string> {
  const brief = await buildLeagueBrief();
  // Same phase framing the chat assistant gets, so a persona does not write
  // start/sit copy in March or dynasty musings during a playoff week.
  let phaseBlock = '';
  try {
    const leagueId = await getCurrentLeagueId();
    const [league, nflState] = await Promise.all([getLeagueInfo(leagueId), getNFLState()]);
    const phase = resolvePhase(nflState, league);
    phaseBlock =
      `\n\nSEASON PHASE: ${phase.label} (${phase.season}, week ${phase.week}).` +
      `\nWHAT MATTERS NOW: ${phase.guidance}`;
  } catch { /* the brief already states the phase in prose */ }

  return `LEAGUE CONTEXT (the complete, authoritative record):\n\n${brief.text}${phaseBlock}`;
}

/**
 * The editorial standard for long-form pieces.
 *
 * Left to itself the model writes even-handed recaps that read like a database
 * dump with adjectives. Commentary needs a thesis, a named target, and a reason
 * to argue back, so the brief demands all three, while the grounding rules
 * still forbid inventing the facts underneath them.
 */
const EDITORIAL = `
HOW TO WRITE THIS
- Lead with an argument, not a summary. The first line should make someone want
  to reply.
- Name names. Call out specific managers and teams, and say who is overrated,
  who is kidding themselves, and who is quietly dangerous.
- Every opinion must be earned by evidence you actually looked up: a player's
  production, a trade, a head to head record, a real NFL story. Research first,
  then take the position the evidence supports.
- Be willing to be wrong in public. Commit to a call rather than hedging with
  "time will tell" or "only the games will decide".
- No both-sides mush. If two things are close, say which one you would bet on
  and why.
- Keep the facts sacred. Sharp opinions, honest numbers.
- This league trades draft picks, and the transaction record lists them. Never
  judge a trade on the players alone: a deal that looks lopsided is usually
  balanced by picks, and a future first is a real asset. If you call a trade
  bad, account for every pick that moved in it.`;

/**
 * @param subject A team the column must be about. Without one the writers all
 *   gravitate to whoever the brief makes loudest, which produced five straight
 *   pieces about the reigning champion.
 */
export async function writeArticle(p: Personality, subject?: string): Promise<Article> {
  const wire = await generateJson({
    schema: ArticleWireSchema,
    probe: 'headline',
    research: true,
    system: systemFor(p),
    prompt: `${await briefBlock()}

Write an opinion column for the league feed.

${subject
  ? `THIS COLUMN IS ABOUT ${subject.toUpperCase()}. They are the subject: their
roster, their moves, their outlook, their problems. Other teams appear only as
context for the argument you are making about ${subject}. Do not make this a
piece about the reigning champion or the busiest trader unless that is ${subject}.
Name ${subject} in the headline.`
  : 'Pick the most genuinely interesting angle in the data.'}

Research first, but keep it tight: ONE tool call, then stop and write. Pull the
single thing your argument most needs (a roster, a head to head record, or one
web search) and then commit to a position.
${EDITORIAL}

Respond with ONLY a JSON object, no prose and no markdown fences:
{
  "headline": "punchy, under 90 characters",
  "standfirst": "one sentence beneath the headline",
  "paragraphs": ["first paragraph", "second paragraph", "third paragraph"],
  "tags": ["short", "lowercase", "topic", "tags"]
}`,
  });
  const object: Article = {
    headline: wire.headline,
    standfirst: wire.standfirst,
    body: wire.paragraphs.join('\n\n'),
    tags: wire.tags.slice(0, 4),
  };
  return stripDashes(object);
}

/**
 * @param subject A team the post must be about, for the same reason articles
 *   take one: unprompted, every writer reaches for the loudest story in the
 *   brief and the whole feed ends up about one manager.
 */
export async function writeTweet(p: Personality, subject?: string): Promise<Tweet> {
  const { object } = await generateObject({
    model: claude(MODEL_FAST),
    schema: TweetSchema,
    schemaName: 'Post',
    schemaDescription: 'A single short social post',
    system: systemFor(p),
    prompt: `${await briefBlock()}

Write ONE short post for the league feed.

${subject
  ? `THIS POST IS ABOUT ${subject.toUpperCase()}. Name them. Their roster, a move
they made, or their outlook. Do not write about the reigning champion or the
busiest trader unless that is ${subject}.`
  : 'Pick the sharpest thing in the data.'}

Under 280 characters. Make it land: a specific number or name beats a generic
take.`,
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


/**
 * League power rankings: every team, ranked, with a verdict on each.
 *
 * Researches first so the ordering is defensible rather than vibes: rosters and
 * expert rankings for talent, head to head and transactions for context.
 */
export async function writePowerRankings(p: Personality): Promise<PowerRankings> {
  return generateJson({
    schema: PowerRankingsSchema,
    probe: 'headline',
    model: MODEL_FAST,
    maxOutputTokens: 16000,
    system: systemFor(p),
    prompt: `${await briefBlock()}

Rank EVERY team in this league from best to worst and defend the order.

Everything you need is in the league context above: standings, rosters, every
transaction including the draft picks that moved, and the full history. Read it
properly and rank on the evidence.
${EDITORIAL}

Respond with ONLY a JSON object, no prose and no markdown fences:
{
  "headline": "punchy, under 90 characters",
  "standfirst": "one sentence setting up the argument",
  "teams": [
    { "rank": 1, "teamName": "<exact team name>", "verdict": "one punchy line",
      "reasoning": "2-3 sentences with real evidence" }
  ],
  "boldestTake": "the single most contentious claim you are making"
}`,
  });
}

/**
 * Season forecast: projected standings, the playoff field, a champion and a bust.
 */
export async function writePredictions(p: Personality): Promise<Predictions> {
  return generateJson({
    schema: PredictionsSchema,
    probe: 'headline',
    model: MODEL_FAST,
    maxOutputTokens: 16000,
    system: systemFor(p),
    prompt: `${await briefBlock()}

Predict how this whole season finishes. Commit to it.

Everything you need is in the league context above, including every trade and
the draft picks in it. Project a final record for every team, name the playoff
field, pick a champion, and name one team you think is being badly overrated.
${EDITORIAL}

Respond with ONLY a JSON object, no prose and no markdown fences:
{
  "headline": "punchy, under 90 characters",
  "standfirst": "one sentence",
  "standings": [
    { "rank": 1, "teamName": "<exact>", "projectedRecord": "10-4", "note": "one line" }
  ],
  "playoffTeams": ["<exact team names that make the playoffs>"],
  "champion": { "teamName": "<exact>", "reasoning": "3-4 committed sentences" },
  "bustPick": { "teamName": "<exact>", "reasoning": "2-3 sentences" },
  "boldestTake": "the claim most likely to start an argument"
}`,
  });
}
