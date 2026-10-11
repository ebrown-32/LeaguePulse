import { Metadata } from 'next';
import WatchView from './WatchView';

export const metadata: Metadata = {
  title: 'Game Day | LeaguePulse',
  description: 'Which NFL games to have on right now, where your players are on the field, and every play they make.',
};

export default function LivePage() {
  return <WatchView />;
}
