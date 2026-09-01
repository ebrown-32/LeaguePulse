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
import { generateObject, streamText, streamObject, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { buildChatTools } from './chatTools';
import { checkTradeClaims, collectText } from './factCheck';
import { z } from 'zod';
import { claude, MODEL_FAST, MODEL_SMART, GROUNDING_RULES, stripDashes } from './claude';
import { buildLeagueBrief } from './leagueBrief';
import { buildLiveBrief, buildUpcomingMatchups, type LiveBrief } from './liveBrief';
import type { Personality } from './personalities';

function systemFor(p: Personality): string {
  // Fans are league members, not analysts. Handing them the same expertise
  // brief as the writers made every one of them sound like a columnist with a
  // funny name, which is the opposite of why they exist.
  if (p.type === 'fan') {
    return `${GROUNDING_RULES}

WHO YOU ARE
Name: ${p.name} (${p.handle})
Voice: ${p.voice}

You are a member of this fantasy league posting in the group chat. You are not
a journalist, an analyst or a broadcaster, and you are not writing for anyone.
You are reacting.

HOW YOU POST
- Short. One or two sentences. Occasionally just a fragment.
- React to one thing. Do not survey the league or weigh both sides.
- You have opinions, not analysis. Say what you think, not what the numbers
  support, and never explain your reasoning like a column would.
- No headlines, no sign-offs, no "folks", no broadcast voice.
- Everything you refer to has to be real and in the context below. Being a fan
  is licence to be wrong in your opinions, never about what actually happened.

WHO YOU ARE TALKING TO
Post AT people, not about them. Address a manager, a team or a player directly
most of the time: use their manager handle for a manager, the team name for a
team, and the player's name for a player. "@handle you started him again" beats
"that manager started him again", every time.

You are talking to the league, so second person is the default. Reply to them,
accuse them, congratulate them, beg them for a trade. Only fall back to talking
about someone in the third person when there is genuinely nobody to address.

Write entirely in this voice. The persona decides what you notice and how you
say it. It never changes the facts.`;
  }

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
 * Produce a schema-shaped object from the model.
 *
 * The schema is enforced by the provider rather than requested in prose and
 * validated afterwards. Asking for "ONLY a JSON object" and parsing the reply
 * failed intermittently, roughly one run in three: the model would answer in a
 * shape it invented, most often an article-like {headline, body, author}, and
 * every ranked format shares the same `headline` key, so the wrapper probe
 * could not tell a good reply from a wrong one. Measured over eight runs of
 * power rankings, hand-parsing produced two unusable replies, enforcement none.
 *
 * Tools are the one thing enforcement cannot do, so a research pass still goes
 * through free text and falls back to enforcement when its reply will not parse.
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
  const model = claude(opts.model ?? MODEL_SMART);
  const maxOutputTokens = opts.maxOutputTokens ?? 16000;
  // Extended thinking is on by default and shares the output budget. It was
  // consuming the entire allowance before a single character of JSON, and
  // raising the cap enough to fit both made requests long enough for the
  // connection to drop. These calls want structured output, not reasoning.
  const providerOptions = { anthropic: { thinking: { type: 'disabled' as const } } };

  /** Schema-enforced. The model cannot return a shape that is not this one. */
  const enforced = async (prompt: string): Promise<T> => {
    const result = streamObject({
      model,
      schema: opts.schema,
      maxOutputTokens,
      providerOptions,
      system: opts.system,
      prompt,
    });
    // The stream must be consumed. `result.object` only settles as chunks are
    // read, so awaiting it alone leaves the promise pending, empties the event
    // loop, and takes the process down with nothing printed.
    for await (const _ of result.partialObjectStream) { /* drain */ }
    return await result.object;
  };

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

  // A research pass reads the live league and the web before writing, which
  // enforcement has no way to express. Its output is still free text, so it
  // keeps the parser, and anything unusable falls through to enforcement.
  if (opts.research) {
    try {
      const result = streamText({
        model,
        maxOutputTokens,
        providerOptions,
        system: opts.system,
        prompt: opts.prompt,
        tools: {
          ...(await buildChatTools()),
          web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
        },
        stopWhen: stepCountIs(2),
      });
      const text = await result.text;
      if (text.trim()) return parse(text);
      console.error('[generate] research pass returned no text');
    } catch (e) {
      console.error('[generate] research pass unusable:', e instanceof Error ? e.message : e);
    }
  }

  try {
    return await enforced(opts.prompt);
  } catch (e) {
    console.error('[generate] enforced generation failed, retrying:',
      e instanceof Error ? e.message : e);
  }

  try {
    return await enforced(
      `${opts.prompt}\n\nYour previous reply did not fit the required shape. Fill every field.`,
    );
  } catch (e) {
    throw new Error(`Unparseable model output: ${e instanceof Error ? e.message : e}`);
  }
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

/** A pick for every fixture in an upcoming week. */
const MatchupPreviewSchema = z.object({
  headline: z.string(),
  standfirst: z.string(),
  games: z.array(z.object({
    teamA: z.string().describe('Exact team name, as given in the fixture list'),
    teamB: z.string().describe('Exact team name, as given in the fixture list'),
    pick: z.string().describe('Exact name of the team you are picking to win'),
    confidence: z.enum(['lock', 'lean', 'coin flip']),
    take: z.string().describe('2-3 sentences arguing the pick with real evidence'),
  })).min(1),
  upsetAlert: z.string().describe('The one result that would surprise the league most'),
});

/**
 * Live game-day copy: the slate starting, and the slate in progress.
 *
 * One schema for both because they render identically and differ only in what
 * the writer is looking at, which the prompt supplies. A separate near-identical
 * schema for each would be surface with no reader-visible payoff.
 */
const GameBeatSchema = z.object({
  headline: z.string(),
  text: z.string().describe('2-4 punchy sentences. This is a live post, not a column'),
  notes: z.array(z.object({
    teamName: z.string().describe('Exact team name'),
    note: z.string().describe('One line: what is happening to them right now'),
  })).min(1),
});

export type MatchupPreview = z.infer<typeof MatchupPreviewSchema>;
export type GameBeat = z.infer<typeof GameBeatSchema>;
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
  // Roster construction
  'their single best player, and whether one man can carry this roster',
  'the weakest spot in their starting lineup, and what it costs them',
  'whether their starting lineup or their depth is doing the real work',
  'the positional group they built around, and whether that was the right bet',
  'their oldest core piece, and how much good football is left in him',
  'the youngest player they are counting on, and whether that is faith or evidence',

  // Performance and trend
  'the gap between how good they look on paper and how good they actually are',
  'whether their record is earned or the schedule has been kind',
  'a player of theirs due to come back to earth, and why',
  'a player of theirs about to be much better than his last season, and why',
  'how they perform when the week goes badly rather than when it goes well',
  'whether they are consistent or wildly streaky, and which is worse here',

  // The league around them
  'how they stack up against the team most likely to beat them',
  'the head to head record that should worry them most',
  'their route through the playoff race from here',
  'the one rival whose roster is built to beat theirs specifically',

  // The manager
  'the manager behind the team and how they operate',
  'what has to go right for them, and what happens if it does not',
  'whether they are actually competing this season or quietly building for later',

  // Assets, kept last so trades are one lens among many rather than the default
  'one specific trade they made, and whether it was smart',
  'their draft capital, and what it says about whether they are building or winning now',
] as const;

/** Deterministic pick, so a caller can spread angles across a batch. */
export function angleAt(index: number): string {
  return ANGLES[Math.abs(index) % ANGLES.length];
}

/**
 * A specific event the piece has been commissioned to cover, stated as fact.
 *
 * This has to be its own block rather than part of the angle. An angle is a
 * lens, offered next to an instruction that the fact is only the excuse for
 * the take, so anything put there is treated as raw material to riff on. A
 * trade fed in that way came back exactly inverted: the team that acquired two
 * receivers and gave up one star was published as having done the reverse.
 *
 * The direction is restated here in the plainest terms available, because it
 * is the one thing that keeps getting flipped.
 */
function eventBlock(record?: string): string {
  if (!record) return '';
  return `
THE EVENT YOU ARE COVERING, TAKEN FROM THE LEAGUE RECORD:
${record}

Those lines are the record. Read the direction before you write a word.
Each leg names who GETS an asset and who GIVES UP an asset. A team that GETS
a player now has him. A team that GIVES UP a player no longer does. "Traded
away X for Y" means they lost X and gained Y, so check which column each name
is actually in before you use a phrase like that.

Name only players that appear in those lines. Do not invent what a team got
back, do not describe a player moving in the opposite direction to the record,
and if you are not certain who ended up with whom, write about the event
without naming the players.
`;
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

  // Projected records have to be on the right scale. A median league plays
  // two games a week, and a stated instruction is not a guarantee: the
  // writers produced half-length records for a whole season before the brief
  // said anything about it, and a prompt alone would not stop them again.
  const expectedGames = brief.regularSeasonWeeks * (brief.medianMatch ? 2 : 1);
  if (expectedGames) {
    for (const row of content.standings ?? []) {
      // Tolerant of stray punctuation: the model occasionally emits "16-12,"
      // and the record itself is right, so it is trimmed rather than refused.
      const raw = String(row.projectedRecord ?? '').trim().replace(/[^0-9-]+$/, '');
      const m = /^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?$/.exec(raw);
      if (!m) {
        problems.push(`"${row.projectedRecord}" for ${row.teamName} is not a won-lost record.`);
        continue;
      }
      const total = Number(m[1]) + Number(m[2]) + Number(m[3] ?? 0);
      if (total !== expectedGames) {
        problems.push(
          `${row.teamName} projected ${row.projectedRecord}, which is ${total} games; ` +
          `this league plays ${expectedGames} regular season games` +
          `${brief.medianMatch ? ', because every week is two games including the median match' : ''}.`,
        );
      }
    }
  }

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
- MAKE A PREDICTION THAT CAN BE PROVED WRONG. Every piece needs at least one
  claim with a subject and an outcome: who misses the playoffs, which player
  finishes outside the top twelve at his position, who wins a specific matchup,
  which manager regrets a move by December. "They have questions to answer" is
  not a prediction. "They finish fifth and it is not close" is.
- Say what would change your mind. A call you can defend is worth more than one
  you hedge, and naming the thing that would falsify it is not hedging.
- Disagree with the obvious read where the evidence supports it. If the whole
  league thinks a manager is winning, the interesting piece is why they might
  not be. Do not contradict the record, but do not simply restate consensus.
- No both-sides mush. If two things are close, say which one you would bet on
  and why.
- Keep the facts sacred. Sharp opinions, honest numbers.
- THE TRANSACTION LOG IS NOT THE ONLY STORY. Trades are the loudest thing in
  the brief, so they are where every writer lands unprompted and the feed ends
  up reading as one long trade recap. Lineups, ageing cores, schedule luck,
  head to head history, positional depth, who is quietly consistent and who is
  one injury from collapse are all live subjects. Only write about a trade when
  your angle is genuinely about a trade.
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
  /** A specific transaction or result this piece must cover, verbatim from
   *  the league record. */
  record?: string,
): Promise<Article> {
  const wire = await generateJson({
    schema: ArticleWireSchema,
    probe: 'headline',
    research: true,
    system: systemFor(p),
    prompt: `${await briefBlock()}
${eventBlock(record)}
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
  /** A specific transaction or result this post must cover, verbatim from the
   *  league record. */
  record?: string,
): Promise<Tweet> {
  const { object } = await generateObject({
    model: claude(MODEL_FAST),
    schema: TweetSchema,
    schemaName: 'Post',
    schemaDescription: 'A single short social post',
    system: systemFor(p),
    prompt: `${await briefBlock()}
${eventBlock(record)}
Write ONE short post for the league feed.

${p.type === 'fan' ? `TALK TO THEM, NOT ABOUT THEM.
You are posting at someone. Open by addressing a manager, a team or a player
directly and stay in second person: "you", "your". Use a manager's handle when
you name one. Third person is a last resort for when there is genuinely nobody
to address, not the default.

Wrong: "AshKashh69 has made 15 moves and it is starting to look desperate."
Right: "@AshKashh69 fifteen moves. FIFTEEN. blink twice if you need help."
` : ''}
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

${record
  ? `Still anchor it to the event above. The take is yours, the facts of that
event are not: get who gave up what the right way round and everything else is
your call.`
  : `Still anchor it to something real, a name or a number from the context above,
but the fact is the excuse for the take, not the post itself.`}

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

export async function writeComment(
  p: Personality, subject: string,
  /** Set when `subject` is a transaction or result lifted from the league
   *  record rather than a free text prompt, so the direction is stated. */
  isRecord = false,
): Promise<Comment> {
  const { object } = await generateObject({
    model: claude(MODEL_FAST),
    schema: CommentSchema,
    schemaName: 'Comment',
    schemaDescription: 'A short in-character reaction',
    system: systemFor(p),
    prompt: isRecord
      ? `${await briefBlock()}
${eventBlock(subject)}
React to that event in 1-3 sentences, in character.`
      : `${await briefBlock()}

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

  // Schema-enforced, like every other generation here. This used to ask for
  // raw JSON and parse it, on the grounds that the provider wrapped a nested
  // array of enums in a stray envelope key; the streaming object API does not
  // have that problem, and hand-parsing was itself failing about a third of
  // the time by accepting a shape the model invented.
  return stripDashes(await generateJson({
    schema: TradeGradeSchema,
    probe: 'verdict',
    system: systemFor(p),
    prompt,
  }));
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
  "boldestTake": "the single most contentious claim you are making"
}`,
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
  "boldestTake": "the claim most likely to start an argument"
}`,
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

// ── Game-day coverage ──────────────────────────────────────────────────────

/**
 * Reject any team name the model invented.
 *
 * Live formats name teams constantly, in a schema field rather than in prose,
 * so a hallucinated name is both easy to spot and worth spotting: a scoreboard
 * post about a team that does not exist is the most obviously broken thing the
 * desk could publish.
 */
async function unknownTeams(names: (string | undefined)[]): Promise<string[]> {
  const real = new Set((await buildLeagueBrief()).teams.map(t => t.teamName));
  return [...new Set(names.filter((n): n is string => Boolean(n) && !real.has(n!)))];
}

/**
 * Picks for every fixture in an upcoming week.
 *
 * The fixture list is passed in rather than left to the model: Sleeper knows
 * exactly who plays whom, and a preview that invents a pairing is worse than
 * no preview. `EDITORIAL` is deliberately omitted, since the standing
 * instruction to find a controversial angle fights the job of covering all of
 * a week's games evenly.
 */
export async function writeMatchupPreview(
  p: Personality, week: number,
): Promise<MatchupPreview> {
  const upcoming = await buildUpcomingMatchups(week);
  if (!upcoming) throw new Error(`No fixtures published for week ${week}`);

  const prompt = `${await briefBlock()}

${upcoming.text}

Preview week ${week}. Work through every fixture above in order, pick a winner
for each, and say why in a way that will annoy the loser. Rate each pick a
"lock", a "lean" or a "coin flip" and be honest about which is which; picking
everything as a lock is cowardice, not confidence.

Argue from the record above: rosters, results so far, transactions, and history
between these two managers. Name players.`;

  const result = await generateJson({
    schema: MatchupPreviewSchema,
    probe: 'headline',
    model: MODEL_FAST,
    maxOutputTokens: 16000,
    system: systemFor(p),
    prompt,
  });

  const bad = await unknownTeams([
    ...result.games.flatMap(g => [g.teamA, g.teamB, g.pick]),
  ]);
  if (bad.length) {
    throw new Error(`Matchup preview named teams not in this league: ${bad.join(', ')}`);
  }
  // A pick has to be one of the two sides actually playing.
  const strayPick = result.games.find(g => g.pick !== g.teamA && g.pick !== g.teamB);
  if (strayPick) {
    throw new Error(
      `Picked ${strayPick.pick} in ${strayPick.teamA} vs ${strayPick.teamB}, who is not in that game`,
    );
  }
  return stripDashes(result);
}

/**
 * A post for the moment the slate kicks off, and one for it in progress.
 *
 * Both read the live scoreboard, which reports fantasy points and explicitly
 * nothing about NFL game clocks. `mode` only changes the framing.
 */
export async function writeGameBeat(
  p: Personality, mode: 'kickoff' | 'live', slate: string,
  /** The caller has already built this to decide the mode; reusing it saves a
   *  second trip to Sleeper and to the multi-megabyte player directory. */
  brief?: LiveBrief | null,
): Promise<GameBeat> {
  const live = brief ?? await buildLiveBrief();
  if (!live) throw new Error('No live week to cover');

  if (mode === 'live' && !live.anyScoring) {
    throw new Error('Nothing has been scored yet; there is no live game to describe');
  }

  const framing = mode === 'kickoff'
    ? `${slate} is under way. Write the post that goes up as the games start:
who has the most riding on today, which matchup is the one to watch, and who
should be nervous. Look forward, not back.`
    : `${slate} is in progress. Write the live post: who is winning, who is
getting embarrassed, whose stars have shown up and whose have not. React to
what the scoreboard actually says.`;

  const prompt = `${await briefBlock()}

${live.text}

${framing}

Keep it short and quotable. This is a live post, not a column: a few sentences
of reaction, then one line each on the teams that matter right now. Name real
players and real point totals from the scoreboard above and nothing else.`;

  const result = await generateJson({
    schema: GameBeatSchema,
    probe: 'headline',
    model: MODEL_FAST,
    maxOutputTokens: 4000,
    system: systemFor(p),
    prompt,
  });

  const bad = await unknownTeams(result.notes.map(n => n.teamName));
  if (bad.length) {
    throw new Error(`Game post named teams not in this league: ${bad.join(', ')}`);
  }
  return stripDashes(result);
}
