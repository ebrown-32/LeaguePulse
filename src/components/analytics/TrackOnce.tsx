'use client';

/**
 * An event for a server-rendered moment (lib/mixpanel), counted once per `once` key in this
 * browser however often the page reloads.
 */

import { useEffect } from 'react';
import { track } from '@/lib/mixpanel';

export default function TrackOnce({ event, once, props }: { event: string; once: string; props?: Record<string, unknown> }) {
  useEffect(() => {
    const key = `lp_sent:${event}:${once}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch { return; }
    track(event, props);
  }, [event, once, props]);
  return null;
}
