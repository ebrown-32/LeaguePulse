'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, Trophy, Newspaper, Scale, ChevronDown, Users, Swords, Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PostActions from './PostActions';

/**
 * One post, rendered.
 *
 * Shared by the timeline and by a post's own permalink page, so a link someone
 * was sent shows exactly what they saw in the feed. It lived inside DeskView
 * until the permalink needed it; duplicating nine kinds of layout for the sake
 * of one extra route would have guaranteed the two drifted apart.
 */
type Kind =
  | 'article' | 'tweet' | 'comment' | 'tradeGrade' | 'powerRankings' | 'predictions'
  | 'matchupPreview' | 'kickoff' | 'liveTake';

/** Written while the games are on, and rendered inline so it reads as news
 *  breaking rather than as a document to open. */
const LIVE_KINDS = new Set<Kind>(['kickoff', 'liveTake']);

export interface FeedPost {
  id: string;
  personaName: string;
  personaHandle: string;
  personaAccent: string;
  personaAvatar?: string;
  /** Fans are league members reacting, not writers filing. */
  personaType?: 'media' | 'fan';
  kind: Kind;
  content: any;
  createdAt: string;
  subject?: string;
}

const KIND_META: Record<Kind, { label: string; icon: typeof Newspaper } | null> = {
  tweet: null,
  comment: null,
  article: { label: 'Column', icon: Newspaper },
  powerRankings: { label: 'Power Rankings', icon: TrendingUp },
  predictions: { label: 'Predictions', icon: Trophy },
  tradeGrade: { label: 'Trade Grade', icon: Scale },
  matchupPreview: { label: 'Week Preview', icon: Swords },
  kickoff: { label: 'Kickoff', icon: Radio },
  liveTake: { label: 'Live', icon: Radio },
};

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

/**
 * Machine-written, always labelled: it must never read as real reporting.
 *
 * One badge on the page heading rather than one per post. Every writer here
 * is synthetic, so repeating it twenty times down the timeline was noise that
 * said nothing a single label at the top does not, and it crowded the byline.
 *
 * Kept tight and barely rounded. Sitting next to a 30px display heading it
 * only has to be legible, and any more padding or radius turns two letters
 * into a bubble that competes with the title.
 *
 * `leading-none` is load bearing: line-height inherits from the heading, so
 * without it the box is sized by the title's 36px line and the badge comes
 * out 40px tall regardless of its own font size or padding.
 */
export function AiBadge() {
  return (
    <span className="ml-2.5 inline-flex shrink-0 items-center rounded-[3px] border border-primary/40 bg-primary/10 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase leading-none tracking-wider text-primary">
      AI
    </span>
  );
}

