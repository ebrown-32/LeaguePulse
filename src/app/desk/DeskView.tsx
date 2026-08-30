'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingBlock } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import HoneycombLoader from '@/components/ui/honeycomb-loader';
import { FeedPostCard, AiBadge, type FeedPost } from '@/components/desk/FeedPostCard';

/**
 * The Desk: the AI writers' timeline.
 *
 * Previously this lived as the fourth tab on the Media page, where on a phone
 * it started 6px past the right edge of a 390px viewport inside a scroller with
 * no scrollbar, so it was effectively unreachable. It is its own destination
 * now, and reads as a timeline rather than a list of documents: short posts sit
 * inline, long pieces collapse to a headline card you can open, so a column and
 * a one-line jab can share the same column without one burying the other.
 */

/** Posts revealed per page. */
const PAGE = 20;

export default function DeskView({ leagueName }: { leagueName?: string | null } = {}) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [shownCount, setShownCount] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, number>>({});
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    // The store keeps at most 100, so the whole feed arrives in one request.
    // Paging the API as well would add a round trip per scroll for a payload
    // that is already small, and would flicker on every reveal.
    fetch('/api/ai/posts?limit=100')
      .then(r => r.json())
      .then((d: { posts?: FeedPost[] }) => {
        const list = d.posts ?? [];
        setPosts(list);
        // Real like counts, in one request for the whole feed. Asking per post
        // would be a hundred round trips to render one column of numbers.
        if (list.length) {
          fetch(`/api/ai/likes?ids=${list.map(p => encodeURIComponent(p.id)).join(',')}`)
            .then(r => r.json())
            .then((l: { likes?: Record<string, number> }) => setLikes(l.likes ?? {}))
            .catch(() => {});
        }
      })
      .catch(() => setPosts([]));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => (posts ?? []).slice(0, shownCount), [posts, shownCount]);
  const hasMore = (posts?.length ?? 0) > shownCount;

  // Reveal the next page as the end of the list comes into view. The margin
  // starts the reveal before the sentinel is actually on screen, so the
  // timeline extends ahead of the scroll rather than pausing at the bottom.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) setShownCount(n => n + PAGE); },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, shownCount]);

  return (
    <PageLayout
      title={<>The Feed<AiBadge /></>}
      subtitle="Beat writers and fans with live takes, previews and commentary."
      className="max-w-3xl"
    >
      {/* Full bleed. The feed escapes PageLayout's gutters so the dividers run
          edge to edge and the timeline reads as the page rather than as a
          widget sitting on it. Each post puts the gutters back for itself. */}
      <div className="-mx-4 border-t border-border sm:-mx-6 lg:-mx-8">
        {posts === null ? (
          <LoadingBlock size={16} />
        ) : !shown.length ? (
          <div className="px-4 py-16 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-semibold text-foreground">Nothing filed yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The writers publish through the day. Check back shortly.
            </p>
          </div>
        ) : (
          <>
            {shown.map((p, i) => (
              <FeedPostCard
                key={p.id}
                post={p}
                index={i}
                open={openId === p.id}
                onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                leagueName={leagueName}
                realLikes={likes[p.id] ?? 0}
              />
            ))}

            {hasMore && (
              <div ref={sentinel} className="flex justify-center py-8">
                <HoneycombLoader
                  label="Loading more posts"
                  style={{ ['--honeycomb-size' as string]: '10px' }}
                />
              </div>
            )}

            {!hasMore && shown.length > PAGE && (
              <p className="py-8 text-center text-[11px] text-muted-foreground">
                That is the whole feed.
              </p>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
