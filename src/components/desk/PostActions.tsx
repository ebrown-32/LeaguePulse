'use client';

import { useCallback, useEffect, useState } from 'react';
import { Heart, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { compactCount, engagementFor } from '@/lib/ai/engagement';
import SharePost from './SharePost';
import type { ShareablePost } from '@/lib/shareablePost';

/**
 * The action row under a post: like, reposts, share.
 *
 * Whether this viewer has liked something lives in local storage rather than
 * on the server, because there is no sign in and therefore no identity to
 * attach it to. The total is a shared counter; which posts *you* liked is a
 * fact about your device.
 */
const LIKED_KEY = 'lp_liked_posts';

function readLiked(): Set<string> {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    return new Set(raw ? JSON.parse(raw) as string[] : []);
  } catch {
    // Private windows and blocked site data both throw here. A viewer who
    // cannot store anything can still read the feed and still tap a heart.
    return new Set();
  }
}

function writeLiked(ids: Set<string>) {
  try { localStorage.setItem(LIKED_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

export default function PostActions({
  post, realLikes = 0, leagueName,
}: {
  post: ShareablePost & { createdAt: string };
  /** Likes from real readers, added to the ambient count. */
  realLikes?: number;
  leagueName?: string | null;
}) {
  const ambient = engagementFor(post);
  const [liked, setLiked] = useState(false);
  // Local delta, so the number moves the instant it is tapped rather than
  // after a round trip.
  const [delta, setDelta] = useState(0);

  useEffect(() => { setLiked(readLiked().has(post.id)); }, [post.id]);

  const toggle = useCallback(() => {
    const next = !liked;
    setLiked(next);
    setDelta(d => d + (next ? 1 : -1));

    const ids = readLiked();
    if (next) ids.add(post.id); else ids.delete(post.id);
    writeLiked(ids);

    if (navigator.vibrate) navigator.vibrate(next ? 12 : 6);

    // Fire and forget. The count on screen is already right, and a failed
    // write should not yank the heart back out from under a tap.
    fetch('/api/ai/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, liked: next }),
    }).catch(() => {});
  }, [liked, post.id]);

  const likes = Math.max(0, ambient.likes + realLikes + delta);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={liked}
        aria-label={liked ? 'Unlike this post' : 'Like this post'}
        className={cn(
          'group inline-flex min-h-[44px] items-center gap-1.5 rounded-lg -ml-2 px-2',
          'text-[12px] font-medium transition-colors',
          liked ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500',
        )}
      >
        <Heart
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform',
            liked && 'fill-current scale-110',
          )}
        />
        <span className="tabular-nums">{compactCount(likes)}</span>
      </button>

      {/* Reposts are ambient only: there is nothing for a reader to repost to,
          so offering the control would be a button that does nothing. */}
      <span
        className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-[12px] text-muted-foreground"
        aria-label={`${ambient.reposts} reposts`}
      >
        <Repeat2 className="h-3.5 w-3.5 shrink-0" />
        <span className="tabular-nums">{compactCount(ambient.reposts)}</span>
      </span>

      <SharePost post={post} leagueName={leagueName} />
    </div>
  );
}
