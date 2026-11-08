/**
 * The Desk Weekly (lib/ai/podcast).
 *
 *   GET            the league's episodes, newest first, and whether recorded voices are on
 *   POST (admin)   write an episode now: { week? } (default the latest finished week; an earlier
 *                  week of this season is a look back, and replaces that week's episode).
 *                  Replacing an episode is limited to once a week per league: a 429 with
 *                  { error, nextAt } until then.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Episodes recorded before games named their managers: each side's manager found by team name, so
 * their highlights (the stadium, components/podcast/Studio) play too.
 */
async function withManagers<T extends { chapters: { visual: any }[] }>(episodes: T[]): Promise<T[]> {
  const missing = episodes.some(e => e.chapters.some(c => c.visual?.type === 'matchup' && (!c.visual.home.userId || !c.visual.away.userId)));
  if (!missing) return episodes;
  try {
    const [{ getCurrentLeagueId }, { getLeagueUsers }] = await Promise.all([import('@/config/league'), import('@/lib/api')]);
    const users: any[] = await getLeagueUsers(await getCurrentLeagueId());
    const byName = new Map<string, any>();
    for (const u of users) for (const n of [u.metadata?.team_name, u.display_name]) if (n) byName.set(String(n).toLowerCase(), u);
    const fill = (side: any) => {
      if (side.userId) return side;
      const u = byName.get(String(side.team).toLowerCase());
      return u ? { ...side, userId: String(u.user_id), avatar: u.avatar ?? '' } : side;
    };
    return episodes.map(e => ({ ...e, chapters: e.chapters.map(c => c.visual?.type === 'matchup' ? { ...c, visual: { ...c.visual, home: fill(c.visual.home), away: fill(c.visual.away) } } : c) }));
  } catch { return episodes; }
}

export async function GET() {
  const { listEpisodes } = await import('@/lib/ai/podcast');
  const episodes = await withManagers(await listEpisodes().catch(() => []));
  return NextResponse.json({ episodes, recorded: Boolean(process.env.ELEVENLABS_API_KEY?.trim()) }, {
    headers: { 'cache-control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=600' },
  });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { week?: unknown };
  const week = body.week === undefined ? undefined : Number(body.week);
  if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 25)) return NextResponse.json({ error: 'Pick a week of this season.' }, { status: 400 });
  try {
    const [{ isAIConfigured }, { publishEpisode }] = await Promise.all([import('@/lib/ai/claude'), import('@/lib/ai/podcast')]);
    if (!(await isAIConfigured())) return NextResponse.json({ error: 'The AI desk is not set up for this league.' }, { status: 400 });
    const episode = await publishEpisode(week, { admin: true });
    return NextResponse.json({ episode });
  } catch (err) {
    const { RerecordTooSoon } = await import('@/lib/ai/podcast');
    if (err instanceof RerecordTooSoon) return NextResponse.json({ error: err.message, nextAt: err.nextAt }, { status: 429 });
    console.error('[api/podcast]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The episode could not be written.' }, { status: 500 });
  }
}
