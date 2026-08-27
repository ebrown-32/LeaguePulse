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
import { checkTradeClaims, collectText } from './factCheck';
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

Write entirely in this voice, and commit to it hard. The persona is not a
light seasoning on neutral copy: it decides what you notice, what you care
about, what you compare things to and how you say it. A reader should never
mistake you for another writer on this desk.

The persona affects tone and framing only, never the facts.`;
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
/**
 * Angles a piece can be written from.
 *
 * Subject rotation alone was not enough. Given one team, every writer reached
 * for the single loudest fact about them and five posts opened with the same
 * sentence. Handing each piece a different lens is what actually produces a
 * varied feed, because the writers are then looking at different things rather
 * than the same thing in different voices.
 */
export const ANGLES = [
  'their single best player, and whether one man can carry this roster',
  'the weakest spot in their starting lineup, and what it costs them',
  'one specific trade they made, and whether it was smart',
  'their draft capital, and what it says about whether they are building or winning now',
  'how they stack up against the team most likely to beat them',
  'the manager behind the team and how they operate',
  'the gap between how good they look on paper and how good they actually are',
  'what has to go right for them, and what happens if it does not',
] as const;

/** Deterministic pick, so a caller can spread angles across a batch. */
export function angleAt(index: number): string {
  return ANGLES[Math.abs(index) % ANGLES.length];
}

/**
 * Refuses to publish copy that contradicts the transaction record.
 *
 * The brief states every trade in both directions and the prompt forbids
 * inverting it, and the writers still occasionally do. Prompt rules cannot make
 * this guarantee; a check can. One correction attempt, then the piece is
 * abandoned rather than published with a claim we have proven false.
 */
async function publishable<T>(
  content: T,
  regenerate: (correction: string) => Promise<T>,
): Promise<T> {
  const problems = await checkTradeClaims(collectText(content).join(' ')).catch(() => []);
  if (!problems.length) return content;

  console.error('[generate] false trade claim, regenerating:', problems);
  const corrected = await regenerate(
    'Your previous draft contained claims that contradict the transaction record:' +
    `\n- ${problems.join('\n- ')}\n` +
    'Re-read the trade lines in the league context. Each states who GETS and who ' +
    'GIVES UP every asset. Write it again without those errors.',
  );

  const still = await checkTradeClaims(collectText(corrected).join(' ')).catch(() => []);
  if (still.length) {
    throw new Error(`Trade claims still wrong after correction: ${still.join('; ')}`);
  }
  return corrected;
}

/**
 * Predictions must field the league's real playoff bracket.
 *
 * The brief said nothing about format, so the writers assumed the common six
 * team field and marked six of eight as making the playoffs in a league that
 * takes four. The brief states it now, but a stated rule is not a guarantee:
 * this counts the names and refuses anything that does not match, and checks
 * every team named is real.
 */
async function checkPredictionShape(
  content: Predictions,
): Promise<string[]> {
  const problems: string[] = [];
  const brief = await buildLeagueBrief();
  const real = new Set(brief.teams.map(t => t.teamName));
  const expected = brief.playoffTeams;

  const field = content.playoffTeams ?? [];
  if (expected && field.length !== expected) {
    problems.push(
      `Named ${field.length} playoff teams; this league takes exactly ${expected}.`,
    );
  }
  for (const name of [...field, content.champion?.teamName, content.bustPick?.teamName]) {
    if (name && !real.has(name)) problems.push(`"${name}" is not a team in this league.`);
  }
  // The champion has to be in the field they just named.
  if (content.champion?.teamName && field.length && !field.includes(content.champion.teamName)) {
    problems.push(
      `Picked ${content.champion.teamName} as champion but left them out of the playoff field.`,
    );
  }
  return [...new Set(problems)];
}

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
  bad, account for every pick that moved in it.
- Every trade line states exactly who GETS and who GIVES UP each asset. Quote it
  as written. Never say a team traded away a player unless that team's own
  "gives up" list names him, and never attribute a trade to a team that is not
  named in that line. Getting this wrong invents history about real people.`;

/**
 * @param subject A team the column must be about. Without one the writers all
 *   gravitate to whoever the brief makes loudest, which produced five straight
 *   pieces about the reigning champion.
 */
