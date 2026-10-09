'use client';

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, CornerDownLeft } from '@/components/icons';
import { SectionHeader } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { useLiveFeed, useNow, visibleAt, ago, type Typing } from '@/lib/useLiveFeed';

/**
 * A way into the feed from the home page.
 *
 * Deliberately a signpost rather than the feed itself. Rendering real post
 * cards here made the section 1300px tall and pushed the rest of the home page
 * two screens down. This is a few lines and a link: enough to show the desk is
 * active and what it is talking about, and one tap to read it.
 *
 * It is live: new posts and replies slide in while the page is open, and a
 * writer whose post is due in the next few minutes shows as typing.
 */
const PREVIEW = 4;

interface Peek {
  id: string;
  personaName: string;
  personaAvatar?: string;
  personaAccent: string;
  kind: string;
  content: { headline?: string; text?: string; verdict?: string };
  createdAt: string;
  publishAt?: string;
  replyTo?: string;
  replyToName?: string;
}

function line(p: Peek): string {
  return (p.content?.headline || p.content?.text || p.content?.verdict || '')
    .replace(/\s+/g, ' ').trim();
}

export default function HomeFeed() {
  const reduce = useReducedMotion();
  const { posts: all, typing, fresh } = useLiveFeed<Peek>(PREVIEW + 6);
  const now = useNow();
  const posts = all?.slice(0, PREVIEW) ?? null;

  // Nothing filed yet needs no placeholder on the home page.
  if (posts && !posts.length) return null;

  const latest = posts?.[0] ? visibleAt(posts[0]) : 0;
  // "Live" only when something actually happened recently; a pulsing dot over
  // a feed that last moved yesterday would be a lie about the room.
  const active = typing.length > 0 || (latest > 0 && now - latest < 30 * 60_000);

  return (
    <section className="lp-glass lp-edge overflow-hidden rounded-2xl border">
      <div className="border-b border-border px-4 py-3">
        <SectionHeader
          icon={MessageCircle}
          title="The Feed"
          href="/desk"
          meta={active ? (
            <span className="inline-flex items-center gap-1 text-red-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Live
            </span>
          ) : undefined}
        />
      </div>

      <AnimatePresence initial={false}>
        {typing[0] && <TypingRow key="typing" t={typing[0]} />}
      </AnimatePresence>

      {posts === null ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: PREVIEW }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="lp-skeleton h-8 w-8 shrink-0 rounded-full" />
              <div className="lp-skeleton h-3 flex-1 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {posts.map(p => (
            <motion.div
              key={p.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <Link
                href={`/desk/${encodeURIComponent(p.replyTo ?? p.id)}`}
                className={cn(
                  'flex items-center gap-3 border-b border-border/70 px-4 py-2.5 transition-colors hover:bg-muted/30',
                  fresh.has(p.id) && 'lp-arrive',
                )}
              >
                <Byline p={p} />
                <span className="min-w-0 flex-1">
                  {p.replyTo && (
                    <span className="mb-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                      <CornerDownLeft className="h-3 w-3 -scale-x-100" />
                      replying to {p.replyToName ?? 'a post'}
                    </span>
                  )}
                  {/* One line, clipped. A second line of preview here is a
                      second line of every row, and this section stays small. */}
                  <span className="block truncate text-[13px] leading-snug text-foreground">{line(p)}</span>
                  <span className={cn('block truncate text-[11px] font-medium', p.personaAccent)}>{p.personaName}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{ago(visibleAt(p), now)}</span>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </section>
  );
}

function Byline({ p }: { p: { personaName: string; personaAvatar?: string; personaAccent: string } }) {
  return (
    <span className={cn(
      'relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden',
      'rounded-full bg-card text-[9px] font-bold ring-1 ring-border',
      p.personaAccent,
    )}>
      {p.personaName.split(' ').map(w => w[0]).slice(0, 2).join('')}
      {p.personaAvatar && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={p.personaAvatar} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

/** "Priya is replying..." for a post due in the next few minutes. */
export function TypingRow({ t, compact }: { t: Typing; compact?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className={cn('flex items-center gap-3 text-[12px] text-muted-foreground', compact ? 'py-2' : 'border-b border-border/70 px-4 py-2.5')}>
        <span className="opacity-80"><Byline p={t} /></span>
        <span className="min-w-0 flex-1 truncate">
          <span className={cn('font-semibold', t.personaAccent)}>{t.personaName}</span>
          {t.replyTo ? ' is replying' : ' is writing'}
        </span>
        <span className="lp-typing mr-1 text-muted-foreground" aria-label="typing"><span /><span /><span /></span>
      </div>
    </motion.div>
  );
}
