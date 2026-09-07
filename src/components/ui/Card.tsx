import { cn } from '@/lib/utils';

interface CardProps {
  children:   React.ReactNode;
  className?: string;
  /** Cards that are themselves a link or a button lift on hover. A static
   *  panel that moves under the cursor is just noise. */
  interactive?: boolean;
}

export function Card({ children, className, interactive }: CardProps) {
  return (
    <div
      className={cn(
        // `rounded-xl` to match every hand-rolled surface elsewhere on the
        // site. This component was the only thing still at `rounded-lg`, and
        // two radii sitting next to each other is the kind of small
        // inconsistency that reads as unfinished without being nameable.
        'rounded-xl text-card-foreground',
        'lp-surface',
        interactive && 'lp-lift',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('flex items-center justify-between p-5 pb-0', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h3
      className={cn(
        'font-display text-base font-semibold leading-none tracking-tight text-foreground',
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('p-5', className)}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-t border-border px-5 py-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
