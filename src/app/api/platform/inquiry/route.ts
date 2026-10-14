/**
 * A Custom tier inquiry: someone who wants a site designed around their
 * league. Kept for the operator, who follows up by email (see the back
 * office). Rate limited, and nothing here is shown to anyone else.
 */

import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redisClient';
import { rateLimit, clientIp } from '@/lib/ai/rateLimit';
import { INQUIRIES, type Inquiry } from '@/lib/platform/inquiries';

export const dynamic = 'force-dynamic';


const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

export async function POST(req: Request) {
  const { ok } = await rateLimit('lp_inquiry_rl_', clientIp(req), 5, 60 * 60 * 1000);
  if (!ok) return NextResponse.json({ error: 'That’s a few already. We’ll be in touch.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const inquiry: Inquiry = {
    id: Math.random().toString(36).slice(2, 10),
    name: clip(body.name, 80),
    email: clip(body.email, 120).toLowerCase(),
    league: clip(body.league, 200),
    message: clip(body.message, 2000),
    at: new Date().toISOString(),
  };
  if (!inquiry.name) return NextResponse.json({ error: 'Tell us your name.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) return NextResponse.json({ error: 'We need an email to reply to.' }, { status: 400 });
  if (inquiry.message.length < 10) return NextResponse.json({ error: 'Tell us a little about what you have in mind.' }, { status: 400 });
  const r = getRedis().client;
  if (!r) return NextResponse.json({ error: 'Could not send right now.' }, { status: 503 });
  await r.lpush(INQUIRIES, JSON.stringify(inquiry));
  await r.ltrim(INQUIRIES, 0, 499);
  return NextResponse.json({ ok: true });
}
