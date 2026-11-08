import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/PageLayout';
import { getTheme } from '@/lib/themeStorage';
import WrappedView from './WrappedView';
import { ringSeasons } from '@/lib/ringModels';

/**
 * A shared story's preview is that story's card (api/wrapped/card): a link to someone's Wrapped
 * shows their season in the group chat, not the league's generic card.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ season?: string; m?: string }> }): Promise<Metadata> {
  const { season, m } = await searchParams;
  const q = new URLSearchParams({ season: season && /^(all|\d{4})$/.test(season) ? season : 'all', m: m && m.length <= 80 ? m : 'league' });
  const image = { url: `/api/wrapped/card?${q}`, width: 1080, height: 1350, alt: 'League Wrapped' };
  return {
    title: 'League Wrapped | League Pulse',
    description: 'Every season, told as a story.',
    openGraph: { title: 'League Wrapped', description: 'Every season, told as a story.', images: [image] },
    twitter: { card: 'summary_large_image', title: 'League Wrapped', images: [image.url] },
  };
}
export const dynamic = 'force-dynamic';

export default async function WrappedPage() {
  // The league's own name, as its site shows it: the admin's, else the tenant's, else the theme's title.
  const theme = await getTheme().catch(() => null);
  let name = theme?.leagueName?.trim() || '';
  if (!name && process.env.LP_HOSTED === '1') {
    const { currentTenant } = await import('@/lib/tenant/context');
    name = (await currentTenant().catch(() => null))?.leagueName?.trim() || '';
  }
  return (
    <PageLayout title="League Wrapped" subtitle="Every season, told as a story. Pick a year, pick a manager, press play." className="max-w-5xl">
      <WrappedView leagueName={name || theme?.siteTitle?.trim() || 'Your league'} archived={Boolean(process.env.DATABASE_URL?.trim())} ringModels={await ringSeasons()} />
    </PageLayout>
  );
}
