import { personaAvatarUrl } from '@/lib/ai/avatar';
import { NextResponse } from 'next/server';
import { isAIConfigured } from '@/lib/ai/claude';
import {
  writeArticle, writeTweet, writePowerRankings, writePredictions,
  writeMatchupPreview, writeGameBeat, writeGameOfWeek, angleAt,
} from '@/lib/ai/generate';
import { gameOfWeek, type GameOfWeek } from '@/lib/gameOfWeek';
import { getCurrentLeagueId } from '@/config/league';
import { resolveGameWindow, isGameTime } from '@/lib/ai/gameWindows';
import { buildLiveBrief } from '@/lib/ai/liveBrief';
import { coverageOrder } from '@/lib/ai/coverage';
import { addReply, replyTargets } from '@/lib/ai/threads';
import { getNFLState } from '@/lib/api';
import {
  addPost,
  getPosts,
  getPersonalities,
  lastGeneratedAt,
  lastLeadAt,
  lastPublishAt,
  gameOfWeekAnnounced,
  type FeedPost,
} from '@/lib/ai/store';
import type { Personality } from '@/lib/ai/personalities';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Batch writer for the desk, run a few times a day.
 *
 * Each run generates a small batch and staggers each post's publishAt across
 * the hours until the next run is due. The public feed hides anything not yet
 * due, so readers see the desk trickle content out rather than dump it.
 *
 * ── Why several runs rather than one ─────────────────────────────────────────
 *
 * This used to write a whole day in one invocation and spread it over 22 hours.
 * Doubling the volume that way is not possible: a serverless invocation is
 * killed at `maxDuration`, and the run already stops starting new pieces at 40
 * seconds, so the extra pieces would simply be deferred and never written. More
 * output has to mean more runs.
 *
 * Vercel's Hobby plan allows two cron jobs firing once a day and both are
 * spoken for, so the extra pokes come from GitHub Actions, the same way live
 * game-day coverage already does. The endpoint is the authority regardless: the
 * rerun guard below decides whether a poke does anything, so an over-generous
 * schedule costs nothing.
 *
 * Every value is env-tunable, so cadence and spend change without a code edit.
 */
