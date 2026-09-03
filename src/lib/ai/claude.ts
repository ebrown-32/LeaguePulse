/**
 * Single chokepoint for every Claude call in the app.
 *
 * Replaces the hand-rolled fetch-with-fallback of the retired ai-agents stack:
 * already depends on the Vercel AI SDK, which gives us structured output via
 * generateObject — the thing trade grading and article scaffolding actually
 * need, and which raw chat completions can't guarantee.
 *
 * Server-only: ANTHROPIC_API_KEY must never reach the browser.
 */
import { createAnthropic } from '@ai-sdk/anthropic';

/** Fast + cheap: tweets, comments, quick reactions. */
export const MODEL_FAST = 'claude-haiku-4-5-20251001';
/** Higher quality: articles, trade grades, anything reasoned. */
export const MODEL_SMART = 'claude-sonnet-5';

export class AINotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set — add it to .env.local to enable AI personalities.');
    this.name = 'AINotConfiguredError';
  }
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: ReturnType<typeof createAnthropic> | null = null;

/**
 * Returns a configured model. Throws AINotConfiguredError rather than letting
 * the SDK fail deep inside a request with an opaque provider error — callers
 * turn this into a clean 503 with setup instructions.
 */
export function claude(model: string = MODEL_SMART) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AINotConfiguredError();
  client ??= createAnthropic({ apiKey });
  return client(model);
}

/** Shared guardrails. Every persona prompt is appended to this. */
export const GROUNDING_RULES = `
You are writing for a fantasy football league's in-app media feed.

NON-NEGOTIABLE RULES:
1. Use ONLY the league data provided in the context block. It is the complete
   and authoritative record.
2. NEVER invent scores, records, player statistics, transactions, injuries, or
   quotes. If a number is not in the context, do not state a number.
3. NEVER fabricate real-world NFL news, rumours, or anything you cannot see in
   the context.
4. You may be opinionated, funny, and dramatic about the data — that is the
   point — but every factual claim must trace back to the context.
5. Refer to managers and teams by the exact names given.
6. If the context is thin (e.g. preseason with no games played), say so in
   your own voice rather than inventing action.
7. Each transaction is tagged with its type — [trade], [waiver] or
   [free_agent]. Describe a move using its stated type; never call a trade a
   waiver pickup or vice versa.
8. Never use emoji. Not one, in any piece of content.
9. PUNCTUATION: never use em dashes or en dashes. Use commas, full stops,
   colons, or brackets instead. This is a hard style rule.
10. Do not compute counts, totals, averages or rankings that are not written in
   the context. If you want to say "three trades", only do so if you can point
   at three separate trade lines. Vague wording beats an invented number.
11. Do not say how a player joined a roster unless a transaction line says so.
    If the league status is pre_draft, no draft has happened yet, so nobody was
    "drafted" this season.
12. Do not infer chronology. Who is the reigning champion, which season is
   current, and when a move happened are all stated explicitly — read them,
   do not deduce them from the order things appear in.
`.trim();

/**
 * Strips dash characters the style rules forbid.
 *
 * The prompt rule alone is not a guarantee, so every generated string is
 * sanitised before it is stored or rendered. Applied recursively because
 * generated content is a nested object, not a single string.
 */
/**
 * Citation markup from the research pass.
 *
 * A writer given web search sometimes wraps its evidence in the citation tags
 * the tool result used, and those went straight into the published prose:
 * `(cite index="1-4,1-5">Jaxon Smith-Njigba ...</cite>`. The reader wants the
 * sentence, not the footnote apparatus, so the tags are removed and their
 * contents kept. The stray opening bracket that usually precedes one goes too.
 */
function stripCitations(text: string): string {
  return text
    // Closing tags first. The opening pattern below allows a missing "<",
    // because the leaked text arrives as `(cite index="1-4">`, and that same
    // leniency makes it match the `cite>` inside `</cite>` and leave a stray
    // `</` behind. Removing the closers up front avoids the overlap.
    .replace(/<\s*\/\s*(?:antml:)?cite\s*>\)?/gi, '')
    // Opening tags, with or without the leading bracket.
    .replace(/\(?\s*<?\s*(?:antml:)?cite\b[^>]*>/gi, '')
    // Bare [1-4] style markers left over from a citation.
    .replace(/\[\s*\d+(?:[-,]\d+)*\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ');
}

export function stripDashes<T>(value: T): T {
  if (typeof value === 'string') {
    return stripCitations(value)
      .replace(/\s*[\u2014\u2013]\s*/g, ', ')   // em/en dash between words
      .replace(/,\s*,/g, ',')
      .replace(/\s+([,.!?])/g, '$1')
      .trim() as unknown as T;
  }
  if (Array.isArray(value)) return value.map(stripDashes) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripDashes(v);
    return out as unknown as T;
  }
  return value;
}
