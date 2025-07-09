import Image from 'next/image';

interface AvatarProps {
  avatarId: string | null;
  size?: number;
  className?: string;
}

export default function Avatar({ avatarId, size = 40, className = '' }: AvatarProps) {
  const avatarUrl = avatarId
    ? `https://sleepercdn.com/avatars/${avatarId}`
    : `https://sleepercdn.com/images/v2/icons/player-default.webp`;

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