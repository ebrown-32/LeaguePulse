'use client';

/**
 * Where a matchup is played, as the host's own stadium in 3D on game day: the
 * lots filling with tailgates in the days before the week's first kickoff, the
 * gates opening and the stands filling to the crowd the stadium really draws,
 * a full house once it's live (a fifth of it in the visitors' color), and the
 * last fans filing out once it's final. The host and the crowd come from
 * /api/venue (lib/franchise/venue); the stadium as its manager dressed it.
 *
 * Hosted only: the stadium comes from Franchise HQ, which a self-hosted copy
 * doesn't run, so there it renders nothing at all. And anywhere the stadium
 * can't be drawn, it steps aside rather than leave an empty box.
 */

import { defaultStadiumName } from '@/lib/franchise/stadiumName';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { lockScroll } from '@/lib/scrollLock';
import { Camera, Check, Maximize2, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import { gameDay, type GameDayStage, type HostReason } from '@/lib/franchise/venue';
import type { WeekPhase } from '@/lib/nflSchedule';
import { useHostGround } from './useHostGround';
import { liveDemoRequested, useLiveMatchup } from './useLiveMatchup';
import { AnimatePresence, motion } from 'framer-motion';
import type { LiveMatchup, LivePlay, LivePlayer } from '@/lib/live/liveTypes';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import Avatar from '@/components/ui/Avatar';

/**
 * The broadcast angles, wide screens and phones apart: a phone looks down the field from an end
 * so its length runs up the tall screen. Any of them can be dragged from; the choice is remembered.
 */
type Angle = 'sideline' | 'high' | 'endzone' | 'blimp';
const ANGLES: { id: Angle; label: string }[] = [
  { id: 'sideline', label: 'Sideline' }, { id: 'high', label: 'High' }, { id: 'endzone', label: 'End zone' }, { id: 'blimp', label: 'Blimp' },
];
type View = { position: [number, number, number]; target: [number, number, number]; fov: number };
const ANGLE_VIEW: Record<Angle, { wide: View; narrow: View }> = {
  sideline: { wide: { position: [0, 3.6, 5.6], target: [0, 0, 0.2], fov: 46 }, narrow: { position: [0, 10.5, 15], target: [0, 0, 0.3], fov: 52 } },
  high: { wide: { position: [0, 7.4, 6.2], target: [0, 0, 0], fov: 44 }, narrow: { position: [0, 13, 7.4], target: [0, 0, 0.3], fov: 52 } },
  endzone: { wide: { position: [-7.4, 3.8, 0.01], target: [0.6, 0, 0], fov: 46 }, narrow: { position: [-7.6, 9.4, 0.01], target: [0.3, 0, 0], fov: 52 } },
  blimp: { wide: { position: [0, 11.5, 0.9], target: [0, 0, 0], fov: 44 }, narrow: { position: [-1.4, 13.5, 0.01], target: [0, 0, 0], fov: 52 } },
};
const ANGLE_KEY = 'lp_broadcast_angle';

const Stadium3D = dynamic(() => import('@/app/team/[userId]/tycoon/Stadium3D'), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted/40" /> });

interface Team { userId: string; teamName: string; avatar: string }
interface Venue {
  host: string; guest: string; reason: HostReason; playoff: boolean;
  kickoff: number | null; phase: WeekPhase;
  crowd: { attendance: number; capacity: number; fill: number } | null;
  series: { hostWins: number; guestWins: number; ties: number; meetings: number } | null;
}

/** The all-time series between the two, from the leader's side: "Trash Pandas lead the series 11-10". */
function seriesLine(v: Venue, host: string, guest: string): string | null {
  const s = v.series;
  if (!s) return null;
  if (!s.meetings) return 'First ever meeting';
  const tie = s.ties ? `-${s.ties}` : '';
  if (s.hostWins === s.guestWins) return `All-time series tied ${s.hostWins}-${s.guestWins}${tie}`;
  const [leader, w, l] = s.hostWins > s.guestWins ? [host, s.hostWins, s.guestWins] : [guest, s.guestWins, s.hostWins];
  return `${leader} lead the all-time series ${w}-${l}${tie}`;
}

function until(hours: number): string {
  if (hours >= 48) return `${Math.round(hours / 24)} days`;
  if (hours >= 1.5) return `${Math.round(hours)} hours`;
  return `${Math.max(1, Math.round(hours * 60))} min`;
}

function caption(stage: GameDayStage, hours: number, people: number): string {
  const n = people.toLocaleString('en-US');
  switch (stage) {
    case 'quiet': return `Kickoff in ${until(hours)}. The lots are quiet.`;
    case 'tailgating': return `Tailgates are filling. Kickoff in ${until(hours)}.`;
    case 'gates': return `Gates are open: ${n} in their seats. Kickoff in ${until(hours)}.`;
    case 'live': return `Live: ${n} in the building.`;
    case 'final': return 'Final. The last fans are heading home.';
  }
}

export default function MatchupStadium(props: { a: Team; b: Team; week?: number; className?: string }) {
  if (process.env.NEXT_PUBLIC_LP_HOSTED !== '1') return null;
  return <HostedStadium {...props} />;
}

function HostedStadium({ a, b, week, className }: { a: Team; b: Team; week?: number; className?: string }) {
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  const [full, setFull] = useState(false);
  // The crowd moves with the clock: checked every minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    let cancelled = false;
    setVenue(undefined);
    fetch(`/api/venue?a=${encodeURIComponent(a.userId)}&b=${encodeURIComponent(b.userId)}${week ? `&week=${week}` : ''}`)
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then(v => { if (!cancelled) setVenue(v); });
    return () => { cancelled = true; };
  }, [a.userId, b.userId, week]);
  const hostTeam = venue ? (venue.host === a.userId ? a : b) : null;
  const ground = useHostGround(venue?.host ?? null, venue?.guest ?? null, hostTeam?.avatar);

  const day = useMemo(() => (venue ? gameDay(now, venue.kickoff, venue.phase, venue.crowd?.fill ?? 0.8) : null), [venue, now]);

  // The matchup itself, live: once its week is under way (or a demo, on a development server).
  const [inView, setInView] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const [demo, setDemo] = useState(false);
  // A portrait phone looks down the field from behind an end zone, so its length runs up the tall screen.
  const [narrow, setNarrow] = useState(false);
  const [angle, setAngle] = useState<Angle | null>(null);
  useEffect(() => {
    setDemo(liveDemoRequested());
    const n = window.matchMedia('(max-width: 639px)').matches;
    setNarrow(n);
    let saved: string | null = null;
    try { saved = localStorage.getItem(ANGLE_KEY); } catch { /* the default */ }
    setAngle(ANGLES.some(x => x.id === saved) ? saved as Angle : n ? 'endzone' : 'sideline');
  }, []);
  const pickAngle = (a: Angle) => { setAngle(a); try { localStorage.setItem(ANGLE_KEY, a); } catch { /* this visit */ } };
  const liveOn = Boolean(venue && (venue.phase !== 'upcoming' || demo));
  // A card tapped on the field, shown up close.
  const [picked, setPicked] = useState<LivePlayer | null>(null);
  useEffect(() => { if (!full) setPicked(null); }, [full]);
  const { match, celebrate, reel } = useLiveMatchup({ host: venue?.host ?? null, guest: venue?.guest ?? null, week, enabled: liveOn, polling: inView || full });
  const playing = match && match.phase !== 'upcoming' ? match : null;
  // On right now: one of the starters' games is in progress (the week can be "live" on a quiet Saturday).
  const onNow = Boolean(playing && playing.phase === 'live' && playing.players.some(p => p.state === 'driving' || p.state === 'defending' || p.state === 'sideline'));

  if (venue === null || ground === null) return null;
  const host = venue ? (venue.host === a.userId ? a : b) : null;
  const guest = venue ? (venue.host === a.userId ? b : a) : null;
  const people = day && venue?.crowd ? Math.round(venue.crowd.capacity * day.stands) : 0;

  const guestColor = ground?.guestColor ?? '#e5e7eb';
  const scene = (full: boolean) => ground && host && day ? (
    <Stadium3D facilities={ground.facilities} fill={day.stands} lots={day.lots} visitors={ground.guestColor ?? undefined}
      // In a live matchup the starters are the players on the field.
      field={playing ? 'empty' : day.stage === 'live' ? 'game' : day.stage === 'gates' ? 'warmup' : 'empty'}
      live={playing ? { match: playing, hostColor: ground.color ?? '#2a78d6', guestColor, cards: full, cardScale: narrow ? 0.62 : 1, celebrate: celebrate ? { id: celebrate.play.id, side: celebrate.play.side, td: celebrate.play.scoring } : null, reel: reel?.play ?? null, onPick: setPicked, picked: picked?.playerId ?? null } : null}
      color={ground.color ?? '#2a78d6'} name={ground.tierName} teamName={host.teamName} logo={ground.logo} look={ground.look}
      // Watching a live matchup: the broadcast view, from the angle picked (ANGLE_VIEW), the field never blocked.
      view={full && playing ? { ...ANGLE_VIEW[angle ?? 'sideline'][narrow ? 'narrow' : 'wide'], still: true, broadcast: true }
        : full ? { position: [14, 7.5, 14], target: [0, 0.4, 0], fov: 40 } : { position: [10.5, 6.2, 10.5], target: [0, 0.4, 0], fov: 42 }} />
  ) : null;
  const words = host && guest && day ? (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
        {venue?.playoff ? 'Playoffs · ' : ''}{guest.teamName} @ {host.teamName}
      </p>
      <p className="mt-0.5 font-display text-[17px] font-bold leading-tight sm:text-[19px]">{ground?.name || defaultStadiumName(host.userId, host.teamName)}</p>
      {playing ? <LiveLine match={playing} crowd={venue?.crowd ? { people, capacity: venue.crowd.capacity } : null} />
        : <p className="mt-1 text-[12px] leading-snug text-white/85">{caption(day.stage, day.hours, people)}</p>}
      {venue && seriesLine(venue, host.teamName, guest.teamName) && <p className="mt-0.5 text-[10.5px] font-medium text-white/65">{seriesLine(venue, host.teamName, guest.teamName)}</p>}
    </>
  ) : null;

  return (
    <div ref={box} className={cn('relative overflow-hidden rounded-2xl bg-muted/40', className)}>
      {/* One 3D view at a time: the small one steps aside while the big one is open. */}
      {!full && scene(false)}
      {!ground && <div className="h-full w-full animate-pulse" />}
      {words && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-3 pt-10 text-white">{words}</div>
      )}
      {ground && (playing ? (
        // Live: the way in to watch it, players and all.
        <button onClick={e => { e.stopPropagation(); setFull(true); }} onPointerDown={e => e.stopPropagation()}
          className="absolute right-2.5 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/55 px-3 text-[12px] font-bold text-white backdrop-blur-md transition hover:bg-black/70">
          <span className={cn('h-2 w-2 rounded-full', onNow ? 'animate-pulse bg-red-500' : 'bg-white/60')} />
          {onNow ? 'Watch live' : 'Watch'}
        </button>
      ) : (
        <button onClick={e => { e.stopPropagation(); setFull(true); }} onPointerDown={e => e.stopPropagation()} aria-label="View the stadium fullscreen"
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65">
          <Maximize2 className="h-4 w-4" />
        </button>
      ))}
      {playing?.demo && <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">Demo data</span>}
      {!full && <Banner celebrate={celebrate} compact />}
      {full && <Fullscreen onClose={() => setFull(false)} label={host && guest ? `${guest.teamName} @ ${host.teamName}` : 'Stadium'}>
        {scene(true)}
        {words && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-6 pt-16 text-white sm:px-8">{words}</div>}
        {playing && host && guest && (
          <ScoreBug match={playing} onNow={onNow} host={{ avatar: host.avatar, color: ground?.color ?? '#2a78d6' }} guest={{ avatar: guest.avatar, color: guestColor }} />
        )}
        {playing && angle && <CameraMenu angle={angle} onPick={pickAngle} />}
        <AnimatePresence>
          {picked && playing && (() => {
            const now = playing.players.find(p => p.playerId === picked.playerId) ?? picked;
            return <PlayerSpotlight key={now.playerId} p={now} color={now.side === 'host' ? ground?.color ?? '#2a78d6' : guestColor}
              team={now.side === 'host' ? playing.host.name : playing.guest.name} onClose={() => setPicked(null)} />;
          })()}
        </AnimatePresence>
        {playing && <Ticker match={playing} hostColor={ground?.color ?? '#2a78d6'} guestColor={guestColor} />}
        {playing?.demo && <span className="pointer-events-none absolute left-4 top-[calc(env(safe-area-inset-top)+4.25rem)] rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-black">Demo data</span>}
        <Banner celebrate={celebrate} />
      </Fullscreen>}
    </div>
  );
}

/** The live score in the caption: who leads, by how much, what's on, and the crowd in the building. */
function LiveLine({ match, crowd }: { match: LiveMatchup; crowd: { people: number; capacity: number } | null }) {
  const driving = match.players.filter(p => p.state === 'driving').length;
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12px] leading-snug text-white/85">
      <span className="font-display text-[15px] font-black tabular-nums text-white">{match.guest.score.toFixed(1)} – {match.host.score.toFixed(1)}</span>
      <span>{match.phase === 'final' ? 'Final' : driving ? `${driving} starter${driving === 1 ? '' : 's'} on the field right now`
        : match.players.some(p => p.state === 'sideline') ? 'Live' : 'Between games'}</span>
      {crowd && <span className="basis-full text-[11.5px] text-white/70 sm:basis-auto">Attendance: {crowd.people.toLocaleString('en-US')}</span>}
    </p>
  );
}

