'use client';

/**
 * Plays an episode of The Desk Weekly (lib/ai/podcast), line by line, and reports where it is.
 *
 *   speech     the browser reads each line (Web Speech), each host in a different voice; the
 *              word being spoken comes from the voice's boundary events, or from the clock
 *              where a voice doesn't send them
 *   recorded   each line's ElevenLabs recording (api/podcast/audio), with a real level meter
 *
 * Around the words, a sound mark: three rising notes and a soft thump when the show starts, a
 * whoosh between chapters (all synthesized, in Wrapped's key). Respects the visitor's sound
 * preference (lib/prefs music) only for those stings: the voices are what they pressed play for.
 */

import type { Episode } from '@/lib/ai/podcast';

export interface Position { chapter: number; line: number }
export interface EngineState extends Position {
  playing: boolean;
  /** How far through the current line, 0 to 1, and the character the voice has reached. */
  progress: number;
  char: number;
  rate: number;
  done: boolean;
}

type Listener = (s: EngineState) => void;

const MALE = /daniel|alex|fred|aaron|arthur|rishi|oliver|gordon|google uk english male|male|guy|david|mark/i;
const FEMALE = /samantha|karen|victoria|moira|tessa|serena|google us english|female|zira|aria|jenny|ava|allison/i;

/** A browser voice for each host: distinct where the browser has enough English voices, alternating
 *  men's and women's voices, best (natural, local, US) first. */
function pickVoices(n: number): (SpeechSynthesisVoice | null)[] {
  const all = typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices();
  const en = all.filter(v => /^en(-|_|$)/i.test(v.lang));
  const rank = (v: SpeechSynthesisVoice) => (/premium|enhanced|natural|neural/i.test(v.name) ? 3 : 0) + (v.localService ? 1 : 0) + (/en-US/i.test(v.lang) ? 1 : 0);
  const sorted = [...en].sort((x, y) => rank(y) - rank(x));
  const out: (SpeechSynthesisVoice | null)[] = [];
  for (let i = 0; i < n; i++) {
    const want = i % 2 ? FEMALE : MALE;
    const v = sorted.find(x => want.test(x.name) && !out.includes(x)) ?? sorted.find(x => !out.includes(x)) ?? sorted[i % Math.max(1, sorted.length)] ?? null;
    out.push(v);
  }
  return out;
}

/** Where two hosts share a browser voice, pitch and pace tell them apart. */
const SHADES = [{ pitch: 1, rate: 1 }, { pitch: 1.3, rate: 1.04 }, { pitch: 0.8, rate: 0.96 }, { pitch: 1.15, rate: 1.1 }];

export class PodcastEngine {
  readonly ep: Episode;
  readonly recorded: boolean;
  private state: EngineState = { chapter: 0, line: 0, playing: false, progress: 0, char: 0, rate: 1, done: false };
  private listeners = new Set<Listener>();
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private clock = 0;
  private started = 0;
  private token = 0;
  private voices: (SpeechSynthesisVoice | null)[] = [];
  private boundaryAt = 0;
  private stingsOn: () => boolean;

  constructor(ep: Episode, recorded: boolean, stingsOn: () => boolean = () => true) {
    this.ep = ep;
    this.recorded = recorded;
    this.stingsOn = stingsOn;
    if (typeof speechSynthesis !== 'undefined') {
      const n = Math.max(1, ep.hosts.length);
      this.voices = pickVoices(n);
      speechSynthesis.onvoiceschanged = () => { this.voices = pickVoices(n); };
    }
  }

  get snapshot(): EngineState { return this.state; }
  subscribe(l: Listener) { this.listeners.add(l); l(this.state); return () => { this.listeners.delete(l); }; }
  private set(patch: Partial<EngineState>) { this.state = { ...this.state, ...patch }; for (const l of this.listeners) l(this.state); }

