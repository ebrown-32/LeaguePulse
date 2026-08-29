import { Metadata } from 'next';
import DeskView from './DeskView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The Feed | LeaguePulse',
  description: 'Your league\'s timeline: columns, power rankings, predictions, live reactions and fans posting through it.',
};

export default function DeskPage() {
  return <DeskView />;
}
