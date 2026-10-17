/**
 * A league's own Anthropic key.
 *
 * Hosted: the league's admin sets it here and the league's AI runs on it, so
 * each league pays Anthropic directly. It is tested with a one token call
 * before being stored, and never returned: GET reports only whether one is
 * set and its fingerprint.
 *
 * Self-hosted: read only. The key there lives in ANTHROPIC_API_KEY, and
 * secrets stay in the environment by design.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { anthropicKey, aiManaged } from '@/lib/ai/claude';
import { fingerprint, setTenantAnthropicKey } from '@/lib/tenant/secrets';
import { testAnthropicKey } from '@/lib/ai/diagnostics';
import { currentTenant } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

const hosted = () => process.env.LP_HOSTED === '1';

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [{ tenantAnthropicKey }, managed] = await Promise.all([import('@/lib/tenant/secrets'), aiManaged()]);
  // The league's own key, if it has one: the platform's key is never fingerprinted here.
  const own = hosted() ? await tenantAnthropicKey() : await anthropicKey();
  // Switched off by the operator: no AI runs here, whatever key it has.
  const t = hosted() ? await currentTenant() : null;
  const off = Boolean(t && (await import('@/lib/platform/tenants')).aiMode(t) === 'off');
  return NextResponse.json({
    mode: hosted() ? 'hosted' : 'self-hosted',
    configured: !off && (Boolean(own) || (managed && Boolean(await anthropicKey()))),
    off,
    fingerprint: own ? fingerprint(own) : null,
    // League Pass + AI: the platform runs the AI; a key of the league's own is optional.
    managed,
  });
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hosted()) {
    return NextResponse.json({ error: 'Set ANTHROPIC_API_KEY in the deployment environment.' }, { status: 400 });
  }
  if (!(await currentTenant())) return NextResponse.json({ error: 'No league here' }, { status: 400 });

  let key = '';
  try { key = String((await req.json())?.key ?? '').trim(); } catch { /* handled below */ }
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
    return NextResponse.json({ error: 'That does not look like an Anthropic API key (they start with sk-ant-).' }, { status: 400 });
  }

  const check = await testAnthropicKey(key);
  if (check.status === 'fail') {
    return NextResponse.json({ error: check.detail, fix: check.fix }, { status: 400 });
  }
  await setTenantAnthropicKey(key);
  return NextResponse.json({ configured: true, fingerprint: fingerprint(key), note: check.status === 'warn' ? check.detail : undefined });
}

export async function DELETE(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hosted()) return NextResponse.json({ error: 'Remove ANTHROPIC_API_KEY from the environment instead.' }, { status: 400 });
  await setTenantAnthropicKey(null);
  return NextResponse.json({ configured: false });
}
