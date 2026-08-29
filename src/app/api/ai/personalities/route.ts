import { NextRequest, NextResponse } from 'next/server';
import { getPersonalities, getPersonalitiesForAdmin, savePersonalities } from '@/lib/ai/store';
import { avatarProblem } from '@/lib/ai/avatarUpload';
import type { Personality } from '@/lib/ai/personalities';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return req.headers.get('x-admin-password') === (process.env.ADMIN_PASSWORD || 'admin123');
}

/**
 * The public read hides deleted built-ins; the admin read does not, so a
 * delete can be undone from the panel rather than only by clearing storage.
 */
export async function GET(req: NextRequest) {
  const forAdmin = authorized(req);
  return NextResponse.json({
    personalities: forAdmin ? await getPersonalitiesForAdmin() : await getPersonalities(),
  });
}

export async function PUT(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { personalities } = await req.json() as { personalities: Personality[] };
    if (!Array.isArray(personalities)) {
      return NextResponse.json({ error: 'personalities must be an array' }, { status: 400 });
    }

    // Uploaded portraits are the one field here carrying opaque bytes that get
    // served back from our own origin, so they are checked rather than trusted.
    // Rejecting the whole save is deliberate: a partial write would leave the
    // cast in a state the admin did not ask for.
    for (const p of personalities) {
      if (p.avatarImage === undefined) continue;
      const problem = avatarProblem(p.avatarImage);
      if (problem) {
        return NextResponse.json({ error: `${p.name || p.id}: ${problem}` }, { status: 400 });
      }
    }

    await savePersonalities(personalities);
    return NextResponse.json({ personalities });
  } catch (err) {
    console.error('[api/ai/personalities]', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
