import { getTeamMetrics, getAllLeagueSeasons } from '@/lib/api';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import NextGenStats from './NextGenStats';

export default async function NextGenStatsPage() {
  if (!LEAGUE_ID || LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return (
      <ErrorMessage
        title="Configuration Required"
        message="Please set your Sleeper league ID in the .env.local file. You can find your league ID in the URL when viewing your league on Sleeper."
      />
    );
  }

  try {
    const [initialMetrics, seasons] = await Promise.all([
      getTeamMetrics(LEAGUE_ID),
      getAllLeagueSeasons(LEAGUE_ID),
    ]);

    return (
      <NextGenStats
        initialMetrics={initialMetrics}
        seasons={seasons}
        leagueId={LEAGUE_ID}
      />
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