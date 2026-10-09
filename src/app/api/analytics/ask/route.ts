/**
 * Ask a question, get a report.
 *
 * The model writes a query spec, never an answer: it picks the table, the
 * fields, the filters and the chart, and the numbers then come from the same
 * engine as a report built by hand. That is the guard against a confident,
 * wrong figure. The model can misunderstand a question, which the user sees
 * plainly in the fields it chose; it cannot invent a number.
 *
 * Public, so it carries the same protections as the chat assistant: a per-IP
 * allowance, a short input cap, a small output cap, and the fast model.
 */

import { NextResponse } from 'next/server';
import { streamObject } from 'ai';
import { z } from 'zod';
import { claude, MODEL_FAST, isAIConfigured } from '@/lib/ai/claude';
import { rateLimit, clientIp } from '@/lib/ai/rateLimit';
import { getCurrentLeagueId } from '@/config/league';
import { getNFLState } from '@/lib/api';
import { analyticsTables } from '@/lib/analytics/datasets';
import { distinctValues } from '@/lib/analytics/engine';
import { DATASETS, AGGS, datasetById, fieldOf, type QuerySpec } from '@/lib/analytics/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_QUESTION = 300;

const SpecSchema = z.object({
  dataset: z.enum(DATASETS.map(d => d.id) as [string, ...string[]]),
  dimensions: z.array(z.string()).max(2)
    .describe('Field keys to group by. The second, if any, splits the chart into series.'),
  measures: z.array(z.object({
    field: z.string().describe('A measure field key, or "*" to count rows'),
    agg: z.enum(AGGS.map(a => a.id) as [string, ...string[]]),
  })).max(3),
  filters: z.array(z.object({
    field: z.string(),
    op: z.enum(['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'is']),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
  })).max(6),
  sort: z.object({ by: z.string(), dir: z.enum(['asc', 'desc']) }).optional()
    .describe('Sort by a dimension key, or a measure written as agg(field), e.g. "sum(points)"'),
  limit: z.number().int().min(1).max(100).optional(),
  chart: z.enum(['auto', 'bar', 'hbar', 'line', 'area', 'donut', 'scatter', 'kpi', 'table']),
  title: z.string().describe('A short title for the report, in plain words'),
});

/** Values worth telling the model about: low-cardinality dimensions only. */
function valueHints(tables: Record<string, any[]>): string {
  const lines: string[] = [];
  for (const ds of DATASETS) {
    const rows = tables[ds.id] ?? [];
    for (const f of ds.fields) {
      if (f.role !== 'dimension' || f.type === 'boolean') continue;
      const vals = distinctValues(rows, f.key, f.ordinal);
      if (vals.length > 0 && vals.length <= 20) {
        lines.push(`  ${ds.id}.${f.key}: ${vals.map(v => JSON.stringify(v)).join(', ')}`);
      }
    }
  }
  return lines.join('\n');
}

function describeSchema(): string {
  return DATASETS.map(d => [
    `DATASET ${d.id} (${d.grain}):`,
    ...d.fields.map(f => `  ${f.key} [${f.type}, ${f.role}] ${f.label}: ${f.description}`),
  ].join('\n')).join('\n\n');
}

export async function POST(request: Request) {
  if (!isAIConfigured()) {
    return NextResponse.json({ error: 'AI is not configured' }, { status: 503 });
  }
  const { ok } = await rateLimit('lp_analytics_rl_', clientIp(request), RATE_LIMIT, RATE_WINDOW_MS);
  if (!ok) {
    return NextResponse.json({ error: 'You have asked a lot this hour. Try again later, or build it by hand.' }, { status: 429 });
  }

  let question = '';
  try {
    const body = await request.json();
    question = String(body?.question ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!question) return NextResponse.json({ error: 'Ask a question' }, { status: 400 });
  if (question.length > MAX_QUESTION) {
    return NextResponse.json({ error: `Keep it under ${MAX_QUESTION} characters` }, { status: 413 });
  }

  try {
    const [tables, state] = await Promise.all([
      analyticsTables(await getCurrentLeagueId()),
      getNFLState().catch(() => null as any),
    ]);

    const system = `You turn questions about a fantasy football league into a query spec for a reporting tool.
You never answer the question yourself; the tool computes the numbers from your spec.

${describeSchema()}

KNOWN VALUES (use these exact strings in filters):
${valueHints(tables as unknown as Record<string, any[]>)}

The current NFL season is ${state?.season ?? 'unknown'}. "This season" means that season, "last season" the one before.
Only weeks whose games are final are in the data.

How to build a good spec:
- Pick the ONE dataset whose grain fits the question.
- Group by at most two dimensions. Put time (season, week) first when the question is about change over time.
- A ranking ("who has the most...", "best", "top") is one dimension, a measure, sort desc, and a limit (10 is a good default).
- A single number ("what was the highest...", "how many...") has no dimensions and chart "kpi".
- To count wins in matchups, sum the "win" field. For win rate, average it.
- Transactions: "trades" means filter type eq "Trade"; "waiver claims" type eq "Waiver"; "pickups" or
  "free agents" type eq "Free agent". Only leave type unfiltered for "moves" or "transactions" in general.
  Count with the "moves" field (sum) or "*" (count).
- "Playoffs" means phase eq "Playoffs". Consolation games are not playoff games.
- "Bench points", "points left on the bench": players.bench_points, or matchups.bench_points per week.
- Prefer chart "auto" unless the question implies a form (trend -> line, share -> donut).
- Boolean filters use op "is" with value true or false.
- Measures sorted by key agg(field), e.g. "sum(points)". Use "*" with agg "count" to count rows.`;

    const result = streamObject({
      model: claude(MODEL_FAST),
      schema: SpecSchema,
      maxOutputTokens: 1200,
      providerOptions: { anthropic: { thinking: { type: 'disabled' as const } } },
      system,
      prompt: question,
    });
    for await (const _ of result.partialObjectStream) { /* drain */ }
    const raw = await result.object;

    // Keep only what exists. A field the model invented is dropped rather
    // than passed through to fail later as an empty column.
    const ds = datasetById(raw.dataset)!;
    const known = (k: string) => k === '*' || Boolean(fieldOf(ds, k));
    const spec: QuerySpec = {
      dataset: ds.id,
      dimensions: raw.dimensions.filter(known),
      measures: raw.measures.filter(m => known(m.field)) as QuerySpec['measures'],
      filters: raw.filters.filter(f => known(f.field)) as QuerySpec['filters'],
      sort: raw.sort,
      limit: raw.limit,
      chart: raw.chart as QuerySpec['chart'],
      title: raw.title,
    };
    if (!spec.dimensions.length && !spec.measures.length) {
      return NextResponse.json({ error: "Couldn't turn that into a report. Try naming what to measure." }, { status: 422 });
    }
    return NextResponse.json({ spec });
  } catch (err) {
    console.error('[api/analytics/ask]', err);
    return NextResponse.json({ error: 'Could not build that report' }, { status: 500 });
  }
}