function Avatar({ post }: { post: FeedPost }) {
  const initials = post.personaName.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <span className={cn(
      'relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full',
      'border border-border bg-card text-[11px] font-bold',
      post.personaAccent,
    )}>
      {initials}
      {post.personaAvatar && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={post.personaAvatar} alt="" loading="lazy"
          className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

/** Long-form bodies collapse so the timeline stays scannable. */
function LongForm({ post, open, onToggle }: { post: FeedPost; open: boolean; onToggle: () => void }) {
  const c = post.content;
  const meta = KIND_META[post.kind];

  return (
    <div className="mt-1">
      {/* The headline is the post. There is no nested card and no second
          avatar: a long piece and a one line jab are the same kind of object
          in a timeline, and wrapping one of them in its own bordered panel
          with a banner made the feed read as a list of documents. */}
      {c.headline && (
        <p className="text-[15px] font-semibold leading-snug text-foreground">
          {c.headline}
        </p>
      )}
      {c.standfirst && (
        <p className="mt-1 text-[15px] leading-relaxed text-foreground/80">{c.standfirst}</p>
      )}

      <button
        onClick={onToggle}
        aria-expanded={open}
        className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
      >
        {open ? 'Show less' : meta ? `Read the ${meta.label.toLowerCase()}` : 'Show more'}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="mt-2.5 rounded-xl border border-border bg-muted/20 p-3">
              {post.kind === 'article' && (
                <div className="space-y-2.5 text-[14px] leading-relaxed text-foreground/90">
                  {String(c.body || '').split(/\n{2,}/).map((para: string, i: number) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              )}

              {post.kind === 'powerRankings' && (
                <ol className="space-y-2">
                  {(c.teams ?? []).map((t: any) => (
                    <li key={t.rank} className="flex gap-3 rounded-lg border border-border px-3 py-2">
                      <span className="w-5 shrink-0 text-center font-display text-lg font-bold text-primary">
                        {t.rank}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">
                          {t.teamName}
                          <span className="ml-2 font-normal text-muted-foreground">{t.verdict}</span>
                        </p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/85">{t.reasoning}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {post.kind === 'predictions' && (
                <div className="space-y-3">
                  {c.champion && (
                    <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Champion pick</p>
                      <p className="mt-0.5 text-sm font-bold text-foreground">{c.champion.teamName}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{c.champion.reasoning}</p>
                    </div>
                  )}
                  <ol className="space-y-1">
                    {(c.standings ?? []).map((t: any) => (
                      <li key={t.rank} className="flex items-baseline gap-3 rounded-md border border-border px-3 py-1.5">
                        <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
                          {t.rank}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                          {t.teamName}
                          {(c.playoffTeams ?? []).includes(t.teamName) && (
                            <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-primary">PO</span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t.projectedRecord}</span>
                      </li>
                    ))}
                  </ol>
                  {c.bustPick && (
                    <p className="rounded-lg border border-border px-3 py-2 text-[13px] text-foreground/85">
                      <span className="font-bold uppercase tracking-widest text-muted-foreground">Most overrated </span>
                      <span className="font-semibold text-foreground">{c.bustPick.teamName}</span>
                      {'. '}{c.bustPick.reasoning}
                    </p>
                  )}
                </div>
              )}

              {post.kind === 'matchupPreview' && (
                <div className="space-y-2">
                  {(c.games ?? []).map((g: any, i: number) => {
                    // The pick is shown by highlighting the side that was
                    // picked, so the call is readable without reading prose.
                    const pickedA = g.pick === g.teamA;
                    // Sized to content and allowed to wrap. Splitting the row
                    // evenly with flex-1 truncated whichever name was longer,
                    // and team names here are arbitrary user-chosen strings.
                    const side = (name: string, picked: boolean) => (
                      <span className={cn(
                        'text-[13px]',
                        picked ? 'font-bold text-foreground' : 'text-muted-foreground',
                      )}>
                        {name}
                      </span>
                    );
                    return (
                      <div key={i} className="rounded-lg border border-border px-3 py-2">
                        {/* The badge sits on its own line so the two team names
                            get the full width. Sharing a row with it truncated
                            every name to "Ass Kick..." on a phone. */}
                        <span className={cn(
                          'inline-block rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider',
                          g.confidence === 'lock'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                            : g.confidence === 'coin flip'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                              : 'border-border text-muted-foreground',
                        )}>
                          {g.confidence}
                        </span>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                          {side(g.teamA, pickedA)}
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            v
                          </span>
                          {side(g.teamB, !pickedA)}
                        </div>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85">{g.take}</p>
                      </div>
                    );
                  })}
                  {c.upsetAlert && (
                    <p className="rounded-lg border border-border px-3 py-2 text-[13px] text-foreground/85">
                      <span className="font-bold uppercase tracking-widest text-muted-foreground">Upset alert </span>
                      {c.upsetAlert}
                    </p>
                  )}
                </div>
              )}

              {post.kind === 'tradeGrade' && (
                <div className="space-y-2">
                  <p className="text-[14px] text-foreground">{c.verdict}</p>
                  {(c.sides ?? []).map((s: any) => (
                    <div key={s.teamName} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                      <span className="font-display text-lg font-bold text-primary">{s.grade}</span>
                      <span className="min-w-0 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{s.teamName}</span>, {s.reasoning}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {c.boldestTake && (
                <p className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[13px] text-foreground">
                  <span className="font-bold uppercase tracking-widest text-primary">Boldest take </span>
                  {c.boldestTake}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A kickoff or in-progress post.
 *
 * Rendered inline rather than behind a "read it" toggle: the value of a live
 * post is that you see it without doing anything, and it is short enough that
 * collapsing it would save no space worth saving.
 */
function GameBeat({ post }: { post: FeedPost }) {
  const c = post.content;
  const live = post.kind === 'liveTake';
  return (
    <div className="mt-1.5">
      <span className={cn(
        'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest',
        live ? 'text-rose-500' : 'text-primary',
      )}>
        <span className="relative flex h-1.5 w-1.5">
          {live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full',
            live ? 'bg-rose-500' : 'bg-primary')} />
        </span>
        {live ? 'Live' : 'Kickoff'}
      </span>

      {c.headline && (
        <p className="mt-1 font-display text-[15px] font-bold leading-snug text-foreground">
          {c.headline}
        </p>
      )}
      {c.text && (
        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
          {c.text}
        </p>
      )}

      {Array.isArray(c.notes) && c.notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {c.notes.map((n: any, i: number) => (
            <li key={i} className="flex gap-2 rounded-lg border border-border px-2.5 py-1.5">
              <span className="shrink-0 text-[13px] font-semibold text-foreground">{n.teamName}</span>
              <span className="min-w-0 text-[13px] leading-snug text-foreground/85">{n.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FeedPostCard({
  post, index = 0, open, onToggle, leagueName, realLikes, inset = 'page',
}: {
  post: FeedPost; index?: number; open: boolean; onToggle: () => void;
  leagueName?: string | null; realLikes?: number;
  /**
   * How much room the post leaves at its sides. The feed runs full bleed and
   * puts the page's own gutters back for itself; inside a bordered card those
   * gutters are already there, and repeating them at the `lg` breakpoint left
   * the text floating in the middle of the card.
   */
  inset?: 'page' | 'card';
}) {
  const isLive = LIVE_KINDS.has(post.kind);
  const isLong = post.kind !== 'tweet' && post.kind !== 'comment' && !isLive;
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
    >
      <div className={cn(
        'flex gap-3 py-4',
        inset === 'page' ? 'px-4 sm:px-6 lg:px-8' : 'px-4',
      )}>
          <Avatar post={post} />
          <div className="min-w-0 flex-1">
            {/* Two lines. Who wrote it on the first, everything that
                qualifies it on the second. Fitting name, handle, timestamp
                and kind onto one row put all four in the same 300px on a
                phone, which wrapped mid-byline and read as clutter. */}
            <div className="flex items-baseline gap-2">
              <span className={cn('truncate text-[15px] font-bold', post.personaAccent)}>
                {post.personaName}
              </span>
              <span className="ml-auto shrink-0 text-[13px] tabular-nums text-muted-foreground">
                {timeAgo(post.createdAt)}
              </span>
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] text-muted-foreground">{post.personaHandle}</span>
              {post.personaType === 'fan' && (
                <span className="rounded bg-muted px-1 py-px text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Fan
                </span>
              )}
              {(() => {
                const meta = KIND_META[post.kind];
                return meta ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                    <meta.icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                ) : null;
              })()}
            </div>

            {!isLong && !isLive && (
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                {post.content.text}
              </p>
            )}

            {isLive && <GameBeat post={post} />}

            {isLong && <LongForm post={post} open={open} onToggle={onToggle} />}

            {post.subject && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" /> on {post.subject}
              </p>
            )}

            <PostActions post={post} realLikes={realLikes} leagueName={leagueName} />
          </div>
      </div>
    </motion.article>
  );
}