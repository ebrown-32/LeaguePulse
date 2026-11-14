/**
 * The beat that plays while a championship ring or the trophy is open full screen
 * (components/trophies): a hype trap loop, synthesized live in the browser (Web Audio). Nothing to
 * download and nothing to license.
 *
 *   140 BPM, half-time, F minor (Fm Db Ab Eb), four bars round:
 *   808s that slide, a clap on the three, hats in eighths with rolls into each bar, a dark brass
 *   stab on the ones, and a bell hook on top from the second bar.
 *
 * Starts from the tap that opens the piece (browsers only allow sound from a tap), fades out when
 * it closes. Also the bed under The Desk Weekly's highlights, quietly, on the player's own audio
 * (already woken by its play button). Off when the visitor has the site's music off (lib/prefs).
 * Client only.
 */

import { getPrefs, setPrefs } from './prefs';
import { audioTakeover } from './soundtrack';

const BPM = 140;
const STEP = 60 / BPM / 4; // a sixteenth
const BAR = 16;
const CHORDS = [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]]; // Fm Db Ab Eb
const ROOTS = [29, 25, 32, 27];
const HOOK = [72, null, 75, null, 77, null, 75, 72, null, null, 70, null, 72, null, null, null];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

class Beat {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private next = 0;
  private running = false;
  /** Whether this made its own audio (suspended when it stops), or plays on someone else's. */
  private owned = true;
  private volume = 0.55;

  get muted() { return getPrefs().music === false; }

  /**
   * Call inside the tap that opens the piece; or hand it an audio context already running (the
   * podcast's) and a volume, to play under something.
   */
  start(o: { ctx?: AudioContext | null; volume?: number } = {}) {
    if (typeof window === 'undefined' || this.running) return;
    audioTakeover('beat', true);
    this.volume = o.volume ?? 0.55;
    if (o.ctx && o.ctx !== this.ctx) { this.build(o.ctx); this.owned = false; }
    // Its own again after playing under the show.
    else if (!o.ctx && !this.owned) this.ctx = null;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.build(new Ctx()); this.owned = true;
    }
    const c = this.ctx!;
    if (this.owned) c.resume().catch(() => {});
    this.running = true;
    this.step = 0;
    this.next = c.currentTime + 0.06;
    this.level();
    this.timer = window.setInterval(this.schedule, 25);
  }

  private build(c: AudioContext) {
    this.ctx = c;
    {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.15;
      this.out = c.createGain(); this.out.gain.value = 0;
      this.out.connect(comp).connect(c.destination);
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    }
  }

  stop() {
    audioTakeover('beat', false);
    const c = this.ctx;
    if (!c || !this.running) return;
    this.running = false;
    this.out.gain.cancelScheduledValues(c.currentTime);
    this.out.gain.setTargetAtTime(0, c.currentTime, 0.12);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.owned) window.setTimeout(() => { if (!this.running) c.suspend().catch(() => {}); }, 700);
  }

  setMuted(m: boolean) {
    setPrefs({ music: m ? false : undefined });
    if (this.running) this.level();
  }

  private level() {
    const c = this.ctx!;
    this.out.gain.cancelScheduledValues(c.currentTime);
    this.out.gain.setTargetAtTime(this.muted ? 0 : this.volume, c.currentTime, 0.25);
  }

  private schedule = () => {
    const c = this.ctx;
    if (!c || !this.running) return;
    while (this.next < c.currentTime + 0.12) { this.play(this.step, this.next); this.next += STEP; this.step++; }
  };

  private play(step: number, t: number) {
    const bar = Math.floor(step / BAR) % 4, s = step % BAR;
    // 808: on the one, a pickup, a slide into the next bar.
    if (s === 0 || s === 7 || s === 10) this.bass(ROOTS[bar], t, s === 10 ? STEP * 5 : STEP * 6, s === 10 ? ROOTS[(bar + 1) % 4] : null);
    if (s === 0 || s === 10) this.kick(t);
    if (s === 8) this.clap(t);
    // Hats in eighths, a roll of thirty-seconds into every bar.
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.09 : 0.06);
    if (s >= 13) { this.hat(t + STEP / 2, 0.05); }
    if (s === 15 && bar === 3) for (let k = 1; k < 4; k++) this.hat(t + (STEP / 3) * k, 0.05 + k * 0.01);
    if (s === 0) this.stab(CHORDS[bar], t);
    const note = HOOK[s];
    if (step >= BAR && note !== null) this.bell(note + (bar === 3 ? -2 : 0), t);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private kick(t: number) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(g).connect(this.out); this.env(g, t, 0.9, 0.002, 0.28);
    o.start(t); o.stop(t + 0.32);
  }

  private bass(root: number, t: number, len: number, slideTo: number | null) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain(), shape = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
    shape.curve = curve;
    o.type = 'sine';
    o.frequency.setValueAtTime(hz(root) * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(hz(root), t + 0.05);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(hz(slideTo), t + len);
    o.connect(shape).connect(g).connect(this.out);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    g.gain.setValueAtTime(0.7, t + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.start(t); o.stop(t + len + 0.02);
  }

  private noiseHit(t: number, len: number, type: BiquadFilterType, f: number, peak: number) {
    const c = this.ctx!, src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; flt.type = type; flt.frequency.value = f;
    src.connect(flt).connect(g).connect(this.out);
    this.env(g, t, peak, 0.001, len);
    src.start(t); src.stop(t + len + 0.02);
  }

  private clap(t: number) {
    for (const d of [0, 0.012, 0.024]) this.noiseHit(t + d, 0.16, 'bandpass', 1500, 0.5);
  }

  private hat(t: number, peak: number) { this.noiseHit(t, 0.035, 'highpass', 8000, peak); }

  private stab(chord: number[], t: number) {
    const c = this.ctx!, flt = c.createBiquadFilter(), g = c.createGain();
    flt.type = 'lowpass'; flt.frequency.setValueAtTime(2200, t); flt.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    flt.connect(g).connect(this.out);
    this.env(g, t, 0.11, 0.01, 0.6);
    for (const n of chord) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det;
      o.connect(flt); o.start(t); o.stop(t + 0.7);
    }
  }

  private bell(n: number, t: number) {
    const c = this.ctx!, g = c.createGain();
    g.connect(this.out);
    this.env(g, t, 0.08, 0.002, 0.45);
    for (const [mult, type] of [[1, 'sine'], [2.01, 'triangle']] as const) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = hz(n) * mult;
      o.connect(g); o.start(t); o.stop(t + 0.5);
    }
  }
}

export const trophyBeat = new Beat();
