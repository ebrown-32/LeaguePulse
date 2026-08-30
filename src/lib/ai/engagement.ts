/**
 * Ambient engagement numbers for the feed.
 *
 * A timeline where every post shows nothing reads as abandoned, which is the
 * opposite of what this feature is for. These counts are set dressing, in the
 * same way the writers themselves are: nobody in an eight person league thinks
 * a fictional broadcaster genuinely has four hundred followers reacting.
 *
 * Two properties matter more than the exact numbers:
 *
 *   Deterministic. Derived from the post id, so a given post always shows the
 *   same figure. Random values would shuffle on every render and every reload,
 *   which reads as broken rather than as busy.
 *
 *   Monotonic in age. A post gains engagement over its first day and then
 *   settles, so a fresh post is not born with more reaction than a day old one.
 *
 * Real likes from real readers are counted separately and added on top, so a
 * tap always visibly moves the number it is attached to.
 */

/** Deterministic 32 bit hash of a string. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded PRNG, so one id yields a stable sequence. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How much reach a format gets.
 *
 * A column or a power ranking is the piece people actually argue about; a
 * one-line jab from a fan is background chatter. Flat numbers across both made
 * the feed look uniform, which is precisely the thing that reads as fake.
 */
const REACH: Record<string, number> = {
  powerRankings: 1.6,
  predictions: 1.5,
  article: 1.3,
  matchupPreview: 1.2,
  tradeGrade: 1.1,
  liveTake: 1.0,
  kickoff: 0.9,
  tweet: 0.8,
  comment: 0.5,
};

/** Fraction of final engagement reached, by age. Fast at first, then flat. */
function maturity(hoursOld: number): number {
  if (hoursOld <= 0) return 0.12;
  // Approaches 1 asymptotically; about half by two hours, most by a day.
  return 1 - Math.exp(-hoursOld / 6);
}

export interface Engagement {
  likes: number;
  reposts: number;
}

export function engagementFor(
  post: { id: string; kind: string; createdAt: string },
  now: number = Date.now(),
): Engagement {
  const seed = hash(post.id);
  const next = rng(seed);
  const reach = REACH[post.kind] ?? 1;

  const hoursOld = Math.max(0, (now - new Date(post.createdAt).getTime()) / 3_600_000);
  const grown = maturity(hoursOld);

  // Ceiling for this particular post, then how far along it is.
  const likeCeiling = Math.round((8 + next() * 34) * reach);
  const likes = Math.max(0, Math.round(likeCeiling * grown));

  // Reposts trail likes by a wide margin, the way they do anywhere else.
  const repostRatio = 0.08 + next() * 0.16;
  const reposts = Math.max(0, Math.round(likes * repostRatio));

  return { likes, reposts };
}

/** 1200 -> "1.2K". Long numbers wreck a tight byline row on a phone. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`;
}
