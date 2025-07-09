import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Card, CardContent } from './Card';

interface ErrorMessageProps {
  title?: string;
  message: string;
}

export function ErrorMessage({ title = 'Error', message }: ErrorMessageProps) {
  return (
    <Card className="border border-red-500/20 bg-red-500/5">
      <CardContent className="flex items-center space-x-4 py-6">
        <div className="rounded-full bg-red-500/10 p-2">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
        </div>
        <div>
          <h3 className="font-medium text-red-500">{title}</h3>
          <p className="text-sm text-red-200/80">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
} 