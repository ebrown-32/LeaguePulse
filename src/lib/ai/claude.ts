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
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';

/** Fast + cheap: tweets, comments, quick reactions. */
export const MODEL_FAST = 'claude-haiku-4-5-20251001';
/** Higher quality: articles, trade grades, anything reasoned. */
export const MODEL_SMART = 'claude-sonnet-5';

export class AINotConfiguredError extends Error {
  constructor() {
    super(process.env.LP_HOSTED === '1'
      ? 'This league has no Anthropic API key yet. An admin can add one under Admin, AI Desk.'
      : 'ANTHROPIC_API_KEY is not set — add it to .env.local to enable AI personalities.');
    this.name = 'AINotConfiguredError';
  }
}

const hosted = () => process.env.LP_HOSTED === '1';

/**
 * The Anthropic key for the current request.
 *
 * Self-hosted: ANTHROPIC_API_KEY, as always. Hosted: the league's own key, so
 * each league pays for its own AI; and for a league on League Pass + AI with
 * no key of its own, the platform's key for managed leagues
 * (LP_MANAGED_ANTHROPIC_API_KEY), because running its AI is what it pays for.
 * There is deliberately no fallback for any other league: that would quietly
 * bill the platform for every league's usage.
 *
 * The operator can override any league's plan either way (lib/platform/
 * tenants, aiMode): switched off, no key at all, so nothing AI runs there,
 * even on a key of its own.
 */
export async function anthropicKey(): Promise<string | null> {
  if (!hosted()) return process.env.ANTHROPIC_API_KEY?.trim() || null;
  if ((await currentAiMode()) === 'off') return null;
  const { tenantAnthropicKey } = await import('@/lib/tenant/secrets');
  const own = await tenantAnthropicKey();
  if (own) return own;
  return (await aiManaged()) ? process.env.LP_MANAGED_ANTHROPIC_API_KEY?.trim() || null : null;
}

/** How this league's AI runs (its plan, unless the operator said otherwise). Hosted only. */
async function currentAiMode() {
  const [{ currentTenant }, { aiMode }] = await Promise.all([import('@/lib/tenant/context'), import('@/lib/platform/tenants')]);
  const t = await currentTenant();
  return t ? aiMode(t) : null;
}

/** Whether the platform runs this league's AI (League Pass + AI, or the operator's say-so). Hosted only. */
export async function aiManaged(): Promise<boolean> {
  if (!hosted()) return false;
  return (await currentAiMode()) === 'platform';
}

/**
 * Whether this request's AI is billed to the platform: a League Pass + AI
 * league with no key of its own. Those leagues get the tighter daily limits.
 */
export async function onPlatformKey(): Promise<boolean> {
  if (!hosted() || !(await aiManaged())) return false;
  const { tenantAnthropicKey } = await import('@/lib/tenant/secrets');
  return !(await tenantAnthropicKey());
}

/**
 * A league's daily allowance of chat or analytics questions. A league on its
 * own key keeps the generous default (it pays for what it uses); a league
 * whose AI the platform pays for gets a cap sized to its price.
 */
export async function dailyQuestionLimit(kind: 'chat' | 'ask'): Promise<number> {
  const env = (name: string, fallback: number) => Number(process.env[name] || fallback);
  if (await onPlatformKey()) return kind === 'chat' ? env('LP_MANAGED_DAILY_CHAT', 40) : env('LP_MANAGED_DAILY_ASK', 20);
  return kind === 'chat' ? env('LP_AI_DAILY_CHAT', 300) : env('LP_AI_DAILY_ASK', 200);
}

/**
 * The model a call actually uses. A league whose AI the platform pays for (League Pass + AI on
 * the platform's key) has a monthly budget, LP_MANAGED_MONTHLY_BUDGET dollars at list prices
 * ($4 unless set): past it, its calls run on the fast model for the rest of the month instead of
 * stopping. That keeps the worst case, a league maxing its daily limits every day, inside what
 * it pays. A league on its own key pays its own way and is never switched. The month's spend is
 * read at most once a minute per league.
 */
