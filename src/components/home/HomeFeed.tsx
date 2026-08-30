'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A way into the feed from the home page.
 *
 * Deliberately a signpost rather than the feed itself. Rendering real post
 * cards here made the section 1300px tall and pushed the rest of the home page
 * two screens down, which is a worse home page in exchange for content that
 * already has its own destination. This is three lines and a link: enough to
 * show the desk is active and what it is talking about, and one tap to read it.
 */
const PREVIEW = 3;

interface Peek {
  id: string;
  personaName: string;
  personaAvatar?: string;
  personaAccent: string;
  content: { headline?: string; text?: string; verdict?: string };
  createdAt: string;
}

function line(p: Peek): string {
  return (p.content?.headline || p.content?.text || p.content?.verdict || '')
    .replace(/\s+/g, ' ').trim();
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

export default function HomeFeed() {
  const [posts, setPosts] = useState<Peek[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ai/posts?limit=${PREVIEW}`)
      .then(r => r.json())
      .then((d: { posts?: Peek[] }) => {
        if (!cancelled) setPosts((d.posts ?? []).slice(0, PREVIEW));
      })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, []);

  // Nothing filed yet needs no placeholder on the home page.
  if (posts && !posts.length) return null;

  return (
    <section className="lp-glass overflow-hidden rounded-xl border">
      <Link
        href="/desk"
        className="flex items-center gap-2 border-b border-border px-4 py-3 transition-colors hover:bg-muted/30"
      >
        <MessageCircle className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          The Feed
        </h2>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
          Open
          <ArrowRight className="h-3 w-3" />
        </span>
      </Link>

      {posts === null ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: PREVIEW }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="lp-skeleton h-7 w-7 shrink-0 rounded-full" />
              <div className="lp-skeleton h-3 flex-1 rounded" />
            </div>
          ))}
        </div>
      ) : (
        posts.map(p => (
          <Link
            key={p.id}
            href={`/desk/${encodeURIComponent(p.id)}`}
            className="flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-muted/30"
          >
            <span className={cn(
              'relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden',
              'rounded-full border border-border bg-card text-[9px] font-bold',
              p.personaAccent,
            )}>
              {p.personaName.split(' ').map(w => w[0]).slice(0, 2).join('')}
              {p.personaAvatar && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p.personaAvatar} alt="" loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover" />
              )}
            </span>

            {/* One line, clipped. A second line of preview here is a second
                line of every row, and this section is meant to stay small. */}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-snug text-foreground">
                {line(p)}
              </span>
              <span className={cn('block truncate text-[11px]', p.personaAccent)}>
                {p.personaName}
              </span>
            </span>

            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {ago(p.createdAt)}
            </span>
          </Link>
        ))
      )}
    </section>
  );
}
