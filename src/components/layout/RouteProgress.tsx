'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A progress bar for navigation.
 *
 * Ten pages in this app are `force-dynamic`, so a click waits on a server
 * round trip before anything renders. With no feedback that reads as the app
 * freezing and then snapping to the new page, which is most of what "choppy"
 * actually means here. A bar that starts the instant you click turns the same
 * wait into something that feels deliberate.
 *
 * The App Router has no router events, so navigation start is inferred from a
 * click on an internal link and navigation end from the pathname changing.
 */

/** How far the bar creeps while waiting. Never reaches the end on its own:
 *  a bar that completes before the page arrives is a lie. */
const CEILING = 0.9;

export default function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);
  const settled = useRef(pathname);

  const stop = () => {
    if (timer.current) { cancelAnimationFrame(timer.current); timer.current = null; }
  };

  useEffect(() => {
    const start = () => {
      stop();
      setVisible(true);
      setProgress(0.08);
      let value = 0.08;
      let last = performance.now();
      const tick = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        // Decelerating creep: quick to a third, then increasingly reluctant,
        // so a slow route never looks stalled and a fast one never overshoots.
        value += (CEILING - value) * dt * 1.6;
        setProgress(value);
        timer.current = requestAnimationFrame(tick);
      };
      timer.current = requestAnimationFrame(tick);
    };

    const onClick = (e: MouseEvent) => {
      // Only plain left clicks on same-origin links that actually change page.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      let url: URL;
      try { url = new URL(anchor.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      // A hash on the current page is not a navigation.
      if (url.pathname === window.location.pathname && url.hash) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      start();
    };

    document.addEventListener('click', onClick, { capture: true });
    window.addEventListener('popstate', start);
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('popstate', start);
      stop();
    };
  }, []);

  // The new route has rendered: run to full, then get out of the way.
  useEffect(() => {
    if (pathname === settled.current) return;
    settled.current = pathname;
    stop();
    setProgress(1);
    const t = setTimeout(() => { setVisible(false); setProgress(0); }, 260);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease' }}
    >
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress * 100}%`,
          // Only the final run-to-100 is eased; the creep is already animated
          // frame by frame and a transition on top of it would lag behind.
          transition: progress === 1 ? 'width 220ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          boxShadow: '0 0 12px hsl(var(--primary) / 0.7)',
        }}
      />
    </div>
  );
}
