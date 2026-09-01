import { personaAvatarUrl } from '@/lib/ai/avatar';
import { NextRequest, NextResponse } from 'next/server';
import { AINotConfiguredError, isAIConfigured } from '@/lib/ai/claude';
import { findPersonality, type ContentKind } from '@/lib/ai/personalities';
import {
  writeArticle, writeTweet, writeComment, writePowerRankings, writePredictions,
  writeMatchupPreview, writeGameBeat, angleAt,
} from '@/lib/ai/generate';
import { resolveGameWindow } from '@/lib/ai/gameWindows';
import { findLeagueEvent } from '@/lib/ai/leagueEvents';
import { nextSubject } from '@/lib/ai/coverage';
import { getNFLState } from '@/lib/api';
import { addPost, getPersonalitiesForAdmin, type FeedPost } from '@/lib/ai/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Formats written about one team, and so eligible for the coverage rotation.
 *  Power rankings, predictions and the week preview cover everyone already. */
const SUBJECT_KINDS = new Set<ContentKind>(['article', 'tweet']);

function authorized(req: NextRequest): boolean {
  return req.headers.get('x-admin-password') === (process.env.ADMIN_PASSWORD || 'admin123');
}

interface GenerateBody {
  personalityId: string;
  kind: ContentKind;
  /** A recent league event from /api/ai/events to write about. */
  eventId?: string;
  /** A team the piece should be about. Only meaningful for kinds that have a
   *  single subject; power rankings and predictions cover the whole league. */
  subject?: string;
  /** Free text steer, layered on top of whatever the event supplies. */
  angle?: string;
  /** Which week to preview. Defaults to the week Sleeper is currently on. */
  week?: number;
}

/**
 * A one line description of what was published, for the panel to show back.
 *
 * The panel used to print `content.text ?? content.headline ?? JSON.stringify`,
 * so publishing power rankings dumped a wall of raw JSON at the admin and gave
 * no confirmation that anything had reached the feed.
 */
function describe(kind: ContentKind, content: any): string {
  switch (kind) {
    case 'tweet':
    case 'comment':
      return String(content?.text ?? '');
    case 'powerRankings': {
      const teams = content?.teams ?? [];
      return [content?.headline, teams.map((t: any) => `${t.rank}. ${t.teamName}`).join('\n')]
        .filter(Boolean).join('\n\n');
    }
    case 'predictions': {
      const standings = content?.standings ?? [];
      return [
        content?.headline,
        content?.champion?.teamName ? `Champion pick: ${content.champion.teamName}` : '',
        standings.map((t: any) => `${t.rank}. ${t.teamName} (${t.projectedRecord})`).join('\n'),
      ].filter(Boolean).join('\n\n');
    }
    case 'matchupPreview': {
      const games = content?.games ?? [];
      return [
        content?.headline,
        games.map((g: any) => `${g.teamA} v ${g.teamB}, picks ${g.pick} (${g.confidence})`).join('\n'),
      ].filter(Boolean).join('\n\n');
    }
    case 'kickoff':
    case 'liveTake':
      return [content?.headline, content?.text].filter(Boolean).join('\n\n');
    default:
      return [content?.headline, content?.standfirst].filter(Boolean).join('\n\n');
  }
}