const BUDGET_MEMO = new Map<string, { at: number; over: boolean }>();
export async function budgetedModel(model: string): Promise<string> {
  if (model === MODEL_FAST || !hosted()) return model;
  try {
    const budget = Number(process.env.LP_MANAGED_MONTHLY_BUDGET || 4);
    if (!(budget > 0) || !(await onPlatformKey())) return model;
    const { currentTenant } = await import('@/lib/tenant/context');
    const slug = (await currentTenant())?.slug ?? '';
    const hit = BUDGET_MEMO.get(slug);
    let over = hit && Date.now() - hit.at < 60_000 ? hit.over : null;
    if (over === null) {
      const { monthUsage } = await import('./usage');
      over = (await monthUsage()).cost >= budget;
      BUDGET_MEMO.set(slug, { at: Date.now(), over });
    }
    return over ? MODEL_FAST : model;
  } catch {
    // Can't tell: the call goes ahead as asked rather than failing.
    return model;
  }
}

/** Whether AI can run for this request. Async: on the hosted product it is per league. */
export async function isAIConfigured(): Promise<boolean> {
  return Boolean(await anthropicKey());
}

let client: ReturnType<typeof createAnthropic> | null = null;
let hostedClient: ReturnType<typeof createAnthropic> | null = null;

/**
 * Returns a configured model. Throws AINotConfiguredError rather than letting
 * the SDK fail deep inside a request with an opaque provider error — callers
 * turn this into a clean 503 with setup instructions.
 *
 * Hosted, the key is resolved per request inside the client's fetch, which is
 * what lets this stay synchronous for its many callers while still sending
 * each league's own key. The placeholder key below is never sent: the header
 * is overwritten on every request.
 */
export function claude(model: string = MODEL_SMART) {
  return wrapLanguageModel({ model: baseModel(model), middleware: counted(model) });
}

function baseModel(model: string) {
  if (hosted()) {
    hostedClient ??= createAnthropic({
      apiKey: 'resolved-per-request',
      fetch: async (input, init) => {
        const key = await anthropicKey();
        if (!key) throw new AINotConfiguredError();
        const headers = new Headers(init?.headers);
        headers.set('x-api-key', key);
        return fetch(input, { ...init, headers });
      },
    });
    return hostedClient(model);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AINotConfiguredError();
  client ??= createAnthropic({ apiKey });
  return client(model);
}

type Usage = { inputTokens: { total?: number; noCache?: number; cacheRead?: number; cacheWrite?: number }; outputTokens: { total?: number } };
type Part = { type: string; toolName?: string };

/**
 * Counts every call's tokens and web searches against the league (see
 * usage.ts), under the model that actually ran: a league over its budget
 * (budgetedModel) is switched here, call by call. The league is captured when
 * the call starts: a stream finishes after the request code that started it
 * has moved on.
 */
function counted(asked: string): LanguageModelMiddleware {
  const record = async (usage: Usage, parts: Part[], model: string) => {
    const n = (v?: number) => v ?? 0;
    const cacheRead = n(usage.inputTokens.cacheRead), cacheWrite = n(usage.inputTokens.cacheWrite);
    const { recordUsage } = await import('./usage');
    await recordUsage({
      model,
      input: usage.inputTokens.noCache ?? Math.max(0, n(usage.inputTokens.total) - cacheRead - cacheWrite),
      output: n(usage.outputTokens.total), cacheRead, cacheWrite,
      searches: parts.filter(p => p.type === 'tool-call' && p.toolName === 'web_search').length,
    });
  };
  const inLeague = async (fn: () => Promise<void>): Promise<() => Promise<void>> => {
    try {
      const { currentTenant, runAsTenant } = await import('@/lib/tenant/context');
      const t = await currentTenant();
      return () => Promise.resolve().then(() => runAsTenant(t, fn)).catch(() => {});
    } catch {
      return async () => {};
    }
  };
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate, params }) => {
      const used = await budgetedModel(asked);
      const result = used === asked ? await doGenerate() : await baseModel(used).doGenerate(params);
      await (await inLeague(() => record(result.usage, result.content as Part[], used)))();
      return result;
    },
    wrapStream: async ({ doStream, params }) => {
      const used = await budgetedModel(asked);
      const { stream, ...rest } = used === asked ? await doStream() : await baseModel(used).doStream(params);
      const parts: Part[] = [];
      let usage: Usage | null = null;
      const save = await inLeague(async () => { if (usage) await record(usage, parts, used); });
      return {
        stream: stream.pipeThrough(new TransformStream({
          transform(part, ctrl) {
            if (part.type === 'tool-call') parts.push(part as Part);
            if (part.type === 'finish') usage = part.usage;
            ctrl.enqueue(part);
          },
          async flush() { await save(); },
        })),
        ...rest,
      };
    },
  };
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
