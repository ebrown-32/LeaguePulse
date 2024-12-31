import { ReactNode } from 'react';
import { Card, CardContent } from './Card';

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ icon, title, subtitle, action }: PageHeaderProps) {
  return (
    <Card>
      <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-6">
        <div className="flex items-center space-x-4">
          <div className="rounded-xl bg-white/5 p-3">
            {icon}
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-gray-400 text-sm md:text-base">{subtitle}</p>
            )}
          </div>
        </div>
        {action && (
          <div>
            {action}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 