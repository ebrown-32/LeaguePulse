import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PLATFORM } from '@/lib/platform/config';
import { LeaguePulseLockup } from './LeaguePulseBrand';

/**
 * "Powered by LeaguePulse", at the foot of the menus.
 *
 * Always LeaguePulse's own mark and wordmark (LeaguePulseBrand), never
 * `theme.logoUrl`: that is the league's badge, and using it here would have
 * every league claiming to be powered by itself.
 *
 * A link rather than a label: someone who notices this is someone wondering
 * what the app is, and the LeaguePulse site is where they find out (and set up
 * a league of their own).
 */
const PRODUCT = `https://${PLATFORM.rootDomain}`;

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
      href={PRODUCT}
      target="_blank"
      rel="noreferrer"
      onClick={onNavigate}
      className={cn('group inline-flex flex-col gap-1 rounded-lg transition-opacity', md ? 'px-2 py-1.5' : 'px-1.5 py-1', className)}
    >
      <span className={cn('font-semibold uppercase tracking-[0.2em] text-muted-foreground/70', md ? 'text-[9px]' : 'text-[8px]')}>
        Powered by
      </span>
      <LeaguePulseLockup size={md ? 24 : 19} text={md ? 17 : 14}
        className="opacity-85 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
