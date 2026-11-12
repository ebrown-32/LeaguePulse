'use client';

/**
 * Plays an episode of The Desk Weekly (lib/ai/podcast), line by line, and reports where it is.
 *
 *   speech     the browser reads each line (Web Speech), each host in a different voice; the
 *              word being spoken comes from the voice's boundary events, or from the clock
 *              where a voice doesn't send them
 *   recorded   ElevenLabs: each chapter performed by the panel as one conversation
 *              (api/podcast/chapter), the line and the word being spoken found from its timings
 *              (each word's start, measured when it was recorded; estimated for older recordings
 *              and for lines recorded one at a time); a chapter
 *              that can't be had falls back to line-by-line recordings (api/podcast/audio), and
 *              those to the browser's voice. With a real level meter.
 *
 * Around the words, the show's sound: its theme when it starts, a stinger between chapters, the
 * crowd for a blowout or a nail-biter, a sign-off (public/podcast, made once with ElevenLabs Music
 * and Sound Effects), or synthesized stand-ins until those load. Respects the visitor's sound
 * preference (lib/prefs music) only for those: the voices are what they pressed play for.
 */

import { estimateWordStarts, plainLine, repairTimings, spokenWords } from '@/lib/podcastText';
import type { Episode } from '@/lib/ai/podcast';

export interface Position { chapter: number; line: number }

/** A line's place in its chapter's recording (api/podcast/chapter), in seconds. */
interface Timing { line: number; start: number; end: number; words?: number[] }

/** How far ahead of the clock a word lights up, in seconds: a frame to paint, and the colour's
 *  short fade (Player's Spoken), land as the word starts rather than after. */
const LEAD_S = 0.09;
export interface EngineState extends Position {
  playing: boolean;
  /** How far through the current line, 0 to 1, and where the word being said starts (-1 before
   *  the first). */
  progress: number;
  char: number;
  rate: number;
  done: boolean;
  /** Waiting on a recording: the first listener of a chapter waits while the panel records it. */
  buffering: boolean;
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

/**
 * A quarter second of silence, for unlocking the audio element inside a tap: a real MP3 file
 * (public/podcast/silence.mp3), the format every phone plays. A clip the phone won't play leaves
 * the element locked, and the first line blocked until a second tap.
 */
const silence = () => '/podcast/silence.mp3';

/**
 * iPhone and iPad (every browser there is Safari underneath) and Safari on a Mac. There, audio
 * played through the Web Audio API is muted by the ring/silent switch and can stall when the page
 * is backgrounded, so the voices play straight from the audio element, and the level meter is
 * felt, not measured.
 */
function appleAudio(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  return ios || safari;
}

/** Why a play() was refused: only some of these mean the recording is bad. */
type PlayRefusal = 'blocked' | 'interrupted' | 'failed';
function refusal(err: unknown): PlayRefusal {
  const name = (err as { name?: string })?.name;
  // Blocked: the browser wants a tap. Interrupted: a pause, a skip or the next load got there
  // first. Neither says anything about the recording.
  return name === 'NotAllowedError' ? 'blocked' : name === 'AbortError' ? 'interrupted' : 'failed';
}

/** The show's sound files, fetched once a page whatever players come and go. */
const RAW_SOUNDS = new Map<string, Promise<ArrayBuffer | null>>();

export class PodcastEngine {
  readonly ep: Episode;
  /** Whether lines are played from recordings. Turns false for the session if recordings keep failing. */
  recorded: boolean;
  private misses = 0;
  private state: EngineState = { chapter: 0, line: 0, playing: false, progress: 0, char: 0, rate: 1, done: false, buffering: false };
  private listeners = new Set<Listener>();
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private clock = 0;

  // ── Following the voice, word by word ──
  //
  // An audio element's currentTime moves in steps (every 250ms or so in Safari and Firefox), so a
  // highlight read straight from it stutters and trails. Between steps the clock runs on from the
  // last one at the playback rate; it never runs backwards except for a real seek.
  private heard = { media: -1, wall: 0, shown: -1 };