/** What a starter is doing, in words. */
function doing(p: LivePlayer): string {
  switch (p.state) {
    case 'driving': return p.redZone ? `In the red zone · ${p.downDistance ?? ''}`.trim() : p.downDistance ? `On the field · ${p.downDistance}` : 'On the field';
    case 'defending': return 'On defense';
    case 'sideline': return 'On the sideline';
    case 'pregame': return 'Warming up';
    case 'final': return 'Game over';
    case 'bye': return 'On a bye this week';
  }
}

/** A tapped player, up close over the stadium: their points, their game, where to watch it. */
function PlayerSpotlight({ p, color, team, onClose }: { p: LivePlayer; color: string; team: string; onClose: () => void }) {
  const photo = playerPhoto(p);
  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-20 mx-auto max-w-sm sm:bottom-6 sm:left-6 sm:right-auto sm:mx-0 sm:w-[340px]">
      <div className="overflow-hidden rounded-2xl bg-[#0b0f14]/90 text-white shadow-[0_24px_50px_-16px_rgba(0,0,0,0.8)] ring-1 ring-white/12 backdrop-blur-xl" style={{ boxShadow: `inset 0 3px 0 ${color}` }}>
        <div className="flex items-center gap-3 p-3">
          <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl" style={{ background: `radial-gradient(90% 100% at 50% 100%, ${color}99, transparent 70%)` }}>
            {photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photo} alt="" className={cn('absolute bottom-0 left-1/2 w-auto -translate-x-1/2', p.position === 'DEF' ? 'bottom-2 h-[70%]' : 'h-full')} />
              : <span className="absolute inset-0 flex items-center justify-center font-display text-[18px] font-black">{initialsOf(p.name)}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
              <span className="rounded px-1 py-px text-white" style={{ background: color }}>{p.position}</span>
              <span className="truncate">{team}</span>
            </p>
            <p className="mt-0.5 truncate font-display text-[18px] font-black leading-tight">{p.name}</p>
            <p className="truncate text-[12px] text-white/70">{doing(p)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-[26px] font-black leading-none tabular-nums">{(p.points ?? 0).toFixed(1)}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">pts</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2 text-[12px]">
          <span className="min-w-0 flex-1 truncate text-white/75">{p.game ?? (p.nflTeam || 'Free agent')}</span>
          {p.channel && p.state !== 'final' && p.state !== 'bye' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/12 px-1.5 py-0.5 text-[11px] font-bold">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M8 2l4 4 4-4" /></svg>
              {p.channel}
            </span>
          )}
          <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </motion.div>
  );
}