  private get text() { return this.ep.chapters[this.state.chapter]?.lines[this.state.line]?.text ?? ''; }
  private get host() { return this.ep.chapters[this.state.chapter]?.lines[this.state.line]?.host ?? 0; }

  /** How loud the voice is right now, 0 to 1: measured for recordings, felt for speech. */
  level(): number {
    if (!this.state.playing) return 0;
    if (this.analyser) {
      const d = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(d);
      let sum = 0; for (const v of d) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / d.length) * 4);
    }
    // Speech can't be measured: a syllable-ish pulse, brighter right after each word.
    const t = performance.now();
    const fresh = Math.max(0, 1 - (t - this.boundaryAt) / 260);
    return 0.35 + 0.25 * Math.abs(Math.sin(t / 95)) + 0.35 * fresh;
  }

  play() {
    if (this.state.done) this.seek({ chapter: 0, line: 0 });
    this.unlockAudio();
    const fresh = this.state.chapter === 0 && this.state.line === 0 && this.state.progress === 0;
    this.set({ playing: true });
    if (fresh) { this.sting('open'); window.setTimeout(() => this.speak(), 1100); } else this.speak();
  }

  pause() {
    this.token++;
    this.set({ playing: false });
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.audio?.pause();
    cancelAnimationFrame(this.clock);
  }

  toggle() { if (this.state.playing) this.pause(); else this.play(); }

  setRate(rate: number) {
    this.set({ rate });
    if (this.audio) this.audio.playbackRate = rate;
    if (this.state.playing && !this.recorded) this.speak();
  }

  seek(pos: Position) {
    const was = this.state.playing;
    this.pause();
    const ch = Math.max(0, Math.min(this.ep.chapters.length - 1, pos.chapter));
    const ln = Math.max(0, Math.min(this.ep.chapters[ch].lines.length - 1, pos.line));
    this.set({ chapter: ch, line: ln, progress: 0, char: 0, done: false });
    if (was) { this.set({ playing: true }); this.speak(); }
  }

  next() { const c = this.state.chapter; if (c < this.ep.chapters.length - 1) { this.sting('turn'); this.seek({ chapter: c + 1, line: 0 }); } }
  prev() { const c = this.state.chapter; this.seek({ chapter: this.state.line > 0 ? c : Math.max(0, c - 1), line: 0 }); }

  /** Stops and lets go of the audio. Usable again after (React may mount it twice in development). */
  destroy() {
    this.pause();
    try { this.ctx?.close(); } catch { /* closed */ }
    this.ctx = null; this.analyser = null; this.source = null; this.audio = null;
  }

  // ── Speaking a line ──

  private speak() {
    const my = ++this.token;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.audio?.pause();
    cancelAnimationFrame(this.clock);
    this.set({ progress: 0, char: 0 });
    if (this.recorded) this.speakRecorded(my); else this.speakSynth(my);
  }

  private advance(my: number) {
    if (my !== this.token) return;
    const { chapter, line } = this.state;
    const ch = this.ep.chapters[chapter];
    if (line < ch.lines.length - 1) { this.set({ line: line + 1 }); window.setTimeout(() => my === this.token && this.speak(), 260); return; }
    if (chapter < this.ep.chapters.length - 1) {
      this.sting('turn');
      this.set({ chapter: chapter + 1, line: 0 });
      window.setTimeout(() => my === this.token && this.speak(), 700);
      return;
    }
    this.sting('close');
    this.set({ playing: false, done: true, progress: 1 });
  }

  private speakSynth(my: number) {
    if (typeof speechSynthesis === 'undefined') { this.set({ playing: false }); return; }
    const text = this.text, host = this.host;
    const u = new SpeechSynthesisUtterance(text);
    const v = this.voices[host];
    if (v) u.voice = v;
    const shared = this.voices.findIndex(x => x === v) !== host;
    const shade = shared ? SHADES[host % SHADES.length] : SHADES[0];
    u.pitch = shade.pitch;
    u.rate = 1.05 * shade.rate * this.state.rate;
    let boundaries = false;
    u.onboundary = e => { if (my !== this.token) return; boundaries = true; this.boundaryAt = performance.now(); this.set({ char: e.charIndex, progress: e.charIndex / Math.max(1, text.length) }); };
    u.onend = () => { if (my === this.token) { this.set({ char: text.length, progress: 1 }); this.advance(my); } };
    u.onerror = () => { if (my === this.token) this.advance(my); };
    // Where a voice sends no word boundaries, the clock stands in: about 15 characters a second.
    this.started = performance.now();
    const tick = () => {
      if (my !== this.token) return;
      if (!boundaries) {
        const p = Math.min(0.98, ((performance.now() - this.started) / 1000) * 15 * this.state.rate / Math.max(1, text.length));
        this.set({ progress: p, char: Math.floor(p * text.length) });
      }
      this.clock = requestAnimationFrame(tick);
    };
    this.clock = requestAnimationFrame(tick);
    speechSynthesis.speak(u);
  }

  private speakRecorded(my: number) {
    const { chapter, line } = this.state;
    const a = this.audio ?? (this.audio = new Audio());
    a.crossOrigin = 'anonymous';
    a.src = `/api/podcast/audio?ep=${encodeURIComponent(this.ep.id)}&c=${chapter}&l=${line}`;
    a.playbackRate = this.state.rate;
    if (this.ctx && !this.source) {
      try {
        this.source = this.ctx.createMediaElementSource(a);
        this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024;
        this.source.connect(this.analyser).connect(this.ctx.destination);
      } catch { /* metered by feel instead */ }
    }
    const text = this.text;
    a.onended = () => this.advance(my);
    // Not recorded (over the month's allowance, or ElevenLabs down): this line is read in the browser.
    a.onerror = () => { if (my !== this.token) return; cancelAnimationFrame(this.clock); this.speakSynth(my); };
    const tick = () => {
      if (my !== this.token) return;
      const p = a.duration ? a.currentTime / a.duration : 0;
      this.set({ progress: p, char: Math.floor(p * text.length) });
      this.clock = requestAnimationFrame(tick);
    };
    a.play().then(() => { this.clock = requestAnimationFrame(tick); }).catch(() => this.set({ playing: false }));
  }

  // ── The sound mark ──

  private unlockAudio() {
    if (this.ctx || typeof window === 'undefined') { this.ctx?.resume().catch(() => {}); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) this.ctx = new Ctx();
  }

  private sting(kind: 'open' | 'turn' | 'close') {
    const c = this.ctx;
    if (!c || !this.stingsOn()) return;
    const t = c.currentTime + 0.02;
    const out = c.createGain(); out.gain.value = 0.18; out.connect(c.destination);
    const note = (f: number, at: number, len: number, peak = 0.6, type: OscillatorType = 'triangle') => {
      const g = c.createGain(); g.connect(out);
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.start(at); o.stop(at + len + 0.05);
    };
    const thump = (at: number) => {
      const g = c.createGain(); g.connect(out);
      const o = c.createOscillator(); o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.18); o.connect(g);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(1, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      o.start(at); o.stop(at + 0.45);
    };
    if (kind === 'open') {
      // A, C sharp, E: up the A major chord, then the pulse.
      [440, 554.37, 659.25].forEach((f, i) => note(f, t + i * 0.14, 0.5));
      note(880, t + 0.42, 0.9, 0.4, 'sine');
      thump(t + 0.42);
    } else if (kind === 'turn') {
      const n = c.createBufferSource(); const buf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
      const g = c.createGain(); g.gain.value = 0.35;
      n.connect(f).connect(g).connect(out); n.start(t);
      note(659.25, t + 0.12, 0.35, 0.25, 'sine');
    } else {
      [659.25, 554.37, 440].forEach((f, i) => note(f, t + i * 0.16, 0.6, 0.5));
      thump(t + 0.5);
    }
  }
}
