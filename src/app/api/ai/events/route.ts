import { NextRequest, NextResponse } from 'next/server';
import { buildLeagueEvents } from '@/lib/ai/leagueEvents';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  return req.headers.get('x-admin-password') === (process.env.ADMIN_PASSWORD || 'admin123');
}

/**
 * Recent league events the admin panel can commission coverage of.
 *
 * Admin-only, matching the rest of the AI surface: this reveals nothing
 * sensitive, but it is only ever read by the back office and leaving it open
 * would mean an unauthenticated visitor could warm the league brief.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ events: await buildLeagueEvents() });
  } catch (err) {
    console.error('[api/ai/events]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read league events', events: [] },
      { status: 500 },
    );
  }
}
