import { NextResponse } from 'next/server';
import { checkTradeClaims, loadTradeFacts } from '@/lib/ai/factCheck';

export const dynamic = 'force-dynamic';

/** Admin-only harness for exercising the trade-claim checker against copy. */
export async function POST(request: Request) {
  const admin = process.env.ADMIN_PASSWORD;
  if (admin && request.headers.get('x-admin-password') !== admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { text, debug } = await request.json();
  if (debug) {
    const { facts, teams } = await loadTradeFacts();
    return NextResponse.json({
      teams,
      players: [...facts.values()].map(f => ({
        player: f.player, received: [...f.receivedBy], gaveUp: [...f.gaveUpBy],
      })),
    });
  }
  return NextResponse.json({ problems: await checkTradeClaims(String(text ?? '')) });
}
