'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FeedPostCard, type FeedPost } from '@/components/desk/FeedPostCard';

/**
 * A personality's posts on their profile, as The Feed shows them (FeedPostCard), newest first. A
 * reply says who it answered and links to that post, since it's here without its thread.
 */
export default function ProfilePosts({ posts, likes, leagueName }: { posts: FeedPost[]; likes: Record<string, number>; leagueName: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      {posts.map((p, i) => (
        <div key={p.id}>
          {p.replyTo && (
            <Link href={`/desk/${encodeURIComponent(p.replyTo)}`} className="block px-4 pt-3 text-[12px] font-medium text-muted-foreground hover:text-foreground">
              Replying to {p.replyToName ?? 'a post'}
            </Link>
          )}
          <FeedPostCard post={p} index={i} open={open === p.id} onToggle={() => setOpen(o => (o === p.id ? null : p.id))}
            realLikes={likes[p.id]} leagueName={leagueName} inset="card" />
        </div>
      ))}
    </div>
  );
}
