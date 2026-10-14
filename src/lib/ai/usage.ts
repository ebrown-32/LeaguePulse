/**
 * What a league's AI actually uses, counted per month.
 *
 * Every Claude call goes through `claude()`, which reports its tokens and web
 * searches here. The counts are kept per league (the keys are scoped like any
 * other league key) and per calendar month, as plain counters, so concurrent
 * calls never lose a write. The back office turns them into dollars with the
 * list prices below: that is what tells us whether League Pass + AI pays for
 * its own AI, and what a League Pass league can expect to pay Anthropic.
 */

/** Anthropic list prices, US dollars per million tokens. */
export const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-5': { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};
/** Web search, per search. */
export const SEARCH_PRICE = 0.01;

export interface CallUsage { model: string; input: number; output: number; cacheRead: number; cacheWrite: number; searches: number }

const FIELDS = ['calls', 'in', 'out', 'cacheRead', 'cacheWrite'] as const;
const month = (d = new Date()) => d.toISOString().slice(0, 7);
const key = (m: string, model: string, field: string) => `ai_usage_${m}_${model}_${field}`;
const searchKey = (m: string) => `ai_usage_${m}_searches`;

/** Count one call. Never throws: losing a count must not fail the call it counts. */
export async function recordUsage(u: CallUsage): Promise<void> {
  const r = (await import('@/lib/redisClient')).getRedis().client;
  if (!r) return;
  const m = month();
  const values: Record<(typeof FIELDS)[number], number> = { calls: 1, in: u.input, out: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite };
  await Promise.all([
    ...FIELDS.filter(f => values[f] > 0).map(f => r.incrby(key(m, u.model, f), Math.round(values[f]))),
    u.searches > 0 ? r.incrby(searchKey(m), u.searches) : null,
  ]).catch(() => {});
}

export interface MonthUsage { month: string; calls: number; inputTokens: number; outputTokens: number; searches: number; cost: number }

/** This month's usage for the current league, and its cost at list prices. */
export async function monthUsage(m = month()): Promise<MonthUsage> {
  const empty = { month: m, calls: 0, inputTokens: 0, outputTokens: 0, searches: 0, cost: 0 };
  const r = (await import('@/lib/redisClient')).getRedis().client;
  if (!r) return empty;
  const models = Object.keys(PRICES);
  const keys = [...models.flatMap(model => FIELDS.map(f => key(m, model, f))), searchKey(m)];
  const vals = (await r.mget(keys).catch(() => [])).map(v => Number(v ?? 0));
  if (!vals.length) return empty;
  return { month: m, ...costOf(models, vals) };
}

/** Pure: counters in `FIELDS` order per model, then searches, to totals and dollars. */
export function costOf(models: string[], vals: number[]): Omit<MonthUsage, 'month'> {
  let calls = 0, inputTokens = 0, outputTokens = 0, cost = 0;
  models.forEach((model, i) => {
    const [c, inp, out, cr, cw] = vals.slice(i * FIELDS.length, (i + 1) * FIELDS.length);
    const p = PRICES[model];
    calls += c; inputTokens += inp + cr + cw; outputTokens += out;
    cost += (inp * p.in + out * p.out + cr * p.cacheRead + cw * p.cacheWrite) / 1e6;
  });
  const searches = vals[models.length * FIELDS.length] ?? 0;
  cost += searches * SEARCH_PRICE;
  return { calls, inputTokens, outputTokens, searches, cost: Math.round(cost * 100) / 100 };
}
