import { SparklesIcon } from '@heroicons/react/24/outline';
import { getAdvancedTeamMetrics, getAllLeagueSeasons } from '@/lib/api';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { PageLayout } from '@/components/layout/PageLayout';
import NextGenStats from './NextGenStats';

export const dynamic = 'force-dynamic';

export default async function NextGenStatsPage() {
  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return (
      <ErrorMessage
        title="Configuration Required"
        message="Please set your Sleeper league ID in the .env.local file. You can find your league ID in the URL when viewing your league on Sleeper."
      />
    );
  }

  try {
    const leagueId = await getCurrentLeagueId();
    const [initialMetrics, seasons] = await Promise.all([
      getAdvancedTeamMetrics(leagueId),
      getAllLeagueSeasons(leagueId),
    ]);

    return (
      <PageLayout
        title="Next-Gen Stats"
        subtitle="Advanced analytics and performance metrics powered by League Pulse. This is a work in progress."
        icon={<SparklesIcon className="h-6 w-6 text-gray-400" />}
      >
        <NextGenStats
          initialMetrics={initialMetrics}
          seasons={seasons}
          leagueId={leagueId}
        />
      </PageLayout>
    );
  } catch (error) {
    console.error('Failed to fetch next-gen stats:', error);
    return (
      <ErrorMessage
        title="Failed to Load Next-Gen Stats"
        message={error instanceof Error ? error.message : 'An unexpected error occurred while fetching next-gen stats. Please check your league ID and try again.'}
      />
    );
  }
} 