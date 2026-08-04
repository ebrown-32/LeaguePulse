'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { ChevronIcon, HeartIcon, ArticleIcon, ShareIcon, InjuryIcon, TrendingIcon } from '@/components/icons/MediaIcons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import MediaDetailModal from './MediaDetailModal';
import type { FeedItem } from '@/lib/mediaSources';

const STATUS_COLOR: Record<string, string> = {
  Out: 'text-rose-400 bg-rose-500/10 border-rose-400/20',
  'Injured Reserve': 'text-rose-400 bg-rose-500/10 border-rose-400/20',
  Doubtful: 'text-amber-400 bg-amber-500/10 border-amber-400/20',
  Questionable: 'text-amber-400 bg-amber-500/10 border-amber-400/20',
  Active: 'text-emerald-400 bg-emerald-500/10 border-emerald-400/20',
};

export default function NewsView({ teamId }: { teamId?: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [dominantColor, setDominantColor] = useState('26, 26, 46');
  const [secondaryColor, setSecondaryColor] = useState('15, 67, 146');
  const [showTooltip, setShowTooltip] = useState(true);
  const [copied, setCopied] = useState(false);
  const [detailItem, setDetailItem] = useState<FeedItem | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = (offset: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: '40' });
    if (teamId) params.set('team', teamId);
    return fetch(`/api/media/feed?${params}`).then(res => res.json());
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCurrentIndex(0);
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

  // Fetch the next page as the user approaches the end of what's loaded, so
  // swiping through feels continuous instead of hitting a wall.
  useEffect(() => {
    if (!hasMore || loadingMore || !items.length) return;
    if (currentIndex < items.length - 5) return;

    setLoadingMore(true);
    loadPage(items.length)
      .then(data => {
        setItems(prev => [...prev, ...(data.feed || [])]);
        setHasMore(!!data.hasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [currentIndex, items.length, hasMore, loadingMore]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          paginate(-1);
          break;
        case 'ArrowDown':
          paginate(1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length]);

  // Extract a mood color from the current card's image to theme the backdrop
  useEffect(() => {
    const extractColorsFromCurrentImage = async () => {
      if (!items.length || !items[currentIndex]?.imageUrl) return;

      const imageUrl = items[currentIndex].imageUrl!;
      try {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0, g = 0, b = 0, count = 0;

        for (let i = 0; i < imageData.length; i += 16) {
          r += imageData[i];
          g += imageData[i + 1];
          b += imageData[i + 2];
          count++;
        }

        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        setDominantColor(`${Math.floor(r * 0.35)}, ${Math.floor(g * 0.35)}, ${Math.floor(b * 0.35)}`);
        setSecondaryColor(`${Math.floor(r * 0.12)}, ${Math.floor(g * 0.12)}, ${Math.floor(b * 0.12)}`);
      } catch {
        // Cross-origin images can fail to sample; the default gradient stands in.
      }
    };

    extractColorsFromCurrentImage();
  }, [items, currentIndex]);

  const paginate = (direction: number) => {
    setCurrentIndex((prevIndex) => {
      let nextIndex = prevIndex + direction;
      if (nextIndex < 0) nextIndex = items.length - 1;
      if (nextIndex >= items.length) nextIndex = 0;
      return nextIndex;
    });
    setShowFullDescription(false);
    setCopied(false);
  };

  const toggleLike = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLiked(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Native OS share sheet where supported (still in-app, just handing off to
  // the system); falls back to a clipboard copy otherwise — no separate
  // copy-link button, since that would just duplicate this fallback.
  const shareItem = async (item: FeedItem, e: React.MouseEvent) => {
    e.stopPropagation();
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
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => setShowTooltip(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!items.length) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center text-muted-foreground text-sm px-4 text-center">
        {teamId ? "Nothing mentioning this team's roster right now." : 'Nothing to show right now.'}
      </div>
    );
  }

  const item = items[currentIndex];
  const isLiked = liked.has(currentIndex);

  return (
    <div
      className="relative h-[calc(100vh-6rem)] w-full overflow-hidden transition-colors duration-700"
      style={{ background: `linear-gradient(160deg, rgb(${dominantColor}), rgb(${secondaryColor}))` }}
    >
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-6 py-3 rounded-full
              bg-black/50 shadow-xl border border-white/10 text-white text-sm font-medium backdrop-blur-md"
          >
            Swipe or use arrow keys to browse
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 200 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -200 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative h-full w-full max-w-5xl mx-auto"
          style={{ touchAction: 'none' }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.3}
          onDragEnd={(_, info) => {
            if (info.offset.y < -80) paginate(1);
            else if (info.offset.y > 80) paginate(-1);
          }}
        >
          {/* Navigation Indicators (desktop only — mobile relies on swipe/tap) */}
          <div className="hidden md:flex absolute md:-left-16 top-1/2 -translate-y-1/2 flex-col items-center space-y-4 z-20">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors border border-white/10 shadow-lg"
              onClick={() => paginate(-1)}
              aria-label="Previous"
            >
              <ChevronIcon direction="up" className="w-6 h-6 text-white" />
            </motion.button>

            <div className="py-4 flex flex-col items-center space-y-2">
              {items.slice(Math.max(0, currentIndex - 2), Math.min(items.length, currentIndex + 3)).map((_, idx) => {
                const currentIdx = idx + Math.max(0, currentIndex - 2);
                return (
                  <div
                    key={currentIdx}
                    className={`w-1 h-6 rounded-full transition-all duration-300 shadow-lg ${
                      currentIdx === currentIndex ? 'bg-white scale-100' : 'bg-white/30 scale-75'
                    }`}
                  />
                );
              })}
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors border border-white/10 shadow-lg"
              onClick={() => paginate(1)}
              aria-label="Next"
            >
              <ChevronIcon direction="down" className="w-6 h-6 text-white" />
            </motion.button>
          </div>

          {/* Main Content */}
          <div className="relative h-full flex flex-col md:flex-row items-center justify-center p-4 md:p-8 gap-8">
            {/* Image / kind-icon Section */}
            <motion.div
              className="relative w-full md:w-2/3 h-[40vh] md:h-[70vh] rounded-3xl overflow-hidden shadow-2xl cursor-pointer group"
              onClick={() => paginate(1)}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.3 }}
            >
              {item.imageUrl ? (
                <>
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    className="object-cover"
                    priority
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/90" />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/5">
                  {item.kind === 'injury' && <InjuryIcon className="w-20 h-20 text-white/15" />}
                  {item.kind === 'trending' && <TrendingIcon className="w-20 h-20 text-white/15" />}
                  {item.kind === 'article' && <ArticleIcon className="w-20 h-20 text-white/15" />}
                </div>
              )}

              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex items-center justify-center backdrop-blur-sm">
                <span className="text-white text-lg font-medium px-6 py-3 rounded-full bg-white/10 border border-white/20 shadow-xl">
                  Click to see next
                </span>
              </div>
            </motion.div>

            {/* Content Section */}
            <div className="relative w-full md:w-1/3 mt-4 md:mt-0">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="backdrop-blur-xl bg-white/10 rounded-3xl p-6 border border-white/10 shadow-2xl text-white"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                    {item.source}
                  </span>
                  {item.status && (
                    <span className={cn('text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border', STATUS_COLOR[item.status] || 'text-white/60 bg-white/10 border-white/20')}>
                      {item.status}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
                  {item.title}
                </h2>
                <div
                  className={`text-white/70 text-sm md:text-base mb-4 cursor-pointer ${showFullDescription ? '' : 'line-clamp-3'}`}
                  onClick={() => setShowFullDescription(!showFullDescription)}
                >
                  {item.subtitle}
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-6 pt-4 border-t border-white/10">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => toggleLike(currentIndex, e)}
                    className="flex flex-col items-center"
                    aria-label={isLiked ? 'Unlike' : 'Like'}
                  >
                    <HeartIcon filled={isLiked} className={isLiked ? 'w-6 h-6 text-rose-400 drop-shadow-glow-red' : 'w-6 h-6 text-white'} />
                    <span className="text-xs mt-1">Like</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => shareItem(item, e)}
                    className="flex flex-col items-center text-white"
                    aria-label="Share"
                  >
                    <ShareIcon className="w-6 h-6" />
                    <span className="text-xs mt-1">{copied ? 'Copied' : 'Share'}</span>
                  </motion.button>

                  {item.kind === 'article' && item.url && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailItem(item);
                      }}
                      className="flex flex-col items-center text-white"
                      aria-label="Read full article"
                    >
                      <ArticleIcon className="w-6 h-6" />
                      <span className="text-xs mt-1">Read</span>
                    </motion.button>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <style jsx global>{`
        .drop-shadow-glow-red {
          filter: drop-shadow(0 0 8px rgba(244, 63, 94, 0.5));
        }
      `}</style>

      <MediaDetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}
