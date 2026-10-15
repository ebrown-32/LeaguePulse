import './globals.css';
import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { Space_Grotesk, DM_Sans } from 'next/font/google';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import PageTransition from '@/components/layout/PageTransition';
import ChatWidget from '@/components/chat/ChatWidget';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeInjector } from '@/components/ThemeInjector';
import { InstallPromptProvider } from '@/components/pwa/InstallPromptProvider';
import { getTheme } from '@/lib/themeStorage';
import Analytics from '@/components/analytics/Analytics';
import ParticleField from '@/components/ParticleField';
import type { Metadata } from 'next';
import { defaultTheme } from '@/lib/themeConfig';
import ProductAuth from '@/components/platform/ProductAuth';
import { appIconUrl } from '@/lib/appIconUrl';
import RouteProgress from '@/components/layout/RouteProgress';
import AppLoader from '@/components/layout/AppLoader';
import NavMemory from '@/components/layout/NavMemory';
import FeedbackProvider from '@/components/layout/FeedbackProvider';

const displayFont = Space_Grotesk({
  subsets:  ['latin'],
  variable: '--font-display-fallback',
  weight:   ['400', '500', '600', '700'],
  display:  'swap',
});

const bodyFont = DM_Sans({
  subsets:  ['latin'],
  variable: '--font-body-fallback',
  weight:   ['300', '400', '500', '600', '700'],
  display:  'swap',
});

/**
 * Title and favicon come from admin-saved theme storage, so a league can put
 * its own name in the browser tab without editing code.
 *
 * This has to be `generateMetadata` rather than a static `metadata` export:
 * the values live in Redis, and a static object is evaluated once at build
 * time, which is why the tab said "League Pulse" no matter what was saved.
 * noStore() keeps an admin change from waiting on a redeploy.
 */
