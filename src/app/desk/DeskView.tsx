'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import {
  MessageCircle, TrendingUp, Trophy, Newspaper, Scale, ChevronDown, Users,
  Swords, Radio,
} from 'lucide-react';
import TabSelector from '@/components/ui/TabSelector';

/**
 * The Desk: the AI writers' timeline.
 *
 * Previously this lived as the fourth tab on the Media page, where on a phone
 * it started 6px past the right edge of a 390px viewport inside a scroller with
 * no scrollbar, so it was effectively unreachable. It is its own destination
 * now, and reads as a timeline rather than a list of documents: short posts sit
 * inline, long pieces collapse to a headline card you can open, so a column and
 * a one-line jab can share the same column without one burying the other.
 */

type Kind =
  | 'article' | 'tweet' | 'comment' | 'tradeGrade' | 'powerRankings' | 'predictions'
  | 'matchupPreview' | 'kickoff' | 'liveTake';

/** Written while the games are on, and rendered inline so it reads as news
 *  breaking rather than as a document to open. */
const LIVE_KINDS = new Set<Kind>(['kickoff', 'liveTake']);

interface FeedPost {
  id: string;
  personaName: string;
  personaHandle: string;
  personaAccent: string;
  personaAvatar?: string;
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

const FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'live', label: 'Game day' },
  { id: 'long', label: 'Columns' },
  { id: 'short', label: 'Tweets' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

/** Machine-written, always labelled: it must never read as real reporting. */
function AiBadge() {
  return (
    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
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
    <div className="mt-2 overflow-hidden rounded-xl border border-border">
      <button onClick={onToggle} className="w-full text-left transition-colors hover:bg-muted/40">
        {post.personaAvatar && (
          <div className="flex h-24 items-center justify-center border-b border-border bg-gradient-to-br from-primary/10 to-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.personaAvatar} alt="" loading="lazy"
              className="h-16 w-16 rounded-full border border-border bg-card object-cover" />
          </div>
        )}
        <div className="p-3">
          {meta && (
            <span className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary">
              <meta.icon className="h-3 w-3" /> {meta.label}
            </span>
          )}
          <h3 className="font-display text-[15px] font-bold leading-snug text-foreground">
            {c.headline}
          </h3>
          {c.standfirst && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{c.standfirst}</p>
          )}
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
            {open ? 'Show less' : 'Read it'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="border-t border-border p-3">
              {post.kind === 'article' && (
                <div className="space-y-2 text-[14px] leading-relaxed text-foreground/90">
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

function Post({ post, index, open, onToggle }: {
  post: FeedPost; index: number; open: boolean; onToggle: () => void;
}) {
  const isLive = LIVE_KINDS.has(post.kind);
  const isLong = post.kind !== 'tweet' && post.kind !== 'comment' && !isLive;
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="flex gap-3 border-b border-border px-4 py-4 transition-colors last:border-0 hover:bg-muted/20"
    >
      <Avatar post={post} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn('text-sm font-semibold', post.personaAccent)}>{post.personaName}</span>
          <span className="text-[13px] text-muted-foreground">{post.personaHandle}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-[13px] text-muted-foreground">{timeAgo(post.createdAt)}</span>
          <AiBadge />
        </div>

        {!isLong && !isLive && (
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {post.content.text}
          </p>
        )}

        {isLive && <GameBeat post={post} />}

        {isLong && <LongForm post={post} open={open} onToggle={onToggle} />}

        {post.subject && (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" /> on {post.subject}
          </p>
        )}
      </div>
    </motion.article>
  );
}

export default function DeskView() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/ai/posts?limit=60')
      .then(r => r.json())
      .then(d => setPosts(d.posts ?? []))
      .catch(() => setPosts([]));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => {
    if (!posts) return [];
    if (filter === 'all') return posts;
    if (filter === 'live') {
      return posts.filter(p => LIVE_KINDS.has(p.kind) || p.kind === 'matchupPreview');
    }
    const long = (p: FeedPost) =>
      p.kind !== 'tweet' && p.kind !== 'comment' && !LIVE_KINDS.has(p.kind);
    return posts.filter(p => (filter === 'long' ? long(p) : !long(p)));
  }, [posts, filter]);

  const writers = useMemo(() => {
    const seen = new Map<string, FeedPost>();
    for (const p of posts ?? []) if (!seen.has(p.personaHandle)) seen.set(p.personaHandle, p);
    return [...seen.values()].slice(0, 8);
  }, [posts]);

  return (
    <PageLayout title="The Desk" subtitle="Your league's beat writers.">
      {/* Who is filing */}
      {writers.length > 0 && (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {writers.map(w => (
            <span key={w.personaHandle}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5">
              <Avatar post={w} />
              <span className="text-[11px] font-semibold text-foreground">{w.personaHandle}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mb-4">
        <TabSelector
          id="desk-filter"
          aria-label="Feed filter"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map(f => ({ id: f.id, label: f.label }))}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {posts === null ? (
          <div className="flex justify-center py-20"><LoadingSpinner className="h-8 w-8" /></div>
        ) : !shown.length ? (
          <div className="px-4 py-16 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-semibold text-foreground">Nothing filed yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The writers publish through the day. Check back shortly.
            </p>
          </div>
        ) : (
          shown.map((p, i) => (
            <Post
              key={p.id}
              post={p}
              index={i}
              open={openId === p.id}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            />
          ))
        )}
      </div>
    </PageLayout>
  );
}