const num = (key: string, fallback: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

/**
 * Pieces written per run. Two is what fits the time budget below.
 *
 * ── The day, with the defaults ───────────────────────────────────────────────
 *
 * Pokes arrive hourly and the rerun guard admits one roughly every three
 * hours, so a day is about five runs: 9am, noon, 3pm, 6pm and 9pm Eastern. Each
 * writes two posts, one up at once and one later in its window, and three
 * replies walked out across the same window. Around ten posts and fifteen
 * replies a day, never more than an hour or so between new activity, and
 * nothing between 11pm and 8am.
 */
// AI_ARTICLES_PER_DAY is no longer read: a run leads with at most one
// substantial piece, rotating article -> power rankings -> predictions, and
// fills the rest with short posts.
const POSTS_PER_RUN   = Math.min(num('AI_POSTS_PER_RUN', num('AI_POSTS_PER_DAY', 2)), 8);
/**
 * Window one run's posts and replies are spread across.
 *
 * The gap to the next run, so batches abut rather than overlap. Never past
 * the start of quiet hours: see `clampToWaking`.
 */
const SPREAD_HOURS    = num('AI_SPREAD_HOURS', 3);

/**
 * Hours, Eastern, when no batch is written and nothing is scheduled to appear.
 *
 * GitHub delays scheduled pokes by hours under load, so the schedule alone
 * cannot keep the desk quiet overnight; a 9pm poke landing at 2am would
 * otherwise post into an empty room and push the morning's news down the feed.
 */
const QUIET_FROM_ET   = num('AI_QUIET_FROM_HOUR_ET', 23);
const QUIET_UNTIL_ET  = num('AI_QUIET_UNTIL_HOUR_ET', 8);
/**
 * Stop starting new pieces once the invocation is this old.
 *
 * A serverless function is killed at maxDuration with no chance to save, so a
 * long piece started at 50s would lose everything written before it. Whatever
 * does not fit is simply picked up by the next run.
 */
const TIME_BUDGET_MS = 40_000;

/**
 * Minimum gap between live game-day posts.
 *
 * Live coverage is driven by an external schedule that may tick every few
 * minutes; without a floor the desk would spend a Sunday afternoon posting the
 * same scoreboard over and over. Ninety minutes is roughly a quarter and a
 * half of real football, which is long enough for the picture to change.
 */
const LIVE_COOLDOWN_MS = num('AI_LIVE_COOLDOWN_MINUTES', 90) * 60 * 1000;

/** Replies written per run. Short calls, so a few is cheap; they are walked out
 *  across the run's window, so a comment section fills the way one does when
 *  people are actually reading. */
const REPLIES_PER_RUN = num('AI_REPLIES_PER_RUN', 3);

/**
 * Minimum gap between batches.
 *
 * Both a guard against a double-trigger and the thing that decides how many
 * runs a day actually happen: pokes arrive hourly and this rejects the ones
 * that come too soon. Two and a half hours admits the poke three hours after
 * the last run, since the run itself takes seconds past its poke.
 */
const RERUN_GUARD_MS  = num('AI_RERUN_GUARD_HOURS', 2.5) * 60 * 60 * 1000;

/**
 * How long a substantial piece holds the lead.
 *
 * Only the first run of a day writes one. Longer than a day would skip days
 * when a run slips; shorter would let two land together.
 */
const LEAD_GAP_MS     = num('AI_LEAD_GAP_HOURS', 20) * 60 * 60 * 1000;

function authorized(request: Request): boolean {
  // The admin panel's "Run scheduler" button. Without this the button works
  // locally, where CRON_SECRET is usually unset, and starts returning 401 the
  // moment the secret is set in production, which is exactly when the panel is
  // most needed. Vercel Cron cannot send this header; an admin cannot send the
  // Bearer one. Both callers are legitimate, so both are accepted.
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && request.headers.get('x-admin-password') === adminPassword) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unset locally so the admin panel can trigger it
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/** Randomised, strictly increasing publish times across the window. The first
 *  entry is exact so a fresh batch always has something readable right away;
 *  everything after it is jittered inside its slot so spacing never looks
 *  mechanical. */
/** The hour of day in Eastern time, DST included. */
function easternHour(at: number): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23',
  }).format(at));
}

function isQuiet(at: number): boolean {
  const h = easternHour(at);
  return QUIET_FROM_ET > QUIET_UNTIL_ET
    ? h >= QUIET_FROM_ET || h < QUIET_UNTIL_ET
    : h >= QUIET_FROM_ET && h < QUIET_UNTIL_ET;
}

/**
 * Pull a time back out of quiet hours.
 *
 * A 9pm run spreads its second post up to three hours on, which would land it
 * after midnight. Anything that would fall in quiet hours is moved to just
 * before they start, keeping its order, rather than held until morning, where
 * it would sit under the morning run as stale news.
 */
function clampToWaking(times: number[]): number[] {
  const out: number[] = [];
  times.forEach((t, i) => {
    if (isQuiet(t)) {
      // Step back to the last waking minutes before quiet hours began, then
      // leave room for whatever else in the batch is landing there too.
      let back = t;
      while (isQuiet(back) && t - back < 12 * 3600e3) back -= 5 * 60e3;
      t = back - (times.length - 1 - i) * 6 * 60e3;
    }
    out.push(Math.max(t, (out[i - 1] ?? -Infinity) + 60e3));
  });
  return out;
}