export async function generateMetadata(): Promise<Metadata> {
  noStore();
  const h = await headers();
  // Share cards and their images resolve against the address being shared,
  // never a fixed domain: a league's link must show the league's own card.
  const host = h.get('host');
  const metadataBase = host ? new URL(`${h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')}://${host}`) : undefined;
  // The product's own pages carry the product's name, not a league's.
  if (h.get('x-lp-surface') === 'platform') {
    const share = 'Your fantasy league, as an app. For Sleeper and ESPN.';
    return {
      metadataBase,
      title: 'LeaguePulse: a home for your Sleeper or ESPN league',
      description: 'AI beat writers, live win odds, a Sunday watch guide and every stat since day one, for any Sleeper or ESPN league.',
      openGraph: {
        title: 'LeaguePulse', description: share, siteName: 'LeaguePulse', type: 'website',
        images: [{ url: '/api/og', width: 1200, height: 630, alt: 'LeaguePulse: your fantasy league, as an app' }],
      },
      twitter: { card: 'summary_large_image', title: 'LeaguePulse', description: share, images: ['/api/og'] },
      icons: {
        icon: [{ url: '/brand/leaguepulse-icon.svg', type: 'image/svg+xml' }, { url: '/brand/leaguepulse-32.png', sizes: '32x32' }],
        apple: '/brand/leaguepulse-apple.png',
      },
    };
  }
  const theme = await getTheme().catch(() => defaultTheme());
  // Hosted: the league's own name until its admin sets one, so the browser tab
  // and the home-screen label say the league, not the product.
  const tenantName = process.env.LP_HOSTED === '1'
    ? (await (await import('@/lib/tenant/context')).currentTenant().catch(() => null))?.leagueName?.trim() || null
    : null;

  const title = theme.siteTitle?.trim() || theme.leagueName?.trim() || tenantName || 'League Pulse';
  const description = theme.siteDescription?.trim()
    || 'A new way to consume fantasy football. Give your league a pulse.';
  // Falls back through the custom icon, then the league logo, then the bundled
  // default, so there is always something in the tab.
  //
  // The default lives in public/ rather than src/app/. Next auto-emits a
  // file-based src/app/favicon.ico ahead of anything declared here, and
  // browsers prefer that .ico, so while it sat there the admin's chosen icon
  // was silently ignored.
  const icon = theme.faviconUrl?.trim() || theme.logoUrl?.trim() || '/favicon.ico';

  // The home-screen icon on an iPhone: a solid PNG drawn from the league's
  // own logo (iOS fills a transparent icon with black), or the LeaguePulse one.
  const apple = appIconUrl(theme.logoUrl, 180);
  const shortName = theme.leagueName?.trim() || tenantName || 'League Pulse';

  // What a shared link says: the league's own words if its admin wrote
  // some, otherwise one plain line about what is behind it.
  const shareName = theme.leagueName?.trim() || tenantName || theme.siteTitle?.trim() || 'Our league';
  const share = theme.siteDescription?.trim() || `Live scores, history and the weekly report for ${shareName}.`;
  const card = { url: '/api/og', width: 1200, height: 630, alt: shareName };

  return {
    metadataBase,
    title,
    description,
    icons: { icon: [{ url: icon, href: icon }], shortcut: icon, apple },
    // Installed on an iPhone: opens full screen, labelled with the league's name.
    // iOS shortens a long label itself, with an ellipsis, as it does for any app.
    appleWebApp: { capable: true, title: shortName, statusBarStyle: 'default' },
    openGraph: { title: shareName, description: share, siteName: shareName, type: 'website', images: [card] },
    twitter: { card: 'summary_large_image', title: shareName, description: share, images: ['/api/og'] },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Same reason as ThemeInjector: the nav/footer league name and logo come
  // from admin-saved theme storage, so this must never be served from a
  // cached render or an admin save appears to "not apply" until redeploy.
  noStore();
  /**
   * The product's marketing site and sign-up render bare: no league navbar,
   * footer, chat button or splash screen, and none of the league's saved
   * theme. Those pages are about the product, and on the hosted bare domain
   * there is no league to theme them with.
   */
  if ((await headers()).get('x-lp-surface') === 'platform') {
    return (
      <html lang="en" className="dark" suppressHydrationWarning>
        <body className={`${displayFont.variable} ${bodyFont.variable} min-h-screen antialiased`}>
          {(await import('@/lib/platform/account')).accountsEnabled()
            ? <ProductAuth>{children}</ProductAuth>
            : children}
        </body>
      </html>
    );
  }

  // Hosted: which league this address is, and whether it is live. An address
  // with no league, or whose subscription has ended, gets a plain page rather
  // than a league site with nothing to load.
  let tenantLeague: string | null = null;
  let tenantName: string | null = null;
  if (process.env.LP_HOSTED === '1') {
    const tenant = await (await import('@/lib/tenant/context')).currentTenant();
    const { isLive } = await import('@/lib/platform/tenants');
    if (!tenant || !isLive(tenant)) {
      const { default: LeagueUnavailable } = await import('@/components/platform/LeagueUnavailable');
      return (
        <html lang="en" className="dark" suppressHydrationWarning>
          <body className={`${displayFont.variable} ${bodyFont.variable} min-h-screen antialiased`}>
            <LeagueUnavailable reason={tenant ? 'ended' : 'missing'} name={tenant?.leagueName} />
          </body>
        </html>
      );
    }
    // Tell the browser which league this page is, so client code that calls
    // getCurrentLeagueId() asks Sleeper about the right league. A league id is
    // public, so nothing secret is exposed.
    tenantLeague = tenant.leagueId;
    tenantName = tenant.leagueName?.trim() || null;
  }

  const [theme, rankings] = await Promise.all([
    getTheme(),
    import('@/lib/fantasyProsRefresh').then(m => m.rankingsConnected()).catch(() => false),
  ]);

  return (
    <html lang="en" data-bg={theme.background} data-motion={theme.motion} suppressHydrationWarning>
      <body
        className={`
          ${displayFont.variable} ${bodyFont.variable}
          min-h-screen bg-background text-foreground antialiased
        `}
      >
        {tenantLeague && (
          <script dangerouslySetInnerHTML={{ __html: `window.__LP_LEAGUE__=${JSON.stringify(tenantLeague)};` }} />
        )}
        <FeedbackProvider
          sound={theme.sound === 'on'}
          haptics={theme.haptics !== 'off'}
        />
        <AppLoader leagueName={theme.leagueName ?? theme.siteTitle} />
        <RouteProgress />
        <ThemeInjector />
        <NavMemory />
        {theme.background === 'particles' && <ParticleField />}
        <ThemeProvider>
          {/* The install prompt previews the very icon the phone will get. */}
          <InstallPromptProvider logoUrl={appIconUrl(theme.logoUrl, 192)} leagueName={theme.leagueName ?? tenantName}>
            <Analytics />
            <div className="flex min-h-screen flex-col">
              {/* Hosted: the league's Sleeper name until its admin sets a display name. */}
              <Navbar logoUrl={theme.logoUrl} leagueName={theme.leagueName ?? tenantName} franchises={Boolean(process.env.DATABASE_URL?.trim())} rankings={rankings} />
              <main className="flex-1 pb-[env(safe-area-inset-bottom)]">
                <PageTransition>{children}</PageTransition>
              </main>
              <Footer />
              <ChatWidget />
            </div>
          </InstallPromptProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
