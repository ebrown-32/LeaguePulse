import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { rankingsConnected } from '@/lib/fantasyProsRefresh';
import RankingsView from './RankingsView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Player Rankings | LeaguePulse',
  description: 'FantasyPros expert consensus rankings, cross-referenced against your league rosters.',
};

/** Hidden until the league's admin connects FantasyPros (admin, Rankings tab). */
export default async function RankingsPage() {
  if (!(await rankingsConnected())) notFound();
  return <RankingsView />;
}
