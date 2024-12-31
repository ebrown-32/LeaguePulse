'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/ui/Logo';
import { 
  HomeIcon, 
  ChartBarIcon, 
  UserGroupIcon,
  SparklesIcon,
  TrophyIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';

const navigation = [
  { name: 'Overview', href: '/', icon: HomeIcon },
  { name: 'Matchups', href: '/matchups', icon: UserGroupIcon },
  { name: 'Season Stats', href: '/records', icon: ChartBarIcon },
  { name: 'History', href: '/all-time', icon: ClockIcon },
  { name: 'Next Gen Stats', href: '/next-gen', icon: SparklesIcon, beta: true },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);

  // Add scroll listener with cleanup
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <nav className={`
        sticky top-0 z-50 transition-all duration-200
        ${isScrolled ? 'bg-gray-900/80 backdrop-blur-xl' : 'bg-gray-900'}
        border-b border-white/10
      `}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Link href="/" className="flex items-center">
                <Logo className="hover:opacity-90 transition-opacity" />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:ml-6 md:flex md:space-x-4 lg:space-x-8">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group inline-flex items-center px-1 pt-1 text-sm font-medium 
                      border-b-2 transition-all relative
                      ${isActive 
                        ? 'border-blue-500 text-white' 
                        : 'border-transparent text-gray-300 hover:border-gray-300 hover:text-white'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    <span>{item.name}</span>
                    {item.beta && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-500/20 text-[10px] font-semibold text-blue-400">
                        BETA
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation Bar - Fixed at Bottom */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-xl border-t border-white/10">
        <div className="grid grid-cols-3 gap-1 p-2">
          {navigation.map((item, index) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            // Show only first 6 items in two rows
            if (index >= 6) return null;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  inline-flex flex-col items-center justify-center py-2 px-1
                  text-xs font-medium relative rounded-lg
                  ${isActive 
                    ? 'text-blue-500 bg-blue-500/10' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }
                `}
              >
                <Icon className="w-5 h-5 mb-1" />
                <span className="text-[11px] text-center">{item.name}</span>
                {item.beta && (
                  <span className="absolute top-0 right-1 px-1 py-0.5 rounded-full bg-blue-500/20 text-[8px] font-semibold text-blue-400">
                    BETA
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom Padding for Mobile to Account for Navigation */}
      <div className="h-[72px] md:h-0" />
    </>
  );
} 