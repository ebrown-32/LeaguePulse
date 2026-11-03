/**
 * League Wrapped's share card (lib/wrapped): a portrait image of a manager's season, or the
 * league's, made to be posted in the group chat. `?season=2025|all&m=<owner id>|league`.
 */

import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

const W = 1080, H = 1350;
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const TURF = '#0A7550', SIGNAL = '#EE5A2E', GOLD = '#FACC15';

async function fonts() {
  const dir = join(process.cwd(), 'src/app/api/og');
  const [display, body] = await Promise.all([readFile(join(dir, 'archivo-800.woff')), readFile(join(dir, 'dmsans-500.woff'))]);
  return [
    { name: 'Archivo', data: display, weight: 800 as const, style: 'normal' as const },
    { name: 'DM Sans', data: body, weight: 500 as const, style: 'normal' as const },
  ];
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '48%', padding: '26px 28px', borderRadius: 28, background: 'rgba(255,255,255,0.09)', marginBottom: 22 }}>
      <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>{label}</div>
      <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: 54, marginTop: 8, letterSpacing: -2 }}>{value}</div>
      {sub ? <div style={{ display: 'flex', fontSize: 24, marginTop: 4, color: 'rgba(255,255,255,0.72)' }}>{sub}</div> : null}
    </div>
  );
}

function Frame({ kicker, title, subtitle, stats, foot }: { kicker: string; title: string; subtitle: string; stats: { label: string; value: string; sub?: string }[]; foot: string }) {
  return (
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '80px 72px', color: '#fff', fontFamily: 'DM Sans',
      background: `radial-gradient(120% 80% at 15% 0%, ${TURF} 0%, #062018 50%, #0b0f14 100%)` }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 26, letterSpacing: 8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>{kicker}</div>
        <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: title.length > 16 ? 92 : 118, lineHeight: 0.95, letterSpacing: -5, marginTop: 22 }}>{title}</div>
        <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: 48, color: GOLD, marginTop: 18, letterSpacing: -1 }}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {stats.slice(0, 6).map(s => <Stat key={s.label} {...s} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 26, color: 'rgba(255,255,255,0.7)' }}>
        <div style={{ display: 'flex' }}>{foot}</div>
        <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: 28, color: '#fff', letterSpacing: 1 }}>LEAGUE<span style={{ color: '#3DD598', marginLeft: 8 }}>PULSE</span></div>
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const scope = q.get('season') ?? 'all';
  const who = q.get('m') ?? 'league';
  const [{ currentSite }, { wrappedFor }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/wrapped/load')]);
  const site = await currentSite();
  const w = await wrappedFor(site, scope === 'all' ? null : Number(scope)).catch(() => null);
  if (!w) return new Response('Not found', { status: 404 });
  const year = w.scope === 'all' ? 'All time' : `${w.season}${w.inProgress ? ', so far' : ''}`;
  // The address people visited (the league's own), not the server's internal one.
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host).split(',')[0].trim();

  let frame: Parameters<typeof Frame>[0];
  if (who === 'league') {
    const L = w.league;
    frame = {
      kicker: `League Wrapped · ${year}`,
      title: w.scope === 'all' ? `${L.seasons.length} seasons` : (L.champions[0] ? L.champions[0].name : 'The season'),
      subtitle: w.scope === 'all' ? `${L.champions.length} champions crowned` : (L.champions[0] ? 'Champion' : `${L.games} games`),
      stats: [
        L.best && { label: 'Best game', value: L.best.pts.toFixed(1), sub: L.best.name },
        L.blowout && { label: 'Biggest blowout', value: `+${L.blowout.margin.toFixed(1)}`, sub: L.blowout.name },
        L.tradeOfTheYear && { label: 'Trade of the year', value: `+${L.tradeOfTheYear.net}`, sub: L.tradeOfTheYear.name },
        L.mvp && { label: 'MVP', value: L.mvp.pts.toFixed(0), sub: L.mvp.player.name },
        L.luckiest && { label: 'Luckiest', value: `+${L.luckiest.delta}`, sub: L.luckiest.name },
        { label: 'Moves', value: String(L.trades + L.adds), sub: `${L.trades} trades, ${L.adds} pickups` },
      ].filter(Boolean) as { label: string; value: string; sub?: string }[],
      foot: host,
    };
  } else {
    const m = w.managers.find(x => x.ownerId === who);
    if (!m) return new Response('Not found', { status: 404 });
    frame = {
      kicker: `League Wrapped · ${year}`,
      title: m.name,
      subtitle: m.archetype.title,
      stats: [
        { label: 'Record', value: `${m.record.w}-${m.record.l}${m.record.t ? `-${m.record.t}` : ''}`, sub: w.scope === 'all' && m.titles ? `${m.titles} title${m.titles > 1 ? 's' : ''}` : m.finish === 1 ? 'Champion' : `${ord(m.pfRank)} in points` },
        m.best && { label: 'Best week', value: m.best.pts.toFixed(1), sub: `vs ${m.best.oppName}` },
        m.mvp && { label: 'MVP', value: m.mvp.pts.toFixed(0), sub: m.mvp.player.name },
        m.luck && { label: 'Luck', value: `${m.luck.delta >= 0 ? '+' : '−'}${Math.abs(m.luck.delta)}`, sub: 'wins vs expected' },
        m.bench && { label: 'Lineup IQ', value: `${m.bench.efficiency}%`, sub: `${Math.round(m.bench.left)} pts on the bench` },
        m.nemesis ? { label: 'Nemesis', value: `${m.nemesis.w}-${m.nemesis.l}`, sub: m.nemesis.name } : m.closestLoss && { label: 'Heartbreak', value: `by ${m.closestLoss.margin.toFixed(2)}`, sub: `to ${m.closestLoss.oppName}` },
      ].filter(Boolean) as { label: string; value: string; sub?: string }[],
      foot: host,
    };
  }
  return new ImageResponse(<Frame {...frame} />, {
    width: W, height: H, fonts: await fonts(),
    headers: { 'cache-control': 'public, max-age=300, s-maxage=1800' },
  });
}
