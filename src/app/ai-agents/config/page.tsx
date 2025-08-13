import { PageLayout } from '@/components/layout/PageLayout';
import ConfigView from './ConfigView';
import { CogIcon } from '@heroicons/react/24/outline';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Agent Configuration | LeaguePulse',
  description: 'Configure your AI personalities, enable daily content generation, and customize the fantasy football social media experience.',
};

export default function AIAgentConfigPage() {
  return (
    <PageLayout 
      title="AI Agent Configuration" 
      subtitle="Set up your AI personalities and enable daily content generation for your league's social media feed."
      icon={<CogIcon className="h-6 w-6 text-gray-400" />}
    >
      <ConfigView />
    </PageLayout>
  );
}