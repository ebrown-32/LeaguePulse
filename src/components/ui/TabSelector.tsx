'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * The tab selector.
 *
 * There were three of these: an animated pill on the admin panel, a second
 * animated pill on the desk with its own spring, and a plain instant swap on
 * Next Gen. Same control, three behaviours, and the odd one out was on the
 * page with the most tabs. This is the one implementation.
 *
 * The active pill is a shared `layoutId` element, so switching tabs slides it
 * across rather than blinking it from one place to another. Each instance
 * needs its own `layoutId` namespace, hence the required `id` prop: two
 * groups sharing one id would animate the pill between them across the page.
 */

export interface TabOption<T extends string> {
  id: T;
  label: string;
  /** Optional count or badge shown after the label. */
  badge?: string | number;
}

interface Props<T extends string> {
  /** Unique per selector instance. Namespaces the sliding pill. */
  id: string;
  options: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Fills the width and shares it evenly, for narrow screens. */
  fullWidth?: boolean;
  className?: string;
  'aria-label'?: string;
}

export default function TabSelector<T extends string>({
  id, options, value, onChange, fullWidth, className, ...rest
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex shrink-0 rounded-lg border border-border bg-card p-0.5',
        // Scrolls rather than wraps: a wrapped tab row changes height and
        // shoves the content below it down, which looks like a bug.
        'max-w-full overflow-x-auto no-scrollbar',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map(opt => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              'relative shrink-0 whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors',
              // A comfortable target on a phone without inflating the desktop
              // control, which sits next to other 36px controls.
              'min-h-[36px]',
              fullWidth && 'flex-1',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-0 rounded-md bg-primary"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative flex items-center justify-center gap-1.5">
              {opt.label}
              {opt.badge !== undefined && (
                <span className={cn(
                  'rounded px-1 py-px text-[9px] font-bold tabular-nums',
                  active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                )}>
                  {opt.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
