/**
 * Replies under a post.
 *
 * The desk had a `comment` format, but a comment was a top level entry in the
 * timeline like everything else, so nobody was ever talking to anybody. This
 * hangs replies off the post they answer, which is what makes the feed read as
 * a room with people in it rather than a queue of monologues.
 */
import { personaAvatarUrl } from './avatar';
import { writeReply, type ReplyStance } from './generate';
import { addPost, getPosts, type FeedPost } from './store';
import type { Personality } from './personalities';

/** Formats worth arguing under. A live score post is stale within the hour and
 *  a reply to it lands after the moment has passed. */
const REPLYABLE = new Set(['article', 'tweet', 'powerRankings', 'predictions', 'matchupPreview']);

/** How many replies one post is allowed to collect, ever. */
const MAX_PER_POST = 4;

export interface ReplyTarget {
  post: FeedPost;
  existing: number;
}

/**
 * Posts worth replying to, most in need of a reply first.
 *
 * Newest first among those with no replies yet, because an empty comment
 * section on the top post is the one a reader actually notices.
 */
export async function replyTargets(limit = 100): Promise<ReplyTarget[]> {
  const all = await getPosts(limit);
  const replyCount = new Map<string, number>();
  for (const p of all) {
    if (p.replyTo) replyCount.set(p.replyTo, (replyCount.get(p.replyTo) ?? 0) + 1);
  }
  return all
    .filter(p => !p.replyTo && REPLYABLE.has(p.kind))
    .map(post => ({ post, existing: replyCount.get(post.id) ?? 0 }))
    .filter(t => t.existing < MAX_PER_POST)
    .sort((a, b) =>
      a.existing - b.existing
      || new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime());
}

/**
 * Who answers, and whether they push back.
 *
 * Never the author replying to themselves, and never the same voice twice in
 * one thread. Fans are favoured slightly once a writer has already answered,
 * so a thread turns into the group chat rather than two columnists talking
 * shop at each other.
 */
export function pickResponder(
  cast: Personality[],
  parent: FeedPost,
  alreadyReplied: string[],
): Personality | null {
  const eligible = cast.filter(p =>
    p.enabled
    && p.kinds.includes('comment')
    && p.id !== parent.personalityId
    && !alreadyReplied.includes(p.id));
  if (!eligible.length) return null;

  const fans = eligible.filter(p => p.type === 'fan');
  const pool = alreadyReplied.length && fans.length ? fans : eligible;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Agreement or dissent.
 *
 * The first reply leans towards pushing back, because a thread that opens with
 * agreement rarely goes anywhere, and later replies mix so a post does not
 * turn into a pile-on.
 */
export function pickStance(alreadyReplied: number): ReplyStance {
  if (alreadyReplied === 0) return Math.random() < 0.65 ? 'disagree' : 'agree';
  return Math.random() < 0.5 ? 'disagree' : 'agree';
}

/** Writes one reply and stores it. Returns null when nobody is eligible. */
export async function addReply(
  cast: Personality[],
  parent: FeedPost,
  alreadyReplied: string[],
): Promise<FeedPost | null> {
  const responder = pickResponder(cast, parent, alreadyReplied);
  if (!responder) return null;

  const stance = pickStance(alreadyReplied.length);
  const content = await writeReply(responder, parent, stance);

  const reply: FeedPost = {
    id: `${Date.now()}-${responder.id}-re`,
    personalityId: responder.id,
    personaName: responder.name,
    personaHandle: responder.handle,
    personaAccent: responder.accent,
    personaType: responder.type ?? 'media',
    personaAvatar: personaAvatarUrl(responder),
    kind: 'comment',
    content: content as any,
    createdAt: new Date().toISOString(),
    // Replies land immediately. A reply held back until tomorrow appears under
    // a post everyone has already read and argues with nobody.
    publishAt: new Date().toISOString(),
    source: 'cron',
    replyTo: parent.id,
    replyToName: parent.personaName,
    stance,
  };
  await addPost(reply);
  return reply;
}
