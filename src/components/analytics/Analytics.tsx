'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initMixpanel, track, type SuperProps } from '@/lib/mixpanel';

const PAGE_NAMES: Record<string, string> = {
  '/':             'Home',
  '/matchups':     'Matchups',
  '/rivalries':    'Rivalries',
  '/trades':       'Trade Finder',
  '/next-gen':     'Next Gen Stats',
  '/history':      'History',
  '/transactions': 'Transactions',
  '/drafts':       'Drafts',
  '/media':        'Media',
  '/constitution': 'Constitution',
};

/** `props` go with every event (lib/mixpanel): the surface, and on a league's site which league. */
export default function Analytics({ props }: { props?: SuperProps }) {
  const pathname = usePathname();

  useEffect(() => {
    initMixpanel(props);
    track('page_viewed', {
      page_name: PAGE_NAMES[pathname] ?? pathname,
      path: pathname,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