/** A big play, announced: who, what, and the points. */
function Banner({ celebrate, compact = false }: { celebrate: { play: LivePlay; name: string } | null; compact?: boolean }) {
  return (
    <AnimatePresence>
      {celebrate && (
        // Centered by its wrapper: the animation owns the banner's transform.
        <div key={celebrate.play.id} className={cn('pointer-events-none absolute inset-x-0 z-10 flex justify-center', compact ? 'top-12' : 'top-[calc(env(safe-area-inset-top)+4.5rem)]')}>
        <motion.div initial={{ y: -30, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className={cn('text-center text-white', compact ? 'w-[88%]' : 'w-[min(92%,520px)]')}>
          <div className="rounded-2xl bg-black/70 px-4 py-2.5 shadow-2xl backdrop-blur-md">
            <p className={cn('font-display font-black tracking-wide text-[#ffd44d]', compact ? 'text-[15px]' : 'text-[22px]')}>{celebrate.play.scoring ? 'TOUCHDOWN' : 'BIG PLAY'}</p>
            <p className={cn('font-semibold', compact ? 'text-[11.5px]' : 'text-[14px]')}>
              {celebrate.name}{celebrate.play.points != null ? ` · +${celebrate.play.points.toFixed(1)}` : ''}
            </p>
            {!compact && <p className="mt-0.5 line-clamp-2 text-[12px] text-white/70">{celebrate.play.text}</p>}
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** A score that counts to its new value. */
function Score({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      setShown(start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{shown.toFixed(1)}</span>;
}

/**
 * The score bug, across the top of the broadcast: each team's picture ringed in its color, its
 * name and its score (counting up as points land), the leader lit and the trailer dimmed, and in
 * the middle whether it's live, with the margin.
 */
function ScoreBug({ match, host, guest, onNow }: {
  match: LiveMatchup; onNow: boolean;
  host: { avatar: string; color: string }; guest: { avatar: string; color: string };
}) {
  const lead = match.host.score - match.guest.score;
  const side = (t: LiveMatchup['host'], look: { avatar: string; color: string }, leads: boolean, right = false) => (
    <div className={cn('relative flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-4', right && 'flex-row-reverse text-right')}>
      {/* The team's color, as a glow behind the leader. */}
      <span aria-hidden className={cn('absolute inset-0 transition-opacity duration-500', leads ? 'opacity-100' : 'opacity-40')}
        style={{ background: `linear-gradient(${right ? 270 : 90}deg, ${look.color}55, transparent 75%)` }} />
      <span className="relative shrink-0 rounded-full p-[2px]" style={{ background: look.color }}>
        <Avatar avatarId={look.avatar || null} size={30} className="ring-0 sm:hidden" />
        <Avatar avatarId={look.avatar || null} size={38} className="hidden ring-0 sm:block" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/70 sm:text-[11px]">{t.name}</span>
        <Score value={t.score} className={cn('block font-display text-[20px] font-black leading-none tabular-nums transition-colors sm:text-[28px]', leads ? 'text-white' : 'text-white/60')} />
      </span>
    </div>
  );
  return (
    <div className="pointer-events-none absolute left-3 right-[4.25rem] top-[calc(env(safe-area-inset-top)+0.9rem)] sm:left-1/2 sm:right-auto sm:w-[min(80%,620px)] sm:-translate-x-1/2">
      <div className="flex items-stretch overflow-hidden rounded-2xl bg-[#0b0f14]/80 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/12 backdrop-blur-xl">
        {side(match.guest, guest, lead < 0)}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 border-x border-white/10 px-2 sm:px-3">
          {match.demo
            ? <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black">Demo</span>
            : match.phase === 'final'
              ? <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">Final</span>
              : <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider', onNow ? 'bg-red-500/90 text-white' : 'bg-white/15 text-white/80')}>
                  {onNow && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}{onNow ? 'Live' : `Wk ${match.week}`}
                </span>}
          <span className="text-[9.5px] font-semibold tabular-nums text-white/55">{Math.abs(lead) < 0.05 ? 'Tied' : `+${Math.abs(lead).toFixed(1)}`}</span>
        </div>
        {side(match.host, host, lead > 0, true)}
      </div>
    </div>
  );
}

/**
 * The camera angle, tucked into a small menu beside the close button: a camera button that opens
 * the four angles. Dragging still looks around from any of them.
 */
function CameraMenu({ angle, onPick }: { angle: Angle; onPick: (a: Angle) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div ref={box} className="absolute right-[4.25rem] top-[calc(env(safe-area-inset-top)+1rem)] max-sm:top-[calc(env(safe-area-inset-top)+5.4rem)] max-sm:right-4">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Camera angle"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75">
        <Camera className="h-[18px] w-[18px]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-12 w-44 overflow-hidden rounded-xl bg-[#0b0f14]/90 p-1 text-white shadow-2xl ring-1 ring-white/12 backdrop-blur-xl">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Camera</p>
            {ANGLES.map(x => (
              <button key={x.id} role="menuitemradio" aria-checked={angle === x.id} onClick={() => { onPick(x.id); setOpen(false); }}
                className={cn('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition', angle === x.id ? 'bg-white/12' : 'hover:bg-white/8')}>
                {x.label}
                {angle === x.id && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The plays as they come, newest first, in each side's color. */
function Ticker({ match, hostColor, guestColor }: { match: LiveMatchup; hostColor: string; guestColor: string }) {
  if (!match.plays.length) return null;
  const nameOf = (id: string) => match.players.find(p => p.playerId === id)?.name ?? '';
  return (
    <div className="pointer-events-none absolute bottom-4 right-3 hidden w-[290px] space-y-1.5 md:block">
      <AnimatePresence initial={false}>
        {match.plays.slice(0, 4).map(p => (
          <motion.div key={p.id} layout initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-xl bg-black/60 px-3 py-2 text-white backdrop-blur-md" style={{ borderLeft: `3px solid ${p.side === 'host' ? hostColor : guestColor}` }}>
            <p className="flex items-baseline justify-between gap-2 text-[12px] font-bold">
              <span className="truncate">{nameOf(p.playerId)}</span>
              {p.points != null && <span className={cn('shrink-0 tabular-nums', p.points > 0 ? 'text-emerald-300' : 'text-white/60')}>{p.points > 0 ? '+' : ''}{p.points.toFixed(1)}</span>}
            </p>
            <p className="line-clamp-2 text-[11px] text-white/70">{p.text}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * A stadium view over the whole screen, above any sheet it was opened from: Escape or the
 * close button leaves, and the page underneath holds still while it's open.
 */
export function Fullscreen({ onClose, label, children }: { onClose: () => void; label: string; children: React.ReactNode }) {
  useEffect(() => {
    const unlock = lockScroll();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); unlock(); };
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${label}, fullscreen`} className="fixed inset-0 z-[100] bg-black"
      onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      {children}
      <button onClick={onClose} aria-label="Close fullscreen"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75">
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}
