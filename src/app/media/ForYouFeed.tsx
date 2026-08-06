'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import MediaDetailModal from './MediaDetailModal';
import InfiniteScrollSentinel from './InfiniteScrollSentinel';
import { ArticleIcon, InjuryIcon, TrendingIcon, TrendingDownIcon } from '@/components/icons/MediaIcons';
import type { FeedItem } from '@/lib/mediaSources';

const PAGE_SIZE = 20;

const KIND_LABEL: Record<FeedItem['kind'], string> = {
  article: 'News',
  injury: 'Injury',
  trending: 'Added',
};

const KIND_DOT: Record<FeedItem['kind'], string> = {
  article: 'bg-primary',
  injury: 'bg-rose-500',
  trending: 'bg-emerald-500',
};

const KIND_ICON: Record<FeedItem['kind'], typeof ArticleIcon> = {
  article: ArticleIcon,
  injury: InjuryIcon,
  trending: TrendingIcon,
};

const KIND_TEXT: Record<FeedItem['kind'], string> = {
  article: 'text-primary',
  injury: 'text-rose-500',
  trending: 'text-emerald-500',
};

/** Gradient used for the thumbnail slot when an item has no image, so those
 *  cards still fill a 16:9 tile instead of leaving a hole in the grid. */
const KIND_PANEL: Record<FeedItem['kind'], string> = {
  article: 'bg-primary/10 text-primary',
  injury: 'bg-rose-500/10 text-rose-500',
  trending: 'bg-emerald-500/10 text-emerald-500',
};

// Waiver drops are the one case where `kind` alone doesn't determine the
// styling — adds trend green/up, drops trend rose/down.
function displayFor(item: FeedItem) {
  if (item.kind === 'trending' && item.trendType === 'drop') {
    return {
      label: 'Dropped',
      dot: 'bg-rose-500',
      text: 'text-rose-500',
      panel: 'bg-rose-500/10 text-rose-500',
      Icon: TrendingDownIcon,
      showBadge: true,
    };
  }
  return {
    label: KIND_LABEL[item.kind],
    dot: KIND_DOT[item.kind],
    text: KIND_TEXT[item.kind],
    panel: KIND_PANEL[item.kind],
    Icon: KIND_ICON[item.kind],
    // Articles are the overwhelming majority of the feed, so a "News" badge
    // on nearly every card is noise. Injuries and waiver moves keep theirs,
    // where the label is the thing that distinguishes them.
    showBadge: item.kind !== 'article',
  };
}

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
  const { label, dot, text, panel, showBadge, Icon: KindIcon } = displayFor(item);

  return (
    <motion.button
      onClick={() => onOpen(item)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index % PAGE_SIZE, 10) * 0.03 }}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/40"
    >
      {/* Thumbnail — fixed 16:9 so every tile lines up on the row baseline */}
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className={cn('flex h-full w-full items-center justify-center ', panel)}>
            <KindIcon className="h-9 w-9 opacity-80 transition-transform duration-500 group-hover:scale-110" />
          </div>
        )}

        {/* Badges float over the media, so they need their own contrast
            rather than the tint that worked on a flat card. */}
        {showBadge && (
        <span className={cn(
          'absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[9px] font-bold uppercase tracking-widest backdrop-blur-md',
          text,
        )}>
          <span className={cn('h-1 w-1 rounded-full', dot)} />
          {label}
        </span>
        )}

        {item.status && (
          <span className={cn(
            'absolute right-2.5 top-2.5 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest backdrop-blur-md',
            STATUS_COLOR[item.status] || 'text-muted-foreground bg-muted border-border',
          )}>
            {item.status}
          </span>
        )}
      </div>

      {/* Body — the subtitle is dropped on the narrowest screens so two
          tiles per row stay short enough to scan. */}
      <div className="flex flex-1 flex-col p-2.5 sm:p-3.5">
        <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-sm">
          {item.title}
        </h3>

        {item.subtitle && (
          <p className="mt-1.5 hidden line-clamp-2 text-xs leading-snug text-muted-foreground sm:block">
            {item.subtitle}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1.5 pt-2.5 text-[10px] text-muted-foreground sm:pt-3">
          <span className="truncate">{item.source}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{timeAgo(item.publishedAt)}</span>
          {item.count !== undefined && (
            <>
              <span className="hidden shrink-0 sm:inline">·</span>
              <span className="hidden shrink-0 sm:inline">{item.count.toLocaleString()} rosters</span>
            </>
          )}
        </div>
      </div>
    </motion.button>
  );
}

