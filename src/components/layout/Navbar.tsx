'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  ChartBarIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ClockIcon,
  SparklesIcon,
  Bars3Icon,
  XMarkIcon,
  UsersIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import Logo from '@/components/ui/Logo';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement>>;
  tag?: string;
}

const navigation: NavigationItem[] = [
  { name: 'Overview', href: '/', icon: HomeIcon },
  { name: 'Matchups', href: '/matchups', icon: UsersIcon },
  { name: 'History', href: '/history', icon: ClockIcon, tag:'Beta' },
  { name: 'Next Gen', href: '/next-gen', icon: SparklesIcon, tag: 'Beta' },
  { name: 'Media', href: '/media', icon: PhotoIcon},
];

export default function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-gray-950/80">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center space-x-3">
            <Logo />
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">League Pulse</span>
          </Link>
          <div className="hidden md:flex md:items-center md:space-x-6">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="group relative flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400"
              >
                <item.icon className="h-5 w-5 text-gray-400" />
                <span>{item.name}</span>
                {item.tag && (
                  <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
                    {item.tag}
                  </span>
                )}
              </Link>
            ))}
            <div className="ml-2">
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center space-x-4 md:hidden">
            <ThemeToggle />
            <button className="rounded-lg p-2 text-gray-600 dark:text-gray-400">
              <Bars3Icon className="h-6 w-6" />
            </button>
          </div>
        </nav>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-gray-950/80">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center space-x-3">
          <Logo />
          <span className="text-lg font-bold tracking-tight text-gray-900 hover:text-gray-600 transition-colors dark:text-white dark:hover:text-gray-400">League Pulse</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex md:items-center md:space-x-6">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group relative flex items-center space-x-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                }`}
              >
                <item.icon
                  className={`h-5 w-5 transition-colors ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100'
                  }`}
                />
                <span>{item.name}</span>
                {item.tag && (
                  <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
                    {item.tag}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="navbar-active-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </Link>
            );
          })}
          <div className="ml-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center space-x-4 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {isOpen ? (
              <XMarkIcon className="h-6 w-6" />
            ) : (
              <Bars3Icon className="h-6 w-6" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="border-t border-gray-200 bg-white dark:border-white/10 dark:bg-gray-950 md:hidden"
          >
            <div className="space-y-1 px-4 py-3">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.name} href={item.href} onClick={() => setIsOpen(false)}>
                    <motion.div
                      className={`flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                      }`}
                      whileTap={{ scale: 0.98 }}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                      {item.tag && (
                        <span className="ml-auto rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
                          {item.tag}
                        </span>
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
} 