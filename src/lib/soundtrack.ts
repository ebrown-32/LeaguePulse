/**
 * The site's soundtrack (hosted): the tracks in public/soundtrack, shuffled for each visitor and
 * played round and round, by one player for the whole visit, so the music carries on from page to
 * page.
 *
 *   A different song every time   the order is shuffled per visit, and a visit starts on a song
 *                                 the visitor hasn't heard lately (the last few are remembered),
 *                                 so coming back isn't the same opening track again.
 *   No gaps                       the next track is loaded while this one plays, and swapped in
 *                                 the moment it ends. When every track has played, the order is
 *                                 shuffled again (never the same song twice in a row).
 *   Started with a tap (browsers allow sound no other way). Whether a visitor had it on is
 *   remembered: next visit it picks up on their first tap anywhere, unless they've turned the site's
 *   music off (lib/prefs).
 *   On a phone, the lock screen shows the track and its controls (Media Session).
 *   It steps aside for the site's other sound: The Desk Weekly, a trophy's beat, League Wrapped's
 *   music (each says so with `audioTakeover`), and picks up again when they've finished.
 *
 * Client only. The track list comes from the server (lib/soundtrackFiles, in the root layout).
 */

import { getPrefs } from './prefs';

export interface Track { title: string; src: string }
export interface SoundtrackState { tracks: Track[]; index: number; playing: boolean; held: boolean }

const KEY = 'lp_soundtrack';
const VOLUME = 0.55;

/** Something else on the site is making sound (`on`), or has stopped: the soundtrack makes way. */
export function audioTakeover(source: string, on: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('lp-audio', { detail: { source, on } }));
}

interface Memory { on: boolean; recent: string[] }
function remembered(): Memory {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { on: Boolean(v.on), recent: Array.isArray(v.recent) ? v.recent.filter((x: unknown) => typeof x === 'string') : [] }; } catch { return { on: false, recent: [] }; }
}
function remember(m: Partial<Memory>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...remembered(), ...m })); } catch { /* private mode */ }
}

/** A shuffled copy (Fisher-Yates). */
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

class Soundtrack {
  private audio: HTMLAudioElement | null = null;
  /** The next track, loading while this one plays. */
  private upNext: HTMLAudioElement | null = null;
  private state: SoundtrackState = { tracks: [], index: 0, playing: false, held: false };
  private listeners = new Set<() => void>();
  private takers = new Set<string>();
  /** Track indexes in the order they'll play, and where in it we are. */
  private order: number[] = [];
  private at = 0;
  /** Playing when something took over: picked up again when it's done. */
  private resumeAfter = false;
  private armed = false;

  get snapshot() { return this.state; }
  subscribe(l: () => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private set(p: Partial<SoundtrackState>) { this.state = { ...this.state, ...p }; this.listeners.forEach(l => l()); }

  /**
   * The tracks, once, from the layout: shuffled, starting on one this visitor hasn't heard lately;
   * and, for a visitor who had it on, ready to pick up on their first tap.
   */
  load(tracks: Track[]) {
    if (typeof window === 'undefined' || this.state.tracks.length || !tracks.length) return;
    const r = remembered();
    const fresh = tracks.map((_, i) => i).filter(i => !r.recent.includes(tracks[i].src));
    const first = (fresh.length ? shuffled(fresh) : shuffled(tracks.map((_, i) => i)))[0];
    this.order = [first, ...shuffled(tracks.map((_, i) => i).filter(i => i !== first))];
    this.at = 0;
    this.set({ tracks, index: first });
    window.addEventListener('lp-audio', this.onTakeover as EventListener);
    if (r.on && getPrefs().music !== false && !this.armed) {
      this.armed = true;
      const go = () => { window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); if (!this.state.playing && !this.takers.size) this.play(); };
      window.addEventListener('pointerdown', go, true);
      window.addEventListener('keydown', go, true);
    }
  }

