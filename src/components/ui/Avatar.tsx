import Image from 'next/image';

interface AvatarProps {
  avatarId: string | null;
  size?: number;
  className?: string;
}

export default function Avatar({ avatarId, size = 40, className = '' }: AvatarProps) {
  // Accepts either a bare account avatar id or a full URL. A manager's team
  // picture is stored by Sleeper as an uploads URL rather than an id, so
  // prefixing everything with the avatars path turned those into 404s.
  // No picture at all (Sleeper's old default image is gone from its CDN, and
  // ESPN managers have no account picture): a plain silhouette.
  if (!avatarId) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-2 ring-white/10 ${className}`}
        style={{ width: size, height: size }}
        aria-label="User avatar"
      >
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z" />
        </svg>
      </div>
    );
  }
  const avatarUrl = /^https?:\/\//.test(avatarId)
    ? avatarId
    : `https://sleepercdn.com/avatars/${avatarId}`;

  return (
    <div
      className={`relative overflow-hidden rounded-full ring-2 ring-white/10 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={avatarUrl}
        alt="User avatar"
        className="object-cover"
        width={size}
        height={size}
      />
    </div>
  );
} 