export async function writeArticle(
  p: Personality, subject?: string, angle?: string,
): Promise<Article> {
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
${angle ? `YOUR ANGLE: ${angle}. Build the column around THAT.` : ''}

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
  return publishable(stripDashes(object), async correction => {
    const retry = await generateJson({
      schema: ArticleWireSchema,
      probe: 'headline',
      system: systemFor(p),
      prompt: `${await briefBlock()}\n\n${correction}\n\nRespond with ONLY the same JSON shape as before.`,
    });
    return stripDashes({
      headline: retry.headline,
      standfirst: retry.standfirst,
      body: retry.paragraphs.join('\n\n'),
      tags: retry.tags.slice(0, 4),
    } as Article);
  });
}

/**
 * @param subject A team the post must be about, for the same reason articles
 *   take one: unprompted, every writer reaches for the loudest story in the
 *   brief and the whole feed ends up about one manager.
 */
export async function writeTweet(
  p: Personality, subject?: string, angle?: string,
): Promise<Tweet> {
  const { object } = await generateObject({
    model: claude(MODEL_FAST),
    schema: TweetSchema,
    schemaName: 'Post',
    schemaDescription: 'A single short social post',
    system: systemFor(p),
    prompt: `${await briefBlock()}

Write ONE short post for the league feed.

${subject
  ? `THIS POST IS ABOUT ${subject.toUpperCase()}. Name them. Do not write about the
reigning champion or the busiest trader unless that is ${subject}.`
  : 'Pick the sharpest thing in the data.'}
${angle ? `YOUR ANGLE: ${angle}. Write about THAT, not whatever is loudest.` : ''}

Under 280 characters.

VOICE IS THE POINT. Someone who knows this cast should identify you from the
first few words, without seeing your name. Write the way YOU talk, not the way
a neutral analyst would: your obsessions, your speech patterns, your opinion of
yourself. A correct but characterless post is a failure.

Still anchor it to something real, a name or a number from the context above,
but the fact is the excuse for the take, not the post itself.

DO NOT OPEN BY RESTATING THE MOST OBVIOUS STATISTIC. Every writer on this desk
reaches for the same headline number and the feed ends up reading like one
person with different hats. Find your own way in: an accusation, a comparison,
a memory, a question, a piece of advice nobody asked for, something you noticed
that others would skip. The number can arrive in the second sentence, or not at
all.`,
  });
  return publishable(stripDashes(object), async correction => {
    const retry = await generateObject({
      model: claude(MODEL_FAST),
      schema: TweetSchema,
      schemaName: 'Post',
      schemaDescription: 'A single short social post',
      system: systemFor(p),
      prompt: `${await briefBlock()}\n\n${correction}`,
    });
    return stripDashes(retry.object);
  });
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
  const result = await generateJson({
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
  "boldestTake": "the single most contentious claim you are making"`,
  });

  return publishable(result, async correction =>
    generateJson({
      schema: PowerRankingsSchema,
      probe: 'headline',
      model: MODEL_FAST,
      maxOutputTokens: 16000,
      system: systemFor(p),
      prompt: [await briefBlock(), correction,
        'Respond with ONLY the same JSON shape as before.'].join('\n\n'),
    }));
}

/**
 * Season forecast: projected standings, the playoff field, a champion and a bust.
 */
export async function writePredictions(p: Personality): Promise<Predictions> {
  const result = await generateJson({
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
  "boldestTake": "the claim most likely to start an argument"`,
  });

  // Two gates before this can publish: the trade-claim checker, and the
  // playoff field actually matching the league's format.
  const shapeProblems = await checkPredictionShape(result);
  const fixed = shapeProblems.length
    ? await generateJson({
        schema: PredictionsSchema,
        probe: 'headline',
        model: MODEL_FAST,
        maxOutputTokens: 16000,
        system: systemFor(p),
        prompt: [
          await briefBlock(),
          'Your previous draft got the league format wrong:\n- ' + shapeProblems.join('\n- '),
          'Respond with ONLY the same JSON shape as before, corrected.',
        ].join('\n\n'),
      })
    : result;

  const stillWrong = await checkPredictionShape(fixed);
  if (stillWrong.length) {
    throw new Error(`Prediction format still wrong: ${stillWrong.join('; ')}`);
  }

  return publishable(fixed, async correction =>
    generateJson({
      schema: PredictionsSchema,
      probe: 'headline',
      model: MODEL_FAST,
      maxOutputTokens: 16000,
      system: systemFor(p),
      prompt: [await briefBlock(), correction,
        'Respond with ONLY the same JSON shape as before.'].join('\n\n'),
    }));
}
