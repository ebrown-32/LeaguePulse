/**
 * The recorded voices an admin can give a personality on The Desk Weekly (AI Desk admin).
 *
 *   GET   admin only   { recorded, voices: [{ id, name, description, preview }] }
 *
 * `recorded` is false when the platform has no ElevenLabs key: episodes are then read by each
 * listener's browser, and there is nothing to pick.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { elevenLabsKey, listVoices, voicesProblem } from '@/lib/ai/elevenlabs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!elevenLabsKey()) return NextResponse.json({ recorded: false, voices: [] });
  try {
    return NextResponse.json({ recorded: true, voices: await listVoices() });
  } catch (err) {
    const problem = voicesProblem(err);
    console.error('[api/podcast/voices]', problem);
    return NextResponse.json({ recorded: true, voices: [], error: problem }, { status: 502 });
  }
}
