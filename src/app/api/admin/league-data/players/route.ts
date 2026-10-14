/**
 * Find a player by name, for the admin's move forms. Searches the full
 * player directory, retired players included, so older seasons can be filled
 * in too.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { getPlayersDirectory } from '@/lib/playerStats';

export const dynamic = 'force-dynamic';

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.'’-]/g, '').trim();

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = norm(new URL(req.url).searchParams.get('q') ?? '');
  if (q.length < 2) return NextResponse.json({ players: [] });
  const dir = await getPlayersDirectory();
  const hits: { id: string; name: string; position: string; team: string; active: boolean; rank: number; starts: boolean }[] = [];
  for (const [id, p] of Object.entries(dir) as [string, any][]) {
    if (!POSITIONS.has(p.position)) continue;
    const name = p.position === 'DEF' ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || id : (p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`).trim();
    const n = norm(name);
    if (!n.includes(q)) continue;
    hits.push({ id, name, position: p.position, team: p.team ?? '', active: Boolean(p.active), rank: Number(p.search_rank ?? 9e9), starts: n.startsWith(q) });
  }
  hits.sort((a, b) => Number(b.starts) - Number(a.starts) || Number(b.active) - Number(a.active) || a.rank - b.rank);
  return NextResponse.json({ players: hits.slice(0, 12).map(({ id, name, position, team }) => ({ id, name, position, team })) });
}
