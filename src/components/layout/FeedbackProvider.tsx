'use client';

import { useEffect } from 'react';
import { configureFeedback, feedback } from '@/lib/feedback';

/**
 * Wires click feedback to the whole app from one listener.
 *
 * Delegated at the document rather than added to every button: there are
 * hundreds of interactive elements here and threading an onClick through all
 * of them would be a change to every component and a permanent tax on every
 * new one. A single capture-phase listener covers everything that exists now
 * and everything added later.
 *
 * The tone is inferred from what was actually clicked, so a switch sounds
 * different from a link without any component opting in.
 */
export default function FeedbackProvider({
  sound,
  haptics,
}: {
  sound: boolean;
  haptics: boolean;
}) {
  useEffect(() => {
    configureFeedback({ sound, haptics });
  }, [sound, haptics]);

  useEffect(() => {
    if (!sound && !haptics) return;

    const onPointerDown = (e: PointerEvent) => {
      // Fired on pointerdown, not click: the feedback has to land when the
      // finger lands. On click it arrives after the press has finished and
      // reads as lag rather than as a response.
      if (e.button !== 0) return;
      const el = (e.target as HTMLElement | null)?.closest?.(
        'button, a[href], [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], select, summary',
      ) as HTMLElement | null;
      if (!el) return;
      // A disabled control did nothing, so it should sound like nothing.
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;

      const role = el.getAttribute('role');
      const isToggle =
        el.tagName === 'INPUT' ||
        el.getAttribute('aria-checked') !== null ||
        el.getAttribute('aria-pressed') !== null;
      const isSelect = role === 'tab' || el.tagName === 'SELECT' || el.getAttribute('aria-expanded') !== null;

      feedback(isToggle ? 'toggle' : isSelect ? 'select' : 'tap');
    };

    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [sound, haptics]);

  return null;
}