  /** The track after this one: the next in the order, or the first of a fresh shuffle (never a repeat). */
  private peek(): number {
    if (this.at + 1 < this.order.length) return this.order[this.at + 1];
    const n = this.state.tracks.length;
    if (n < 2) return this.order[this.at] ?? 0;
    let next = shuffled(this.order);
    if (next[0] === this.order[this.at]) next = [...next.slice(1), next[0]];
    this.order = [...this.order.slice(0, this.at + 1), ...next];
    return this.order[this.at + 1];
  }

  private make(): HTMLAudioElement {
    const a = new Audio();
    a.preload = 'auto';
    a.volume = VOLUME;
    a.onended = () => { if (a === this.audio) this.advance(1, true); };
    a.onpause = () => { if (a === this.audio && this.state.playing && !a.ended && !this.takers.size) this.set({ playing: false }); };
    a.onplay = () => { if (a === this.audio) this.set({ playing: true }); };
    return a;
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    this.audio = this.make();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    }
    return this.audio;
  }

  private srcOf(i: number) { return new URL(this.state.tracks[i].src, location.href).href; }

  /** Makes track `i` current: on the element already loading it if there is one. */
  private cue(i: number) {
    const { tracks } = this.state;
    if (!tracks.length) return;
    const want = this.srcOf(i);
    if (this.upNext && this.upNext.src === want) {
      const old = this.audio;
      this.audio = this.upNext; this.upNext = old;
      old?.pause();
    }
    const a = this.element();
    if (a.src !== want) a.src = tracks[i].src;
    this.set({ index: i });
    remember({ recent: [tracks[i].src, ...remembered().recent.filter(s => s !== tracks[i].src)].slice(0, Math.max(1, Math.min(6, tracks.length - 2))) });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[i].title, artist: document.title.split('|').pop()?.trim() || 'LeaguePulse', album: 'Soundtrack' });
    }
  }

  /** Starts loading the track after this one, so it starts the moment this one ends. */
  private preloadNext() {
    if (this.state.tracks.length < 2) return;
    const want = this.srcOf(this.peek());
    this.upNext ??= this.make();
    if (this.upNext.src !== want) { this.upNext.src = this.state.tracks[this.peek()].src; this.upNext.load(); }
  }

  /** Inside a tap. */
  play() {
    if (!this.state.tracks.length) return;
    this.cue(this.state.index);
    this.audio!.play().then(() => { this.set({ playing: true, held: false }); remember({ on: true }); this.preloadNext(); }).catch(() => this.set({ playing: false }));
  }

  pause() {
    this.audio?.pause();
    this.resumeAfter = false;
    this.set({ playing: false });
    remember({ on: false });
  }

  toggle() { if (this.state.playing || this.state.held) this.pause(); else this.play(); }

  /** Forward (1) or back (-1) through the order; `play`: keep playing. */
  private advance(step: 1 | -1, play = this.state.playing) {
    if (step === 1) { const i = this.peek(); this.at++; this.cue(i); }
    else { this.at = Math.max(0, this.at - 1); this.cue(this.order[this.at]); }
    if (play) {
      const a = this.audio!;
      a.currentTime = 0;
      a.play().then(() => { this.set({ playing: true }); this.preloadNext(); }).catch(() => this.set({ playing: false }));
    }
  }

  next() { this.advance(1, this.state.playing || Boolean(this.audio?.ended)); }
  prev() { this.advance(-1); }

  private onTakeover = (e: CustomEvent<{ source: string; on: boolean }>) => {
    const { source, on } = e.detail;
    const before = this.takers.size;
    if (on) this.takers.add(source); else this.takers.delete(source);
    if (on && before === 0 && this.state.playing) {
      // Made way for: held, to come back to.
      this.resumeAfter = true;
      this.audio?.pause();
      this.set({ playing: false, held: true });
    } else if (!on && this.takers.size === 0 && this.resumeAfter) {
      this.resumeAfter = false;
      this.set({ held: false });
      this.audio?.play().then(() => this.set({ playing: true })).catch(() => {});
    }
  };
}

export const soundtrack = new Soundtrack();
