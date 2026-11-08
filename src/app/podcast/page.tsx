import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/PageLayout';
import { getTheme } from '@/lib/themeStorage';
import PodcastView from './PodcastView';

export const dynamic = 'force-dynamic';

const DESCRIPTION = 'Your league\'s week, as a show: the Desk\'s writers recap the games, the table and the trades.';

/** A link to an episode unfurls as that episode: its cover (api/podcast/thumb) and title. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ep?: string }> }): Promise<Metadata> {
  const { ep } = await searchParams;
  const base: Metadata = { title: 'The Desk Weekly | LeaguePulse', description: DESCRIPTION };
  if (!ep || !/^[A-Za-z0-9-]{1,80}$/.test(ep)) return base;
  const { getEpisode } = await import('@/lib/ai/podcast');
  const episode = await getEpisode(ep).catch(() => null);
  if (!episode) return base;
  const title = `${episode.title} | The Desk Weekly, week ${episode.week}`;
  const image = { url: `/api/podcast/thumb?ep=${encodeURIComponent(ep)}`, width: 1280, height: 720, alt: episode.title };
  return {
    title, description: episode.teaser,
    openGraph: { title, description: episode.teaser, images: [image] },
    twitter: { card: 'summary_large_image', title, description: episode.teaser, images: [image.url] },
  };
}

export default async function PodcastPage() {
  const theme = await getTheme();
  return (
    <PageLayout title="The Desk Weekly" subtitle="Your league's week, as a show. New every Tuesday." className="max-w-6xl">
      <PodcastView leagueName={theme.leagueName ?? theme.siteTitle ?? 'Your league'} logoUrl={theme.logoUrl ?? null} />
    </PageLayout>
  );
}
