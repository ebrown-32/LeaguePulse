import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import Logo from '@/components/ui/Logo';
import { getTheme } from '@/lib/themeStorage';
import { PLATFORM } from '@/lib/platform/config';
import { LeaguePulseLockup } from '@/components/ui/LeaguePulseBrand';
import InstallAppCard from './InstallAppCard';
import AccountChip from './AccountChip';
import FeedbackButton from './FeedbackButton';

/**
 * A league site's footer, the league's own: its name and badge, its pages in
 * the same groups as the menu, and the fine print. LeaguePulse sits along the
 * bottom: on the hosted product, your LeaguePulse account at the bottom left
 * (AccountChip, the way to your other leagues, your franchise and admin), and
 * "Powered by LeaguePulse" at the right, back to the product.
 *
 * Pages that are not there (franchises without a database, rankings until an
 * admin connects FantasyPros) are left out here too, as in the menu.
 */

type Item = [label: string, href: string];
const GROUPS: { label: string; items: Item[] }[] = [
  { label: 'This week', items: [['Game Day', '/live'], ['Matchups', '/matchups'], ['Standings', '/standings'], ['Weekly Report', '/report']] },
  { label: 'Dig in', items: [['History', '/history'], ['Franchises', '/franchises'], ['Rivalries', '/rivalries'], ['Trade Finder', '/trades'], ['Next Gen', '/next-gen']] },
  { label: 'Catch up', items: [['The Feed', '/desk'], ['Media', '/media'], ['Transactions', '/transactions']] },
  { label: 'Look it up', items: [['Rosters', '/rosters'], ['Drafts', '/drafts'], ['Player Rankings', '/rankings'], ['Constitution', '/constitution']] },
];

export default async function Footer() {
  // See RootLayout: admin-saved branding must not be served from a cached render.
  noStore();
  const hosted = process.env.LP_HOSTED === '1';
  const [theme, tenant, rankings, provider] = await Promise.all([
    getTheme(),
    hosted ? import('@/lib/tenant/context').then(m => m.currentTenant()).catch(() => null) : null,
    import('@/lib/fantasyProsRefresh').then(m => m.rankingsConnected()).catch(() => false),
    Promise.all([import('@/config/league'), import('@/lib/providers/ids')])
      .then(async ([league, ids]) => ids.providerOf(await league.getCurrentLeagueId()))
      .catch(() => 'sleeper' as const),
  ]);
  const leagueName = theme.leagueName?.trim() || tenant?.leagueName?.trim() || 'Your league';
  const franchises = Boolean(process.env.DATABASE_URL?.trim());
  const shown = ([, href]: Item) => (franchises || href !== '/franchises') && (rankings || href !== '/rankings');
  const year = new Date().getFullYear();
  const product = `https://${PLATFORM.rootDomain}`;
  const source = provider === 'espn' ? 'ESPN' : 'Sleeper';
  const quiet = 'transition-colors hover:text-foreground';

  return (
    <footer className="relative mt-20 border-t border-border/60 bg-gradient-to-b from-transparent to-muted/30">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-12 sm:px-6 sm:pb-10 lg:px-8">

        {/* The league, and its pages */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-16">
          <div className="space-y-4">
            <Link href="/" className="group inline-flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card shadow-sm transition-transform group-hover:-rotate-3 group-hover:scale-105">
                <Logo src={theme.logoUrl} className="h-7 w-7 object-contain" />
              </span>
              <span className="font-display text-lg font-bold tracking-tight text-foreground">{leagueName}</span>
            </Link>
            <p className="max-w-xs text-[13.5px] leading-relaxed text-muted-foreground">
              Every season, rivalry and record of {leagueName}, in one place.
            </p>
            <InstallAppCard />
            {/* Bugs and ideas, to the back office's inbox (lib/ops/feedback). */}
            {hosted && <FeedbackButton />}
          </div>

          <nav aria-label="League pages" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {GROUPS.map(g => {
              const items = g.items.filter(shown);
              if (!items.length) return null;
              return (
                <div key={g.label}>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">{g.label}</p>
                  <ul className="mt-3 space-y-2">
                    {items.map(([label, href]) => (
                      <li key={href}>
                        <Link href={href} className="inline-block text-[14px] text-foreground/75 transition duration-200 hover:translate-x-0.5 hover:text-foreground">
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </div>

        {/* The fine print */}
        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-6 text-xs text-muted-foreground/80">
          <span>&copy; {year} {leagueName}</span>
          <Link href="/admin" className={quiet}>Admin</Link>
          {hosted && <a href={`${product}/legal/terms`} className={quiet}>Terms</a>}
          {hosted && <a href={`${product}/legal/privacy`} className={quiet}>Privacy</a>}
          <span>Data from {source}. Not affiliated with {source} or the NFL.</span>
        </div>

        {/* LeaguePulse: your account at the bottom left, the product at the right */}
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {hosted && <div className="order-last sm:order-first"><AccountChip /></div>}
          <a href={product} className="group inline-flex items-center gap-2.5 text-xs text-muted-foreground sm:ml-auto">
            <span className="font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors group-hover:text-muted-foreground">Powered by</span>
            <LeaguePulseLockup size={20} text={15} className="opacity-80 transition-opacity group-hover:opacity-100" />
          </a>
        </div>
      </div>
    </footer>
  );
}
