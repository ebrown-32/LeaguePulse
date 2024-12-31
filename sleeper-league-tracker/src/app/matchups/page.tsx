import { UserGroupIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '@/components/ui/PageHeader';
import { getNFLState, getLeagueInfo } from '@/lib/api';
import { LEAGUE_ID } from '@/config/league';
import MatchupsView from './MatchupsView';

export default async function MatchupsPage() {
  const [nflState, league] = await Promise.all([
    getNFLState(),
    getLeagueInfo(LEAGUE_ID),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="space-y-6 pb-20 md:pb-8">
        <PageHeader
          icon={<UserGroupIcon className="h-6 w-6 text-gray-400" />}
          title={`${league.name}: Matchups`}
          subtitle={`Week ${nflState.week}`}
        />
        <MatchupsView currentWeek={nflState.week} />
      </div>
    </div>
  );
} 