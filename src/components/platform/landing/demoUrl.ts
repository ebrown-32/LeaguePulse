'use client';

import { useEffect, useState } from 'react';
import { PLATFORM } from '@/lib/platform/config';

/** The demo league's address: its own subdomain, or demo.localhost when developing. */
export function useDemoUrl(): string {
  const [url, setUrl] = useState(PLATFORM.demoUrl || `https://demo.${PLATFORM.rootDomain}`);
  useEffect(() => {
    const { hostname, port } = window.location;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) setUrl(`http://demo.localhost${port ? `:${port}` : ''}`);
  }, []);
  return url;
}
