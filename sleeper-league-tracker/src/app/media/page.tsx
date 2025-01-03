import { PageLayout } from '@/components/layout/PageLayout';
import NewsView from './NewsView';
import { NewspaperIcon } from '@heroicons/react/24/outline';

export default function MediaPage() {
  return (
    <PageLayout 
      title="Media" 
      subtitle="Latest NFL News"
      icon={<NewspaperIcon className="h-6 w-6 text-gray-400" />}
    >
      <NewsView />
    </PageLayout>
  );
} 