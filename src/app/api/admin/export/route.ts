/**
 * Admin only: the league's archive, to look at and to download.
 *
 *   GET  ?status=1                                  what the archive holds, and when it was last updated
 *   GET  ?format=csv|xlsx|json&dataset=&season=     a download (dataset: all, standings, games,
 *                                                   lineups, transactions, draft; season: a year, or all)
 *   POST                                            bring the archive up to date now
 *
 * A league with nothing archived yet is archived on its first request, so the
 * page never shows an empty archive to a league that has history.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { DATASETS, type DatasetId } from '@/lib/archive/tables';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const deny = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const notSetUp = () => NextResponse.json({ configured: false }, { status: 200 });

async function ready() {
  const [{ archiveConfigured }, { currentSite, archiveLeague }, { archiveStatus }] = await Promise.all([
    import('@/lib/archive/db'), import('@/lib/archive/ingest'), import('@/lib/archive/export'),
  ]);
  if (!archiveConfigured()) return null;
  const site = await currentSite();
  let status = await archiveStatus(site);
  if (!status.seasons.length) {
    await archiveLeague();
    status = await archiveStatus(site);
  }
  return { site, status };
}

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  const url = new URL(req.url);
  try {
    const r = await ready();
    if (!r) return notSetUp();
    if (url.searchParams.get('status')) return NextResponse.json({ configured: true, ...r.status, datasets: DATASETS });

    const format = url.searchParams.get('format');
    const dataset = url.searchParams.get('dataset') ?? 'all';
    const seasonParam = url.searchParams.get('season') ?? 'all';
    if (format !== 'csv' && format !== 'xlsx' && format !== 'json') return NextResponse.json({ error: 'Unknown format' }, { status: 400 });
    if (dataset !== 'all' && !DATASETS.some(d => d.id === dataset)) return NextResponse.json({ error: 'Unknown dataset' }, { status: 400 });
    const season = seasonParam === 'all' ? null : Number(seasonParam);
    if (season !== null && !r.status.seasons.some(s => s.season === season)) return NextResponse.json({ error: 'That season is not in the archive' }, { status: 404 });

    const { exportArchive } = await import('@/lib/archive/export');
    const file = await exportArchive({ site: r.site, format, dataset: dataset as DatasetId | 'all', season });
    return new Response(file.body as BodyInit, {
      headers: {
        'content-type': file.type,
        'content-disposition': `attachment; filename="${file.filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[admin/export]', err);
    return NextResponse.json({ error: 'Could not read the archive' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  const [{ archiveConfigured }, { archiveLeague, currentSite }, { archiveStatus }] = await Promise.all([
    import('@/lib/archive/db'), import('@/lib/archive/ingest'), import('@/lib/archive/export'),
  ]);
  if (!archiveConfigured()) return notSetUp();
  try {
    await archiveLeague();
    return NextResponse.json({ configured: true, ...(await archiveStatus(await currentSite())), datasets: DATASETS });
  } catch (err) {
    console.error('[admin/export] archive', err);
    return NextResponse.json({ error: 'Could not update the archive' }, { status: 500 });
  }
}
