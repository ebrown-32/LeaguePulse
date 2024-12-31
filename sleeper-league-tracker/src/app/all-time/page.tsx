import HistoryView from './HistoryView';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { LEAGUE_ID } from '@/config/league';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

export default async function AllTimePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">League History</h1>
        <p className="text-gray-400">View historical performance and records.</p>
      </div>
      <HistoryView />
    </div>
  );
} 