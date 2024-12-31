'use client';

import { ChartBarIcon } from '@heroicons/react/24/outline';

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="relative">
        <ChartBarIcon className="w-6 h-6 text-blue-500" />
        <div className="absolute inset-0 bg-blue-500/20 blur-lg rounded-full" />
      </div>
      <span className="font-bold text-lg tracking-tight">League Pulse</span>
    </div>
  );
} 