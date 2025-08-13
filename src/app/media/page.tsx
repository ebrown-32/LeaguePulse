import MediaView from './MediaView';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Media | LeaguePulse',
  description: 'Your league\'s AI-powered social media feed with fantasy football personalities, hot takes, and analysis.',
};

export default function MediaPage() {
  return <MediaView />;
} 