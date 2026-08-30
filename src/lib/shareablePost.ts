/**
 * Turns a feed post into something worth pasting into a group chat.
 *
 * The target is Sleeper's league chat and iMessage, both of which are plain
 * text. That rules out an image or rich markup: whatever comes out of here has
 * to read well as characters alone, on a phone, in a narrow bubble.
 *
 * Long pieces are deliberately not reproduced in full. A power ranking or a
 * column pasted whole is a wall nobody reads, and the point of sharing is to
 * make someone open it. The share carries the hook and the link.
 */

export interface ShareablePost {
  id: string;
  personaName: string;
  personaHandle: string;
  kind: string;
  content: any;
}

/** Trim to a sentence boundary where possible, so a quote never ends mid-word. */
function clip(text: string, max: number): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  // Only honour a sentence break if it leaves most of the budget used;
  // otherwise a single long opening sentence would collapse to nothing.
  if (stop > max * 0.6) return cut.slice(0, stop + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}...`;
}

/** The body of the share, shaped by what kind of piece it is. */
function bodyFor(post: ShareablePost): string {
  const c = post.content ?? {};

  switch (post.kind) {
    case 'tweet':
    case 'comment':
      return clip(c.text ?? '', 600);

    case 'kickoff':
    case 'liveTake': {
      const notes = (c.notes ?? [])
        .slice(0, 4)
        .map((n: any) => `- ${n.teamName}: ${clip(n.note, 90)}`);
      return [c.headline, clip(c.text ?? '', 400), notes.join('\n')]
        .filter(Boolean).join('\n\n');
    }

    case 'powerRankings': {
      const teams = (c.teams ?? [])
        .map((t: any) => `${t.rank}. ${t.teamName}${t.verdict ? ` (${t.verdict})` : ''}`);
      return [c.headline, teams.join('\n')].filter(Boolean).join('\n\n');
    }

    case 'predictions': {
      const table = (c.standings ?? [])
        .map((t: any) => `${t.rank}. ${t.teamName}${t.projectedRecord ? `  ${t.projectedRecord}` : ''}`);
      return [
        c.headline,
        c.champion?.teamName ? `Champion pick: ${c.champion.teamName}` : '',
        table.join('\n'),
      ].filter(Boolean).join('\n\n');
    }

    case 'matchupPreview': {
      const games = (c.games ?? [])
        .map((g: any) => `${g.teamA} v ${g.teamB} -> ${g.pick}${g.confidence ? ` (${g.confidence})` : ''}`);
      return [c.headline, games.join('\n')].filter(Boolean).join('\n\n');
    }

    case 'tradeGrade': {
      const sides = (c.sides ?? []).map((s: any) => `${s.grade}  ${s.teamName}`);
      return [c.verdict, sides.join('\n')].filter(Boolean).join('\n\n');
    }

    default:
      // Columns share the headline and standfirst; the link carries the rest.
      return [c.headline, clip(c.standfirst ?? '', 240)].filter(Boolean).join('\n\n');
  }
}

/**
 * The full shareable block.
 *
 * @param origin Absolute site origin, so the link works once it has left the
 *   app. A relative path pasted into Sleeper is just text.
 */
export function shareText(
  post: ShareablePost,
  opts: { leagueName?: string | null; origin?: string } = {},
): string {
  const byline = `${post.personaName} ${post.personaHandle}`.trim();
  const body = bodyFor(post);
  const league = opts.leagueName?.trim();

  // Names where it came from. The feed itself is labelled; a share going into
  // a league group chat carries the source and the link and nothing more.
  const footer = league ? `via ${league} on LeaguePulse` : 'via LeaguePulse';

  // Straight to this post, not the top of the feed. A reader sent the feed
  // link had to hunt for the thing they were sent, and by the next day it had
  // moved down the page. The permalink also gives chat apps something specific
  // to unfurl into a preview card.
  const link = opts.origin
    ? `${opts.origin.replace(/\/$/, '')}/desk/${encodeURIComponent(post.id)}`
    : '';
  // Attribution and link are one block: a blank line between them reads as two
  // separate thoughts and wastes a line in a chat bubble.
  const tail = [footer, link].filter(Boolean).join('\n');

  return [byline, body, tail].filter(Boolean).join('\n\n');
}

/** Short label for the native share sheet's title slot. */
export function shareTitle(post: ShareablePost): string {
  const c = post.content ?? {};
  return clip(c.headline || c.text || `${post.personaName} on the feed`, 70);
}
