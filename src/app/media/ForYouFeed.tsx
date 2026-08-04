'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import MediaDetailModal from './MediaDetailModal';
import type { FeedItem } from '@/lib/mediaSources';

const PAGE_SIZE = 20;

const KIND_LABEL: Record<FeedItem['kind'], string> = {
  article: 'News',
  injury: 'Injury',
  trending: 'Waiver Wire',
};

const KIND_DOT: Record<FeedItem['kind'], string> = {
  article: 'bg-primary',
  injury: 'bg-rose-500',
  trending: 'bg-emerald-500',
};

const STATUS_COLOR: Record<string, string> = {
  Out: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  'Injured Reserve': 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  Doubtful: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  Questionable: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  Active: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function FeedCard({ item, index, onOpen }: { item: FeedItem; index: number; onOpen: (item: FeedItem) => void }) {
  return (
    <motion.button
      onClick={() => onOpen(item)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 10) * 0.03 }}
      className="block w-full text-left rounded-xl border border-border bg-card transition-colors hover:bg-accent/30"
    >
      <div className="flex gap-3 p-4">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg object-cover border border-border"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <span className={cn('h-2 w-2 rounded-full', KIND_DOT[item.kind])} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', KIND_DOT[item.kind])} />
            <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              {KIND_LABEL[item.kind]}
            </span>
            {item.status && (
              <span className={cn('text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border', STATUS_COLOR[item.status] || 'text-muted-foreground bg-muted border-border')}>
                {item.status}
              </span>
            )}
          </div>

          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {item.title}
          </h3>

          {item.subtitle && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.subtitle}</p>
          )}

          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{item.source}</span>
            <span>·</span>
            <span>{timeAgo(item.publishedAt)}</span>
            {item.count !== undefined && (
              <>
                <span>·</span>
                <span>{item.count.toLocaleString()} rosters</span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export default function ForYouFeed({ teamId }: { teamId?: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<FeedItem | null>(null);

  const loadPage = (offset: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
    if (teamId) params.set('team', teamId);
    return fetch(`/api/media/feed?${params}`).then(res => res.json());
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPage(0)
      .then(data => {
        if (cancelled) return;
        setItems(data.feed || []);
        setHasMore(!!data.hasMore);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [teamId]);

  const showMore = () => {
    setLoadingMore(true);
    loadPage(items.length)
      .then(data => {
        setItems(prev => [...prev, ...(data.feed || [])]);
        setHasMore(!!data.hasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="text-center py-16 px-4 text-muted-foreground text-sm">
        {teamId ? "Nothing mentioning this team's roster right now. Try again soon." : 'Nothing to show right now. Check back soon.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <FeedCard key={item.id} item={item} index={i} onOpen={setSelected} />
      ))}

      {hasMore && (
        <div className="text-center pt-3">
          <button
            onClick={showMore}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-lg border border-border bg-card hover:bg-accent/30 disabled:opacity-50 transition-colors text-sm font-medium text-foreground"
          >
            {loadingMore ? 'Loading...' : 'Show more'}
          </button>
        </div>
      )}

      <MediaDetailModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
