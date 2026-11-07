'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingBlock } from '@/components/ui/LoadingSpinner';

import { MessageCircle, ArrowUp } from '@/components/icons';
import { useLiveFeed, visibleAt } from '@/lib/useLiveFeed';
import { TypingRow } from '@/components/home/HomeFeed';
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
  // The store keeps at most 100, so the whole feed arrives in one request.
  // Polled while the tab is visible, so the timeline moves while it is open.
  const { posts: latest, typing, fresh } = useLiveFeed<FeedPost>(100);
  const [shownCount, setShownCount] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, number>>({});
  const sentinel = useRef<HTMLDivElement>(null);

  /**
   * What is on screen, which is not always the latest.
   *
   * A reader halfway down the timeline should not have it shift under them
   * because a post landed at the top, so new top level posts wait behind a
   * "new posts" pill until they scroll up or tap it. Near the top, there is
   * nothing to disturb and they go straight in. Replies always go straight in:
   * they land under a post, not above the reader.
   */
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [waiting, setWaiting] = useState<FeedPost[]>([]);
  const postsRef = useRef<FeedPost[] | null>(null);
  postsRef.current = posts;
  useEffect(() => {
    if (!latest) return;
    const prev = postsRef.current;
    const shown = new Set((prev ?? []).map(p => p.id));
    const newRoots = prev ? latest.filter(p => !p.replyTo && !shown.has(p.id)) : [];
    if (!newRoots.length || window.scrollY < 240) {
      setWaiting([]);
      setPosts(latest);
      return;
    }
    // Everything except the held back roots: replies still land in place.
    const held = new Set(newRoots.map(p => p.id));
    setWaiting(newRoots);
    setPosts(latest.filter(p => !held.has(p.id)));
  }, [latest]);

  const showWaiting = () => {
    if (latest) setPosts(latest);
    setWaiting([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Real like counts, in one request for the whole feed. Asking per post would
  // be a hundred round trips to render one column of numbers.
  const ids = useMemo(() => (latest ?? []).map(p => p.id).join(','), [latest]);
  useEffect(() => {
    if (!ids) return;
    fetch(`/api/ai/likes?ids=${ids.split(',').map(encodeURIComponent).join(',')}`)
      .then(r => r.json())
      .then((l: { likes?: Record<string, number> }) => setLikes(l.likes ?? {}))
      .catch(() => {});
  }, [ids]);

  /**
   * The timeline is top level posts only; replies hang off the post they
   * answer. They are stored as ordinary posts so they inherit retention,
   * deletion and likes, which means the split has to happen here.
   */
  const { roots, repliesByParent } = useMemo(() => {
    const all = posts ?? [];
    const byParent = new Map<string, FeedPost[]>();
    for (const p of all) {
      if (!p.replyTo) continue;
      byParent.set(p.replyTo, [...(byParent.get(p.replyTo) ?? []), p]);
    }
    // Oldest first inside a thread, so an exchange reads in the order it
    // happened rather than backwards.
    for (const list of byParent.values()) {
      list.sort((a, b) => visibleAt(a) - visibleAt(b));
    }
    return { roots: all.filter(p => !p.replyTo), repliesByParent: byParent };
  }, [posts]);

  const shown = useMemo(() => roots.slice(0, shownCount), [roots, shownCount]);
  const hasMore = roots.length > shownCount;

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
      <AnimatePresence>
        {waiting.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            onClick={showWaiting}
            className="fixed left-1/2 z-40 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-primary py-2 pl-2 pr-4 text-[13px] font-semibold text-primary-foreground shadow-[var(--elev-3)]"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 84px)' }}
          >
            <span className="flex -space-x-2">
              {waiting.slice(0, 3).map(p => (
                <span key={p.id} className="h-6 w-6 overflow-hidden rounded-full bg-card ring-2 ring-primary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.personaAvatar && <img src={p.personaAvatar} alt="" className="h-full w-full object-cover" />}
                </span>
              ))}
            </span>
            {waiting.length} new post{waiting.length === 1 ? '' : 's'}
            <ArrowUp className="h-3.5 w-3.5" />
          </motion.button>
        )}
      </AnimatePresence>

      <div className="-mx-4 border-t border-border sm:-mx-6 lg:-mx-8">
        {/* A writer about to post, at the top where their post will land. */}
        <AnimatePresence initial={false}>
          {typing.find(t => !t.replyTo) && (
            <div key="typing" className="px-0 sm:px-2 lg:px-4">
              <TypingRow t={typing.find(t => !t.replyTo)!} />
            </div>
          )}
        </AnimatePresence>
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
                replies={repliesByParent.get(p.id)}
                fresh={fresh.has(p.id)}
                typing={typing.filter(t => t.replyTo === p.id)}
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
