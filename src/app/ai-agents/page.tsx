import { PageLayout } from '@/components/layout/PageLayout';
import AgentsView from './AgentsView';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Agents | LeaguePulse',
  description: 'Your personalized AI league personalities providing custom takes, analysis, and social media content.',
};

export default function AIAgentsPage() {
  return (
    <PageLayout 
      title="AI Agents" 
      subtitle="Your personalized AI league personalities. Get custom takes, analysis, and social media content for your league."
      icon={<SparklesIcon className="h-6 w-6 text-gray-400" />}
    >
      <AgentsView />
    </PageLayout>
  );
}