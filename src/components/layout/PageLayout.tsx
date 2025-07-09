'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/ui/PageHeader';

interface PageLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  action?: ReactNode;
}

export function PageLayout({ children, title, subtitle, icon, action }: PageLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <div className="space-y-8 pb-20 md:pb-8">
        <div className="pt-8 pb-4">
          <PageHeader
            icon={icon}
            title={title}
            subtitle={subtitle}
            action={action}
          />
        </div>
        {children}
      </div>
    </motion.div>
  );
} 