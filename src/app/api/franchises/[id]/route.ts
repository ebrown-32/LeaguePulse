/**
 * One franchise: its identity, its story from the archive, and whether the
 * person looking can claim it or edit it.
 *
 *   GET                 everything the franchise page needs beyond /api/team/<id>
 *   PATCH { color?, motto?, bio?, stadiumName?, look? }   the manager's edit (only the fields named) (x-manager-pass), or an admin's (x-admin-password)
 *   PUT { dataUri } / DELETE      the franchise's logo, same permission
 */

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { normalizeLook } from '@/lib/franchise/model';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024;
const DATA_URI = /^data:image\/(?:webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/;

async function context(id: string) {
  const [{ currentSite }, store] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/franchise/store')]);
  const site = await currentSite();
  return { site, store, franchiseId: decodeURIComponent(id) };
}

/**
 * The color a franchise without one of its own wears: the same one the league's
 * franchise list gives it (seededColors over the league's unpicked teams).
 */
async function leagueColor(site: string, franchiseId: string): Promise<string | null> {
  const [{ listFranchises }, { getFranchises }, { seededColors }] = await Promise.all([
    import('@/lib/archive/franchises'), import('@/lib/franchise/store'), import('@/lib/franchise/seededLook'),
  ]);
  const list = await listFranchises(site).catch(() => null);
  const ids = list?.map(f => f.franchiseId) ?? [];
  if (!ids.includes(franchiseId)) ids.push(franchiseId);
  const picked = await getFranchises(site, ids).catch(() => new Map());
  return seededColors(ids.filter(id => !picked.get(id)?.color)).get(franchiseId) ?? null;
}

/** May this request edit the franchise? Its manager's pass, or the league's admin. */
async function canEdit(req: Request, site: string, franchiseId: string): Promise<boolean> {
  const { verifyManagerPass } = await import('@/lib/franchise/managerPass');
  if (await verifyManagerPass(req.headers.get('x-manager-pass'), site, franchiseId).catch(() => false)) return true;
  const { isAdminRequest } = await import('@/lib/tenant/admin');
  return req.headers.get('x-admin-password') ? isAdminRequest(req) : false;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { site, store, franchiseId } = await context((await params).id);
    const [{ franchiseStory }, { accountsEnabled }, links] = await Promise.all([
      import('@/lib/archive/franchises'), import('@/lib/platform/account'), import('@/lib/franchise/links'),
    ]);
    const [f, story, claims] = await Promise.all([
      store.getFranchise(site, franchiseId),
      franchiseStory(site, franchiseId).catch(() => null),
      store.pendingClaims(site).catch(() => []),
    ]);
    const product = links.productOrigin(req);
    const accounts = accountsEnabled() && site !== 'self';
    return NextResponse.json({
      franchiseId,
      identity: { color: f.color ?? await leagueColor(site, franchiseId), motto: f.motto, bio: f.bio, stadiumName: f.stadiumName, look: f.look ? normalizeLook(f.look) : null, logoUrl: f.logoVersion ? `/api/franchises/${encodeURIComponent(franchiseId)}/logo?v=${f.logoVersion}` : null },
      manager: f.manager ? { name: f.manager.name } : null,
      pendingClaims: claims.filter(c => c.franchiseId === franchiseId).length,
      claimUrl: accounts && !f.manager ? product + links.claimPath(site, franchiseId) : null,
      editUrl: accounts && f.manager ? product + links.openPath(site, franchiseId) : null,
      story,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[api/franchises/id]', err);
    return NextResponse.json({ error: 'Could not load the franchise' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { site, store, franchiseId } = await context((await params).id);
  if (!(await canEdit(req, site, franchiseId))) return NextResponse.json({ error: 'Only this franchise’s manager can change it.' }, { status: 401 });
  const error = await store.saveIdentity(site, franchiseId, await req.json().catch(() => null));
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true, franchise: await store.getFranchise(site, franchiseId) });
}

/** A logo: re-encoded here (square, 256 pixels, WebP), so what is stored is always a small, plain image. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { site, store, franchiseId } = await context((await params).id);
  if (!(await canEdit(req, site, franchiseId))) return NextResponse.json({ error: 'Only this franchise’s manager can change it.' }, { status: 401 });
  const m = DATA_URI.exec(String((await req.json().catch(() => null))?.dataUri ?? ''));
  if (!m) return NextResponse.json({ error: 'Upload a PNG, JPEG or WebP image.' }, { status: 400 });
  const input = Buffer.from(m[1], 'base64');
  if (input.length > MAX_BYTES) return NextResponse.json({ error: 'The image must be under 512KB.' }, { status: 400 });
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(input).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 86 }).toBuffer();
    const dataUri = `data:image/webp;base64,${out.toString('base64')}`;
    const version = createHash('sha1').update(out).digest('hex').slice(0, 10);
    await store.setLogo(site, franchiseId, dataUri, version);
    return NextResponse.json({ logoUrl: `/api/franchises/${encodeURIComponent(franchiseId)}/logo?v=${version}` });
  } catch {
    return NextResponse.json({ error: 'That image could not be read.' }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { site, store, franchiseId } = await context((await params).id);
  if (!(await canEdit(req, site, franchiseId))) return NextResponse.json({ error: 'Only this franchise’s manager can change it.' }, { status: 401 });
  await store.setLogo(site, franchiseId, null, null);
  return NextResponse.json({ logoUrl: null });
}
