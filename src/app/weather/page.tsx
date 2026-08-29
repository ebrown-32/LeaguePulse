import WeatherView from './WeatherView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Weather',
  description: 'Kickoff conditions for every game on the slate, and which of your starters are playing in them.',
};

export default function WeatherPage() {
  return <WeatherView />;
}
