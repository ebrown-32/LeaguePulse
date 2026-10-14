/**
 * The picture a link shows when it is shared: iMessage, WhatsApp, Slack.
 *
 * One card per address. The product's own site gets the product's card; a
 * league's site gets that league's, with its name and logo, so a link dropped
 * in the group chat looks like the league's own app rather than ours.
 *
 * Archivo and DM Sans, the product's display and body faces, are bundled
 * beside this file so the card never depends on a font service.
 */

import { ImageResponse } from 'next/og';
import { headers } from 'next/headers';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

const PAPER = '#F7F6F2', INK = '#121417', TURF = '#0A7550', TURF_LIGHT = '#3DD598', SIGNAL = '#EE5A2E', MUTED = '#585D66';

/** The LeaguePulse monogram, as in public/brand/leaguepulse-mark.svg. `ink` is the L's colour. */
function mark(ink: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M7 20.5 L19.5 12.5 V44.5 H34 L39.5 54 H10 Q7 54 7 51 Z" fill="${ink}"/><path d="M21.5 7.5 H41 C49.5 7.5 55.5 13.8 55.5 22.5 C55.5 31.2 49.5 37.5 41 37.5 H30 L22 45.5 V39 Q21.5 38.2 21.5 36.5 Z" fill="${SIGNAL}"/><path d="M25 22.5 H31 L33.6 16 L37.4 30 L40.6 19.5 L42.6 22.5 H50" fill="none" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function fonts() {
  const dir = join(process.cwd(), 'src/app/api/og');
  const [display, body] = await Promise.all([readFile(join(dir, 'archivo-800.woff')), readFile(join(dir, 'dmsans-500.woff'))]);
  return [
    { name: 'Archivo', data: display, weight: 800 as const, style: 'normal' as const },
    { name: 'DM Sans', data: body, weight: 500 as const, style: 'normal' as const },
  ];
}

const SIZE = { width: 1200, height: 630 };

function productCard() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: PAPER, padding: '72px 80px', fontFamily: 'DM Sans' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark(INK)} width={64} height={64} alt="" />
        <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: 38, color: INK, letterSpacing: -1 }}>
          League<span style={{ color: SIGNAL }}>Pulse</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: 'Archivo', fontSize: 96, lineHeight: 1, letterSpacing: -4, color: INK }}>Your fantasy league,</div>
        <div style={{ display: 'flex', marginTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Archivo', fontSize: 96, lineHeight: 1, letterSpacing: -4, color: TURF }}>
            as an app.
            <div style={{ height: 10, background: SIGNAL, marginTop: 6, borderRadius: 5 }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 30, color: MUTED }}>
        <div style={{ display: 'flex' }}>For Sleeper and ESPN leagues</div>
        <div style={{ display: 'flex', color: INK }}>leaguepulse.io</div>
      </div>
    </div>
  );
}

function leagueCard(name: string, logo: string | null, host: string) {
  // One line where it fits: Archivo at 96px holds about fifteen characters across the card.
  const size = name.length <= 15 ? 96 : name.length <= 24 ? 72 : 58;
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '72px 80px', fontFamily: 'DM Sans',
      // A low turf glow in the corner, the colour of the Sunday night band on the product site.
      backgroundColor: INK, backgroundImage: 'radial-gradient(circle at 92% 8%, rgba(61,213,152,0.20) 0%, rgba(61,213,152,0) 42%)',
    }}>
      <div style={{ display: 'flex', width: 168, height: 168, borderRadius: 40, background: PAPER, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo ?? mark(INK)} width={136} height={136} style={{ objectFit: 'contain' }} alt="" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: size, lineHeight: 1.02, letterSpacing: size >= 96 ? -4 : -2.5, color: PAPER, maxWidth: 1040 }}>{name}</div>
        <div style={{ display: 'flex', marginTop: 22, fontSize: 32, color: 'rgba(247,246,242,0.66)' }}>Live scores, history and the weekly report.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 26, color: 'rgba(247,246,242,0.55)' }}>
        <div style={{ display: 'flex', color: TURF_LIGHT }}>{host}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark(PAPER)} width={34} height={34} alt="" />
          on LeaguePulse
        </div>
      </div>
    </div>
  );
}

/** The league's logo as something the renderer can draw: an uploaded logo from storage, or an absolute URL. */
async function leagueLogo(logoUrl: string | null | undefined, origin: string): Promise<string | null> {
  if (!logoUrl || logoUrl.startsWith('/brand/')) return null;
  if (logoUrl.startsWith('/api/league-logo')) {
    const { getRedis } = await import('@/lib/redisClient');
    const dataUri = await getRedis().client?.get('league_logo').catch(() => null);
    return dataUri && /^data:image\/(png|jpe?g|gif|svg\+xml);base64,/.test(dataUri) ? dataUri : null;
  }
  const url = logoUrl.startsWith('/') ? `${origin}${logoUrl}` : logoUrl;
  // Fetched here, so a logo that has gone missing leaves the monogram rather than a broken card.
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !/^image\/(png|jpe?g|gif|svg\+xml)/.test(type)) return null;
  return `data:${type.split(';')[0]};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}

export async function GET(req: Request) {
  const h = await headers();
  const host = (h.get('host') ?? '').toLowerCase();
  const origin = new URL(req.url).origin;
  const cache = { 'cache-control': 'public, max-age=3600, s-maxage=86400' };

  // A league's address, hosted or self-hosted: its own card.
  let name: string | null = null;
  let logo: string | null = null;
  const platform = h.get('x-lp-surface') === 'platform'
    || (process.env.LP_HOSTED === '1' && !(await (await import('@/lib/tenant/context')).currentTenant()));
  if (!platform) {
    const { getTheme } = await import('@/lib/themeStorage');
    const theme = await getTheme().catch(() => null);
    let tenantName: string | null = null;
    if (process.env.LP_HOSTED === '1') {
      tenantName = (await (await import('@/lib/tenant/context')).currentTenant())?.leagueName?.trim() || null;
    }
    name = theme?.leagueName?.trim() || tenantName || theme?.siteTitle?.trim() || null;
    logo = await leagueLogo(theme?.logoUrl, origin);
  }

  return new ImageResponse(name ? leagueCard(name, logo, host.split(':')[0]) : productCard(), {
    ...SIZE, fonts: await fonts(), headers: cache,
  });
}
