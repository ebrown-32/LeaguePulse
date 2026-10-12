/** Whether a web address is free, as someone types it. */

import { NextRequest, NextResponse } from 'next/server';
import { slugAvailability } from '@/lib/platform/tenants';
import { slugify } from '@/lib/platform/config';

export const dynamic = 'force-dynamic';

const WHY = {
  invalid: 'Use 3 to 32 lowercase letters, numbers and hyphens.',
  reserved: 'That address is reserved.',
  taken: 'That address is taken.',
  held: 'Someone is signing up with that address right now.',
} as const;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('s') ?? '';
  const slug = slugify(raw);
  const league = req.nextUrl.searchParams.get('league') ?? undefined;
  try {
    const a = await slugAvailability(slug, league);
    return NextResponse.json(a.ok ? { slug, ok: true } : { slug, ok: false, reason: WHY[a.reason] });
  } catch (err) {
    return NextResponse.json({ slug, ok: false, reason: err instanceof Error ? err.message : 'Unavailable' }, { status: 503 });
  }
}
