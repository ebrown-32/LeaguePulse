'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CloseIcon, ExternalLinkIcon, ShareIcon } from '@/components/icons/MediaIcons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { FeedItem } from '@/lib/mediaSources';

const STATUS_COLOR: Record<string, string> = {
  Out: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  'Injured Reserve': 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  Doubtful: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  Questionable: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  Active: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
};

interface ExtractedArticle {
  available: boolean;
  title?: string;
  byline?: string;
  content?: string;
}

/**
 * Everything opens in-app, never a new tab. For news items this also pulls
 * the real article body (via /api/media/article-content) so reading doesn't
 * require leaving the app at all — when extraction isn't possible for a
 * given source, it quietly falls back to the headline/summary we already
 * have rather than showing an error.
 */
export default function MediaDetailModal({ item, onClose }: { item: FeedItem | null; onClose: () => void }) {
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [fullArticle, setFullArticle] = useState<ExtractedArticle | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  useEffect(() => {
    setShareFeedback(null);
    setFullArticle(null);

    if (!item || item.kind !== 'article' || !item.url) return;

    let cancelled = false;
    setLoadingFull(true);
    fetch(`/api/media/article-content?url=${encodeURIComponent(item.url)}`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setFullArticle(data); })
      .catch(() => { if (!cancelled) setFullArticle({ available: false }); })
      .finally(() => !cancelled && setLoadingFull(false));

    return () => { cancelled = true; };
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  // Prefers the native OS share sheet (mobile browsers, some desktop ones) —
  // still entirely in-app, just handing off to the system rather than the
  // browser. Where that API isn't available at all, falls back to copying
  // whatever we have — this is the only "give me the link" action, a
  // separate copy-link button would just duplicate this fallback.
  const shareItem = async () => {
    if (!item) return;
    const shareData: ShareData = { title: item.title };
    if (item.subtitle) shareData.text = item.subtitle;
    if (item.url) shareData.url = item.url;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
      } catch {
        // User backed out of the share sheet — nothing to do.
      }
      return;
    }

    const fallbackText = item.url || `${item.title}${item.subtitle ? `\n${item.subtitle}` : ''}`;
    navigator.clipboard.writeText(fallbackText).then(() => {
      setShareFeedback('Link copied');
      setTimeout(() => setShareFeedback(null), 1800);
    });
  };

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative w-full sm:max-w-xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 border border-border text-muted-foreground hover:text-foreground backdrop-blur-md"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            {item.imageUrl && (
              <img src={item.imageUrl} alt="" className="h-48 w-full object-cover rounded-t-2xl sm:rounded-t-2xl" />
            )}

            <div className="p-6">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {item.source}
                </span>
                {item.status && (
                  <span className={cn('text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border', STATUS_COLOR[item.status] || 'text-muted-foreground bg-muted border-border')}>
                    {item.status}
                  </span>
                )}
              </div>

              <h2 className="text-xl font-bold text-foreground leading-snug mb-3">{item.title}</h2>

              {item.subtitle && (
                <p className="text-sm text-muted-foreground leading-relaxed">{item.subtitle}</p>
              )}

              {item.count !== undefined && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Added on {item.count.toLocaleString()} rosters in the last 24 hours.
                </p>
              )}

              {loadingFull && (
                <div className="flex items-center gap-2 mt-5 text-xs text-muted-foreground">
                  <LoadingSpinner className="h-3.5 w-3.5" />
                  Loading full article…
                </div>
              )}

              {fullArticle?.available && fullArticle.content && (
                <div className="mt-5 pt-5 border-t border-border">
                  {fullArticle.byline && (
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">{fullArticle.byline}</p>
                  )}
                  <div className="media-prose" dangerouslySetInnerHTML={{ __html: fullArticle.content }} />
                </div>
              )}

              {/* We couldn't pull the full text in-app for this one — rather than
                  leave the user with just the summary, hand them a direct way out
                  to read it at the source instead. */}
              {fullArticle && !fullArticle.available && item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex items-center justify-center gap-2 w-full rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-colors px-4 py-2.5 text-sm font-medium"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                  Read full article on {item.source}
                </a>
              )}

              <button
                onClick={shareItem}
                className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ShareIcon className="h-3.5 w-3.5" />
                {shareFeedback || 'Share'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
