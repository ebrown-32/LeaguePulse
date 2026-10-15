'use client';

/**
 * Remembers the page you were on before this one, within this site and this
 * tab, so a "Back" link can be honest about where it goes. The browser's own
 * referrer does not change on in-app navigation, so it cannot tell.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export const PREVIOUS_KEY = 'lp_prev_path';
const CURRENT_KEY = 'lp_cur_path';

export default function NavMemory() {
  const path = usePathname();
  useEffect(() => {
    try {
      const current = sessionStorage.getItem(CURRENT_KEY);
      if (current && current !== path) sessionStorage.setItem(PREVIOUS_KEY, current);
      sessionStorage.setItem(CURRENT_KEY, path);
    } catch { /* storage blocked: Back links fall back to their default page */ }
  }, [path]);
  return null;
}
