import MatchupsView from './MatchupsView';

export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Matchups</h1>
        <p className="text-gray-400">View weekly matchups and playoff brackets.</p>
      </div>
      <MatchupsView />
    </div>
  );
} 