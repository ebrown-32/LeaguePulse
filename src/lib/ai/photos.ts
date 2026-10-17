/**
 * The desk's photographers: now and then, around the week's biggest game, a
 * writer posts a photo from the host's stadium (lib/franchise/photo) with a
 * caption about the scene and the crowd. Days out it's the empty stadium;
 * on game day a drone over the tailgates; once the gates open, the teams
 * warming up in their colors or a selfie on the sideline; then the crowd.
 *
 * The big games: the Game of the Week in the regular season; in the playoffs,
 * every game still being played in the title bracket, the championship first.
 * At most one photo a batch, a handful a game, never the same shot twice.
 * Server only.
 */

import { defaultStadiumName } from '@/lib/franchise/stadiumName';
import { getCurrentLeagueId } from '@/config/league';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getNFLState, getPlayoffBracket } from '@/lib/api';
import { gameOfWeek, type GameOfWeek } from '@/lib/gameOfWeek';
import { gameDay } from '@/lib/franchise/venue';
import { venueFor, type Venue } from '@/lib/franchise/venueServer';
import { SHOTS_FOR, type PhotoSpec, type Shot } from '@/lib/franchise/photo';
import { allPosts } from './store';
import type { PhotoMoment } from './generate';

/** A game gets at most this many photos, at least this far apart. */
const PER_GAME = 4;
const GAP_MS = 6 * 3_600_000;

export interface PlannedPhoto {
  spec: PhotoSpec;
  moment: PhotoMoment;
  hostTeam: string;
  hostAvatar: string;
  guestTeam: string;
}

/** New York hour of day at a moment: the photo's light. */
function nyHour(at: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(at));
  const get = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return get('hour') + get('minute') / 60;
}

interface Side { userId: string; teamName: string; avatar: string; record: string }
interface BigGame { a: Side; b: Side; occasion: string | null }

/**
 * This week's big games, biggest first: the Game of the Week, or in the playoffs the title
 * bracket's games still to be decided (Sleeper's bracket, which ESPN leagues are translated to).
 */
async function bigGames(season: string, week: number): Promise<BigGame[]> {
  const leagueId = await getCurrentLeagueId();
  const league = await getLeagueInfo(leagueId).catch(() => null as any);
  const start = Number(league?.settings?.playoff_week_start ?? 0);
  if (!start || week < start) {
    const pick: GameOfWeek | null = await gameOfWeek(leagueId, season, week, week).catch(() => null);
    return pick ? [{ a: pick.a, b: pick.b, occasion: null }] : [];
  }
  const [bracket, rosters, users] = await Promise.all([
    getPlayoffBracket(leagueId).catch(() => null), getLeagueRosters(leagueId).catch(() => [] as any[]), getLeagueUsers(leagueId).catch(() => [] as any[]),
  ]);
  const side = (rosterId: number): Side | null => {
    const r = rosters.find((x: any) => x.roster_id === rosterId);
    const u = r && users.find((x: any) => x.user_id === r.owner_id);
    if (!r?.owner_id) return null;
    return {
      userId: String(r.owner_id), teamName: u?.metadata?.team_name || u?.display_name || 'Team', avatar: u?.avatar ?? '',
      record: `${r.settings?.wins ?? 0}-${r.settings?.losses ?? 0}${r.settings?.ties ? `-${r.settings.ties}` : ''}`,
    };
  };
  const live = ((bracket?.winners_bracket ?? []) as any[]).filter(g => g.w == null && typeof g.t1 === 'number' && typeof g.t2 === 'number');
  const lastRound = Math.max(0, ...live.map(g => g.r));
  return live
    // The championship first (placed 1st), then the rest of the latest round.
    .sort((x, y) => (x.p === 1 ? -1 : 0) - (y.p === 1 ? -1 : 0) || y.r - x.r)
    .flatMap(g => {
      const a = side(g.t1), b = side(g.t2);
      if (!a || !b) return [];
      const occasion = g.p === 1 ? 'the championship game' : g.p ? 'a playoff placement game' : g.r === lastRound && live.length <= 2 ? 'a playoff semifinal' : 'a playoff game';
      return [{ a, b, occasion }];
    });
}

/** A photo to post at `at`, or null when none is due. */
export async function planPhoto(at: number): Promise<PlannedPhoto | null> {
  // The stadiums come from Franchise HQ, which is hosted only: a self-hosted
  // desk has nothing to photograph, and a caption with no picture is worse than none.
  if (process.env.LP_HOSTED !== '1') return null;
  const nfl = await getNFLState().catch(() => null as any);
  if (!nfl || nfl.season_type !== 'regular') return null;
  const season = String(nfl.season), week = Number(nfl.week);
  const posts = (await allPosts().catch(() => [] as any[])).filter((p: any) => p.kind === 'photo' && p.content?.photo?.season === season && p.content?.photo?.week === week);
  // At least six hours between any two photos, whichever game they're from.
  if (posts.some((p: any) => Math.abs(new Date(p.publishAt ?? p.createdAt).getTime() - at) < GAP_MS)) return null;
  for (const game of await bigGames(season, week)) {
    const photo = await planFor(game, season, week, at, posts);
    if (photo) return photo;
  }
  return null;
}

async function planFor(pick: BigGame, season: string, week: number, at: number, posts: any[]): Promise<PlannedPhoto | null> {
  // What this game already has.
  const pair = new Set([pick.a.userId, pick.b.userId]);
  const mine = posts.filter((p: any) => pair.has(p.content.photo.host) && pair.has(p.content.photo.guest));
  if (mine.length >= PER_GAME) return null;

  const venue: Venue = await venueFor(pick.a.userId, pick.b.userId, week);
  const day = gameDay(at, venue.kickoff, venue.phase, venue.crowd?.fill ?? 0.8);
  // Not before the lots start filling, three days out.
  if (day.stage === 'quiet' && day.hours > 72) return null;
  const used = new Set<Shot>(mine.map((p: any) => p.content.photo.shot));
  const shot = SHOTS_FOR[day.stage].find(s => !used.has(s));
  if (!shot) return null;

  const host = venue.host === pick.a.userId ? pick.a : pick.b, guest = host === pick.a ? pick.b : pick.a;
  const { currentSite } = await import('@/lib/archive/ingest');
  const { getFranchise } = await import('@/lib/franchise/store');
  const site = await currentSite();
  const f = await getFranchise(site, host.userId).catch(() => null);
  const stadium = f?.stadiumName || defaultStadiumName(host.userId, host.teamName);

  return {
    spec: { shot, host: host.userId, guest: guest.userId, season, week, hour: Math.round(nyHour(at) * 10) / 10, stands: Math.round(day.stands * 100) / 100, lots: Math.round(day.lots * 100) / 100 },
    moment: {
      shot, stage: day.stage, host: { teamName: host.teamName, record: host.record }, guest: { teamName: guest.teamName, record: guest.record },
      stadium, attendance: venue.crowd?.attendance ?? null, capacity: venue.crowd?.capacity ?? null, hours: day.hours,
      gameOfWeek: pick.occasion === null, occasion: pick.occasion,
    },
    hostTeam: host.teamName, hostAvatar: host.avatar, guestTeam: guest.teamName,
  };
}
