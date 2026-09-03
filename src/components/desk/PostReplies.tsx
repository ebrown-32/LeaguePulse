'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedPost } from './FeedPostCard';

/**
 * The argument under a post.
 *
 * The stance behind each reply still shapes what gets written, it is simply
 * not labelled: tagging a reply "agrees" or "pushes back" narrates the
 * argument instead of letting it read.
 *
 * Closed until asked for. Three replies open by default is most of a phone
 * screen spent on commentary before the reader has scrolled past the post
 * itself, and it pushes the next post out of view entirely. The count is
 * always visible, so a lively thread still advertises itself; opening it is
 * one tap.
 *
 * Indented behind a connector rather than shown as its own card, so a thread
 * reads as subordinate to the post it answers. Everything here is smaller and
 * quieter than the parent: a reply that competes visually with the piece it is
 * replying to turns the timeline into a wall of equal-weight blocks.
 */

function Reply({ reply }: { reply: FeedPost }) {
  const initials = reply.personaName.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <div className="flex gap-2.5 py-2">
      <span className={cn(
        'relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border border-border bg-card text-[9px] font-bold',
        reply.personaAccent,
      )}>
        {initials}
        {reply.personaAvatar && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={reply.personaAvatar} alt="" loading="lazy"
            className="absolute inset-0 h-full w-full object-cover" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn('text-[12px] font-bold', reply.personaAccent)}>
            {reply.personaName}
          </span>
          <span className="text-[11px] text-muted-foreground">{reply.personaHandle}</span>
        </span>
        <span className="mt-0.5 block whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
          {reply.content?.text}
        </span>
      </span>
    </div>
  );
}

export default function PostReplies({ replies }: { replies: FeedPost[] }) {
  const [open, setOpen] = useState(false);
  if (!replies.length) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg -ml-2 px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <MessageCircle className="h-3.5 w-3.5 shrink-0" />
        {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            {/* The left border is the thread line, so the indent reads as
                "these hang off the post above" without boxing them in. */}
            <div className="mt-1 divide-y divide-border/50 border-l-2 border-border pl-3">
              {replies.map(r => <Reply key={r.id} reply={r} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
