/**
 * League Wrapped's soundtrack, played live in the browser (Web Audio): an original loop, no
 * recordings, no files to download and nothing to license. 124 BPM in A minor (Am F C G), in
 * sections so a three-minute story never hears the same bar twice in a row:
 *
 *   count-in   one bar of hats and a riser, into the drop
 *   A  8 bars  drums, bass, chord stabs
 *   B  8 bars  the same, with an arpeggio on top
 *   break 8    no kick: a pad and the bass, a riser in the last two bars
 *   C  8 bars  everything
 *
 * And the story's moments: a fanfare for a title, a sad trombone for the worst week, a record
 * scratch for the bad trade, a low boom for heartbreak, a hit on the beat for the big numbers.
 * Sad slides muffle the music. Browsers only let sound start from a tap: call `unlock` inside one.
 *
 * Or the league's own track (setTrack): an original instrumental ElevenLabs Music wrote for that
 * season, in the mood it earned (lib/wrapped/soundtrack). It plays through the same chain, so the
 * moments, the muffling and the stage's thump all still work: looped with a crossfade, the thump
 * read from its bass, the pitched moments with the track ducked under them. Until it has loaded,
 * or where there isn't one, the loop above; a track that arrives mid-story takes over on a bar line.
 *
 * Client only.
 */

import { getPrefs, setPrefs } from '../prefs';

export type Cue = 'fanfare' | 'trombone' | 'scratch' | 'boom' | 'impact' | null;

const BPM = 124;
const STEP = 60 / BPM / 4; // a sixteenth, in seconds
const BAR = 16;
const COUNT_IN = -BAR;
/** Am, F, C, G: voiced close together, and the bass's roots. */
const CHORDS = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];
const ROOTS = [33, 29, 36, 31];
/** Where the stabs land in a bar, in sixteenths: the syncopation. */
const STABS = new Set([0, 3, 6, 10, 12]);
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const VOLUME = 0.68;
/** A finished, mastered track is far louder than the loop's parts: it sits under the moments. */
const TRACK_VOLUME = 0.42;
/** How long one pass of a track fades into the next, in seconds. */
const XFADE = 1.6;

type Section = 'A' | 'B' | 'break' | 'C';
const sectionOf = (bar: number): Section => { const b = bar % 32; return b < 8 ? 'A' : b < 16 ? 'B' : b < 24 ? 'break' : 'C'; };

