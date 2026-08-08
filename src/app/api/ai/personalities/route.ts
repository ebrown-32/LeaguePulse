import { NextRequest, NextResponse } from 'next/server';
import { getPersonalities, savePersonalities } from '@/lib/ai/store';
import type { Personality } from '@/lib/ai/personalities';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return req.headers.get('x-admin-password') === (process.env.ADMIN_PASSWORD || 'admin123');
}

export async function GET() {
  return NextResponse.json({ personalities: await getPersonalities() });
}

export async function PUT(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { personalities } = await req.json() as { personalities: Personality[] };
    if (!Array.isArray(personalities)) {
      return NextResponse.json({ error: 'personalities must be an array' }, { status: 400 });
    }
    await savePersonalities(personalities);
    return NextResponse.json({ personalities });
  } catch (err) {
    console.error('[api/ai/personalities]', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
