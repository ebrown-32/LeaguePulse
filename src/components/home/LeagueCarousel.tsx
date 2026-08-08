'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Home-page carousel of live league content: AI desk posts and the media feed,
 * interleaved so neither stream dominates.
 *
 * Built on native scroll-snap rather than a transform-driven slider, so touch
 * swipe, trackpad flick, and keyboard scrolling all work for free and the
 * arrows are just conveniences on top. Autoplay advances the snap position and
 * yields to the reader the moment they interact.
 */

interface CarouselItem {
  id: string;
  /** Attribution: a persona handle or a publication name. */
  label: string;
  title: string;
  imageUrl?: string;
  href: string;
  external: boolean;
  /** AI desk items are badged so they are never mistaken for real reporting. */
  isAI: boolean;
}

interface AIPost {
  id: string;
  personaHandle: string;
  kind: string;
  content: { headline?: string; text?: string };
}

interface MediaItem {
  id: string;
  title: string;
  source: string;
  url?: string;
  imageUrl?: string;
}

const MAX_PER_SOURCE = 8;
const AUTOPLAY_MS = 5000;

/** Alternate the two streams so one never clumps into a long run. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/** Autoplay is motion; respect the admin toggle and the OS preference alike. */
function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'reduced') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function LeagueCarousel({ className }: { className?: string }) {
  const [items, setItems] = useState<CarouselItem[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const ai = fetch(`/api/ai/posts?limit=${MAX_PER_SOURCE}`)
      .then(r => r.json())
      .then(d => (d.posts ?? []) as AIPost[])
      .catch(() => [] as AIPost[]);

    const media = fetch(`/api/media/feed?limit=${MAX_PER_SOURCE}&kinds=article,injury`)
      .then(r => r.json())
      .then(d => (d.feed ?? []) as MediaItem[])
      .catch(() => [] as MediaItem[]);

    Promise.all([ai, media]).then(([posts, feed]) => {
      if (cancelled) return;

      const aiItems: CarouselItem[] = posts
        .map(p => ({
          id: `ai-${p.id}`,
          label: p.personaHandle,
          title: p.content?.headline || p.content?.text || '',
          href: '/media?tab=desk',
          external: false,
          isAI: true,
        }))
        .filter(i => i.title);

      const mediaItems: CarouselItem[] = feed
        .map(m => ({
          id: `media-${m.id}`,
          label: m.source,
          title: m.title,
          imageUrl: m.imageUrl,
          href: m.url || '/media',
          external: Boolean(m.url),
          isAI: false,
        }))
        .filter(i => i.title);

      setItems(interleave(aiItems, mediaItems));
    });

    return () => { cancelled = true; };
  }, []);

  /** Scroll so that card `i` snaps to the left edge. */
  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[i] as HTMLElement | undefined;
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  }, []);

  // Keep the dots honest when the user swipes or flicks rather than using the
  // arrows: derive the active card from actual scroll position.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const kids = Array.from(track.children) as HTMLElement[];
        const left = track.scrollLeft + track.offsetLeft;
        let best = 0, bestGap = Infinity;
        kids.forEach((el, i) => {
          const gap = Math.abs(el.offsetLeft - left);
          if (gap < bestGap) { bestGap = gap; best = i; }
        });
        setIndex(best);
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => { track.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [items.length]);

  // Autoplay. Stops while hovered, focused, or touched, and never starts at all
  // when motion is turned down.
  useEffect(() => {
    if (paused || items.length < 2 || !motionAllowed()) return;
    const t = setInterval(() => {
      const track = trackRef.current;
      if (!track) return;
      // Wrap once the last card is fully in view rather than at the last index,
      // since several cards are visible at once on wider screens.
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      goTo(atEnd ? 0 : index + 1);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused, index, items.length, goTo]);

  if (items.length < 2) return null;

  return (
    <section
      className={cn('relative', className)}
      aria-label="League feed"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Around the league
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => goTo(Math.max(0, index - 1))}
            disabled={index === 0}
            aria-label="Previous"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => goTo(Math.min(items.length - 1, index + 1))}
            disabled={index >= items.length - 1}
            aria-label="Next"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth"
      >
        {items.map((item, i) => {
          const inner = (
            <>
              {item.imageUrl ? (
                <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                  <span className="font-display text-2xl font-bold text-muted-foreground/30">
                    {item.isAI ? 'AI' : item.label.slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}

              <div className="mt-3 flex items-center gap-1.5">
                <span
                  className={cn(
                    'truncate text-[10px] font-bold uppercase tracking-widest',
                    item.isAI ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
                {item.isAI && (
                  <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-primary">
                    AI
                  </span>
                )}
              </div>

              <p className="mt-1 line-clamp-3 text-xs leading-snug text-foreground transition-colors group-hover:text-primary">
                {item.title}
              </p>
            </>
          );

          const cls = 'group flex h-full flex-col rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40';

          return (
            <div
              key={item.id}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${items.length}`}
              className="w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]"
            >
              {item.external ? (
                <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
              ) : (
                <Link href={item.href} className={cls}>{inner}</Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Dots double as position readout and jump targets. */}
      <div className="mt-3 flex justify-center gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index || undefined}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === index ? 'w-5 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground/40',
            )}
          />
        ))}
      </div>
    </section>
  );
}
