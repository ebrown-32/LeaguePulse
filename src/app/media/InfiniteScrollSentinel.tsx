'use client';

import { useEffect, useRef } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface InfiniteScrollSentinelProps {
  hasMore: boolean;
  loading: boolean;
  /** Must be referentially stable (useCallback) and self-guard against
   *  overlapping calls — the observer can fire again before a fetch settles. */
  onLoadMore: () => void;
}

/**
 * Loads the next page once the bottom of the list comes into view, replacing
 * the old "Show more" button. Fires 600px early so the next batch is usually
 * already in place by the time the user reaches the end.
 */
export default function InfiniteScrollSentinel({ hasMore, loading, onLoadMore }: InfiniteScrollSentinelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) onLoadMore(); },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex justify-center py-6" aria-hidden={!loading}>
      {loading && <LoadingSpinner className="h-6 w-6" />}
    </div>
  );
}
