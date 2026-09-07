import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Usually a string. Takes a node so a page can set a badge beside its
   *  name, which belongs in the heading rather than out in the action slot. */
  title:     ReactNode;
  subtitle?: string;
  action?:   ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {/* Still truncates: a node title sits inline inside it rather than
            changing the box, so long string titles clip exactly as before. */}
        {/* Bigger and tighter. A page title set at the same weight and
            spacing as a card heading gives the page no top, and every screen
            then reads as a stack of equal parts with nothing leading it. */}
        <h1 className="truncate font-display text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-foreground sm:text-[34px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
