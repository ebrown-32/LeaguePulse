import { Suspense } from 'react';
import { getLeagueMatchups, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import MatchupsView from './MatchupsView';
import { Card, CardContent } from '@/components/ui/Card';

function LoadingState() {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/10 rounded w-1/4"></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-32 bg-white/10 rounded"></div>
            <div className="h-32 bg-white/10 rounded"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MatchupsPage() {
  if (!LEAGUE_ID || LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return (
      <ErrorMessage
        title="Configuration Required"
        message="Please set your Sleeper league ID in the .env.local file. You can find your league ID in the URL when viewing your league on Sleeper."
      />
    );
  }

  try {
    const [nflState, users, rosters] = await Promise.all([
      getNFLState(),
      getLeagueUsers(LEAGUE_ID),
      getLeagueRosters(LEAGUE_ID),
    ]);

    const initialMatchups = await getLeagueMatchups(LEAGUE_ID, 1);

    return (
      <Suspense fallback={<LoadingState />}>
        <MatchupsView
          initialMatchups={initialMatchups}
          nflState={nflState}
          users={users}
          rosters={rosters}
          leagueId={LEAGUE_ID}
        />
      </Suspense>
    );
  } catch (error) {
    console.error('Failed to fetch matchup data:', error);
    return (
      <ErrorMessage
        title="Failed to Load Matchups"
        message={error instanceof Error ? error.message : 'An unexpected error occurred while fetching matchup data. Please check your league ID and try again.'}
      />
    );
  }
} 