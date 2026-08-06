import { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';

interface PageLayoutProps {
  children:   ReactNode;
  title:      string;
  subtitle?:  string;
  action?:    ReactNode;
}

export function PageLayout({ children, title, subtitle, action }: PageLayoutProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="space-y-8 py-8 pb-16 md:pb-8">
        <PageHeader title={title} subtitle={subtitle} action={action} />
        {children}
      </div>
    </div>
  );
}
