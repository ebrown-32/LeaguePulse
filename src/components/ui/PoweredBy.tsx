import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * "Powered by League Pulse".
 *
 * Always the League Pulse mark at /logo.png, never `theme.logoUrl`. That
 * setting is the league's own badge, so rendering it here would have every
 * deployment claiming to be powered by itself.
 *
 * A link rather than a label: someone who notices this is someone wondering
 * what the app is, and the repository is the honest answer for a project that
 * is meant to be cloned.
 */
const REPO = 'https://github.com/ebrown-32/LeaguePulse';

export default function PoweredBy({
  size = 'sm', className, onNavigate,
}: {
  /** `sm` for menus and footers, `md` where it is the only branding around. */
  size?: 'sm' | 'md';
  className?: string;
  /** Menus that need to close themselves when this is followed. */
  onNavigate?: () => void;
}) {
  const md = size === 'md';

  return (
    <Link
      href={REPO}
      target="_blank"
      rel="noreferrer"
      onClick={onNavigate}
      className={cn(
        'group inline-flex items-center gap-2 rounded-lg transition-colors',
        md ? 'px-2 py-1.5' : 'px-1.5 py-1',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={md ? 26 : 20}
        height={md ? 26 : 20}
        className={cn(
          'shrink-0 object-contain opacity-80 transition-opacity group-hover:opacity-100',
          md ? 'h-[26px] w-[26px]' : 'h-5 w-5',
        )}
      />
      <span className="flex flex-col leading-none">
        <span className={cn(
          'font-medium uppercase tracking-[0.18em] text-muted-foreground/70',
          md ? 'text-[9px]' : 'text-[8px]',
        )}>
          Powered by
        </span>
        <span className={cn(
          'font-display font-bold tracking-tight text-foreground/80 transition-colors group-hover:text-primary',
          md ? 'mt-1 text-[13px]' : 'mt-0.5 text-[11px]',
        )}>
          League <span className="text-primary">Pulse</span>
        </span>
      </span>
    </Link>
  );
}
