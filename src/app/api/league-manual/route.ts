/**
 * This site's commissioner-entered data, for the browser's leagueFetch to
 * join into what it reads (see src/lib/manual). The same entries every page
 * shows; nothing private.
 */

import { NextResponse } from 'next/server';
import { getManual } from '@/lib/manual/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getManual(), { headers: { 'cache-control': 'no-store' } });
}
