import { getAllLinkedLeagueIds, getLeagueRosters } from '@/lib/api';

/**
 * Career points against, per manager.
 *
 * `generateComprehensiveLeagueHistory` totals points scored but not points
 * conceded, so anything reading `totalPointsAgainst` off it got `undefined`
 * and rendered NaN. Rather than widen that function, this sums the figure
 * Sleeper already keeps on each season's roster.
 *
 * Keyed by owner id, which is stable across seasons where roster ids are not.
 */
export async function allTimePointsAgainst(
  initialLeagueId: string,
): Promise<Record<string, number>> {
  const leagueIds = await getAllLinkedLeagueIds(initialLeagueId);
  const rosterSets = await Promise.all(
    leagueIds.map(id => getLeagueRosters(id).catch(() => [] as any[])),
  );

  const out: Record<string, number> = {};
  for (const rosters of rosterSets) {
    for (const r of rosters as any[]) {
      if (!r?.owner_id) continue;
      // Sleeper splits points into a whole part and hundredths.
      const pa = Number(r.settings?.fpts_against ?? 0)
        + Number(r.settings?.fpts_against_decimal ?? 0) / 100;
      out[r.owner_id] = Number(((out[r.owner_id] ?? 0) + pa).toFixed(2));
    }
  }
  return out;
}
