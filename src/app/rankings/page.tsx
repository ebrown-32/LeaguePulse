import { Metadata } from 'next';
import RankingsView from './RankingsView';

export const metadata: Metadata = {
  title: 'Player Rankings | LeaguePulse',
  description: 'FantasyPros expert consensus rankings, cross-referenced against your league rosters.',
};

export default function RankingsPage() {
  return <RankingsView />;
}
