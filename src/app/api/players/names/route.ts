/**
 * Names for a few players, by Sleeper id, for pages built in the browser that only have ids
 * (the history's player records, lib/enhancedHistoryApi). Saves the browser Sleeper's whole
 * players directory, which is several megabytes.
 *
 *   GET ?ids=4046,6794,BUF   { players: { [id]: { name, position } } }, unknown ids left out
 */

import { NextResponse } from 'next/server';
import { getPlayersDirectory } from '@/lib/playerStats';

export const dynamic = 'force-dynamic';

const MAX = 200;

export async function GET(req: Request) {
  const ids = [...new Set((new URL(req.url).searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean))].slice(0, MAX);
  if (!ids.length) return NextResponse.json({ players: {} });
  const dir = await getPlayersDirectory().catch(() => null);
  if (!dir) return NextResponse.json({ error: 'Players unavailable' }, { status: 502 });
  const players: Record<string, { name: string; position: string | null }> = {};
  for (const id of ids) {
    const p = dir[id];
    const name = p ? (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ')) : '';
    if (name) players[id] = { name, position: p.position ?? null };
  }
  // Names don't change between seasons; an hour in the browser is plenty.
  return NextResponse.json({ players }, { headers: { 'cache-control': 'private, max-age=3600' } });
}
