/**
 * For the AI Desk admin's Desk Weekly section: this season's finished weeks, each with its
 * episode if it has one, and whether the Desk can write one.
 *
 *   GET   admin only   { season, weeks: [{ week, episode: { id, title, createdAt } | null }], aiReady }
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [{ isAIConfigured }, { episodeWeeks }] = await Promise.all([import('@/lib/ai/claude'), import('@/lib/ai/podcast')]);
    const [aiReady, weeks] = await Promise.all([isAIConfigured(), episodeWeeks()]);
    return NextResponse.json({ ...weeks, aiReady }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[api/podcast/weeks]', err);
    return NextResponse.json({ error: 'Could not load the season.' }, { status: 500 });
  }
}
