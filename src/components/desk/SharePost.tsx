'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shareText, shareTitle, type ShareablePost } from '@/lib/shareablePost';

/**
 * Share one post out of the app.
 *
 * Most of this league reads the feed on a phone, so the native share sheet is
 * the primary path: one tap, then Sleeper, iMessage or anything else already
 * installed, with no copying and no app switching. `navigator.share` only
 * exists in a secure context and mostly on mobile, so the desktop and
 * unsupported case falls back to the clipboard.
 *
 * Both paths produce the same plain text. Sleeper's chat has no rich text, so
 * an image or markup would arrive as an attachment or as literal asterisks.
 */
export default function SharePost({
  post, leagueName, className,
}: {
  post: ShareablePost;
  leagueName?: string | null;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'shared' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = useCallback((next: 'shared' | 'copied' | 'failed') => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2200);
  }, []);

  const onShare = useCallback(async () => {
    const text = shareText(post, {
      leagueName,
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    // The sheet gets the text and no separate url field. Passing both makes
    // several targets paste the link twice, and the text already ends with it.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shareTitle(post), text });
        flash('shared');
        return;
      } catch (err) {
        // Dismissing the sheet rejects with AbortError. That is a choice, not
        // a failure, so it must not fall through to copying something the
        // reader just decided against sharing.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      flash('copied');
    } catch {
      flash('failed');
    }
  }, [post, leagueName, flash]);

  const label =
    state === 'shared' ? 'Shared' :
    state === 'copied' ? 'Copied' :
    state === 'failed' ? 'Could not copy' : 'Share';

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={`Share ${post.personaName}'s post`}
      className={cn(
        // 44px tall so it is comfortably tappable, but visually light: the
        // control should not compete with the post it belongs to.
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 -ml-2',
        'text-[12px] font-medium transition-colors',
        'text-muted-foreground hover:text-primary active:text-primary',
        state === 'failed' ? 'text-rose-500' : state !== 'idle' && 'text-emerald-500',
        className,
      )}
    >
      {state === 'shared' || state === 'copied'
        ? <Check className="h-3.5 w-3.5 shrink-0" />
        : state === 'failed'
          ? <Copy className="h-3.5 w-3.5 shrink-0" />
          : <Share2 className="h-3.5 w-3.5 shrink-0" />}
      {label}
    </button>
  );
}
