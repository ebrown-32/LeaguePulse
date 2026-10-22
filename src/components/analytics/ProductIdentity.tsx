'use client';

/**
 * The product site's half of analytics identity (lib/mixpanel): the signed-in Clerk account,
 * by its id, which is the same id a league's site learns from its visitor pass (AccountChip).
 * A brand-new account also counts once as sign_up_completed.
 */

import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { identify, resetIdentity, track } from '@/lib/mixpanel';

const NEW_FOR_MS = 15 * 60 * 1000;

export default function ProductIdentity() {
  const { isLoaded, isSignedIn, user } = useUser();
  const was = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user) {
      identify(user.id);
      was.current = true;
      const key = `lp_signup_sent:${user.id}`;
      const fresh = user.createdAt && Date.now() - user.createdAt.getTime() < NEW_FOR_MS;
      try {
        if (fresh && !localStorage.getItem(key)) {
          track('sign_up_completed', { method: user.externalAccounts[0]?.provider ?? 'email' });
          localStorage.setItem(key, '1');
        }
      } catch { /* no storage: skip rather than count twice */ }
    } else if (was.current) {
      resetIdentity();
      was.current = false;
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
