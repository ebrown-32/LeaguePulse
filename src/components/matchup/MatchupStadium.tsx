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
import { Camera, Check, ChevronDown, Maximize2, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import { gameDay, type GameDayStage, type HostReason } from '@/lib/franchise/venue';
import type { WeekPhase } from '@/lib/nflSchedule';
import { useHostGround } from './useHostGround';
import { liveDemoRequested, useLiveMatchup } from './useLiveMatchup';
import { AnimatePresence, motion } from 'framer-motion';
import type { LiveMatchup, LivePlay, LivePlayer } from '@/lib/live/liveTypes';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import Avatar from '@/components/ui/Avatar';
import HoneycombLoader from '@/components/ui/honeycomb-loader';
import { BEAT_MS, directorShot } from './director';

/**
 * The broadcast angles, wide screens and phones apart (each fitted to its screen's shape). Every
 * watch starts on the sideline; another angle, or dragging, lasts for that viewing.
 */
type Angle = 'director' | 'sideline' | 'high' | 'endzone' | 'blimp';
const ANGLES: { id: Angle; label: string }[] = [
  { id: 'director', label: 'Director (auto)' }, { id: 'sideline', label: 'Sideline' }, { id: 'high', label: 'High' }, { id: 'endzone', label: 'End zone' }, { id: 'blimp', label: 'Blimp' },
];
type View = { position: [number, number, number]; target: [number, number, number]; fov: number };
const ANGLE_VIEW: Record<Exclude<Angle, 'director'>, { wide: View; narrow: View }> = {
  // Sideline is the opening view: close enough to read the cards, the 50 in the middle, the ends at the edges.
  sideline: { wide: { position: [0, 2.9, 4.4], target: [0, 0, 0.2], fov: 46 }, narrow: { position: [0, 4.4, 6.4], target: [0, 0, 0.2], fov: 52 } },
  high: { wide: { position: [0, 7.4, 6.2], target: [0, 0, 0], fov: 44 }, narrow: { position: [0, 13, 7.4], target: [0, 0, 0.3], fov: 52 } },
  endzone: { wide: { position: [-7.4, 3.8, 0.01], target: [0.6, 0, 0], fov: 46 }, narrow: { position: [-7.6, 9.4, 0.01], target: [0.3, 0, 0], fov: 52 } },
  blimp: { wide: { position: [0, 11.5, 0.9], target: [0, 0, 0], fov: 44 }, narrow: { position: [-1.4, 13.5, 0.01], target: [0, 0, 0], fov: 52 } },
};

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

export default function MatchupStadium(props: {
  a: Team; b: Team; week?: number; className?: string;
  /** A big invitation to watch it in the stadium (Game Day), while the matchup's week is on. */
  prompt?: boolean;
  /**
   * A small preview inside a card that already names both teams (the matchups page): just the
   * stadium's name and the score over it, so the stadium shows. Fullscreen is the same either way.
   */
  compact?: boolean;
}) {
  if (process.env.NEXT_PUBLIC_LP_HOSTED !== '1') return null;
  return <HostedStadium {...props} />;
}

function HostedStadium({ a, b, week, className, prompt = false, compact = false }: { a: Team; b: Team; week?: number; className?: string; prompt?: boolean; compact?: boolean }) {
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
  const ground = useHostGround(venue?.host ?? null, venue?.guest ?? null);

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
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  // The camera fits the field to the screen's shape: any portrait screen (a phone, a tablet held upright) gets the tall framing.
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const [angle, setAngle] = useState<Angle | null>(null);
  useEffect(() => {
    setDemo(liveDemoRequested());
    const n = window.matchMedia('(max-width: 639px)').matches;
    setNarrow(n);
    setAngle('sideline');
  }, []);
  // Every watch starts on the sideline; another angle lasts for that viewing.
  const pickAngle = (a: Angle) => setAngle(a);
  useEffect(() => { if (!full) setAngle(a => (a ? 'sideline' : a)); }, [full]);
  const liveOn = Boolean(venue && (venue.phase !== 'upcoming' || demo));
  // The fullscreen view waits behind a loader until its stadium has drawn (and, live, the matchup has come in).
  const [fullReady, setFullReady] = useState(false);
  useEffect(() => { if (!full) setFullReady(false); }, [full]);
  // A card tapped on the field, shown up close.
  const [picked, setPicked] = useState<LivePlayer | null>(null);
  useEffect(() => { if (!full) setPicked(null); }, [full]);
  const { match, celebrate, reel } = useLiveMatchup({ host: venue?.host ?? null, guest: venue?.guest ?? null, week, enabled: liveOn, polling: inView || full });
  const playing = match && match.phase !== 'upcoming' ? match : null;
  // The director (see director.ts) moves on to its next shot every beat while it has the camera.
  const directing = full && angle === 'director';
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!directing) return;
    const t = setInterval(() => setBeat(n => n + 1), BEAT_MS);
    return () => clearInterval(t);
  }, [directing]);
  const shot = directing && playing ? directorShot({ match: playing, reel: reel?.play ?? null, portrait, beat }) : null;
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
      live={playing ? { match: playing, hostColor: ground.color ?? '#2a78d6', guestColor, cards: true, pins: !full, pinSize: 14, cardScale: narrow || portrait ? 0.85 : 1, celebrate: celebrate ? { id: celebrate.play.id, side: celebrate.play.side, td: celebrate.play.scoring } : null, reel: reel?.play ?? null, onPick: full ? setPicked : undefined, picked: full ? picked?.playerId ?? null : null } : null}
      color={ground.color ?? '#2a78d6'} name={ground.tierName} teamName={host.teamName} logo={ground.logo} look={ground.look}
      // Watching a live matchup: the broadcast view, from the angle picked (ANGLE_VIEW), the field never blocked.
      onReady={full ? () => setFullReady(true) : undefined}
      view={full && playing ? { ...(shot ?? ANGLE_VIEW[angle && angle !== 'director' ? angle : 'sideline'][portrait ? 'narrow' : 'wide']), still: true, broadcast: true }
        : full ? { position: [14, 7.5, 14], target: [0, 0.4, 0], fov: 40 } : { position: [10.5, 6.2, 10.5], target: [0, 0.4, 0], fov: 42 }} />
  ) : null;
  const matchupLine = host && guest ? (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">
      {venue?.playoff ? 'Playoffs · ' : ''}{guest.teamName} @ {host.teamName}
    </p>
  ) : null;
  // The caption; in the preview the matchup line sits apart, at the top left (see below). A compact preview keeps only the name and the score.
  const words = (withMatchup: boolean) => host && guest && day ? (
    <>
      {withMatchup && matchupLine}
      <p className={cn('font-display font-bold leading-tight', compact ? 'text-[14px] sm:text-[15px]' : 'text-[17px] sm:text-[19px]', withMatchup && 'mt-0.5')}>{ground?.name || defaultStadiumName(host.userId, host.teamName)}</p>
      {playing ? <LiveLine match={playing} crowd={venue?.crowd && !(compact && !withMatchup) ? { people, capacity: venue.crowd.capacity } : null} />
        : <p className="mt-1 text-[12px] leading-snug text-white/85">{caption(day.stage, day.hours, people)}</p>}
      {!(compact && !withMatchup) && venue && seriesLine(venue, host.teamName, guest.teamName) && <p className="mt-0.5 text-[10.5px] font-medium text-white/65">{seriesLine(venue, host.teamName, guest.teamName)}</p>}
    </>
  ) : null;

  return (
    <div ref={box} className={cn('relative overflow-hidden rounded-2xl bg-muted/40', className)}>
      {/* One 3D view at a time: the small one steps aside while the big one is open. */}
      {!full && scene(false)}
      {!ground && <div className="h-full w-full animate-pulse" />}
      {/* The matchup, top left, under its own shade so it reads over any sky. */}
      {matchupLine && day && !compact && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-3 pr-32 text-white">
          {matchupLine}
          {playing?.demo && <span className="mt-1.5 inline-block rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">Demo data</span>}
        </div>
      )}
      {words(false) && (
        <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent text-white', compact ? 'px-3 pb-2.5 pt-8' : 'px-4 pb-3 pt-10')}>{words(false)}</div>
      )}
      {/* Game Day: the invitation in, front and center, while the week is on. */}
      {prompt && ground && playing && (
        // Above the caption at the bottom, below the matchup line at the top.
        <div className="pointer-events-none absolute inset-x-0 bottom-[46%] top-12 flex items-center justify-center [&>*]:pointer-events-auto">
          <motion.button onClick={e => { e.stopPropagation(); setFull(true); }} onPointerDown={e => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2.5 rounded-full bg-white/95 px-5 py-3 text-[14px] font-extrabold text-black shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur-md sm:text-[15px]">
            <span className="relative flex h-2.5 w-2.5">
              {onNow && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />}
              <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', onNow ? 'bg-red-500' : 'bg-black/40')} />
            </span>
            {onNow ? 'Watch live in the stadium' : 'Watch in the stadium'}
          </motion.button>
        </div>
      )}
      {ground && !(prompt && playing) && (playing ? (
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
      {!full && <Banner celebrate={celebrate} compact />}
      {full && <Fullscreen onClose={() => setFull(false)} label={host && guest ? `${guest.teamName} @ ${host.teamName}` : 'Stadium'}>
        {scene(true)}
        {words(true) && <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-6 pt-16 text-white sm:px-8', playing && playing.plays.length > 0 && 'max-md:hidden')}>{words(true)}</div>}
        {playing && host && guest && (
          <ScoreBug match={playing} onNow={onNow} host={{ avatar: host.avatar, color: ground?.color ?? '#2a78d6' }} guest={{ avatar: guest.avatar, color: guestColor }} />
        )}
        {playing && angle && <CameraMenu angle={angle} onPick={pickAngle} />}
        <AnimatePresence>
          {!(fullReady && (!liveOn || match)) && (
            <motion.div key="loading" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-10 bg-[#070a0e]">
              <HoneycombLoader />
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">{liveOn ? 'Heading to the stadium' : 'Opening the gates'}</p>
            </motion.div>
          )}
        </AnimatePresence>
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

/**
 * Where the matchup stands, in words. "Between games" only once someone has played and someone
 * is still to play; before anyone has kicked off it's the pregame.
 */
function liveStatus(match: LiveMatchup, driving: number): string {
  if (match.phase === 'final') return 'Final';
  // How many starters' games are being played right now, whether or not they're on the field this snap.
  const playing = match.players.filter(p => p.state === 'driving' || p.state === 'defending' || p.state === 'sideline').length;
  if (playing) return `${playing} playing now`;
  const states = new Set(match.players.map(p => p.state));
  const played = states.has('final'), toPlay = states.has('pregame');
  if (toPlay && !played) return 'Pregame: nobody has kicked off yet';
  if (toPlay) return 'Between games';
  return 'Final';
}

/** The live score in the caption: who leads, by how much, what's on, and the crowd in the building. */
function LiveLine({ match, crowd }: { match: LiveMatchup; crowd: { people: number; capacity: number } | null }) {
  const driving = match.players.filter(p => p.state === 'driving').length;
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12px] leading-snug text-white/85">
      <span className="font-display text-[15px] font-black tabular-nums text-white">{match.guest.score.toFixed(1)} – {match.host.score.toFixed(1)}</span>
      <span>{liveStatus(match, driving)}</span>
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
    <div className="pointer-events-none absolute left-3 right-[4.25rem] top-[calc(env(safe-area-inset-top)+0.9rem)] sm:left-1/2 sm:right-auto sm:w-[min(calc(100%-11rem),620px)] sm:-translate-x-1/2">
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
      <BugStrip match={match} host={host} guest={guest} />
    </div>
  );
}

/**
 * Under the score bug: each side's win chance (LeaguePulse's live forecast) split as a bar in
 * their colors. Who's playing is marked on the players' own cards (LiveField).
 */
function BugStrip({ match, host, guest }: { match: LiveMatchup; host: { color: string }; guest: { color: string } }) {
  const p = match.hostWinProb;
  if (p == null) return null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  // Desktop only: on a phone, upright or on its side (a short screen), the score bug stands alone.
  return (
    <div className="mt-1.5 rounded-xl bg-[#0b0f14]/70 px-2.5 py-1.5 ring-1 ring-white/10 backdrop-blur-xl max-sm:hidden [@media(max-height:500px)]:hidden">
      <p className="text-center text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Win chance</p>
      <div className="mt-1 flex items-center gap-2 text-[11px] font-black tabular-nums text-white">
        <span className="w-8">{pct(1 - p)}</span>
        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.span className="absolute inset-y-0 left-0" style={{ background: guest.color }} initial={false} animate={{ width: pct(1 - p) }} transition={{ duration: 0.8 }} />
          <motion.span className="absolute inset-y-0 right-0" style={{ background: host.color }} initial={false} animate={{ width: pct(p) }} transition={{ duration: 0.8 }} />
        </span>
        <span className="w-8 text-right">{pct(p)}</span>
      </div>
    </div>
  );
}

/**
 * The camera angle, tucked into a small menu beside the close button: a camera button that opens
 * the angles, and the director, which works the camera itself. Dragging still looks around from any of them.
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
  const [open, setOpen] = useState(false);
  if (!match.plays.length) return null;
  const nameOf = (id: string) => match.players.find(p => p.playerId === id)?.name ?? '';
  const latest = match.plays[0];
  const tone = (side: 'host' | 'guest') => (side === 'host' ? hostColor : guestColor);
  const pts = (n: number | null) => n == null ? null : <span className={cn('shrink-0 tabular-nums', n > 0 ? 'text-emerald-300' : 'text-white/60')}>{n > 0 ? '+' : ''}{n.toFixed(1)}</span>;
  return (
    <>
    {/* Phones: in the caption's place at the bottom, the latest play, and a toggle for the rest. */}
    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-10 md:hidden">
      <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/60">Play by play</p>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: 10, height: 0 }}
            className="mb-1.5 max-h-[42dvh] space-y-1.5 overflow-y-auto overscroll-contain rounded-2xl">
            {match.plays.slice(1, 12).map(p => (
              <div key={p.id} className="rounded-xl bg-black/70 px-3 py-2 text-white backdrop-blur-md" style={{ borderLeft: `3px solid ${tone(p.side)}` }}>
                <p className="flex items-baseline justify-between gap-2 text-[12px] font-bold"><span className="truncate">{nameOf(p.playerId)}</span>{pts(p.points)}</p>
                <p className="line-clamp-2 text-[11px] text-white/70">{p.text}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="rounded-xl bg-black/70 px-3 py-2 text-white backdrop-blur-md" style={{ borderLeft: `3px solid ${tone(latest.side)}` }}>
        <p className="flex items-baseline justify-between gap-2 text-[12.5px] font-bold"><span className="truncate">{nameOf(latest.playerId)}</span>{pts(latest.points)}</p>
        <p className="line-clamp-2 text-[11.5px] text-white/75">{latest.text}</p>
      </div>
      {match.plays.length > 1 && (
        <button onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/12 py-2 text-[12.5px] font-bold text-white backdrop-blur-md active:bg-white/20">
          {open ? 'Show less' : `All plays (${match.plays.length})`}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-0' : 'rotate-180')} />
        </button>
      )}
    </div>
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
    </>
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
        className="absolute z-40 right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75">
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}
