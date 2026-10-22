/**
 * A bug or an idea, from anyone using a league's site (FeedbackButton), for the back office's
 * inbox (lib/ops/feedback). Five an hour from one address, so a stuck button can't flood it.
 *
 *   POST { kind: 'bug' | 'idea', title, details?, email?, page?, viewport? }
 */

import { NextResponse } from 'next/server';
import { addFeedback, checkFeedback } from '@/lib/ops/feedback';
import { clientIp, rateLimit } from '@/lib/ai/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const limit = await rateLimit('lp_feedback_rl_', clientIp(req), 5, 3_600_000);
  if (!limit.ok) return NextResponse.json({ error: 'That’s a lot of feedback at once. Try again in a little while.' }, { status: 429 });
  const checked = checkFeedback(await req.json().catch(() => null));
  if (typeof checked === 'string') return NextResponse.json({ error: checked }, { status: 400 });
  const { currentTenant } = await import('@/lib/tenant/context');
  const tenant = await currentTenant().catch(() => null);
  const saved = await addFeedback({
    ...checked,
    league: tenant?.slug ?? null,
    userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
  if (!saved) return NextResponse.json({ error: 'Feedback can’t be saved right now. Try again later.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
