/**
 * Delivery cues in The Desk Weekly's lines: a few bracketed audio tags ("[laughs]", "[sarcastic]")
 * that ElevenLabs' v4 model performs rather than reads. Shared by the script writer (which keeps
 * only these), the recorder (which sends them), and the player (which shows and, in the browser's
 * own voice, speaks the line without them).
 */

export const DELIVERY_TAGS = [
  'laughs', 'laughing', 'chuckles', 'sighs', 'groans', 'scoffs', 'gasps', 'clears throat',
  'sarcastic', 'deadpan', 'excited', 'shouting', 'whispers', 'mock serious', 'exasperated', 'incredulous',
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
