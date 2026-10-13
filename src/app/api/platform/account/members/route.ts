/**
 * The owner manages a league's admins.
 *
 *   POST    { slug, email }    invite someone as an admin
 *   DELETE  { slug, email }    withdraw an invite
 *   DELETE  { slug, userId }   remove an admin
 *
 * An invite is just a record: the person signs in to the product site with
 * that email and the league appears in their account.
 */

import { NextResponse } from 'next/server';
import { accountsEnabled, signedInAccount } from '@/lib/platform/account';
import { addInvite, getMembers, removeInvite, removeMember, roleOf } from '@/lib/platform/members';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function owner(req: Request) {
  if (!accountsEnabled()) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const me = await signedInAccount();
  if (!me) return { error: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) };
  const body = await req.json().catch(() => ({})) as { slug?: string; email?: string; userId?: string };
  if (!body.slug || (await roleOf(body.slug, me.userId)) !== 'owner') {
    return { error: NextResponse.json({ error: 'Only the league owner can manage admins.' }, { status: 403 }) };
  }
  return { me, body: body as { slug: string; email?: string; userId?: string } };
}

export async function POST(req: Request) {
  const o = await owner(req);
  if ('error' in o) return o.error;
  const email = (o.body.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'Enter an email address.' }, { status: 400 });
  if ((await getMembers(o.body.slug)).some(m => m.email === email)) return NextResponse.json({ error: 'They are already an admin.' }, { status: 409 });
  await addInvite(o.body.slug, email, o.me.userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const o = await owner(req);
  if ('error' in o) return o.error;
  if (o.body.userId) {
    if (o.body.userId === o.me.userId) return NextResponse.json({ error: 'You can’t remove yourself as owner.' }, { status: 400 });
    await removeMember(o.body.slug, o.body.userId);
  } else if (o.body.email) {
    await removeInvite(o.body.slug, o.body.email);
  }
  return NextResponse.json({ ok: true });
}
