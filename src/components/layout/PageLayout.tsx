import { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  children:   ReactNode;
  title:      ReactNode;
  subtitle?:  string;
  action?:    ReactNode;
  /** Overrides on the page container, chiefly a narrower `max-w-*` for pages
   *  that read as a single column rather than as a dashboard. Merged, so a
   *  width passed here wins over the default. */
  className?: string;
}

export function PageLayout({ children, title, subtitle, action, className }: PageLayoutProps) {
  return (
    <div className={cn('mx-auto max-w-7xl px-4 sm:px-6 lg:px-8', className)}>
      <div className="space-y-8 py-8 pb-16 md:pb-8">
        <PageHeader title={title} subtitle={subtitle} action={action} />
        {children}
      </div>
    </div>
  );
}
