import { NextResponse } from 'next/server';
import { runDiagnostics } from '@/lib/ai/diagnostics';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Admin-gated health check for every AI dependency.
 *
 * Gated because the output names which env vars are set and returns provider
 * error bodies, which is exactly the sort of thing not to expose publicly.
 * `?live=1` additionally spends one token proving the Anthropic key works.
 */
export async function GET(request: Request) {
  const admin = process.env.ADMIN_PASSWORD;
  if (admin && request.headers.get('x-admin-password') !== admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const live = new URL(request.url).searchParams.get('live') === '1';
  try {
    return NextResponse.json(await runDiagnostics({ live }));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
