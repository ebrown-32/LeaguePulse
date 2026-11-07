/**
 * The Desk Weekly (lib/ai/podcast).
 *
 *   GET            the league's episodes, newest first, and whether recorded voices are on
 *   POST (admin)   write this week's episode now
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const { listEpisodes } = await import('@/lib/ai/podcast');
  const episodes = await listEpisodes().catch(() => []);
  return NextResponse.json({ episodes, recorded: Boolean(process.env.ELEVENLABS_API_KEY?.trim()) }, {
    headers: { 'cache-control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=600' },
  });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [{ isAIConfigured }, { publishEpisode }] = await Promise.all([import('@/lib/ai/claude'), import('@/lib/ai/podcast')]);
    if (!(await isAIConfigured())) return NextResponse.json({ error: 'The AI desk is not set up for this league.' }, { status: 400 });
    const episode = await publishEpisode();
    return NextResponse.json({ episode });
  } catch (err) {
    console.error('[api/podcast]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The episode could not be written.' }, { status: 500 });
  }
}