  private audioTime(a: HTMLAudioElement): number {
    const media = a.currentTime, wall = performance.now();
    if (media !== this.heard.media) this.heard = { media, wall, shown: this.heard.shown };
    const est = a.paused ? media : media + Math.min(0.35, ((wall - this.heard.wall) / 1000) * a.playbackRate);
    // A seek (or a new source) jumps back: follow it. A step that lands a hair behind the estimate: hold.
    const t = est < this.heard.shown - 0.3 ? est : Math.max(est, this.heard.shown);
    this.heard.shown = t;
    return t;
  }

  private resetClock() { this.heard = { media: -1, wall: 0, shown: -1 }; }

  /** Where the word being said at `t` starts in the line (-1 before the first), given each word's start. */
  private wordAt(text: string, starts: number[], t: number): number {
    const words = spokenWords(text);
    let i = -1;
    // A touch early: by the time the frame is painted and the colour has turned, the word is out.
    for (let k = 0; k < starts.length && k < words.length; k++) if (starts[k] <= t + LEAD_S) i = k;
    return i < 0 ? -1 : words[i].at;
  }
  private estimates = new Map<string, number[]>();
  private startsFor(key: string, text: string, start: number, end: number, measured?: number[], raw?: string): number[] {
    if (measured?.length) return measured;
    let e = this.estimates.get(key);
    if (!e) { e = estimateWordStarts(text, start, end, raw); this.estimates.set(key, e); }
    return e;
  }
  private started = 0;
  private token = 0;
  private voices: (SpeechSynthesisVoice | null)[] = [];
  private boundaryAt = 0;
  private stingsOn: () => boolean;

  constructor(ep: Episode, recorded: boolean, stingsOn: () => boolean = () => true) {
    this.ep = ep;
    this.recorded = recorded;
    this.stingsOn = stingsOn;
    this.fetchSounds();
    if (typeof speechSynthesis !== 'undefined') {
      const n = Math.max(1, ep.hosts.length);
      this.voices = pickVoices(n);
      speechSynthesis.onvoiceschanged = () => { this.voices = pickVoices(n); };
    }
  }

  get snapshot(): EngineState { return this.state; }
  subscribe(l: Listener) { this.listeners.add(l); l(this.state); return () => { this.listeners.delete(l); }; }
  private set(patch: Partial<EngineState>) { this.state = { ...this.state, ...patch }; for (const l of this.listeners) l(this.state); }

  private get text() { return plainLine(this.ep.chapters[this.state.chapter]?.lines[this.state.line]?.text ?? ''); }
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
    const t = performance.now();
    // A recording playing without a meter (Safari): a speech-like pulse while it plays.
    if (this.recorded && this.audio && !this.audio.paused) return 0.4 + 0.3 * Math.abs(Math.sin(t / 110)) * Math.abs(Math.sin(t / 47 + 1));
    // Speech can't be measured: a syllable-ish pulse, brighter right after each word.
    const fresh = Math.max(0, 1 - (t - this.boundaryAt) / 260);
    return 0.35 + 0.25 * Math.abs(Math.sin(t / 95)) + 0.35 * fresh;
  }

  play() {
    if (this.state.done) this.seek({ chapter: 0, line: 0 });
    this.unlockAudio();
    this.unlockPlayback();
    const fresh = this.state.chapter === 0 && this.state.line === 0 && this.state.progress === 0;
    this.set({ playing: true });
    if (this.recorded) this.fetchChapter(this.state.chapter);
    if (fresh) {
      // A moment for the theme to decode (it was fetched when the player appeared), then it plays.
      const my = this.token;
      const go = () => { if (my !== this.token || !this.state.playing) return; const lead = this.sting('open'); window.setTimeout(() => my === this.token && this.speak(), lead); };
      Promise.race([this.loadSounds(), new Promise(r => setTimeout(r, 400))]).then(go);
    } else { this.loadSounds(); this.speak(); }
  }

  pause() {
    this.token++;
    this.set({ playing: false, buffering: false });
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.audio?.pause();
    this.stopVoice(true);
    cancelAnimationFrame(this.clock);
  }

  toggle() { if (this.state.playing) this.pause(); else this.play(); }

  /** The show's audio, once a tap has woken it: for music played under the voices (Studio's highlights). */
  audioContext(): AudioContext | null { return this.ctx && this.ctx.state === 'running' ? this.ctx : null; }