/** Admin-only: visitors read the feed, they never generate into it. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: 'AI is not configured', setup: 'Add ANTHROPIC_API_KEY to .env.local and restart.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json() as GenerateBody;
    const { personalityId, kind, eventId } = body;

    /**
     * Resolved against the cast the admin panel itself lists, and strictly.
     *
     * Two things went wrong here at once. The route read the public cast,
     * which drops built-ins that have since been retired from the code, while
     * the panel reads the admin cast, which keeps them. So the panel offered
     * writers this route could not see. `personalityById` then answered a miss
     * with the first entry rather than an error, and that first entry is Champ
     * Kind, so the piece went out under his name.
     */
    const cast = await getPersonalitiesForAdmin();
    const persona = findPersonality(personalityId, cast);
    if (!persona) {
      return NextResponse.json(
        {
          error: 'That writer is not in the saved cast. If you have just created them, '
            + 'save the cast first, then publish.',
        },
        { status: 404 },
      );
    }
    if (persona.hidden) {
      return NextResponse.json(
        { error: `${persona.name} has been deleted. Restore them before publishing.` },
        { status: 400 },
      );
    }
    if (!persona.kinds.includes(kind)) {
      return NextResponse.json(
        { error: `${persona.name} does not write ${kind}. Add it under Writes, or pick another format.` },
        { status: 400 },
      );
    }
    if (kind === 'tradeGrade') {
      return NextResponse.json(
        { error: 'Trade grades are published from the trade itself, not from here.' },
        { status: 400 },
      );
    }

    // The event is resolved server side from its id rather than trusted from
    // the request body, so a piece can only ever be commissioned about
    // something that is genuinely in the league record.
    const event = eventId ? await findLeagueEvent(eventId) : null;
    if (eventId && !event) {
      return NextResponse.json(
        { error: 'That event is no longer in the recent league record. Reload the list and pick again.' },
        { status: 400 },
      );
    }

    const manualAngle = body.angle?.trim() || undefined;

    /**
     * Who this piece is about.
     *
     * An explicit choice wins, then the event's own subject. Failing both, the
     * team nobody has written about for longest, which is the same rotation
     * the scheduler uses. Without this a hand published piece had no subject
     * at all and the writer picked whoever the brief made loudest, so one team
     * led eight of the twenty two most recent headlines and two led none.
     */
    const rotate = SUBJECT_KINDS.has(kind) && !event;
    const subject = body.subject?.trim()
      || event?.subject
      || (rotate ? await nextSubject().catch(() => undefined) : undefined);
    /**
     * The angle is a lens, nothing more.
     *
     * The event used to be concatenated into it, which put a trade's legs into
     * a slot the prompt frames as "write about THAT" rather than as fact. It
     * came back inverted. Facts now travel in their own block; the angle stays
     * what it was, and with no event and no instruction there is still a
     * rotating lens so repeated clicks do not repeat themselves.
     */
    const angle = manualAngle
      || (event ? undefined : angleAt(Math.floor(Math.random() * 1000)));
    const record = event?.detail;

    const started = Date.now();
    let content: unknown;

    if (kind === 'article') {
      content = await writeArticle(persona, subject, angle, record);
    } else if (kind === 'tweet') {
      content = await writeTweet(persona, subject, angle, record);
    } else if (kind === 'comment') {
      // A comment reacts to something specific. Without one it has no
      // referent, and the model invents a post to reply to.
      const reactTo = record || manualAngle;
      if (!reactTo) {
        return NextResponse.json(
          { error: 'A comment needs something to react to. Pick a league event or write an angle.' },
          { status: 400 },
        );
      }
      content = await writeComment(persona, reactTo, Boolean(record));
    } else if (kind === 'powerRankings') {
      content = await writePowerRankings(persona);
    } else if (kind === 'predictions') {
      content = await writePredictions(persona);
    } else if (kind === 'matchupPreview') {
      const week = Number(body.week) || Number((await getNFLState().catch(() => null))?.week) || 0;
      if (!week) {
        return NextResponse.json(
          { error: 'No NFL week to preview yet.' },
          { status: 400 },
        );
      }
      content = await writeMatchupPreview(persona, week);
    } else {
      // Kickoff and live posts read the live scoreboard. Out of season there is
      // nothing there, and writeGameBeat throws rather than invent a game.
      const state = await getNFLState().catch(() => null);
      const week = Number(state?.week ?? 0);
      const slate = resolveGameWindow(new Date(), week).label;
      content = await writeGameBeat(persona, kind === 'kickoff' ? 'kickoff' : 'live', slate);
    }

    const post: FeedPost = {
      id: `${Date.now()}-${persona.id}`,
      personalityId: persona.id,
      personaName: persona.name,
      personaHandle: persona.handle,
      personaAccent: persona.accent,
      personaType: persona.type ?? 'media',
      personaAvatar: personaAvatarUrl(persona),
      kind,
      content: content as any,
      // Kept on the post so the feed can say what a piece is about, and so the
      // cron's coverage rotation counts hand published pieces too.
      ...(subject ? { subject } : {}),
      createdAt: new Date().toISOString(),
      // Admin publishes are immediate; only the daily batch is staggered.
      publishAt: new Date().toISOString(),
      source: 'admin',
    };
    // Published straight to the same feed the scheduler writes to, so admin
    // output and auto-posts are indistinguishable to readers. Comments used to
    // be generated and then silently dropped here, which is why publishing one
    // appeared to do nothing.
    await addPost(post);

    return NextResponse.json({
      post,
      ms: Date.now() - started,
      summary: describe(kind, content),
      published: {
        kind,
        persona: persona.name,
        ...(subject ? { subject } : {}),
        ...(event ? { event: event.label } : {}),
      },
    });
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('[api/ai/generate]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
