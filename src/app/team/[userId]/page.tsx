import TeamProfileView from './TeamProfileView';
import { leagueDisplayName } from '@/lib/leagueName';

export const metadata = { title: 'Team Profile | League Pulse' };

export default async function TeamProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <TeamProfileView userId={userId} leagueName={await leagueDisplayName()} />;
}