/** Compact horizontal row — the denser alternative to the tile grid. */
function FeedRow({ item, index, onOpen }: { item: FeedItem; index: number; onOpen: (item: FeedItem) => void }) {
  const { label, dot, panel, showBadge, Icon: KindIcon } = displayFor(item);

  return (
    <motion.button
      onClick={() => onOpen(item)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index % PAGE_SIZE, 10) * 0.03 }}
      className="group block w-full rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/40"
    >
      <div className="flex gap-3 p-3 sm:p-4">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover sm:h-20 sm:w-20"
          />
        ) : (
          <div className={cn(
            'flex h-16 w-16 shrink-0 items-center justify-center rounded-lg sm:h-20 sm:w-20',
            panel,
          )}>
            <KindIcon className="h-7 w-7 opacity-80" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {(showBadge || item.status) && (
          <div className="mb-1 flex items-center gap-2">
            {showBadge && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
            {showBadge && <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>}
            {item.status && (
              <span className={cn(
                'rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest',
                STATUS_COLOR[item.status] || 'border-border bg-muted text-muted-foreground',
              )}>
                {item.status}
              </span>
            )}
          </div>
          )}

          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {item.title}
          </h3>

          {item.subtitle && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.subtitle}</p>
          )}

          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="truncate">{item.source}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{timeAgo(item.publishedAt)}</span>
            {item.count !== undefined && (
              <>
                <span className="shrink-0">·</span>
                <span className="shrink-0">{item.count.toLocaleString()} rosters</span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export default function ForYouFeed({
  teamId, kinds, trend, layout = 'grid',
}: { teamId?: string; kinds?: string; trend?: 'add' | 'drop'; layout?: 'grid' | 'list' }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<FeedItem | null>(null);

  // Offset lives in a ref so the scroll observer never reads a stale
  // items.length from an old closure. `gen` invalidates in-flight pages when
  // the filter changes, so a slow request can't append results from the
  // previous team/tab after the list has already been reset.
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const genRef = useRef(0);

  const loadPage = useCallback((offset: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
    if (teamId) params.set('team', teamId);
    if (kinds) params.set('kinds', kinds);
    if (trend) params.set('trend', trend);
    return fetch(`/api/media/feed?${params}`).then(res => res.json());
  }, [teamId, kinds, trend]);

  useEffect(() => {
    const gen = ++genRef.current;
    setLoading(true);
    offsetRef.current = 0;
    loadPage(0)
      .then(data => {
        if (genRef.current !== gen) return;
        const feed: FeedItem[] = data.feed || [];
        setItems(feed);
        offsetRef.current = feed.length;
        setHasMore(!!data.hasMore && feed.length > 0);
      })
      .catch(() => {})
      .finally(() => { if (genRef.current === gen) setLoading(false); });
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const gen = genRef.current;
    setLoadingMore(true);
    loadPage(offsetRef.current)
      .then(data => {
        if (genRef.current !== gen) return;
        const feed: FeedItem[] = data.feed || [];
        setItems(prev => [...prev, ...feed]);
        offsetRef.current += feed.length;
        // An empty page that still claimed hasMore would loop forever.
        setHasMore(!!data.hasMore && feed.length > 0);
      })
      .catch(() => { if (genRef.current === gen) setHasMore(false); })
      .finally(() => {
        loadingRef.current = false;
        if (genRef.current === gen) setLoadingMore(false);
      });
  }, [loadPage]);

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
    <div>
      {layout === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item, i) => (
            <FeedCard key={item.id} item={item} index={i} onOpen={setSelected} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <FeedRow key={item.id} item={item} index={i} onOpen={setSelected} />
          ))}
        </div>
      )}

      {/* Outside the grid so it spans the full width rather than taking a cell */}
      <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />

      <MediaDetailModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
