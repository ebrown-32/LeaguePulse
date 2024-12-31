'use client';

import Image from 'next/image';

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="relative w-8 h-8">
        <Image
          src="/logo.png"
          alt="League Pulse Logo"
          width={32}
          height={32}
          className="object-contain"
        />
      </div>
      <span className="font-bold text-lg">League Pulse</span>
    </div>
  );
} 