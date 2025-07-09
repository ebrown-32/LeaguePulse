import { PageLayout } from '@/components/layout/PageLayout';
import NewsView from './NewsView';
import { NewspaperIcon } from '@heroicons/react/24/outline';

export default function MediaPage() {
  return (
    <PageLayout 
      title="Media" 
      subtitle="Latest NFL News from ESPN. Coming soon: define custom AI media personalities to cover your league activity and give it a pulse."
      icon={<NewspaperIcon className="h-6 w-6 text-gray-400" />}
    >
      <NewsView />
    </PageLayout>
  );
} 