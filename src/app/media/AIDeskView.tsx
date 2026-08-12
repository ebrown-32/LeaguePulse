'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface FeedPost {
  id: string;
  personaName: string;
  personaHandle: string;
  personaAccent: string;
  personaAvatar?: string;
  kind: 'article' | 'tweet' | 'comment' | 'tradeGrade';
  content: any;
  createdAt: string;
}

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

/** Machine-written, always labelled — it must never read as real reporting. */
function AiBadge() {
  return (
    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
      AI
    </span>
  );
}

function PostCard({ post, index }: { post: FeedPost; index: number }) {
  const { content, kind } = post;
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="flex gap-3 border-b border-border px-1 py-4 last:border-0"
    >
      {/* DiceBear portrait, with initials behind it so a blocked or slow
          request still leaves a readable byline. */}
      <span className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card text-[11px] font-bold',
        post.personaAccent,
      )}>
        {post.personaName.split(' ').map(w => w[0]).slice(0, 2).join('')}
        {post.personaAvatar && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={post.personaAvatar}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn('text-sm font-semibold', post.personaAccent)}>{post.personaName}</span>
          <span className="text-[13px] text-muted-foreground">{post.personaHandle}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-[13px] text-muted-foreground">{timeAgo(post.createdAt)}</span>
          <AiBadge />
        </div>

        {kind === 'tweet' && (
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{content.text}</p>
        )}

        {kind === 'article' && (
          <div className="mt-1.5">
            {/* Articles get a hero thumbnail: the author's own portrait on an
                accent wash, so a long-form piece reads differently from a
                one-line take in the same column. */}
            {post.personaAvatar && (
              <div className="mb-2.5 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/10 to-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.personaAvatar}
                  alt={`${post.personaName} portrait`}
                  loading="lazy"
                  className="h-24 w-24 rounded-full border border-border bg-card object-cover shadow-sm"
                />
              </div>
            )}
            <h3 className="font-display text-base font-bold leading-snug text-foreground">{content.headline}</h3>
            {content.standfirst && (
              <p className="mt-0.5 text-sm text-muted-foreground">{content.standfirst}</p>
            )}
            <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-foreground/90">
              {String(content.body || '').split(/\n{2,}/).map((p: string, i: number) => <p key={i}>{p}</p>)}
            </div>
          </div>
        )}

        {kind === 'tradeGrade' && (
          <div className="mt-1.5">
            <p className="text-[15px] text-foreground">{content.verdict}</p>
            <div className="mt-2 space-y-1.5">
              {content.sides?.map((s: any) => (
                <div key={s.teamName} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="font-display text-lg font-bold text-primary">{s.grade}</span>
                  <span className="min-w-0 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{s.teamName}</span>, {s.reasoning}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}

export default function AIDeskView() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/ai/posts?limit=40')
        .then(r => r.json())
        .then(d => { if (!cancelled) setPosts(d.posts ?? []); })
        .catch(() => { if (!cancelled) setPosts([]); });
    load();
    // The desk posts on its own schedule, so refresh occasionally rather than
    // making the reader reload to see new material.
    const t = setInterval(load, 120_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (posts === null) {
    return <div className="flex justify-center py-16"><LoadingSpinner className="h-7 w-7" /></div>;
  }

  if (!posts.length) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-foreground">The desk hasn&apos;t filed anything yet.</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          The personalities post on their own schedule. New pieces will appear here as they write them.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {posts.map((p, i) => <PostCard key={p.id} post={p} index={i} />)}
    </div>
  );
}