  setRate(rate: number) {
    // A chapter playing through Web Audio keeps its place at the new speed.
    if (this.voice && this.ctx) {
      const t = this.voiceTime();
      this.voice.playbackRate.value = rate;
      this.voiceAt = this.ctx.currentTime - t / rate;
    }
    this.set({ rate });
    if (this.audio) this.audio.playbackRate = rate;
    if (this.state.playing && !this.recorded) this.speak();
  }

  seek(pos: Position) {
    const was = this.state.playing;
    this.pause();
    this.resumeAt = null;
    const ch = Math.max(0, Math.min(this.ep.chapters.length - 1, pos.chapter));
    const ln = Math.max(0, Math.min(this.ep.chapters[ch].lines.length - 1, pos.line));
    this.set({ chapter: ch, line: ln, progress: 0, char: -1, done: false });
    if (was) { this.set({ playing: true }); this.speak(); }
  }

  next() { const c = this.state.chapter; if (c < this.ep.chapters.length - 1) { this.sting('turn'); this.seek({ chapter: c + 1, line: 0 }); } }
  prev() { const c = this.state.chapter; this.seek({ chapter: this.state.line > 0 ? c : Math.max(0, c - 1), line: 0 }); }

  /** Stops and lets go of the audio. Usable again after (React may mount it twice in development). */
  destroy() {
    this.pause();
    this.buffers.clear();
    try { this.ctx?.close(); } catch { /* closed */ }
    this.ctx = null; this.analyser = null; this.source = null; this.audio = null;
    for (const got of this.lines.values()) got.then(u => { if (u) URL.revokeObjectURL(u); });
    for (const got of this.takes.values()) got.then(t => { if (t) URL.revokeObjectURL(t.url); });
    this.lines.clear(); this.takes.clear(); this.loadedChapter = -1;
  }

  // ── Speaking a line ──

  private speak() {
    const my = ++this.token;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.audio?.pause();
    cancelAnimationFrame(this.clock);
    this.set({ progress: 0, char: -1 });
    if (!this.recorded) this.speakSynth(my);
    else if (this.lineMode.has(this.state.chapter)) this.speakRecorded(my);
    else if (appleAudio() && this.ctx) this.speakChapterWeb(my);
    else this.speakChapter(my);
  }

  // ── Chapters through Web Audio (Apple devices) ──
  //
  // Safari on an iPhone lets an audio element start only from a tap, and in practice that
  // doesn't reliably carry over to a new chapter started later: the theme plays first and each
  // chapter begins on its own, so the voices could be refused and the show stopped until it was
  // tapped again. Web Audio, once the tap has woken it, plays whatever it's given for the rest of
  // the visit. So on Apple devices each chapter is decoded once and played as a buffer, through
  // the same meter as everything else (a real one: the studio's lights follow the voices). The
  // audio session is "playback" (unlockAudio), so the silent switch doesn't mute it.

  private buffers = new Map<number, Promise<AudioBuffer | null>>();
  private voice: AudioBufferSourceNode | null = null;
  private voiceOutNode: GainNode | null = null;
  /** The context's time at which the chapter's start would have played, at the current speed. */
  private voiceAt = 0;
  private voiceChapter = -1;
  /** Where a pause left off, so play carries on from inside the line. */
  private resumeAt: { chapter: number; t: number } | null = null;

  private voiceTime(): number { return this.ctx ? (this.ctx.currentTime - this.voiceAt) * this.state.rate : 0; }

  private stopVoice(keepPlace: boolean) {
    const v = this.voice;
    if (!v) return;
    if (keepPlace) this.resumeAt = { chapter: this.voiceChapter, t: this.voiceTime() };
    v.onended = null;
    try { v.stop(); } catch { /* not started */ }
    v.disconnect();
    this.voice = null;
  }

  private voiceOut(): AudioNode {
    const c = this.ctx!;
    if (!this.voiceOutNode) {
      this.voiceOutNode = c.createGain();
      if (!this.analyser) { this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024; }
      this.voiceOutNode.connect(this.analyser).connect(c.destination);
    }
    return this.voiceOutNode;
  }

