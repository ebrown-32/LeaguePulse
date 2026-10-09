'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, Trophy, Newspaper, Scale, ChevronDown, Users, Swords, Radio, CrownIcon,
  ArrowRight, Ticket, Zap, Sword, type Icon,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import TeamAvatar from '@/components/ui/Avatar';
import { IconChip } from '@/components/ui/kit';
import MatchupDetailModal, { type MatchupTarget } from '@/components/matchup/MatchupDetailModal';
import { useNow, visibleAt, ago, type Typing } from '@/lib/useLiveFeed';
import { TypingRow } from '@/components/home/HomeFeed';
import PostActions from './PostActions';
import PostReplies from './PostReplies';

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
  | 'matchupPreview' | 'kickoff' | 'liveTake' | 'gameOfWeek';

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
  /** When it became visible. Times and ambient numbers count from this. */
  publishAt?: string;
  subject?: string;
  /** Set on a reply, naming the post it answers. */
  replyTo?: string;
  replyToName?: string;
  /** Whether a reply backs the parent up or takes it apart. */
  stance?: 'agree' | 'disagree';
}

const KIND_META: Record<Kind, { label: string; icon: Icon } | null> = {
  tweet: null,
  comment: null,
  article: { label: 'Column', icon: Newspaper },
  powerRankings: { label: 'Power Rankings', icon: TrendingUp },
  predictions: { label: 'Predictions', icon: Trophy },
  tradeGrade: { label: 'Trade Grade', icon: Scale },
  matchupPreview: { label: 'Week Preview', icon: Swords },
  kickoff: { label: 'Kickoff', icon: Radio },
  liveTake: { label: 'Live', icon: Radio },
  gameOfWeek: { label: 'Game of the Week', icon: CrownIcon },
};

const SIGNAL_ICON: Record<string, Icon> = {
  records: Trophy, playoffs: Ticket, points: Zap, rivalry: Sword, closeness: Scale,
};

/**
 * The Game of the Week announcement.
 *
 * Inline rather than collapsed: it is the desk pointing at one game, and the
 * point is lost if the game is behind a "read more". The face-off is drawn
 * from the pick attached to the post, never from the prose, so the card shows
 * exactly the game the page features even if the writing is loose about it.
 */
function GameOfWeekPost({ post }: { post: FeedPost }) {
  const c = post.content;
  const m = c.matchup;
  const [open, setOpen] = useState<MatchupTarget | null>(null);
  if (!m) return null;
  const target: MatchupTarget = {
    a: { userId: m.a.userId, teamName: m.a.teamName, avatar: m.a.avatar },
    b: { userId: m.b.userId, teamName: m.b.teamName, avatar: m.b.avatar },
    week: m.week,
  };
  const team = (t: any, right?: boolean) => (
    <div className={cn('flex min-w-0 items-center gap-2.5', right && 'flex-row-reverse text-right')}>
      <span className={cn('shrink-0 rounded-xl p-[2px]',
        c.lean === t.teamName ? 'bg-gradient-to-br from-primary to-primary/30' : 'bg-border')}>
        <TeamAvatar avatarId={t.avatar} size={38} className="rounded-[10px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-bold leading-tight text-foreground">{t.teamName}</span>
        <span className="block text-[11px] tabular-nums text-muted-foreground">{t.record}</span>
      </span>
    </div>
  );
  return (
    <div className="mt-2">
      {c.headline && (
        <p className="font-display text-[16px] font-bold leading-snug text-foreground">{c.headline}</p>
      )}
      <div className="lp-spotlight mt-3 rounded-2xl bg-card/60">
        <div className="relative z-[2] p-3.5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            {team(m.a)}
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">vs</span>
            {team(m.b, true)}
          </div>
          {Array.isArray(m.reasons) && m.reasons.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {m.reasons.map((r: any) => (
                <li key={r.text} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 py-0.5 pl-0.5 pr-2.5 text-[11.5px] text-foreground">
                  <IconChip icon={SIGNAL_ICON[r.kind] ?? Zap} size="xs" className="rounded-full" />
                  {r.text}
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setOpen(target)}
            className="group mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary"
          >
            Open the matchup
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
      {c.body && (
        <div className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-foreground">
          {String(c.body).split(/\n{2,}/).map((para: string, i: number) => <p key={i}>{para}</p>)}
        </div>
      )}
      {Array.isArray(c.watchFor) && c.watchFor.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">What decides it</p>
          <ul className="mt-1.5 space-y-1.5">
            {c.watchFor.map((w: string, i: number) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-foreground/90">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.lean && (
        <p className="mt-2.5 text-[13px] text-muted-foreground">
          Leaning <span className="font-semibold text-foreground">{c.lean}</span>
        </p>
      )}
      <MatchupDetailModal target={open} onClose={() => setOpen(null)} />
    </div>
  );
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
      'bg-card text-[11px] font-bold ring-1 ring-border ring-offset-2 ring-offset-background',
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
  post, index = 0, open, onToggle, leagueName, realLikes, replies, inset = 'page', fresh, typing,
}: {
  post: FeedPost; index?: number; open: boolean; onToggle: () => void;
  leagueName?: string | null; realLikes?: number;
  /** Replies to this post, oldest first. */
  replies?: FeedPost[];
  /** Arrived while the page was open; glows once as it lands. */
  fresh?: boolean;
  /** Replies to this post due in the next few minutes. */
  typing?: Typing[];
  /**
   * How much room the post leaves at its sides. The feed runs full bleed and
   * puts the page's own gutters back for itself; inside a bordered card those
   * gutters are already there, and repeating them at the `lg` breakpoint left
   * the text floating in the middle of the card.
   */
  inset?: 'page' | 'card';
}) {
  const now = useNow();
  const isLive = LIVE_KINDS.has(post.kind);
  const isGotw = post.kind === 'gameOfWeek';
  const isLong = post.kind !== 'tweet' && post.kind !== 'comment' && !isLive && !isGotw;
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className={cn(
        'border-b border-border/70 transition-colors last:border-0 hover:bg-muted/25',
        fresh && 'lp-arrive',
      )}
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
                {ago(visibleAt(post), now)}
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-1 pr-2 text-[10.5px] font-semibold text-primary">
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

            {isGotw && <GameOfWeekPost post={post} />}

            {isLong && <LongForm post={post} open={open} onToggle={onToggle} />}

            {post.subject && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" /> on {post.subject}
              </p>
            )}

            <PostActions post={post} realLikes={realLikes} leagueName={leagueName} />

            {replies && replies.length > 0 && <PostReplies replies={replies} />}

            <AnimatePresence initial={false}>
              {typing?.[0] && <TypingRow key="typing" t={typing[0]} compact />}
            </AnimatePresence>
          </div>
      </div>
    </motion.article>
  );
}