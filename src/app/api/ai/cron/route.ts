import { personaAvatarUrl } from '@/lib/ai/avatar';
import { NextResponse } from 'next/server';
import { isAIConfigured } from '@/lib/ai/claude';
import { writeArticle, writeTweet, writePowerRankings, writePredictions, angleAt } from '@/lib/ai/generate';
import { getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import {
  addPost,
  getPersonalities,
  getRecentSubjects,
  lastGeneratedAt,
  lastPublishAt,
  type FeedPost,
} from '@/lib/ai/store';
import type { Personality } from '@/lib/ai/personalities';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily batch writer, built for Vercel's Hobby plan.
 *
 * Hobby allows a single cron invocation per day, so posting one piece per run
 * would leave the feed nearly static. Instead this run generates a whole day's
 * worth in one go and staggers each post's publishAt across the following ~22
 * hours. The public feed hides anything not yet due, so readers still see the
 * desk trickle content out through the day.
 *
 * Every value is env-tunable, so cadence and spend change without a code edit.
 */
const num = (key: string, fallback: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

/** Pieces written per daily run. */
// Quality over quantity: two considered pieces a day beat a stream of thin
// takes, and each researched piece takes real time to produce.
const POSTS_PER_RUN   = Math.min(num('AI_POSTS_PER_DAY', 2), 8);
// AI_ARTICLES_PER_DAY is no longer read: each run leads with exactly one
// substantial piece, rotating article -> power rankings -> predictions, and
// fills the rest with short posts. AI_POSTS_PER_DAY still sets the batch size.
/** Window the batch is spread across. */
const SPREAD_HOURS    = num('AI_SPREAD_HOURS', 22);
/**
 * Stop starting new pieces once the invocation is this old.
 *
 * A serverless function is killed at maxDuration with no chance to save, so a
 * long piece started at 50s would lose everything written before it. Whatever
 * does not fit is simply picked up by the next run.
 */
const TIME_BUDGET_MS = 40_000;

/** Guard against a double-trigger writing two batches the same day. */
const RERUN_GUARD_MS  = num('AI_RERUN_GUARD_HOURS', 12) * 60 * 60 * 1000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unset locally so the admin panel can trigger it
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/** Randomised, strictly increasing publish times across the window. The first
 *  entry is exact so a fresh batch always has something readable right away;
 *  everything after it is jittered inside its slot so spacing never looks
 *  mechanical. */
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

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAIConfigured()) {
    return NextResponse.json({ skipped: 'ai-not-configured' });
  }

  const force = new URL(request.url).searchParams.get('force') === '1';
  const sinceGenerated = Date.now() - (await lastGeneratedAt());
  if (!force && sinceGenerated < RERUN_GUARD_MS) {
    return NextResponse.json({
      skipped: 'already-ran-today',
      hoursSinceLastBatch: Math.round(sinceGenerated / 3_600_000),
    });
  }

  // Who the next column is about.
  //
  // Left to choose freely the writers converged on whoever the brief makes
  // loudest, which meant five straight pieces about the reigning champion.
  // Commissioning a specific team, least recently covered first, gets the whole
  // league written about instead.
  let subjects: string[] = [];
  try {
    const leagueId = await getCurrentLeagueId();
    const [rosters, users] = await Promise.all([
      getLeagueRosters(leagueId), getLeagueUsers(leagueId),
    ]);
    const byId = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
    const teams = rosters
      .map((r: any) => {
        const u = byId.get(r.owner_id);
        return u?.metadata?.team_name || u?.display_name || '';
      })
      .filter(Boolean) as string[];

    const recent = await getRecentSubjects();
    // Rank by how long ago each team was last written about; never-covered
    // teams sort first because indexOf returns -1 for them.
    const lastSeen = (t: string) => {
      const i = recent.indexOf(t);
      return i === -1 ? Number.MAX_SAFE_INTEGER : recent.length - i;
    };
    subjects = [...teams].sort((a, b) => lastSeen(b) - lastSeen(a));
  } catch (err) {
    console.error('[api/ai/cron] could not build subject rotation:', err);
  }

  const people = (await getPersonalities()).filter(p => p.enabled);
  if (!people.length) return NextResponse.json({ skipped: 'no-enabled-personalities' });

  const articleWriters = people.filter(p => p.kinds.includes('article'));
  const rankWriters    = people.filter(p => p.kinds.includes('powerRankings'));
  const predictWriters = people.filter(p => p.kinds.includes('predictions'));
  const postWriters    = people.filter(p => p.kinds.includes('tweet'));
  if (!postWriters.length && !articleWriters.length) {
    return NextResponse.json({ skipped: 'no-personality-writes-these-kinds' });
  }

  // Queue behind anything still pending so a re-run does not bunch up, but
  // when nothing is pending start immediately: offsetting the first post left
  // the feed reading "nothing filed yet" for an hour after every fresh run.
  const pendingUntil = await lastPublishAt();
  const hasBacklog = pendingUntil > Date.now();
  const startAt = hasBacklog ? pendingUntil + 60_000 : Date.now();
  const times = scheduleTimes(POSTS_PER_RUN, startAt);

  type PlannedKind = 'article' | 'tweet' | 'powerRankings' | 'predictions';
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
  const LEAD_CYCLE: PlannedKind[] = ['article', 'powerRankings', 'predictions'];
  const poolFor = (k: PlannedKind) =>
    k === 'article' ? articleWriters :
    k === 'powerRankings' ? rankWriters :
    k === 'predictions' ? predictWriters : postWriters;

  // Day of year, so the cycle advances even if a run is missed.
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  let lead: PlannedKind | null = null;
  for (let i = 0; i < LEAD_CYCLE.length; i++) {
    const candidate = LEAD_CYCLE[(dayIndex + i) % LEAD_CYCLE.length];
    if (poolFor(candidate).length) { lead = candidate; break; }
  }

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
        kind === 'article'       ? await writeArticle(persona, subject, angle) :
        kind === 'powerRankings' ? await writePowerRankings(persona) :
        kind === 'predictions'   ? await writePredictions(persona) :
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

  return NextResponse.json({
    posted: written.length,
    requested: POSTS_PER_RUN,
    ...(deferred ? { deferred, note: 'Ran out of time; the rest roll into the next run.' } : {}),
    spreadHours: SPREAD_HOURS,
    written,
    ...(failures.length ? { failures } : {}),
  });
}