function scheduleTimes(count: number, startAt: number): number[] {
  const window = SPREAD_HOURS * 60 * 60 * 1000;
  const slot = window / count;
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? startAt : Math.round(startAt + i * slot + Math.random() * slot * 0.8),
  );
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Game-day coverage: one short post while the games are actually on.
 *
 * Deliberately separate from the daily batch, which writes a day's worth up
 * front and staggers publication. That model is exactly wrong here: a reaction
 * to a scoreboard is worthless an hour later, so these publish immediately and
 * one at a time.
 *
 * Three independent gates have to agree before anything is written, because
 * the failure mode is a persona inventing a fourth-quarter comeback in March:
 *   1. Sleeper says we are in the regular season or the postseason.
 *   2. The clock says an NFL window is open, in Eastern time.
 *   3. For an in-progress post, the scoreboard shows someone has actually
 *      scored. Sleeper exposes no game clock, so points are the only real
 *      evidence that football is being played.
 */
async function runLiveCoverage(force: boolean) {
  const nflState = await getNFLState().catch(() => null);
  const week = Number(nflState?.week ?? 0);
  const seasonType = String(nflState?.season_type ?? '');

  if (!week || (seasonType !== 'regular' && seasonType !== 'post')) {
    return NextResponse.json({ skipped: 'not-in-season', seasonType, week });
  }

  const window = resolveGameWindow(new Date(), week);
  if (!force && !isGameTime(window)) {
    return NextResponse.json({ skipped: 'no-games-now', state: window.state, et: window.et });
  }

  // One post per cooldown, however often the schedule ticks.
  const recent = await getPosts(20);
  const lastLive = recent.find(p => p.kind === 'kickoff' || p.kind === 'liveTake');
  const since = lastLive ? Date.now() - new Date(lastLive.createdAt).getTime() : Infinity;
  if (!force && since < LIVE_COOLDOWN_MS) {
    return NextResponse.json({
      skipped: 'live-cooldown',
      minutesSinceLastLivePost: Math.round(since / 60_000),
    });
  }

  const live = await buildLiveBrief();
  if (!live) return NextResponse.json({ skipped: 'no-live-week' });

  // The window says games should be on; the scoreboard says whether they are.
  // Before anyone scores there is nothing to react to, so the slate gets a
  // kickoff post instead of a fabricated in-progress one.
  const mode: 'kickoff' | 'live' =
    window.state === 'kickoff' || !live.anyScoring ? 'kickoff' : 'live';
  const kind = mode === 'kickoff' ? 'kickoff' : 'liveTake';

  const people = (await getPersonalities()).filter(p => p.enabled && p.kinds.includes(kind));
  if (!people.length) return NextResponse.json({ skipped: 'no-personality-writes-live' });

  // Not the writer who filed the last live post, so a Sunday is not one voice.
  const eligible = people.filter(p => p.id !== lastLive?.personalityId);
  const persona = pick(eligible.length ? eligible : people);

  try {
    const content = await writeGameBeat(persona, mode, window.label, live);
    const post: FeedPost = {
      id: `${Date.now()}-${persona.id}-live`,
      personalityId: persona.id,
      personaName: persona.name,
      personaHandle: persona.handle,
      personaAccent: persona.accent,
      personaType: persona.type ?? 'media',
      personaAvatar: personaAvatarUrl(persona),
      kind,
      content: content as any,
      createdAt: new Date().toISOString(),
      // Live copy publishes now. Staggering it would be publishing a stale
      // scoreboard on purpose.
      publishAt: new Date().toISOString(),
      source: 'cron',
    };
    await addPost(post);
    return NextResponse.json({
      posted: 1, kind, persona: persona.name,
      slate: window.label, week, scoring: live.anyScoring,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/ai/cron] live ${persona.name}/${kind} failed:`, msg);
    return NextResponse.json({ posted: 0, error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAIConfigured()) {
    return NextResponse.json({ skipped: 'ai-not-configured' });
  }

  const params = new URL(request.url).searchParams;
  const force = params.get('force') === '1';

  // Game-day coverage runs on its own cadence and its own guards.
  if (params.get('mode') === 'live') return runLiveCoverage(force);

  const sinceGenerated = Date.now() - (await lastGeneratedAt());
  if (!force && sinceGenerated < RERUN_GUARD_MS) {
    return NextResponse.json({
      skipped: 'too-soon-since-last-batch',
      hoursSinceLastBatch: Math.round(sinceGenerated / 3_600_000),
      minimumGapHours: Math.round(RERUN_GUARD_MS / 3_600_000),
    });
  }
  if (!force && isQuiet(Date.now())) {
    return NextResponse.json({ skipped: 'quiet-hours', easternHour: easternHour(Date.now()) });
  }

  // Who the next column is about.
  //
  // Left to choose freely the writers converged on whoever the brief makes
  // loudest, which meant five straight pieces about the reigning champion.
  // Commissioning a specific team, least recently covered first, gets the whole
  // league written about instead.
  // Shared with the hand publish route, so the two cannot drift apart. It used
  // to live only here, which is why pieces published from the panel had no
  // rotation at all.
  const subjects = await coverageOrder().catch(err => {
    console.error('[api/ai/cron] could not build subject rotation:', err);
    return [] as string[];
  });

  const people = (await getPersonalities()).filter(p => p.enabled);
  if (!people.length) return NextResponse.json({ skipped: 'no-enabled-personalities' });

  const articleWriters = people.filter(p => p.kinds.includes('article'));
  const rankWriters    = people.filter(p => p.kinds.includes('powerRankings'));
  const predictWriters = people.filter(p => p.kinds.includes('predictions'));
  const postWriters    = people.filter(p => p.kinds.includes('tweet'));
  const previewWriters = people.filter(p => p.kinds.includes('matchupPreview'));

  /**
   * Whether a week preview makes sense today.
   *
   * Sleeper rolls `week` forward on Tuesday, so from Tuesday until Thursday's
   * kickoff it names the week about to be played and a preview is genuinely a
   * preview. From Thursday night onward it names a week already in progress,
   * and previewing that would be reporting the future about the present.
   */
  const previewWeek = await (async () => {
    if (!previewWriters.length) return 0;
    const state = await getNFLState().catch(() => null);
    const wk = Number(state?.week ?? 0);
    if (!wk || state?.season_type !== 'regular') return 0;
    const w = resolveGameWindow(new Date(), wk);
    const midweek = w.et.weekday === 2 || w.et.weekday === 3;
    return midweek && w.state === 'idle' ? wk : 0;
  })();
  if (!postWriters.length && !articleWriters.length) {
    return NextResponse.json({ skipped: 'no-personality-writes-these-kinds' });
  }

  // Queue behind anything still pending so a re-run does not bunch up, but
  // when nothing is pending start immediately: offsetting the first post left
  // the feed reading "nothing filed yet" for an hour after every fresh run.
  // With several runs a day a batch often starts while the tail of the last one
  // is still queued, so the push is capped: uncapped, each run would begin
  // where the previous ended and the queue would drift steadily further into
  // the future until posts were landing a day late.
  const pendingUntil = await lastPublishAt();
  const hasBacklog = pendingUntil > Date.now();
  const startAt = hasBacklog
    ? Math.min(pendingUntil + 60_000, Date.now() + 90 * 60_000)
    : Date.now();
  const times = clampToWaking(scheduleTimes(POSTS_PER_RUN, startAt));

  type PlannedKind =
    'article' | 'tweet' | 'powerRankings' | 'predictions' | 'matchupPreview' | 'gameOfWeek';
  const plan: { kind: PlannedKind; persona: Personality }[] = [];

  /**
   * One substantial piece per run, then short posts.
   *
   * Pairing an article WITH a marquee piece never fit: the article alone spends
   * most of the time budget, so the marquee was deferred every single run and
   * power rankings never published at all. Rotating the lead across a three day
   * cycle means each format actually appears, and the rest of the batch is
   * short posts, which are quick and keep the feed moving.
   */
  // A week preview is the most timely thing the desk can lead with, so on the
  // midweek days it displaces the rotation entirely rather than waiting its
  // turn behind a power ranking.
  const LEAD_CYCLE: PlannedKind[] = previewWeek
    ? ['matchupPreview', 'article', 'powerRankings', 'predictions']
    : ['article', 'powerRankings', 'predictions'];
  const poolFor = (k: PlannedKind) =>
    k === 'article' ? articleWriters :
    k === 'powerRankings' ? rankWriters :
    k === 'predictions' ? predictWriters :
    // Anyone trusted with a week preview can announce the featured game; it
    // is the same kind of piece, and a separate permission would need every
    // saved persona migrated before the feature did anything.
    k === 'matchupPreview' || k === 'gameOfWeek' ? previewWriters : postWriters;

  // One lead a day, not one a run. The cycle is keyed to the day, so without
  // this every run on the same day would lead with the same format and file a
  // second power ranking a few hours after the first.
  const ledRecently = Date.now() - (await lastLeadAt()) < LEAD_GAP_MS;

  // Day of year, so the cycle advances even if a run is missed.
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  /**
   * Midweek, the week's Game of the Week is announced first, then the full
   * preview follows on the next day's lead. Announcing it after the preview
   * would be featuring a game everyone has already read about.
   */
  let gotw: GameOfWeek | null = null;
  if (previewWeek && previewWriters.length) {
    const state = await getNFLState().catch(() => null);
    const season = String(state?.season ?? '');
    if (season && !(await gameOfWeekAnnounced(season, previewWeek))) {
      gotw = await gameOfWeek(await getCurrentLeagueId(), season, previewWeek, previewWeek)
        .catch(err => { console.error('[api/ai/cron] game of the week:', err); return null; });
    }
  }
  let lead: PlannedKind | null =
    gotw ? 'gameOfWeek' :
    previewWeek && previewWriters.length ? 'matchupPreview' : null;
  for (let i = 0; !lead && i < LEAD_CYCLE.length; i++) {
    const candidate = LEAD_CYCLE[(dayIndex + i) % LEAD_CYCLE.length];
    if (poolFor(candidate).length) { lead = candidate; break; }
  }
  if (ledRecently) lead = null;

  // Spread each persona around rather than letting one dominate the day.
  const rotation = [...people].sort(() => Math.random() - 0.5);
  for (let i = 0; i < POSTS_PER_RUN; i++) {
    const kind: PlannedKind = i === 0 && lead ? lead : 'tweet';
    let pool = poolFor(kind);
    if (!pool.length) pool = postWriters.length ? postWriters : articleWriters;

    const persona = rotation.find(p => pool.includes(p) && !plan.some(x => x.persona.id === p.id)) ?? pick(pool);
    plan.push({ kind, persona });
  }

  // Advances for every subject-bearing piece in this batch.
  let subjectCursor = 0;
  const written: { kind: string; persona: string; publishAt: string }[] = [];
  const failures: string[] = [];
  const startedAt = Date.now();
  let deferred = 0;

  for (let i = 0; i < plan.length; i++) {
    const { kind, persona } = plan[i];

    // Never begin a piece we cannot finish before the platform kills us.
    if (i > 0 && Date.now() - startedAt > TIME_BUDGET_MS) {
      deferred = plan.length - i;
      break;
    }
    try {
      // Every piece that can be about one team takes the next slot in the
      // rotation, so a batch never doubles up and the feed works its way round
      // the league. Power rankings and predictions are league-wide by design
      // and cover everyone already.
      const takesSubject = kind === 'article' || kind === 'tweet';
      const rotationIndex = subjectCursor++;
      const subject = takesSubject && subjects.length
        ? subjects[rotationIndex % subjects.length]
        : undefined;
      // A different lens per piece, so two writers on the same day do not both
      // open with the loudest number in the brief.
      const angle = takesSubject
        ? angleAt(rotationIndex + new Date().getUTCDate())
        : undefined;

      const content =
        kind === 'article'        ? await writeArticle(persona, subject, angle) :
        kind === 'powerRankings'  ? await writePowerRankings(persona) :
        kind === 'predictions'    ? await writePredictions(persona) :
        kind === 'matchupPreview' ? await writeMatchupPreview(persona, previewWeek) :
        kind === 'gameOfWeek'     ? await writeGameOfWeek(persona, gotw!) :
                                    await writeTweet(persona, subject, angle);
      // Times are claimed by successful posts only. Indexing by loop position
      // meant a failed item burned slot 0, the one that publishes immediately,
      // and the whole batch landed in the future leaving the feed empty.
      const slot = written.length;
      const post: FeedPost = {
        id: `${Date.now()}-${persona.id}-${i}`,
        personalityId: persona.id,
        personaName: persona.name,
        personaHandle: persona.handle,
        personaAccent: persona.accent,
      personaType: persona.type ?? 'media',
        personaAvatar: personaAvatarUrl(persona),
        kind,
        content: content as any,
        ...(subject ? { subject } : {}),
        createdAt: new Date().toISOString(),
        publishAt: new Date(times[slot]).toISOString(),
        source: 'cron',
      };
      // Written one at a time so a later failure never discards earlier work.
      await addPost(post);
      written.push({ kind, persona: persona.name, publishAt: post.publishAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[api/ai/cron] ${persona.name}/${kind} failed:`, msg);
      failures.push(`${persona.name}/${kind}: ${msg}`);
      // A storage failure will hit every remaining item, so stop early.
      if (/storage is not writable/i.test(msg)) break;
    }
  }

  if (!written.length) {
    return NextResponse.json(
      { posted: 0, error: failures[0] ?? 'nothing generated', failures },
      { status: 500 },
    );
  }

  /**
   * Argue under the posts that are already up.
   *
   * Deliberately about the existing feed rather than the batch just written:
   * most of that batch is staggered into the future, and a reply that lands
   * before the post it answers reads as nonsense. These are short, cheap
   * calls, so they run on whatever time is left rather than getting their own
   * budget, and whatever does not fit is picked up by the next run.
   */
  const threaded: { on: string; by: string; stance: string }[] = [];
  try {
    const targets = await replyTargets();
    const byParent = new Map<string, string[]>();
    for (const p of await getPosts(100)) {
      if (p.replyTo) byParent.set(p.replyTo, [...(byParent.get(p.replyTo) ?? []), p.personalityId]);
    }

    // Walked out across the run's window rather than all at once, so a
    // comment section fills the way one does when people are reading.
    const chosen = targets.slice(0, REPLIES_PER_RUN);
    for (let i = 0; i < chosen.length; i++) {
      const { post } = chosen[i];
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      // The first lands within the half hour, the rest across the run's
      // window, so there is something new between one run and the next.
      const window = SPREAD_HOURS * 3600e3;
      const due = clampToWaking([Date.now() + (10 + Math.random() * 15) * 60e3
        + i * (window * 0.8 / Math.max(chosen.length, 1)) * (0.75 + Math.random() * 0.5)])[0];
      const reply = await addReply(people, post, byParent.get(post.id) ?? [], due);
      if (reply) {
        threaded.push({ on: post.personaName, by: reply.personaName, stance: reply.stance! });
      }
    }
  } catch (err) {
    // A thread failing is not a reason to report the batch as failed.
    console.error('[api/ai/cron] replies failed:', err);
  }

  return NextResponse.json({
    posted: written.length,
    requested: POSTS_PER_RUN,
    ...(deferred ? { deferred, note: 'Ran out of time; the rest roll into the next run.' } : {}),
    spreadHours: SPREAD_HOURS,
    written,
    ...(threaded.length ? { replies: threaded } : {}),
    ...(failures.length ? { failures } : {}),
  });
}
