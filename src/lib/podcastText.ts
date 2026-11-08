/**
 * Delivery cues in The Desk Weekly's lines: a few bracketed audio tags ("[laughs]", "[sarcastic]")
 * that ElevenLabs' v4 model performs rather than reads. Shared by the script writer (which keeps
 * only these), the recorder (which sends them), and the player (which shows and, in the browser's
 * own voice, speaks the line without them).
 */

export const DELIVERY_TAGS = [
  'laughs', 'laughing', 'chuckles', 'laughs harder', 'starts laughing', 'wheezing', 'snorts',
  'sighs', 'exhales', 'groans', 'scoffs', 'gasps', 'clears throat',
  'sarcastic', 'deadpan', 'excited', 'shouting', 'whispers', 'mock serious', 'exasperated', 'incredulous', 'mischievously',
  // Cross-talk: a line that cuts in on the one before it, or talks over it.
  'interrupting', 'overlapping', 'cuts in',
] as const;

const TAG = /\s*\[([a-z ]{2,24})\]\s*/gi;
const KNOWN = new Set<string>(DELIVERY_TAGS);

/** Keeps the known tags (lower-cased), drops any other bracketed aside. For the script writer. */
export function keepDeliveryTags(text: string): string {
  return text
    .replace(TAG, (_m, t: string) => (KNOWN.has(t.toLowerCase().trim()) ? ` [${t.toLowerCase().trim()}] ` : ' '))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** The line as words, for the transcript and the browser's voice. */
export function plainLine(text: string): string {
  return text.replace(TAG, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** About what one episode of The Desk Weekly is written to (about ninety seconds), in characters. */
export const EPISODE_CHARS = 1_500;

// ── Word timings, for the transcript's word-by-word highlight ─────────────────

/** The words of a plain line, each with its character offset. The transcript and the timings both
 *  split a line this way, so word n of one is word n of the other. */
export function spokenWords(plain: string): { w: string; at: number }[] {
  const out: { w: string; at: number }[] = [];
  const re = /\S+\s*/g; let m: RegExpExecArray | null;
  while ((m = re.exec(plain))) out.push({ w: m[0], at: m.index });
  return out;
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * When each word starts, estimated from where the line starts and ends: a long word takes longer
 * than a short one, a comma or a full stop leaves a pause after it, and a delivery cue in `raw`
 * (the line as recorded, "[laughs] Sixty-one points") takes its moment before the word it leads
 * into. For recordings made before real timings were kept, and for lines recorded one at a time.
 */
export function estimateWordStarts(plain: string, start: number, end: number, raw?: string): number[] {
  const words = spokenWords(plain);
  if (!words.length) return [];
  // The cues' time, before the word each one leads into (a cue at the very end doesn't delay any).
  const cue: number[] = words.map(() => 0);
  if (raw) {
    const tokens = raw.replace(TAG, ' \u0001 ').trim().split(/\s+/).filter(Boolean);
    let pending = 0, i = 0;
    for (const tok of tokens) {
      if (tok === '\u0001') { pending += 9; continue; }
      if (i < cue.length) cue[i] = pending;
      pending = 0; i++;
    }
    if (i !== words.length) cue.fill(0);
  }
  const weight = (w: string) => {
    const letters = norm(w).length || 1;
    const pause = /[.!?]["')]*\s*$/.test(w) ? 6 : /[,;:]["')]*\s*$/.test(w) ? 3 : /\.\.\.\s*$/.test(w) ? 7 : 0;
    return { speak: letters + 1.5, pause };
  };
  const ws = words.map(x => weight(x.w));
  // The last word's pause falls after the line ends: it doesn't count.
  const total = ws.reduce((n, x, i) => n + cue[i] + x.speak + (i < ws.length - 1 ? x.pause : 0), 0);
  const per = Math.max(0, end - start) / Math.max(1, total);
  const out: number[] = [];
  let t = start;
  ws.forEach((x, i) => { t += cue[i] * per; out.push(t); t += (x.speak + x.pause) * per; });
  return out;
}

/**
 * When each word of a plain line starts, from ElevenLabs' character timings for what was sent (the
 * line with its delivery tags, which take time but aren't shown). Tags are skipped, and the words
 * are matched in order, allowing for a few that don't line up (numbers read out, say); those are
 * placed between their neighbours. Null when too few match to trust.
 */
export function alignWordStarts(plain: string, chars: string[], starts: number[], span: { start: number; end: number }): number[] | null {
  const words = spokenWords(plain);
  if (!words.length || !chars.length) return null;
  // The recorded words: whitespace-separated runs, with bracketed tags left out.
  const heard: { n: string; t: number }[] = [];
  let cur = '', curT = 0, inTag = false;
  const flush = () => { if (cur) { const n = norm(cur); if (n) heard.push({ n, t: curT }); } cur = ''; };
  chars.forEach((c, i) => {
    if (c === '[') { flush(); inTag = true; return; }
    if (inTag) { if (c === ']') inTag = false; return; }
    if (/\s/.test(c)) { flush(); return; }
    if (!cur) curT = starts[i] ?? 0;
    cur += c;
  });
  flush();

  const got: (number | null)[] = words.map(() => null);
  let k = 0;
  words.forEach((x, i) => {
    const n = norm(x.w);
    if (!n) return;
    for (let j = k; j < Math.min(heard.length, k + 4); j++) {
      if (heard[j].n === n || heard[j].n.startsWith(n) || n.startsWith(heard[j].n)) { got[i] = heard[j].t; k = j + 1; return; }
    }
  });
  const matched = got.filter(x => x != null).length;
  if (matched < Math.max(1, words.length * 0.6)) return null;

  // Fill the gaps between known words, evenly, and keep every start inside the line and in order.
  const out = got.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null) continue;
    let a = i - 1; while (a >= 0 && out[a] == null) a--;
    let b = i + 1; while (b < out.length && got[b] == null) b++;
    const from = a >= 0 ? out[a]! : span.start;
    const to = b < out.length ? got[b]! : span.end;
    const gap = b - (a >= 0 ? a : -1);
    for (let j = i; j < b; j++) out[j] = from + ((to - from) * (j - (a >= 0 ? a : -1))) / gap;
    i = b - 1;
  }
  let last = span.start;
  return out.map(t => { const v = Math.max(last, Math.min(span.end, t ?? last)); last = v; return Math.round(v * 1000) / 1000; });
}
