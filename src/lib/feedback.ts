'use client';

/**
 * Tactile feedback: a click you can hear and feel.
 *
 * Sounds are synthesised with the Web Audio API rather than loaded as files.
 * A click is a few milliseconds of shaped noise, so generating it costs
 * nothing, ships no assets, adds no request, and can be retuned by changing a
 * number instead of re-exporting a wav.
 *
 * Nothing here ever throws into the caller. Audio is a garnish: a browser that
 * blocks it, a device with no vibration motor, or a locked-down context should
 * cost the user a click, not an interaction.
 */

export type FeedbackTone = 'tap' | 'select' | 'toggle' | 'error';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = { sound: false, haptics: true };

/**
 * The context is created lazily on the first real gesture.
 *
 * Browsers refuse to start audio before a user interaction, and a context
 * created at import time lands in a suspended state that never recovers on
 * some versions of Safari.
 */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      // Deliberately quiet. This should sit under the interface, not on it.
      master.gain.value = 0.05;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Per-tone shape: pitch, length, and how bright the click is. */
const TONES: Record<FeedbackTone, { freq: number; ms: number; type: OscillatorType; gain: number }> = {
  // Short, high, almost pitchless: a fingernail on plastic.
  tap:    { freq: 2400, ms: 18, type: 'triangle', gain: 0.5 },
  // Slightly lower and longer, so choosing something feels heavier than
  // brushing past it.
  select: { freq: 1600, ms: 26, type: 'triangle', gain: 0.7 },
  // Two-part, handled below: a switch has a travel and a landing.
  toggle: { freq: 1100, ms: 30, type: 'square',   gain: 0.5 },
  error:  { freq: 320,  ms: 90, type: 'sine',     gain: 0.8 },
};

function blip(tone: FeedbackTone, at = 0) {
  const c = audio();
  if (!c || !master) return;
  const spec = TONES[tone];
  const t0 = c.currentTime + at;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, t0);
  // A click is a transient, not a note: pitch and volume both fall away fast.
  osc.frequency.exponentialRampToValueAtTime(spec.freq * 0.6, t0 + spec.ms / 1000);

  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(spec.gain, t0 + 0.002);
  // Exponential decay to near zero, never to zero: the ramp is undefined at 0.
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.ms / 1000);

  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + spec.ms / 1000 + 0.02);
}

/** Vibration patterns, in milliseconds. Kept short enough to read as texture. */
const HAPTICS: Record<FeedbackTone, number | number[]> = {
  tap: 8,
  select: 12,
  toggle: [10, 24, 10],
  error: [24, 40, 24],
};

/**
 * Fire feedback for an interaction.
 *
 * Safe to call from anywhere, including during render teardown or on a device
 * with neither capability.
 */
export function feedback(tone: FeedbackTone = 'tap') {
  if (enabled.sound) {
    try {
      blip(tone);
      // A toggle gets a second, lower click so it reads as a switch landing
      // rather than the same tap used everywhere else.
      if (tone === 'toggle') blip('tap', 0.045);
    } catch { /* never let a garnish break an interaction */ }
  }

  if (enabled.haptics) {
    try {
      // Absent on iOS Safari, which exposes no vibration API at all. Android
      // and desktop Chrome honour it; everywhere else this is a no-op.
      navigator.vibrate?.(HAPTICS[tone]);
    } catch { /* as above */ }
  }
}

/** Called once by the provider when the admin's settings are known. */
export function configureFeedback(next: { sound: boolean; haptics: boolean }) {
  enabled = next;
}

export function feedbackSettings() {
  return { ...enabled };
}
