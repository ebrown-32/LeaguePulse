import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import Logo from '@/components/ui/Logo';
import { getTheme } from '@/lib/themeStorage';
import { PLATFORM } from '@/lib/platform/config';
import InstallAppCard from './InstallAppCard';

/**
 * A league site's footer: quiet, and the league's own.
 *
 * The league's name and a short row of its pages, an install link on phones,
 * and the fine print. LeaguePulse appears once, as a small "Powered by" link
 * back to the product, so the site still reads as the league's.
 */

const LINKS: [string, string][] = [
  ['Game Day', '/live'], ['Matchups', '/matchups'], ['Standings', '/standings'], ['History', '/history'],
  ['The Feed', '/desk'], ['Rosters', '/rosters'], ['Drafts', '/drafts'], ['Constitution', '/constitution'],
];

export default async function Footer() {
  // See RootLayout: admin-saved branding must not be served from a cached render.
  noStore();
  const theme = await getTheme();
  const hosted = process.env.LP_HOSTED === '1';
  const tenant = hosted ? await (await import('@/lib/tenant/context')).currentTenant().catch(() => null) : null;
  const leagueName = theme.leagueName?.trim() || tenant?.leagueName?.trim() || 'Your league';
  const year = new Date().getFullYear();
  const product = `https://${PLATFORM.rootDomain}`;
  const quiet = 'transition-colors hover:text-foreground';

  return (
    <footer className="mt-16 border-t border-border/50">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 sm:pb-10 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo src={theme.logoUrl} className="h-7 w-7 object-contain" />
              <span className="font-display text-base font-semibold text-foreground">{leagueName}</span>
            </Link>
            <InstallAppCard />
          </div>
          <nav aria-label="League pages" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {LINKS.map(([label, href]) => <Link key={href} href={href} className={quiet}>{label}</Link>)}
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-border/40 pt-6 text-xs text-muted-foreground/80 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>&copy; {year} {leagueName}</span>
            <Link href="/admin" className={quiet}>Admin</Link>
            {hosted && <a href={`${product}/legal/terms`} className={quiet}>Terms</a>}
            {hosted && <a href={`${product}/legal/privacy`} className={quiet}>Privacy</a>}
            <span>Data from Sleeper. Not affiliated with Sleeper or the NFL.</span>
          </div>
          <a href={product} className={`group inline-flex items-center gap-1.5 ${quiet}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/leaguepulse-icon.svg" alt="" className="h-4 w-4 rounded opacity-70 grayscale transition group-hover:opacity-100 group-hover:grayscale-0" />
            Powered by <span className="font-semibold">LeaguePulse</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
