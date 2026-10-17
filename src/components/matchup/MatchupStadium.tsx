'use client';

/**
 * Where a matchup is played, as the host's own stadium in 3D on game day: the
 * lots filling with tailgates in the days before the week's first kickoff, the
 * gates opening and the stands filling to the crowd the stadium really draws,
 * a full house once it's live (a fifth of it in the visitors' color), and the
 * last fans filing out once it's final. The host and the crowd come from
 * /api/venue (lib/franchise/venue); the stadium as its manager dressed it.
 */

import { defaultStadiumName } from '@/lib/franchise/stadiumName';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { lockScroll } from '@/lib/scrollLock';
import { Maximize2, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import { gameDay, type GameDayStage, type HostReason } from '@/lib/franchise/venue';
import type { WeekPhase } from '@/lib/nflSchedule';
import { useHostGround } from './useHostGround';

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

export default function MatchupStadium({ a, b, week, className }: { a: Team; b: Team; week?: number; className?: string }) {
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
  if (venue === null) return null;
  const host = venue ? (venue.host === a.userId ? a : b) : null;
  const guest = venue ? (venue.host === a.userId ? b : a) : null;
  const people = day && venue?.crowd ? Math.round(venue.crowd.capacity * day.stands) : 0;

  const scene = (full: boolean) => ground && host && day ? (
    <Stadium3D facilities={ground.facilities} fill={day.stands} lots={day.lots} visitors={ground.guestColor ?? undefined}
      field={day.stage === 'live' ? 'game' : day.stage === 'gates' ? 'warmup' : 'empty'}
      color={ground.color ?? '#2a78d6'} name={ground.tierName} teamName={host.teamName} logo={ground.logo} look={ground.look}
      view={full ? { position: [14, 7.5, 14], target: [0, 0.4, 0], fov: 40 } : { position: [10.5, 6.2, 10.5], target: [0, 0.4, 0], fov: 42 }} />
  ) : null;
  const words = host && guest && day ? (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
        {venue?.playoff ? 'Playoffs · ' : ''}{guest.teamName} @ {host.teamName}
      </p>
      <p className="mt-0.5 font-display text-[17px] font-bold leading-tight sm:text-[19px]">{ground?.name || defaultStadiumName(host.userId, host.teamName)}</p>
      <p className="mt-1 text-[12px] leading-snug text-white/85">{caption(day.stage, day.hours, people)}</p>
      {venue && seriesLine(venue, host.teamName, guest.teamName) && <p className="mt-0.5 text-[10.5px] font-medium text-white/65">{seriesLine(venue, host.teamName, guest.teamName)}</p>}
    </>
  ) : null;

  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-muted/40', className)}>
      {/* One 3D view at a time: the small one steps aside while the big one is open. */}
      {!full && scene(false)}
      {!ground && <div className="h-full w-full animate-pulse" />}
      {words && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-3 pt-10 text-white">{words}</div>
      )}
      {ground && (
        <button onClick={e => { e.stopPropagation(); setFull(true); }} onPointerDown={e => e.stopPropagation()} aria-label="View the stadium fullscreen"
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65">
          <Maximize2 className="h-4 w-4" />
        </button>
      )}
      {full && <Fullscreen onClose={() => setFull(false)} label={host && guest ? `${guest.teamName} @ ${host.teamName}` : 'Stadium'}>
        {scene(true)}
        {words && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-6 pt-16 text-white sm:px-8">{words}</div>}
      </Fullscreen>}
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