class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private tone!: BiquadFilterNode;
  private drums!: GainNode;
  private duck!: GainNode;
  private send!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private step = COUNT_IN;
  private next = 0;
  private zero = 0;
  private running = false;
  private held = false;
  private gen = 0;

  // The league's own track, when it has one.
  private trackUrl: string | null = null;
  private trackBytes: Promise<ArrayBuffer | null> | null = null;
  private trackBuf: AudioBuffer | null = null;
  private trackOn = false;
  private trackGain!: GainNode;
  private trackMeter!: AnalyserNode;
  private trackBins: Uint8Array<ArrayBuffer> | null = null;
  private trackNextAt = 0;
  private trackFirst = true;
  /** When the track comes in: the loop plays up to there. */
  private trackStartAt = 0;
  private sources: AudioBufferSourceNode[] = [];
  /** Off when the visitor turned the music off (lib/prefs), here or in their preferences. */
  get muted() { return getPrefs().music === false; }

  /** Call inside a tap: makes (or wakes) the audio, which browsers allow only then. */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.build(new Ctx());
    }
    if (!this.held && this.ctx!.state !== 'running') this.ctx!.resume().catch(() => {});
  }

  private build(c: AudioContext) {
    this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(this.master).connect(c.destination);
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 18000; this.tone.Q.value = 0.7;
    this.tone.connect(comp);
    this.drums = c.createGain(); this.drums.gain.value = 0.9; this.drums.connect(this.tone);
    // Everything but the drums ducks under the kick.
    this.duck = c.createGain(); this.duck.connect(this.tone);
    const delay = c.createDelay(1); delay.delayTime.value = STEP * 3;
    const fb = c.createGain(); fb.gain.value = 0.3;
    const wet = c.createGain(); wet.gain.value = 0.22;
    this.send = c.createGain();
    this.send.connect(delay).connect(fb).connect(delay); delay.connect(wet).connect(this.duck);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(comp);
    // The league's track: through the tone filter (sad slides muffle it too), metered for the thump.
    this.trackGain = c.createGain(); this.trackGain.gain.value = 0; this.trackGain.connect(this.tone);
    this.trackMeter = c.createAnalyser(); this.trackMeter.fftSize = 256; this.trackMeter.smoothingTimeConstant = 0.55;
    this.trackGain.connect(this.trackMeter);
    this.decodeTrack();
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  }

  /**
   * The story's own track (a URL from api/wrapped/soundtrack), or null for the synthesized loop.
   * Fetched now, decoded once there's audio to decode with, and played from the next start, or
   * from the next bar if the story is already playing.
   */
  setTrack(url: string | null) {
    if (url === this.trackUrl) return;
    this.trackUrl = url; this.trackBuf = null;
    this.trackBytes = url ? fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
    if (!url && this.trackOn) this.endTrack();
    this.decodeTrack();
  }

  private async decodeTrack() {
    const c = this.ctx, url = this.trackUrl, bytes = this.trackBytes;
    if (!c || !url || !bytes) return;
    const data = await bytes;
    if (!data || url !== this.trackUrl || this.trackBuf) return;
    const buf = await c.decodeAudioData(data.slice(0)).catch(() => null);
    if (!buf || url !== this.trackUrl) return;
    this.trackBuf = buf;
    // Already playing the loop: take over on the next bar.
    if (this.running && !this.trackOn) {
      const bar = STEP * BAR;
      this.beginTrack(this.zero + Math.ceil((c.currentTime + 0.1 - this.zero) / bar) * bar);
    }
  }

  private beginTrack(at: number) {
    const c = this.ctx!;
    this.trackOn = true; this.trackFirst = true;
    this.trackNextAt = Math.max(at, c.currentTime + 0.05);
    this.trackStartAt = this.trackNextAt;
    this.trackGain.gain.cancelScheduledValues(c.currentTime);
    this.trackGain.gain.setValueAtTime(0.0001, this.trackNextAt);
    this.trackGain.gain.exponentialRampToValueAtTime(TRACK_VOLUME, this.trackNextAt + 0.5);
    this.queueTrack();
  }

  /** Keeps the next pass of the track queued: each one fades into the next over XFADE seconds. */
  private queueTrack() {
    const c = this.ctx, buf = this.trackBuf;
    if (!c || !buf || !this.trackOn) return;
    while (this.trackNextAt < c.currentTime + 1.5) {
      const at = this.trackNextAt, len = buf.duration, xf = Math.min(XFADE, len / 4);
      const src = c.createBufferSource(); src.buffer = buf;
      const g = c.createGain(); src.connect(g).connect(this.trackGain);
      if (this.trackFirst) g.gain.setValueAtTime(1, at);
      else { g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(1, at + xf); }
      g.gain.setValueAtTime(1, at + len - xf); g.gain.linearRampToValueAtTime(0.0001, at + len);
      src.start(at); src.stop(at + len + 0.05);
      src.onended = () => { this.sources = this.sources.filter(x => x !== src); };
      this.sources.push(src);
      this.trackFirst = false;
      this.trackNextAt = at + len - xf;
    }
  }

  private endTrack() {
    this.trackOn = false;
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } }
    this.sources = [];
  }

  /** From the count-in: the story opened. */
  start() {
    this.unlock();
    const c = this.ctx; if (!c || this.running) return;
    this.gen++;
    this.running = true; this.held = false;
    this.step = COUNT_IN;
    this.next = c.currentTime + 0.08;
    this.zero = this.next - COUNT_IN * STEP;
    // The league's track, when it's ready, straight in: it was written to start on the beat.
    if (this.trackBuf) { this.zero = this.next; this.step = 0; this.beginTrack(this.next); }
    this.tone.frequency.cancelScheduledValues(c.currentTime); this.tone.frequency.setValueAtTime(18000, c.currentTime);
    this.level(0.05);
    if (this.timer) clearInterval(this.timer);
    this.timer = window.setInterval(this.schedule, 25);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Fades out: the story closed. */
  stop() {
    const c = this.ctx; if (!c || !this.running) return;
    this.running = false;
    const g = ++this.gen;
    this.master.gain.cancelScheduledValues(c.currentTime);
    this.master.gain.setTargetAtTime(0, c.currentTime, 0.12);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.setTimeout(() => {
      if (g !== this.gen) return;
      this.endTrack();
      if (this.timer) clearInterval(this.timer); this.timer = null;
      c.suspend().catch(() => {});
    }, 600);
  }

  /** Hold to pause holds the music too. */
  setPaused(p: boolean) {
    const c = this.ctx; if (!c || !this.running) return;
    this.held = p;
    if (p) c.suspend().catch(() => {}); else c.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    setPrefs({ music: m ? false : undefined });
    if (this.running) this.level(0.08);
  }

  /** A slide arrives: its cue lands on the next beat, the music darkens or opens. */
  slide(cue: Cue, low: boolean, forward: boolean) {
    const c = this.ctx; if (!c || !this.running || c.state !== 'running') return;
    this.tone.frequency.setTargetAtTime(low ? 650 : 18000, c.currentTime, low ? 0.25 : 0.4);
    this.whoosh(c.currentTime, forward);
    if (!cue) return;
    if (this.trackOn) {
      // The track has its own tempo and key: the moment lands now, and the pitched ones play
      // over the track ducked low, so they don't clash with it.
      const now = c.currentTime + 0.02;
      if (cue !== 'impact') {
        this.trackGain.gain.cancelScheduledValues(now);
        this.trackGain.gain.setTargetAtTime(TRACK_VOLUME * 0.3, now, 0.05);
        this.trackGain.gain.setTargetAtTime(TRACK_VOLUME, now + (cue === 'fanfare' ? 1.8 : 1.3), 0.3);
      }
      ({ fanfare: this.fanfare, trombone: this.trombone, scratch: this.scratch, boom: this.boom, impact: this.impact })[cue].call(this, now);
      return;
    }
    const beat = STEP * 4;
    const at = this.zero + Math.ceil((c.currentTime + 0.02 - this.zero) / (cue === 'impact' ? STEP * 2 : beat)) * (cue === 'impact' ? STEP * 2 : beat);
    ({ fanfare: this.fanfare, trombone: this.trombone, scratch: this.scratch, boom: this.boom, impact: this.impact })[cue].call(this, Math.max(at, c.currentTime));
  }

  /** How hard the kick is hitting right now, 0 to 1: for the stage to thump along. */
  pulse(): number {
    const c = this.ctx; if (!c || !this.running || this.held || this.muted) return 0;
    if (this.trackOn) {
      // The track's own low end: how hard its kick and bass are hitting.
      const bins = this.trackBins ?? (this.trackBins = new Uint8Array(new ArrayBuffer(this.trackMeter.frequencyBinCount)));
      this.trackMeter.getByteFrequencyData(bins);
      let sum = 0; for (let k = 1; k < 5; k++) sum += bins[k];
      return Math.min(1, Math.max(0, (sum / 4 / 255 - 0.5) / 0.4));
    }
    const since = c.currentTime - this.zero; if (since < 0) return 0;
    if (sectionOf(Math.floor(since / (STEP * BAR))) === 'break') return 0;
    return Math.exp(-((since % (STEP * 4)) / (STEP * 4)) * 6);
  }

  private level(tc: number) {
    const c = this.ctx!;
    this.master.gain.cancelScheduledValues(c.currentTime);
    this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, c.currentTime, tc);
  }

  private onVisibility = () => {
    const c = this.ctx; if (!c) return;
    if (document.hidden) c.suspend().catch(() => {});
    else if (!this.held && this.running) c.resume().catch(() => {});
  };

  private schedule = () => {
    const c = this.ctx; if (!c || !this.running) return;
    if (this.trackOn) {
      this.queueTrack();
      // The loop carries on up to the bar the track comes in on, so the hand-over has no gap.
      while (this.next < Math.min(this.trackStartAt, c.currentTime + 0.12)) { this.play(this.step, this.next); this.next += STEP; this.step++; }
      return;
    }
    while (this.next < c.currentTime + 0.12) { this.play(this.step, this.next); this.next += STEP; this.step++; }
  };

  // ── The arrangement ────────────────────────────────────────────────────────

  private play(step: number, t: number) {
    if (step < 0) {
      if (step === COUNT_IN) this.riser(t, BAR * STEP);
      if (step % 2 === 0) this.hat(t, false, 0.04 + (step - COUNT_IN) * 0.006);
      if (step === -2 || step === -1) this.clap(t, 0.6);
      return;
    }
    const barN = Math.floor(step / BAR), s = step % BAR, sec = sectionOf(barN), chord = barN % 4;
    const bar32 = barN % 32;
    if (s === 0 && (bar32 === 0 || bar32 === 8 || bar32 === 24)) this.crash(t);
    if (sec === 'break') {
      if (s === 0) { this.pad(CHORDS[chord], t, BAR * STEP); this.bass(ROOTS[chord], t, BAR * STEP * 0.9, 0.22); }
      if (s % 4 === 2) this.hat(t, false, 0.05);
      if (bar32 === 22 && s === 0) this.riser(t, BAR * 2 * STEP);
      if (bar32 === 23 && s >= 8 && s % 2 === 0) this.clap(t, 0.3 + (s - 8) * 0.08);
      return;
    }
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.clap(t, 0.8);
    if (s % 2 === 0) this.hat(t, s % 4 === 2, s % 4 === 2 ? 0.1 : 0.06);
    else if (sec === 'C') this.hat(t, false, 0.035);
    if (s % 4 === 2) this.bass(ROOTS[chord], t, STEP * 1.6, 0.42);
    if (s === 14) this.bass(ROOTS[chord] + 12, t, STEP * 0.9, 0.3);
    if (STABS.has(s)) this.stab(CHORDS[chord], t, sec === 'A' ? 0.05 : 0.06);
    if (sec !== 'A') {
      const notes = [...CHORDS[chord], CHORDS[chord][0] + 12];
      this.arp(notes[s % 4] + 12, t, sec === 'C' ? 0.045 : 0.035);
    }
  }

  // ── The instruments ───────────────────────────────────────────────────────

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private osc(type: OscillatorType, f: number, t: number, len: number, out: AudioNode, detune = 0) {
    const o = this.ctx!.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    o.connect(out); o.start(t); o.stop(t + len + 0.05);
    return o;
  }

  private noiseSrc(t: number, len: number, out: AudioNode) {
    const n = this.ctx!.createBufferSource(); n.buffer = this.noise; n.loop = true;
    n.connect(out); n.start(t, Math.random() * 0.5); n.stop(t + len + 0.05);
    return n;
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7) {
    const b = this.ctx!.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
  }

  private kick(t: number, out: AudioNode = this.drums, peak = 1) {
    const c = this.ctx!, g = c.createGain(); g.connect(out);
    const o = this.osc('sine', 160, t, 0.45, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, peak, 0.002, 0.42);
    // The duck: everything else breathes with the kick.
    this.duck.gain.setValueAtTime(0.3, t);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.2);
  }

  private clap(t: number, peak: number) {
    const c = this.ctx!, g = c.createGain(), bp = this.filter('bandpass', 1300, 0.9);
    bp.connect(g).connect(this.drums);
    this.noiseSrc(t, 0.25, bp);
    g.gain.setValueAtTime(0.0001, t);
    for (const k of [0, 0.011, 0.022]) { g.gain.setValueAtTime(peak * 0.5, t + k); g.gain.exponentialRampToValueAtTime(0.05, t + k + 0.009); }
    g.gain.setValueAtTime(peak * 0.45, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  }

  private hat(t: number, open: boolean, peak: number) {
    const c = this.ctx!, g = c.createGain(), hp = this.filter('highpass', 7500);
    hp.connect(g).connect(this.drums);
    this.noiseSrc(t, open ? 0.2 : 0.06, hp);
    this.env(g, t, peak, 0.001, open ? 0.17 : 0.045);
  }

  private crash(t: number, out: AudioNode = this.drums, peak = 0.2) {
    const c = this.ctx!, g = c.createGain(), hp = this.filter('highpass', 4500);
    hp.connect(g).connect(out);
    this.noiseSrc(t, 1.6, hp);
    this.env(g, t, peak, 0.002, 1.5);
  }

  private bass(midi: number, t: number, len: number, peak: number) {
    const c = this.ctx!, g = c.createGain(), lp = this.filter('lowpass', 900, 4);
    lp.connect(g).connect(this.duck);
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(180, t + len);
    this.osc('sawtooth', hz(midi), t, len, lp);
    this.osc('sine', hz(midi), t, len, g);
    this.env(g, t, peak, 0.005, len);
  }

  private stab(chord: number[], t: number, peak: number) {
    const c = this.ctx!, g = c.createGain(), lp = this.filter('lowpass', 2600, 1.5);
    lp.connect(g); g.connect(this.duck); g.connect(this.send);
    for (const n of chord) for (const d of [-9, 9]) this.osc('sawtooth', hz(n), t, 0.3, lp, d);
    this.env(g, t, peak, 0.004, 0.24);
  }

  private pad(chord: number[], t: number, len: number) {
    const c = this.ctx!, g = c.createGain(), lp = this.filter('lowpass', 1400);
    lp.connect(g); g.connect(this.duck); g.connect(this.send);
    for (const n of chord) for (const d of [-12, 12]) this.osc('sawtooth', hz(n), t, len, lp, d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + len * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }

  private arp(midi: number, t: number, peak: number) {
    const c = this.ctx!, g = c.createGain(), lp = this.filter('lowpass', 3200);
    lp.connect(g); g.connect(this.duck); g.connect(this.send);
    this.osc('square', hz(midi), t, 0.14, lp);
    this.env(g, t, peak, 0.003, 0.12);
  }

  private riser(t: number, len: number, out: AudioNode = this.drums, peak = 0.16) {
    const c = this.ctx!, g = c.createGain(), bp = this.filter('bandpass', 300, 2);
    bp.connect(g).connect(out);
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(7000, t + len);
    this.noiseSrc(t, len, bp);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + len * 0.97); g.gain.linearRampToValueAtTime(0, t + len);
  }

  // ── The moments ───────────────────────────────────────────────────────────

  private whoosh(t: number, forward: boolean) {
    const c = this.ctx!, g = c.createGain(), bp = this.filter('bandpass', forward ? 600 : 3000, 1.2);
    bp.connect(g).connect(this.sfxBus);
    bp.frequency.exponentialRampToValueAtTime(forward ? 3500 : 500, t + 0.28);
    this.noiseSrc(t, 0.32, bp);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  }

  private impact(t: number) {
    this.kick(t, this.sfxBus, 0.5);
    const c = this.ctx!, g = c.createGain(), lp = this.filter('lowpass', 2500);
    lp.connect(g).connect(this.sfxBus);
    this.noiseSrc(t, 0.2, lp);
    this.env(g, t, 0.18, 0.002, 0.16);
  }

  /** A brass-ish run up the A major chord, then the chord held, and a crash: champions. */
  private fanfare(t: number) {
    const c = this.ctx!;
    const brass = (midi: number, at: number, len: number, peak: number) => {
      const g = c.createGain(), lp = this.filter('lowpass', 500, 2);
      lp.connect(g); g.connect(this.sfxBus); g.connect(this.send);
      lp.frequency.setValueAtTime(500, at); lp.frequency.exponentialRampToValueAtTime(3200, at + 0.06); lp.frequency.exponentialRampToValueAtTime(1600, at + len);
      for (const d of [-7, 7]) this.osc('sawtooth', hz(midi), at, len, lp, d);
      this.env(g, at, peak, 0.02, len);
    };
    [57, 61, 64].forEach((n, k) => brass(n + 12, t + k * STEP, STEP * 0.9, 0.09));
    for (const n of [57, 61, 64, 69]) brass(n + 12, t + STEP * 3, STEP * 10, 0.06);
    this.crash(t + STEP * 3, this.sfxBus, 0.26);
    this.kick(t + STEP * 3, this.sfxBus, 0.5);
  }

  /** Wah, wah, wah, waaah: the worst week. */
  private trombone(t: number) {
    const c = this.ctx!;
    [55, 54, 53, 52].forEach((n, k) => {
      const at = t + k * 0.42, len = k === 3 ? 1.1 : 0.36;
      const g = c.createGain(), lp = this.filter('lowpass', 400, 6);
      lp.connect(g).connect(this.sfxBus);
      // The mute opening and closing.
      lp.frequency.setValueAtTime(350, at); lp.frequency.linearRampToValueAtTime(1400, at + 0.12); lp.frequency.linearRampToValueAtTime(500, at + len);
      const o = this.osc('sawtooth', hz(n), at, len, lp);
      if (k === 3) {
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = 5.5; depth.gain.value = 14;
        lfo.connect(depth).connect(o.detune); lfo.start(at + 0.25); lfo.stop(at + len);
      }
      this.env(g, at, 0.16, 0.03, len);
    });
  }

  /** A record scratch: the bad trade. */
  private scratch(t: number) {
    const c = this.ctx!, g = c.createGain(), bp = this.filter('bandpass', 900, 4);
    bp.connect(g).connect(this.sfxBus);
    const pts = [900, 3200, 700, 2600, 500];
    pts.forEach((f, k) => bp.frequency.linearRampToValueAtTime(f, t + k * 0.07));
    this.noiseSrc(t, 0.36, bp);
    g.gain.setValueAtTime(0.0001, t);
    pts.forEach((_, k) => { g.gain.linearRampToValueAtTime(0.5, t + k * 0.07 + 0.01); g.gain.linearRampToValueAtTime(0.15, t + k * 0.07 + 0.06); });
    g.gain.linearRampToValueAtTime(0, t + 0.36);
    const o = this.osc('sawtooth', 220, t, 0.34, bp);
    o.frequency.linearRampToValueAtTime(90, t + 0.34);
  }

  /** A low boom and rumble: heartbreak. */
  private boom(t: number) {
    const c = this.ctx!, g = c.createGain();
    g.connect(this.sfxBus);
    const o = this.osc('sine', 70, t, 1.4, g);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    this.env(g, t, 0.8, 0.005, 1.3);
    const r = c.createGain(), lp = this.filter('lowpass', 220);
    lp.connect(r).connect(this.sfxBus);
    this.noiseSrc(t, 1.4, lp);
    this.env(r, t, 0.35, 0.02, 1.3);
  }
}

export const music = new Music();

/** What a slide sounds like, by what it shows. */
export function cueFor(key: string, confetti?: boolean): { cue: Cue; low: boolean } {
  if (confetti) return { cue: 'fanfare', low: false };
  switch (key) {
    case 'worst': return { cue: 'trombone', low: true };
    case 'badtrade': return { cue: 'scratch', low: true };
    case 'heartbreak': return { cue: 'boom', low: true };
    case 'heartbreak-box': return { cue: null, low: true };
    case 'best': case 'blowout': case 'closest': case 'records': case 'mvp': case 'steal': case 'pickup': case 'trade': case 'archetype':
      return { cue: 'impact', low: false };
    default: return { cue: null, low: false };
  }
}
