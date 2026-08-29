import StandingsView from './StandingsView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Standings',
  description: 'The table, with form, streaks, point differential and who is actually in the playoff hunt.',
};

export default function StandingsPage() {
  return <StandingsView />;
}
