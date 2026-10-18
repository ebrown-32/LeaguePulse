/**
 * Sets up (or refreshes) the demo site: demo.<root domain>, the league of league.ts.
 *
 *   The site itself: active, League Pass + AI, so the media desk files its takes.
 *   Each franchise's identity: its color, motto, bio and stadium name, from the cast.
 *   The archive: every season, read through the demo provider like any league.
 *   The stadiums: each franchise spends what it has earned over its seasons, on the
 *     upgrades its manager would pick, until it can afford no more.
 *
 * Safe to run again: identities are rewritten, the archive tops up, and the stadiums buy only
 * what's newly affordable. Server only; the operator's back office calls it.
 */

import { CAST, LEAGUE_NAME, type Style } from './cast';
import { demoLeagueId, demoUserId } from '@/lib/providers/ids';
import { nflClock } from './data';
import { FIRST_SEASON } from './settings';
import type { Tenant } from '@/lib/platform/tenants';
import type { TrackId } from '@/lib/tycoon/catalog';

import { DEMO_SLUG } from './site';
export { DEMO_SLUG, isDemoSite } from './site';

/** What each kind of manager spends on first. */
const WISHLIST: Record<Style, TrackId[]> = {
  balanced: ['stadium', 'seating', 'concessions', 'videoboard', 'atmosphere', 'suites', 'parking', 'restrooms', 'store'],
  zeroRB: ['videoboard', 'stadium', 'atmosphere', 'seating', 'concessions', 'store', 'suites', 'parking', 'restrooms'],
  robustRB: ['concessions', 'stadium', 'seating', 'parking', 'restrooms', 'atmosphere', 'videoboard', 'suites', 'store'],
  qbFirst: ['stadium', 'suites', 'videoboard', 'seating', 'atmosphere', 'concessions', 'store', 'parking', 'restrooms'],
  waiverHawk: ['seating', 'stadium', 'concessions', 'parking', 'videoboard', 'restrooms', 'atmosphere', 'store', 'suites'],
  trader: ['store', 'stadium', 'suites', 'atmosphere', 'videoboard', 'seating', 'concessions', 'parking', 'restrooms'],
  analytics: ['stadium', 'seating', 'suites', 'concessions', 'videoboard', 'atmosphere', 'parking', 'restrooms', 'store'],
  couch: ['concessions', 'restrooms', 'seating', 'stadium', 'parking', 'store', 'videoboard', 'suites', 'atmosphere'],
};

/**
 * What each franchise stops one short of: close to maxed out, never all the way, so no two
 * stadiums are the same and each still has something to build toward. The commissioner, the
 * couch potato, the IT guy and the zero RB evangelist stop at a Cathedral; the rest have Monoliths.
 */
const HOLD: Record<string, TrackId[]> = {
  gus: ['stadium', 'store'], marty: ['stadium', 'restrooms'], dee: ['videoboard'], rosa: ['suites'],
  brent: ['stadium', 'suites', 'atmosphere'], priya: ['parking'], hank: ['parking', 'store'],
  jules: ['restrooms'], theo: ['stadium', 'store'], bev: ['atmosphere'],
};

export interface DemoSetup { url: string; seasons: number; archive: string; builds: Record<string, number>; bank: Record<string, string> }

export async function setUpDemo(): Promise<DemoSetup> {
  const [{ saveTenant, getTenant }, { runAsTenant, forgetTenant }, { PLATFORM }] = await Promise.all([
    import('@/lib/platform/tenants'), import('@/lib/tenant/context'), import('@/lib/platform/config'),
  ]);
  const { season } = await nflClock();
  const now = new Date().toISOString();
  const had = await getTenant(DEMO_SLUG);
  const tenant: Tenant = {
    slug: DEMO_SLUG, leagueId: demoLeagueId(season), leagueName: LEAGUE_NAME,
    status: 'active', plan: 'season', tier: 'ai', ownerEmail: null,
    stripeCustomerId: null, stripeSubscriptionId: null, createdAt: had?.createdAt ?? now, updatedAt: now,
  };
  await saveTenant(tenant);
  forgetTenant(DEMO_SLUG);

  return runAsTenant(tenant, async () => {
    // The chain of seasons is found again: a new season, or an earlier first one, joins it.
    await (await import('@/config/league')).forgetLinkedLeagueIds();
    // How it looks: Midnight, deep space blue with an electric cyan, sharp corners, in Space Grotesk, under its own
    // crest. It opens dark (see app/layout).
    const [{ saveTheme }, { palettes }] = await Promise.all([import('@/lib/themeStorage'), import('@/lib/themeConfig')]);
    const night = palettes.midnight;
    await saveTheme({
      palette: 'midnight', fontPair: 'space-inter', radiusRem: 0, background: 'grid', motion: 'full',
      primaryH: night.accentDark.h, primaryS: night.accentDark.s, primaryL: night.accentDark.l,
      primaryHLight: night.accentLight.h, primarySLight: night.accentLight.s, primaryLLight: night.accentLight.l,
      txColorsDark: night.txDark, txColorsLight: night.txLight,
      logoUrl: '/demo/league.svg', faviconUrl: '/demo/league.svg', leagueName: LEAGUE_NAME,
      siteTitle: `${LEAGUE_NAME} · LeaguePulse demo`,
      siteDescription: 'A live demo of LeaguePulse: ten made-up managers, real NFL players, every point scored from the real games.',
    });

    // Who they are.
    const { saveIdentity } = await import('@/lib/franchise/store');
    for (const c of CAST) {
      const error = await saveIdentity(DEMO_SLUG, demoUserId(c.key), { color: c.color, motto: c.motto, bio: c.bio, stadiumName: c.stadium });
      if (error) throw new Error(`${c.team}: ${error}`);
    }

    // Their history.
    let archive = 'The archive is not set up (no DATABASE_URL).';
    if (process.env.DATABASE_URL?.trim()) {
      const { archiveLeague } = await import('@/lib/archive/ingest');
      // Every season again: the demo's seasons are rebuilt when the way they're played changes.
      const r = await archiveLeague({ full: true });
      archive = `${r.seasons.length} seasons archived.`;
    }

    // Their stadiums: each owner's bankroll (lib/demo/site), spent in the manager's order of
    // wants, on everything but the last step of what they hold back on.
    const [{ economyOf, recordDecision }, { shop, cash }] = await Promise.all([import('@/lib/tycoon/service'), import('@/lib/tycoon/economy')]);
    const builds: Record<string, number> = {}, bank: Record<string, string> = {};
    for (const c of CAST) {
      const id = demoUserId(c.key);
      let bought = 0;
      for (let i = 0; i < 80; i++) {
        const state = await economyOf(DEMO_SLUG, id);
        if (!state) break;
        const items = shop(state);
        const held = new Set(HOLD[c.key] ?? []);
        const next = WISHLIST[c.style].map(t => items.find(x => x.track === t))
          .find(x => x?.next?.affordable && !(held.has(x.track) && x.next.level >= x.max));
        if (!next) {
          const blocked = items.filter(x => x.blocked).map(x => `${x.track}: ${x.blocked}`);
          bank[c.team] = `${cash(state.vc)} left${blocked.length ? `; ${blocked.join(', ')}` : ''}`;
          break;
        }
        await recordDecision(id, { at: Date.now(), kind: 'build', track: next.track });
        bought++;
      }
      builds[c.team] = bought;
    }

    return { url: `https://${DEMO_SLUG}.${PLATFORM.rootDomain}`, seasons: season - FIRST_SEASON + 1, archive, builds, bank };
  });
}
