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
  const avatarUrl = !avatarId
    ? `https://sleepercdn.com/images/v2/icons/player-default.webp`
    : /^https?:\/\//.test(avatarId)
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