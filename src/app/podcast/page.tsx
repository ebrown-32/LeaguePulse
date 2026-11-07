import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/PageLayout';
import { getTheme } from '@/lib/themeStorage';
import PodcastView from './PodcastView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The Desk Weekly | LeaguePulse',
  description: 'Your league\'s week, as a show: the Desk\'s writers recap the games, the table and the trades.',
};

export default async function PodcastPage() {
  const theme = await getTheme();
  return (
    <PageLayout title="The Desk Weekly" subtitle="Your league's week, as a show. New every Tuesday." className="max-w-6xl">
      <PodcastView leagueName={theme.leagueName ?? theme.siteTitle ?? 'Your league'} />
    </PageLayout>
  );
}
