'use client';

import { useState } from 'react';
import { FeedPostCard, type FeedPost } from '@/components/desk/FeedPostCard';

/**
 * A permalinked post.
 *
 * Long pieces open expanded here. In the timeline they collapse so a column
 * does not bury the posts around it, but someone who followed a link to this
 * exact post came for the whole thing, and making them tap again to see it
 * would be a strange greeting.
 */
export default function SinglePostView({
  post, realLikes, leagueName,
}: {
  post: FeedPost;
  realLikes?: number;
  leagueName?: string | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <FeedPostCard
      post={post}
      open={open}
      onToggle={() => setOpen(o => !o)}
      realLikes={realLikes}
      leagueName={leagueName}
    />
  );
}