  private bufferFor(c: number, url: string): Promise<AudioBuffer | null> {
    let b = this.buffers.get(c);
    if (!b) {
      b = fetch(url).then(r => r.arrayBuffer()).then(d => this.ctx!.decodeAudioData(d)).catch(() => null);
      this.buffers.set(c, b);
      b.then(x => { if (!x) this.buffers.delete(c); });
    }
    return b;
  }

  private speakChapterWeb(my: number) {
    const c = this.state.chapter, ctx = this.ctx!;
    const wait = window.setTimeout(() => { if (my === this.token) this.set({ buffering: true }); }, 350);
    this.fetchChapter(c).then(async take => {
      if (my !== this.token) { window.clearTimeout(wait); return; }
      if (!take) {
        window.clearTimeout(wait); this.set({ buffering: false });
        if (!this.recorded) { this.speakSynth(my); return; }
        this.lineMode.add(c); this.speakRecorded(my); return;
      }
      const buf = await this.bufferFor(c, take.url);
      window.clearTimeout(wait);
      if (my !== this.token) return;
      this.set({ buffering: false });
      // Couldn't be decoded here: the audio element instead.
      if (!buf) { this.speakChapter(my); return; }
      const next = this.ep.chapters[c + 1] ? this.fetchChapter(c + 1) : null;
      next?.then(t => { if (t) this.bufferFor(c + 1, t.url); });

      const segs = take.segments;
      const from = segs[this.state.line] ?? segs[0];
      const r = this.resumeAt;
      const offset = r && r.chapter === c && r.t >= from.start && r.t < from.end ? r.t : Math.max(0, from.start);
      this.resumeAt = null;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = this.state.rate;
      src.connect(this.voiceOut());
      src.start(0, Math.min(offset, Math.max(0, buf.duration - 0.05)));
      this.voice = src; this.voiceChapter = c;
      this.voiceAt = ctx.currentTime - offset / this.state.rate;
      this.unlocked = true;
      src.onended = () => { if (my === this.token && this.voice === src) { this.voice = null; this.misses = 0; this.nextChapter(my); } };

      const tick = () => {
        if (my !== this.token) return;
        const t = this.voiceTime();
        let i = 0;
        for (let k = 0; k < segs.length; k++) if (segs[k].start <= t + LEAD_S) i = k;
        const s = segs[i];
        const p = s.end > s.start ? Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start))) : 1;
        const raw = this.ep.chapters[c]?.lines[s.line]?.text ?? '';
        const text = plainLine(raw);
        const char = this.wordAt(text, this.startsFor(`c${c}:${s.line}`, text, s.start, s.end, s.words, raw), t);
        if (s.line !== this.state.line) { this.set({ line: s.line }); this.react(c, s.line); }
        if (p !== this.state.progress || char !== this.state.char) this.set({ progress: p, char });
        this.clock = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(this.clock);
      this.clock = requestAnimationFrame(tick);
      // If the system has the audio held (a call, another app), the show waits for a tap rather
      // than pretending to play.
      window.setTimeout(() => {
        if (my === this.token && this.state.playing && ctx.state !== 'running') { this.stopVoice(true); this.pause(); }
      }, 1500);
    });
  }

  /** On to the next chapter (with its stinger, and the crowd if the game calls for it), or the end. */
  private nextChapter(my: number) {
    if (my !== this.token) return;
    const { chapter } = this.state;
    if (chapter < this.ep.chapters.length - 1) {
      this.sting('turn');
      this.crowdFor(chapter + 1);
      this.set({ chapter: chapter + 1, line: 0 });
      window.setTimeout(() => my === this.token && this.speak(), 700);
      return;
    }
    this.sting('close');
    this.set({ playing: false, done: true, progress: 1 });
  }

  private advance(my: number) {
    if (my !== this.token) return;
    const { chapter, line } = this.state;
    const ch = this.ep.chapters[chapter];
    if (line < ch.lines.length - 1) { this.set({ line: line + 1 }); window.setTimeout(() => my === this.token && this.speak(), 260); return; }
    this.nextChapter(my);
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
        const length = text.length / 15 / this.state.rate;
        const t = (performance.now() - this.started) / 1000;
        const p = Math.min(0.98, t / Math.max(0.1, length));
        const char = this.wordAt(text, this.startsFor(`s${this.state.chapter}:${this.state.line}:${this.state.rate}`, text, 0, length), t);
        if (p !== this.state.progress || char !== this.state.char) this.set({ progress: p, char });
      }
      this.clock = requestAnimationFrame(tick);
    };
    this.clock = requestAnimationFrame(tick);
    speechSynthesis.speak(u);
  }

  // ── Recordings: a chapter at a time, the next one fetched while this one plays ──

  private takes = new Map<number, Promise<{ url: string; segments: Timing[] } | null>>();
  /** Chapters that couldn't be had whole, played line by line instead. */
  private lineMode = new Set<number>();
  private loadedChapter = -1;

  private fetchChapter(c: number) {
    let got = this.takes.get(c);
    if (!got) {
      const url = `/api/podcast/chapter?ep=${encodeURIComponent(this.ep.id)}&c=${c}`;
      // 503: someone else's play is recording this chapter right now. It's worth waiting for
      // rather than recording the chapter again line by line.
      const ask = async (tries: number): Promise<Response> => {
        const r = await fetch(url);
        if (r.status === 503 && tries > 0) { await new Promise(res => setTimeout(res, 3000)); return ask(tries - 1); }
        return r;
      };
      got = ask(2)
        .then(async r => {
          // 429: the league's recorded voices are used up for the month (or this visitor asked
          // for too many). The episode is all-or-nothing, so the browser reads all of it.
          if (r.status === 429) { this.recorded = false; return null; }
          if (!r.ok) return null;
          // Older recordings can have a line with no time of its own (folded into the line before):
          // shared out, so no line is skipped (lib/podcastText repairTimings).
          const segments = repairTimings(JSON.parse(r.headers.get('x-lp-segments') || '[]') as Timing[], this.ep.chapters[c]?.lines.map(l => l.text) ?? []);
          const b = await r.blob();
          return b.size && segments.length ? { url: URL.createObjectURL(b), segments } : null;
        })
        .catch(() => null);
      // A miss is remembered for half a minute (so the line-by-line fallback doesn't ask again
      // straight away), then forgotten, so a later play can try the whole chapter again.
      got.then(t => { if (!t) window.setTimeout(() => this.takes.delete(c), 30_000); });
      this.takes.set(c, got);
    }
    return got;
  }

  /** The one audio element everything recorded plays through, wired to the level meter (except
   *  on Apple devices: see appleAudio). Everything it plays is from this site, as blobs. */
  private element(): HTMLAudioElement {
    const a = this.audio ?? (this.audio = new Audio());
    a.preload = 'auto';
    if (this.ctx && !this.source && !appleAudio()) {
      try {
        this.source = this.ctx.createMediaElementSource(a);
        this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024;
        this.source.connect(this.analyser).connect(this.ctx.destination);
      } catch { /* metered by feel instead */ }
    }
    return a;
  }

  private speakChapter(my: number) {
    const c = this.state.chapter;
    const a = this.element();
    const wait = window.setTimeout(() => { if (my === this.token) this.set({ buffering: true }); }, 350);
    this.fetchChapter(c).then(take => {
      window.clearTimeout(wait);
      if (my !== this.token) return;
      this.set({ buffering: false });
      if (!take) {
        if (!this.recorded) { this.speakSynth(my); return; }
        this.lineMode.add(c); this.speakRecorded(my); return;
      }
      if (this.ep.chapters[c + 1]) this.fetchChapter(c + 1);
      const segs = take.segments;
      const from = segs[this.state.line] ?? segs[0];
      const place = () => {
        // Resuming inside the line it stopped on carries on from there; anything else starts the line.
        if (a.currentTime < from.start || a.currentTime >= from.end) a.currentTime = Math.max(0, from.start);
        this.resetClock();
      };
      if (this.loadedChapter !== c) {
        this.loadedChapter = c;
        a.src = take.url;
        a.addEventListener('loadedmetadata', place, { once: true });
      } else place();
      a.playbackRate = this.state.rate;
      a.onended = () => { if (my === this.token) { this.misses = 0; this.nextChapter(my); } };
      a.onerror = () => { if (my === this.token) { this.loadedChapter = -1; this.lineMode.add(c); this.speakRecorded(my); } };
      const tick = () => {
        if (my !== this.token) return;
        const t = this.audioTime(a);
        let i = 0;
        for (let k = 0; k < segs.length; k++) if (segs[k].start <= t + LEAD_S) i = k;
        const s = segs[i];
        const p = s.end > s.start ? Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start))) : 1;
        const raw = this.ep.chapters[c]?.lines[s.line]?.text ?? '';
        const text = plainLine(raw);
        const char = this.wordAt(text, this.startsFor(`c${c}:${s.line}`, text, s.start, s.end, s.words, raw), t);
        if (s.line !== this.state.line) { this.set({ line: s.line }); this.react(c, s.line); }
        if (p !== this.state.progress || char !== this.state.char) this.set({ progress: p, char });
        this.clock = requestAnimationFrame(tick);
      };
      this.start(a, my, tick, () => { this.loadedChapter = -1; this.lineMode.add(c); this.speakRecorded(my); });
    });
  }

  // ── Recordings, a line at a time (when a chapter can't be had whole), fetched a line ahead ──
  //
  // A line is recorded the first time anyone plays it, which takes a few seconds. So while one line
  // plays, the next is already being fetched (and recorded, for the first listener), and each line
  // starts the moment the last one ends. Held as blobs, so playing one never asks the server twice.

  private lines = new Map<string, Promise<string | null>>();

  private lineAt(chapter: number, line: number): { chapter: number; line: number } | null {
    const ch = this.ep.chapters[chapter];
    if (!ch) return null;
    if (line < ch.lines.length) return { chapter, line };
    return this.ep.chapters[chapter + 1] ? { chapter: chapter + 1, line: 0 } : null;
  }

  private fetchLine(chapter: number, line: number): Promise<string | null> {
    const key = `${chapter}:${line}`;
    let got = this.lines.get(key);
    if (!got) {
      got = fetch(`/api/podcast/audio?ep=${encodeURIComponent(this.ep.id)}&c=${chapter}&l=${line}`)
        .then(r => (r.ok ? r.blob() : null))
        .then(b => (b && b.size ? URL.createObjectURL(b) : null))
        .catch(() => null);
      // A miss isn't kept: the next try (a seek back, say) asks again.
      got.then(u => { if (!u) this.lines.delete(key); });
      this.lines.set(key, got);
    }
    return got;
  }

  /** Starts fetching the line after the current one, within this chapter: the next chapter is
   *  tried whole first, and fetching its first line alone would pay for that line twice. */
  private prefetchNext() {
    if (!this.recorded) return;
    const { chapter, line } = this.state;
    const next = this.lineAt(chapter, line + 1);
    if (next && next.chapter === chapter) this.fetchLine(next.chapter, next.line);
  }

  private speakRecorded(my: number) {
    const { chapter, line } = this.state;
    const a = this.element();
    this.loadedChapter = -1;
    const text = this.text;
    // Not recorded (over the month's allowance, or ElevenLabs down): the line is read in the browser
    // instead. Only after three lines in a row come back unrecorded from the server does the rest
    // of the episode follow without asking again; a hiccup playing one line never does that.
    let fellBack = false;
    const fallBack = (refused: boolean) => {
      if (my !== this.token || fellBack) return;
      fellBack = true;
      cancelAnimationFrame(this.clock);
      if (refused && ++this.misses >= 3) this.recorded = false;
      this.speakSynth(my);
    };
    const tick = () => {
      if (my !== this.token) return;
      const t = this.audioTime(a);
      const p = a.duration ? Math.min(1, t / a.duration) : 0;
      // A line on its own has no timings: estimated across it, less the recording's quiet ends.
      const char = a.duration ? this.wordAt(text, this.startsFor(`l${chapter}:${line}:${a.duration}`, text, Math.min(0.12, a.duration / 10), Math.max(0, a.duration - 0.25), undefined, this.ep.chapters[chapter]?.lines[line]?.text), t) : -1;
      if (p !== this.state.progress || char !== this.state.char) this.set({ progress: p, char });
      this.clock = requestAnimationFrame(tick);
    };

    const wait = window.setTimeout(() => { if (my === this.token) this.set({ buffering: true }); }, 350);
    this.fetchLine(chapter, line).then(url => {
      window.clearTimeout(wait);
      if (my !== this.token) return;
      this.set({ buffering: false });
      if (!url) { fallBack(true); return; }
      this.prefetchNext();
      a.src = url;
      this.resetClock();
      a.playbackRate = this.state.rate;
      a.onended = () => { this.misses = 0; this.advance(my); };
      a.onerror = () => fallBack(false);
      this.start(a, my, tick, () => fallBack(false));
    });
  }

  // ── The sound mark ──

  /**
   * Phones only let audio start from a tap, and the first line starts a beat after it (the sting
   * plays first). So, inside the tap: the one audio element every line plays through is started
   * on a moment of silence, and the browser's voice speaks nothing. Both then stay allowed for
   * the rest of the episode, recordings and the browser-voice fallback alike.
   */
  private unlockPlayback() {
    if (typeof window === 'undefined') return;
    // Until a play on the element has gone through, every tap tries the unlock again. Not on Apple
    // devices: their chapters play through Web Audio, and an element starting and ending a moment
    // later (the silence) ends iOS's audio session with it, cutting the theme off mid-note.
    if (this.recorded && !appleAudio() && !this.unlocked && (!this.audio || this.audio.paused)) {
      const a = this.audio ?? (this.audio = new Audio());
      a.preload = 'auto';
      this.loadedChapter = -1;
      a.src = silence();
      a.play().then(() => { this.unlocked = true; }).catch(() => { /* the next tap tries again */ });
    }
    if (typeof speechSynthesis !== 'undefined' && !this.speechUnlocked) {
      this.speechUnlocked = true;
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  }
  private speechUnlocked = false;
  /** Whether the audio element has been allowed to play (by a play inside a tap). */
  private unlocked = false;

  private unlockAudio() {
    if (typeof window === 'undefined') return;
    // Safari (16.4 and later): the show is media, like a video. Without this, once the theme has
    // played through Web Audio, an iPhone on silent mutes the voices that follow it too.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'playback') { try { session.type = 'playback'; } catch { /* older Safari */ } }
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.ctx = new Ctx();
        // iOS can take the audio away mid-show (a call, another app, the session ending): try to
        // carry on by itself; if it can't within a moment, pause cleanly at the line, so one tap
        // picks it up again rather than a play button that shows playing over silence.
        const c = this.ctx;
        c.onstatechange = () => {
          if (c !== this.ctx || c.state === 'running' || !this.state.playing) return;
          c.resume().catch(() => {});
          window.setTimeout(() => {
            if (c === this.ctx && c.state !== 'running' && this.state.playing) { this.stopVoice(true); this.pause(); }
          }, 1200);
        };
      }
    }
    // Inside the tap: some browsers make a new context suspended until it's asked to run.
    this.ctx?.resume().catch(() => {});
  }

  /**
   * Starts the voice on the element and keeps it honest. A start the browser cut short (a new
   * load got in its way) is tried again rather than left silent with the button saying it's
   * playing; and two seconds in, if the element still isn't moving, it's started again, or, if the
   * browser won't allow that outside a tap, the player shows Play so one tap carries on.
   */
  private start(a: HTMLAudioElement, my: number, tick: () => void, failed: () => void) {
    const go = (retry: boolean) => a.play().then(() => {
      if (my !== this.token) return;
      this.unlocked = true;
      cancelAnimationFrame(this.clock);
      this.clock = requestAnimationFrame(tick);
    }).catch((err: unknown) => {
      if (my !== this.token) return;
      const why = refusal(err);
      if (why === 'blocked') { this.unlocked = false; this.set({ playing: false }); }
      else if (why === 'failed') failed();
      else if (retry) window.setTimeout(() => { if (my === this.token && this.state.playing && a.paused && !a.ended) go(false); }, 200);
    });
    go(true);
    window.setTimeout(() => {
      if (my !== this.token || !this.state.playing || !a.paused || a.ended || this.state.buffering) return;
      go(false);
    }, 2000);
  }

  // The show's sound, made once with ElevenLabs Music and Sound Effects and served as plain files:
  // nothing is generated per episode or per league. Decoded into the audio context, which the tap
  // unlocked, so they play on phones between lines too.
  private sounds = new Map<string, AudioBuffer>();

  private decoding: Promise<void> | null = null;
  private get raw() { return RAW_SOUNDS; }

  /** Fetches the sound files once a page, as soon as a player exists. */
  private fetchSounds() {
    if (typeof window === 'undefined' || RAW_SOUNDS.size) return;
    for (const name of ['theme', 'turn', 'close', 'roar', 'groan']) {
      RAW_SOUNDS.set(name, fetch(`/podcast/${name}.mp3`).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
    }
  }

  /** Decodes them into the audio context (once it exists, after the tap). */
  private loadSounds(): Promise<void> {
    const c = this.ctx;
    if (!c) return Promise.resolve();
    this.fetchSounds();
    this.decoding ??= Promise.all([...this.raw.entries()].map(async ([name, got]) => {
      const bytes = await got;
      if (!bytes) return;
      try { this.sounds.set(name, await c.decodeAudioData(bytes.slice(0))); } catch { /* stand-in instead */ }
    })).then(() => {});
    return this.decoding;
  }

  /** Plays a loaded sound under the voices; false if it isn't loaded. */
  private playSound(name: string, gain: number, fadeAfter?: number): boolean {
    const c = this.ctx, buf = this.sounds.get(name);
    if (!c || !buf) return false;
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(g).connect(c.destination);
    const t = c.currentTime + 0.02;
    src.start(t);
    if (fadeAfter !== undefined && fadeAfter < buf.duration) {
      // Ducked under the first voice, then gone.
      g.gain.setValueAtTime(gain, t + fadeAfter);
      g.gain.linearRampToValueAtTime(gain * 0.25, t + fadeAfter + 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + fadeAfter + 2.2);
      src.stop(t + fadeAfter + 2.3);
    }
    return true;
  }

  /** The crowd for a game chapter that earns it: a roar for a blowout, a groan for a nail-biter. */
  private crowdFor(chapter: number) {
    if (!this.stingsOn()) return;
    const v = this.ep.chapters[chapter]?.visual;
    if (v?.type !== 'matchup') return;
    if (v.margin >= 40) this.playSound('roar', 0.22);
    else if (v.margin <= 5) this.playSound('groan', 0.22);
  }

  /**
   * The soundboard, run by the show itself: when a host gets loud in a game segment the crowd
   * goes up, and a groan from the panel gets one from the crowd. Low under the voices, and at most
   * one every fifteen seconds, so it lands as a moment rather than a laugh track.
   */
  private reacted = 0;
  private react(chapter: number, line: number) {
    if (!this.stingsOn()) return;
    const ch = this.ep.chapters[chapter], raw = ch?.lines[line]?.text ?? '';
    const now = performance.now();
    if (now - this.reacted < 15_000) return;
    const sound = /\[(shouting|excited)\]/i.test(raw) && (ch.kind === 'games' || ch.kind === 'open') ? 'roar'
      : /\[(groans|exasperated)\]/i.test(raw) ? 'groan' : null;
    if (sound && this.playSound(sound, 0.12)) this.reacted = now;
  }

  /** Plays a sting; returns how long before the first voice should start, in ms. */
  private sting(kind: 'open' | 'turn' | 'close'): number {
    const c = this.ctx;
    if (!c || !this.stingsOn()) return 400;
    if (kind === 'open') {
      const theme = this.sounds.get('theme');
      // The theme plays in, and the first voice comes in over its tail.
      if (theme && this.playSound('theme', 0.5, Math.min(4.5, Math.max(1.5, theme.duration - 2)))) return Math.min(4200, Math.max(1200, (theme.duration - 2.3) * 1000));
    } else if (this.playSound(kind, kind === 'turn' ? 0.4 : 0.5)) return 700;
    this.synthSting(kind);
    return 1100;
  }

  private synthSting(kind: 'open' | 'turn' | 'close') {
    const c = this.ctx;
    if (!c) return;
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
