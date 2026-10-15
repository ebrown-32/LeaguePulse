/**
 * Operator only: the league archive (see src/lib/archive).
 *
 *   POST  { slug, full? }   archive that league now (full: re-read every season, not just what can change)
 *   GET   ?slug=     what the archive holds for it, season by season
 *
 * Both take `Authorization: Bearer $LP_OPERATOR_SECRET`, or an operator account.
 */

import { NextResponse } from 'next/server';
import { isOperator } from '@/lib/platform/operator';
import { getTenant } from '@/lib/platform/tenants';
import { runAsTenant } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';
// A league with a decade of history reads a few hundred pages the first time.
export const maxDuration = 300;

const deny = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function POST(req: Request) {
  if (!(await isOperator(req))) return deny();
  const { slug, full } = await req.json().catch(() => ({})) as { slug?: string; full?: boolean };
  const t = slug ? await getTenant(slug) : null;
  if (!t) return NextResponse.json({ error: 'Unknown league' }, { status: 404 });
  const { archiveLeague } = await import('@/lib/archive/ingest');
  try {
    return NextResponse.json(await runAsTenant(t, () => archiveLeague({ full: Boolean(full) })));
  } catch (err) {
    console.error('[operator/archive]', slug, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Archive failed' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!(await isOperator(req))) return deny();
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  const { ensureArchive, T } = await import('@/lib/archive/db');
  const db = await ensureArchive();
  if (!db) return NextResponse.json({ error: 'The archive is not set up' }, { status: 503 });
  const count = (table: string) => `(SELECT count(*)::int FROM ${T(table)} x WHERE x.site = s.site AND x.season_id = s.season_id)`;
  const { rows } = await db.query(`
    SELECT s.season, s.season_id, s.provider, s.final, s.archived_at,
      ${count('teams')} AS teams, ${count('matchups')} AS matchups,
      (SELECT count(DISTINCT week)::int FROM ${T('matchups')} x WHERE x.site = s.site AND x.season_id = s.season_id) AS weeks,
      ${count('transactions')} AS transactions,
      (SELECT count(*)::int FROM ${T('transactions')} x WHERE x.site = s.site AND x.season_id = s.season_id AND x.type = 'trade') AS trades,
      ${count('draft_picks')} AS draft_picks,
      (SELECT count(*)::int FROM ${T('draft_picks')} x WHERE x.site = s.site AND x.season_id = s.season_id AND x.player_name IS NOT NULL) AS named_picks
    FROM ${T('seasons')} s WHERE s.site = $1 ORDER BY s.season DESC`, [slug]);
  const last = await db.query(`SELECT started_at, finished_at, error FROM ${T('archive_runs')} WHERE site = $1 ORDER BY started_at DESC LIMIT 1`, [slug]);
  return NextResponse.json({ site: slug, seasons: rows, lastRun: last.rows[0] ?? null });
}
