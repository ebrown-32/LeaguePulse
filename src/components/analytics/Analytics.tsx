'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initMixpanel, track } from '@/lib/mixpanel';

const PAGE_NAMES: Record<string, string> = {
  '/':             'Overview',
  '/matchups':     'Matchups',
  '/rivalries':    'Rivalries',
  '/next-gen':     'Next Gen Stats',
  '/history':      'History',
  '/transactions': 'Transactions',
  '/drafts':       'Drafts',
  '/media':        'Media',
  '/constitution': 'Constitution',
};

export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    initMixpanel();
    track('page_viewed', {
      page_name: PAGE_NAMES[pathname] ?? pathname,
      path: pathname,
    });
  }, [pathname]);

  return null;
}
