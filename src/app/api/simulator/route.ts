/**
 * The simulator's data payload.
 *
 * All the work happens in `lib/sim/buildLeague`, which the Weekly Report also
 * uses so both features report the same odds.
 */

import { NextResponse } from 'next/server';
import { buildSimLeague } from '@/lib/sim/buildLeague';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await buildSimLeague());
  } catch (err) {
    console.error('[api/simulator]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not build the simulation' },
      { status: 500 },
    );
  }
}
