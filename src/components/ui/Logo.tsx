'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <Link href="/" className={className}>
      <Image
        src="/logo.png"
        alt="League Pulse"
        width={32}
        height={32}
        className="h-8 w-8"
      />
    </Link>
  );
} 