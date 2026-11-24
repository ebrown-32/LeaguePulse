import { PageLayout } from '@/components/layout/PageLayout';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { leagueConfigured } from '@/config/league';
import EdgeHub from './EdgeHub';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'The Edge | League Pulse',
  description: 'The league\'s research desk: every player\'s season in your scoring, usage, matchups, lineup calls, team comparisons and the waiver wire.',
};

export default async function EdgePage() {
  if (!(await leagueConfigured())) return <ErrorMessage title="The Edge" message="No league configured" />;
  // The research (stats, usage, matchups, lineups) is for every site. What leagues like yours are
  // doing comes from the hosted product's market (lib/market/crawl), so that tab is hosted only.
  return (
    <PageLayout title="The Edge" subtitle="Your league's research desk: every player in your scoring, the matchups, the lineup calls, and how every team stacks up." className="max-w-7xl">
      <EdgeHub hosted={process.env.LP_HOSTED === '1'} />
    </PageLayout>
  );
}
