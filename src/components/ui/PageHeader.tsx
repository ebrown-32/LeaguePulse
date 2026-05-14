import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title:     string;
  subtitle?: string;
  icon:      ReactNode;
  action?:   ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, icon, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 sm:gap-4', className)}>
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {/* Icon with glow ring */}
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            {icon}
          </div>
          <div className="absolute inset-0 rounded-lg blur-md opacity-40 bg-primary/20 -z-10" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground truncate tracking-wide">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
