import Link from 'next/link';
import Avatar from './Avatar';
import { cn } from '@/lib/utils';

interface TeamLinkProps {
  userId: string;
  teamName: string;
  avatar: string;
  avatarSize?: number;
  avatarClassName?: string;
  className?: string;
  textClassName?: string;
  /** Render only the avatar (no name), still a full link with a hover ring. */
  avatarOnly?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Drop-in replacement for the Avatar+name pairs scattered across the app,
 * every team reference should route to that manager's profile page. Stops
 * click propagation so it's safe to nest inside other clickable rows/cards.
 */
export default function TeamLink({
  userId, teamName, avatar, avatarSize = 20, avatarClassName, className, textClassName, avatarOnly, onClick,
}: TeamLinkProps) {
  if (!userId) {
    // No stable identity to link to (e.g. a departed/unknown manager), render as plain text.
    return (
      <span className={cn('inline-flex items-center gap-2 min-w-0', className)}>
        <Avatar avatarId={avatar} size={avatarSize} className={cn('rounded shrink-0', avatarClassName)} />
        {!avatarOnly && <span className={cn('truncate', textClassName)}>{teamName}</span>}
      </span>
    );
  }

  return (
    <Link
      href={`/team/${userId}`}
      onClick={e => { e.stopPropagation(); onClick?.(e); }}
      className={cn(
        'group/tl inline-flex items-center gap-2 min-w-0 rounded transition-colors hover:text-primary',
        className,
      )}
    >
      <Avatar
        avatarId={avatar}
        size={avatarSize}
        className={cn('rounded shrink-0 ring-1 ring-transparent transition-all group-hover/tl:ring-primary/50', avatarClassName)}
      />
      {!avatarOnly && <span className={cn('truncate group-hover/tl:text-primary', textClassName)}>{teamName}</span>}
    </Link>
  );
}
