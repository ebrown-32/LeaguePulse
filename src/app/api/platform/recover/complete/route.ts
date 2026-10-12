/** Set a new admin password with a one-time recovery link. See lib/platform/recovery. */

import { NextResponse } from 'next/server';
import { consumeRecovery } from '@/lib/platform/recovery';
import { getTenant } from '@/lib/platform/tenants';
import { runAsTenant } from '@/lib/tenant/context';
import { setAdminPassword } from '@/lib/tenant/admin';
import { rateLimit, clientIp } from '@/lib/ai/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { ok } = await rateLimit('lp_recover_rl_', clientIp(req), 20, 60 * 60 * 1000);
  if (!ok) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  const body = await req.json().catch(() => ({})) as { token?: string; password?: string };
  const password = String(body.password ?? '');
  if (password.length < 8) return NextResponse.json({ error: 'Use at least 8 characters.' }, { status: 400 });

  const slug = await consumeRecovery(String(body.token ?? ''));
  const tenant = slug ? await getTenant(slug) : null;
  if (!tenant) return NextResponse.json({ error: 'This link has expired or was already used. Ask support for a new one.' }, { status: 403 });
  await runAsTenant(tenant, () => setAdminPassword(password));
  return NextResponse.json({ ok: true, slug });
}
