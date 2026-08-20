import { Metadata } from 'next';
import DeskView from './DeskView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The Desk | LeaguePulse',
  description: 'Your league\'s AI beat writers: columns, power rankings, predictions and hot takes.',
};

export default function DeskPage() {
  return <DeskView />;
}
