'use client';

/**
 * A desk photograph (lib/franchise/photo), developed in the reader's browser
 * from the host's real 3D stadium. One hidden "darkroom" view takes the
 * pictures one at a time and keeps each as a JPEG, so a feed full of photos
 * costs one 3D scene for a moment, never one per post, and scrolling past a
 * developed photo again costs nothing at all.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { photoView, type PhotoSpec, type PhotoView } from '@/lib/franchise/photo';
import { loadGround, type Ground } from '@/components/matchup/useHostGround';
import { Fullscreen } from '@/components/matchup/MatchupStadium';
import { Maximize2 } from '@/components/icons';

const Stadium3D = dynamic(() => import('@/app/team/[userId]/tycoon/Stadium3D'), { ssr: false });

const W = 1200, H = 750;
/** Long enough for every piece of the stadium to rise into place and the shadows to settle. */
const DEVELOP_MS = 3200;

interface Job { key: string; spec: PhotoSpec; ground: Ground; view: PhotoView; hostTeam: string; done: (url: string | null) => void }

const developed = new Map<string, string>();
const queue: Job[] = [];
let current: Job | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

const keyOf = (s: PhotoSpec) => `lp_photo_v1:${s.shot}:${s.host}:${s.guest}:${s.season}:${s.week}:${s.hour.toFixed(1)}:${s.stands.toFixed(2)}:${s.lots.toFixed(2)}`;

function stored(key: string): string | null {
  if (developed.has(key)) return developed.get(key)!;
  try { const v = sessionStorage.getItem(key); if (v) { developed.set(key, v); return v; } } catch { /* private mode */ }
  return null;
}

function next() {
  if (current || !queue.length) return;
  current = queue.shift()!;
  notify();
}

function develop(spec: PhotoSpec, hostTeam: string, hostAvatar: string | null): Promise<string | null> {
  const key = keyOf(spec);
  const have = stored(key);
  if (have) return Promise.resolve(have);
  return loadGround(spec.host, spec.guest, hostAvatar).then(ground => new Promise<string | null>(resolve => {
    if (!ground) return resolve(null);
    const view = photoView(spec.shot, ground.facilities, ground.look, spec.stands > 0.5 && (spec.shot === 'crowd' || spec.shot === 'aerial'));
    queue.push({ key, spec, ground, view, hostTeam, done: url => {
      if (url) { developed.set(key, url); try { sessionStorage.setItem(key, url); } catch { /* full: memory only */ } }
      resolve(url);
    } });
    next();
  }));
}

/** The one hidden view that takes the pictures. Mounted once, by whichever photo appears first. */
function Darkroom() {
  const [, force] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const job = current;
  useEffect(() => {
    if (!job) return;
    const t = setTimeout(() => {
      const canvas = box.current?.querySelector('canvas');
      let url: string | null = null;
      try { url = canvas ? canvas.toDataURL('image/jpeg', 0.84) : null; } catch { url = null; }
      job.done(url && url.length > 2000 ? url : null);
      current = null;
      next(); notify();
    }, DEVELOP_MS);
    return () => clearTimeout(t);
  }, [job]);
  if (!job) return null;
  const { spec, ground, view } = job;
  return (
    // On screen (a view off screen stops drawing) but unseen and out of the way.
    <div ref={box} aria-hidden style={{ position: 'fixed', left: 0, top: 0, width: W, height: H, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
      <Stadium3D key={job.key} photo facilities={ground.facilities} fill={spec.stands} lots={spec.lots} visitors={ground.guestColor ?? undefined}
        field={view.field} color={ground.color ?? '#2a78d6'} name={ground.tierName} teamName={job.hostTeam} logo={ground.logo} look={ground.look}
        hour={spec.hour} view={{ position: view.position, target: view.target, fov: view.fov, still: true }} />
    </div>
  );
}

let darkroomMounted = false;

export default function StadiumPhoto({ spec, hostTeam, hostAvatar, persona, className }: {
  spec: PhotoSpec; hostTeam: string; hostAvatar?: string | null;
  /** The writer, for an interview: their face in the frame. */
  persona?: { name: string; avatar?: string };
  className?: string;
}) {
  const [url, setUrl] = useState<string | null | undefined>(() => (typeof window === 'undefined' ? undefined : stored(keyOf(spec)) ?? undefined));
  const [near, setNear] = useState(false);
  const [full, setFull] = useState(false);
  const [mountRoom, setMountRoom] = useState(false);
  const el = useRef<HTMLDivElement>(null);

  // Develop only when it is about to scroll into view.
  useEffect(() => {
    if (url !== undefined || !el.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '600px' });
    io.observe(el.current);
    return () => io.disconnect();
  }, [url]);
  useEffect(() => {
    if (!near || url !== undefined) return;
    if (!darkroomMounted) { darkroomMounted = true; setMountRoom(true); }
    let cancelled = false;
    develop(spec, hostTeam, hostAvatar ?? null).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [near, url, spec, hostTeam, hostAvatar]);

  if (url === null) return null;
  // The picture with the writer in it for a selfie; framed to the post, or over the whole screen.
  const picture = (fit: 'cover' | 'contain') => url && (
    <div className={cn('relative', fit === 'cover' ? 'h-full w-full' : 'aspect-[16/10] max-h-full w-full max-w-[calc(100dvh*1.6)]')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`${hostTeam}'s stadium, ${ALT[spec.shot]}`} className="h-full w-full object-cover" />
      {spec.shot === 'interview' && persona?.avatar && (
        // A selfie: the writer's face in the near corner of the frame.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cutout(persona.avatar)} alt={persona.name} className="absolute bottom-0 left-[6%] h-[62%] w-auto drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]" />
      )}
    </div>
  );
  return (
    <div ref={el} className={cn('relative mt-2.5 aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-muted/40', className)}>
      {mountRoom && typeof document !== 'undefined' && createPortal(<Darkroom />, document.body)}
      {url ? (
        <button onClick={e => { e.stopPropagation(); setFull(true); }} aria-label="View the photo fullscreen" className="group block h-full w-full cursor-zoom-in">
          {picture('cover')}
          <span className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white opacity-80 backdrop-blur-md transition group-hover:opacity-100">
            <Maximize2 className="h-4 w-4" />
          </span>
        </button>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-[12px] text-muted-foreground animate-pulse">Developing…</span>
        </div>
      )}
      {full && url && (
        <Fullscreen onClose={() => setFull(false)} label={`${hostTeam}'s stadium`}>
          <div className="flex h-full w-full items-center justify-center p-3 sm:p-8" onClick={() => setFull(false)}>{picture('contain')}</div>
        </Fullscreen>
      )}
    </div>
  );
}

/** The writer's avatar without its background square, so they stand in front of the stadium. */
function cutout(url: string): string {
  if (!url.includes('api.dicebear.com')) return url;
  const u = new URL(url);
  // DiceBear draws no background unless asked for one.
  u.searchParams.delete('backgroundColor'); u.searchParams.delete('backgroundType');
  return u.toString();
}

const ALT: Record<PhotoSpec['shot'], string> = {
  exterior: 'from across the plaza', drone: 'from a drone over the tailgates', tailgate: 'from among the tailgates',
  crowd: 'the crowd from the field', warmup: 'both teams warming up', interview: 'on the sideline', aerial: 'from high above',
};
