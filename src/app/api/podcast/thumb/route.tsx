/**
 * An episode's cover, for its post on The Feed and its link preview: the studio, drawn for that
 * episode. The city at night through the glass, the lights, the panel at the desk (their own
 * faces), the show's logo, and the episode's week and title, in the league's colour.
 *
 *   GET ?ep=<episode id>   image/png, 1280x720
 *
 * Public, like the episode. The same episode always draws the same cover, so it's cached hard.
 */

import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

const W = 1280, H = 720;
const TINTS = ['#E07A4F', '#5B8DEF', '#C064C6', '#E8B84A'];

async function fonts() {
  const dir = join(process.cwd(), 'src/app/api/og');
  const [display, body] = await Promise.all([readFile(join(dir, 'archivo-800.woff')), readFile(join(dir, 'dmsans-500.woff'))]);
  return [
    { name: 'Archivo', data: display, weight: 800 as const, style: 'normal' as const },
    { name: 'DM Sans', data: body, weight: 500 as const, style: 'normal' as const },
  ];
}

function seeded(seed: string) {
  let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  s ||= 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** A face for the image renderer: a DiceBear SVG asked for as a PNG; anything on this site made absolute. */
function faceUrl(src: string, origin: string): string {
  if (src.startsWith('/')) return `${origin}${src}`;
  return src.replace('/svg?', '/png?');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('ep') ?? '';
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) return new Response('Bad request', { status: 400 });
  const [{ getEpisode }, { getTheme }] = await Promise.all([import('@/lib/ai/podcast'), import('@/lib/themeStorage')]);
  const [ep, theme] = await Promise.all([getEpisode(id), getTheme().catch(() => null)]);
  if (!ep) return new Response('Not found', { status: 404 });

  const t = theme as unknown as { primaryH?: number; primaryS?: number; primaryL?: number } | null;
  const primary = t?.primaryH != null ? `hsl(${t.primaryH}, ${t.primaryS ?? 70}%, ${Math.max(38, t.primaryL ?? 45)}%)` : '#0A7550';
  const r = seeded(ep.leagueName);
  const towers: { x: number; w: number; top: number; lit: { x: number; y: number }[] }[] = [];
  for (let x = -20; x < W + 20;) {
    const w = 60 + r() * 90, top = 230 + r() * 160;
    const lit: { x: number; y: number }[] = [];
    for (let wy = top + 14; wy < 470; wy += 18) for (let wx = x + 10; wx < x + w - 12; wx += 16) if (r() < 0.4) lit.push({ x: wx, y: wy });
    towers.push({ x, w, top, lit });
    x += w + 6 + r() * 24;
  }
  const hosts = ep.hosts.slice(0, 4);
  const face = hosts.length > 3 ? 104 : 118;
  const origin = url.origin;

  const image = new ImageResponse(
    (
      <div style={{ display: 'flex', width: W, height: H, position: 'relative', background: '#07080f', fontFamily: 'DM Sans', color: 'white', overflow: 'hidden' }}>
        {/* The sky and the city. */}
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: 470, background: 'linear-gradient(180deg, #050816 0%, #1d2552 100%)' }} />
        {towers.map((b, i) => (
          <div key={i} style={{ display: 'flex', position: 'absolute', left: b.x, top: b.top, width: b.w, height: 470 - b.top, background: '#0b0f24' }} />
        ))}
        {towers.flatMap((b, i) => b.lit.map((w, k) => (
          <div key={`${i}-${k}`} style={{ display: 'flex', position: 'absolute', left: w.x, top: w.y, width: 7, height: 9, background: '#ffd98a', opacity: 0.8 }} />
        )))}
        {/* The glass. */}
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ display: 'flex', position: 'absolute', left: (i * W) / 5 - 4, top: 0, width: 8, height: 470, background: '#0b0d16' }} />
        ))}
        {/* The lights. */}
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          <defs>
            <linearGradient id="beam-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfe0ff" stopOpacity="0.38" /><stop offset="1" stopColor="#cfe0ff" stopOpacity="0" /></linearGradient>
            <linearGradient id="beam-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={primary} stopOpacity="0.45" /><stop offset="1" stopColor={primary} stopOpacity="0" /></linearGradient>
          </defs>
          {[0.16, 0.39, 0.61, 0.84].map((lx, i) => {
            const x = lx * W, toward = (i < 2 ? 1 : -1) * 60;
            return <polygon key={i} points={`${x - 10},24 ${x + 10},24 ${x + toward + 170},520 ${x + toward - 170},520`} fill={`url(#beam-${i % 2 ? 'b' : 'a'})`} />;
          })}
        </svg>
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: 28, background: '#14161f' }} />

        {/* The panel. */}
        {hosts.map((h, i) => {
          const cx = W * (0.14 + (0.72 * (i + 0.5)) / hosts.length);
          const tint = i === 0 ? primary : TINTS[(i - 1) % TINTS.length];
          return (
            <div key={h.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: cx - face * 0.75, top: 488 - face * 1.36, width: face * 1.5 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faceUrl(h.avatar, origin)} width={face} height={face} style={{ width: face, height: face, borderRadius: face, background: '#22242f', border: `4px solid ${tint}` }} />
              <div style={{ display: 'flex', marginTop: -10, width: face * 1.4, height: face * 0.5, borderTopLeftRadius: face, borderTopRightRadius: face, background: tint }} />
            </div>
          );
        })}
        {/* The desk. */}
        <div style={{ display: 'flex', position: 'absolute', left: 60, top: 470, width: W - 120, height: 250, background: 'linear-gradient(180deg, #2b2e3e 0%, #0d0e14 70%)', borderTopLeftRadius: 40, borderTopRightRadius: 40 }} />
        <div style={{ display: 'flex', position: 'absolute', left: 100, top: 498, width: W - 200, height: 5, borderRadius: 5, background: primary, boxShadow: `0 0 24px 4px ${primary}` }} />

        {/* The show's logo. */}
        <div style={{ display: 'flex', alignItems: 'center', position: 'absolute', left: 48, top: 54 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 76, height: 76, borderRadius: 18, background: primary }}>
            <svg width="44" height="44" viewBox="0 0 48 48"><rect x="17" y="6" width="14" height="24" rx="7" fill="white" /><path d="M11 22a13 13 0 0 0 26 0M24 35v6M17 41h14" fill="none" stroke="white" strokeWidth="3.4" strokeLinecap="round" /><circle cx="38" cy="9" r="4.5" fill="#FF4D3D" /></svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 16 }}>
            <div style={{ display: 'flex', fontSize: 18, letterSpacing: 7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>The Desk</div>
            <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: 44, fontStyle: 'italic', letterSpacing: -1, lineHeight: 1 }}>WEEKLY</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', right: 48, top: 56, alignItems: 'flex-end', padding: '12px 18px', borderRadius: 14, background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', fontSize: 16, letterSpacing: 5, color: 'rgba(255,255,255,0.6)' }}>{ep.season}</div>
          <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: 34 }}>WEEK {ep.week}</div>
        </div>

        {/* The title. */}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 0, bottom: 0, width: W, padding: '90px 56px 40px', background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 45%)' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>{`${ep.leagueName} · Episode ${ep.week}`}</div>
          <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: ep.title.length > 34 ? 52 : 62, lineHeight: 1.05, marginTop: 8, letterSpacing: -1.5 }}>{ep.title}</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: await fonts() },
  );
  image.headers.set('cache-control', 'public, max-age=86400, s-maxage=31536000, immutable');
  return image;
}
