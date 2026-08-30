import { Metadata } from 'next';
import DeskView from './DeskView';
import { getTheme } from '@/lib/themeStorage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The Feed | LeaguePulse',
  description: 'Your league\'s timeline: columns, power rankings, predictions, live reactions and fans posting through it.',
};

export default async function DeskPage() {
  // Resolved here rather than in the client: a shared post names the league it
  // came from, and the timeline itself has no other reason to know it.
  const theme = await getTheme();
  return <DeskView leagueName={theme.leagueName ?? theme.siteTitle ?? null} />;
}
