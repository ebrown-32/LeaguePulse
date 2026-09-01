/**
 * Whose turn it is to be written about.
 *
 * Left to choose freely, every writer reaches for whoever the brief makes
 * loudest, which in a league that trades a lot is always the busiest trader.
 * Measured over fifty posts, one team led eight of the twenty two most recent
 * headlines while two others led none.
 *
 * The scheduler already rotated subjects. Hand published pieces did not, and
 * they are the bulk of the feed, so the rotation lives here now and both paths
 * use it.
 */
import { getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getRecentSubjects } from './store';

/** Every team name in the league, in no particular order. */
export async function leagueTeamNames(): Promise<string[]> {
  const leagueId = await getCurrentLeagueId();
  const [rosters, users] = await Promise.all([
    getLeagueRosters(leagueId), getLeagueUsers(leagueId),
  ]);
  const byId = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
  return rosters
    .map((r: any) => {
      const u = byId.get(r.owner_id);
      return u?.metadata?.team_name || u?.display_name || '';
    })
    .filter(Boolean) as string[];
}

/**
 * Teams ordered by how long since anyone wrote about them, longest first.
 *
 * A team nobody has covered sorts ahead of everyone, because `indexOf` returns
 * -1 for it and that is treated as infinitely long ago.
 */
export async function coverageOrder(): Promise<string[]> {
  const [teams, recent] = await Promise.all([
    leagueTeamNames().catch(() => [] as string[]),
    getRecentSubjects(60).catch(() => [] as string[]),
  ]);
  if (!teams.length) return [];

  /**
   * How many posts ago this team was last written about.
   *
   * `getRecentSubjects` is newest first, so the index IS the distance: 0 means
   * the most recent piece was about them. The original expression here was
   * `recent.length - i`, which inverted it and gave the team covered most
   * recently the highest priority. In practice the rotation kept re-picking
   * whoever had just been written about: five straight hand published posts
   * landed on the same team.
   */
  const postsSinceCovered = (team: string) => {
    const i = recent.indexOf(team);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...teams].sort((a, b) => postsSinceCovered(b) - postsSinceCovered(a));
}

/** The single team most overdue for coverage, or undefined if unknown. */
export async function nextSubject(): Promise<string | undefined> {
  return (await coverageOrder())[0];
}
