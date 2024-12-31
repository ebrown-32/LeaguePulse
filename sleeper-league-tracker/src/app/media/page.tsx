import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';

export default function ArticlesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="space-y-6 pb-20 md:pb-8">
        <PageHeader
          icon={<DocumentTextIcon className="h-6 w-6 text-gray-400" />}
          title="Media"
          subtitle="Fantasy News, Weekly Recaps, Power Rankings, and Analysis powered by AI."
        />

        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-200">Coming Soon</h3>
              <p className="mt-2 text-sm text-gray-400">
                View a centralized news feed for fantasy football. Define AI media personalities that cover your league in unprecedented ways. Give your league a pulse!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 