/**
 * The site's soundtrack (hosted): the tracks in public/soundtrack, played in order, round and round,
 * by one audio element for the whole visit, so the music carries on from page to page.
 *
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

function remembered(): { on: boolean; index: number } {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { on: Boolean(v.on), index: Number(v.index) || 0 }; } catch { return { on: false, index: 0 }; }
}
function remember(on: boolean, index: number) { try { localStorage.setItem(KEY, JSON.stringify({ on, index })); } catch { /* private mode */ } }

class Soundtrack {
  private audio: HTMLAudioElement | null = null;
  private state: SoundtrackState = { tracks: [], index: 0, playing: false, held: false };
  private listeners = new Set<() => void>();
  private takers = new Set<string>();
  /** Playing when something took over: picked up again when it's done. */
  private resumeAfter = false;
  private armed = false;

  get snapshot() { return this.state; }
  subscribe(l: () => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private set(p: Partial<SoundtrackState>) { this.state = { ...this.state, ...p }; this.listeners.forEach(l => l()); }

  /** The tracks, once, from the layout; and, for a visitor who had it on, ready to pick up on their first tap. */
  load(tracks: Track[]) {
    if (typeof window === 'undefined' || this.state.tracks.length || !tracks.length) return;
    const r = remembered();
    this.set({ tracks, index: r.index % tracks.length });
    window.addEventListener('lp-audio', this.onTakeover as EventListener);
    if (r.on && getPrefs().music !== false && !this.armed) {
      this.armed = true;
      const go = () => { window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); if (!this.state.playing && !this.takers.size) this.play(); };
      window.addEventListener('pointerdown', go, true);
      window.addEventListener('keydown', go, true);
    }
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const a = this.audio = new Audio();
    a.preload = 'auto';
    a.volume = VOLUME;
    a.onended = () => this.next();
    a.onpause = () => { if (this.state.playing && !a.ended && !this.takers.size) this.set({ playing: false }); };
    a.onplay = () => this.set({ playing: true });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    }
    return a;
  }

  private cue(index: number) {
    const { tracks } = this.state;
    if (!tracks.length) return;
    const i = ((index % tracks.length) + tracks.length) % tracks.length;
    const a = this.element();
    if (a.src !== new URL(tracks[i].src, location.href).href) a.src = tracks[i].src;
    this.set({ index: i });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[i].title, artist: document.title.split('|').pop()?.trim() || 'LeaguePulse', album: 'Soundtrack' });
    }
  }

  /** Inside a tap. */
  play() {
    if (!this.state.tracks.length) return;
    this.cue(this.state.index);
    this.audio!.play().then(() => { this.set({ playing: true, held: false }); remember(true, this.state.index); }).catch(() => this.set({ playing: false }));
  }

  pause() {
    this.audio?.pause();
    this.resumeAfter = false;
    this.set({ playing: false });
    remember(false, this.state.index);
  }

  toggle() { if (this.state.playing || this.state.held) this.pause(); else this.play(); }

  next() { const was = this.state.playing || this.audio?.ended; this.cue(this.state.index + 1); if (was) this.play(); else remember(false, this.state.index); }
  prev() { const was = this.state.playing; this.cue(this.state.index - 1); if (was) this.play(); }

  private onTakeover = (e: CustomEvent<{ source: string; on: boolean }>) => {
    const { source, on } = e.detail;
    const before = this.takers.size;
    if (on) this.takers.add(source); else this.takers.delete(source);
    if (on && before === 0 && this.state.playing) {
      // Made way for: faded down and held, to come back to.
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
