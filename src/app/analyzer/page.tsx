import { Metadata } from 'next';
import AnalyzerView from './AnalyzerView';

export const metadata: Metadata = {
  title: 'Power Rankings | LeaguePulse',
  description: 'League analyzer: roster strength, positional rankings, and starter rankings.',
};

export default function AnalyzerPage() {
  return <AnalyzerView />;
}
