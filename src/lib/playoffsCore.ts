/** The pure parts of the playoffs (lib/playoffs): round names and seeding. Shared with the tests. */

/** "Championship", "Semifinals", "Quarterfinals", counting back from the last round. */
export function roundLabels(rounds: number): string[] {
  return Array.from({ length: rounds }, (_, i) => {
    const fromEnd = rounds - 1 - i;
    return fromEnd === 0 ? 'Championship' : fromEnd === 1 ? 'Semifinals' : fromEnd === 2 ? 'Quarterfinals' : `Round ${i + 1}`;
  });
}

/**
 * Seeds from final regular season standings: record (ties half a win), then
 * points for. The provider's own rank wins where every team has one.
 */
export function standingsSeeds(rosters: { roster_id: number; settings?: any }[]): { seeds: Map<number, number>; fromProvider: boolean } {
  // ESPN's playoff seed (translated to `rank`): the league's own, divisions and all.
  const ranked = rosters.map(r => r.settings ?? {});
  if (rosters.length && ranked.every(s => Number(s.rank) > 0) && new Set(ranked.map(s => Number(s.rank))).size === rosters.length) {
    return { seeds: new Map(rosters.map(r => [r.roster_id, Number(r.settings.rank)])), fromProvider: true };
  }
  const pf = (s: any) => Number(s.fpts ?? 0) + Number(s.fpts_decimal ?? 0) / 100;
  const pct = (s: any) => {
    const g = Number(s.wins ?? 0) + Number(s.losses ?? 0) + Number(s.ties ?? 0);
    return g ? (Number(s.wins ?? 0) + Number(s.ties ?? 0) / 2) / g : 0;
  };
  return {
    seeds: new Map([...rosters]
      .sort((a, b) => pct(b.settings ?? {}) - pct(a.settings ?? {}) || pf(b.settings ?? {}) - pf(a.settings ?? {}))
      .map((r, i) => [r.roster_id, i + 1])),
    fromProvider: false,
  };
}

/** Byes are top seeds: seeds that put a non-bye team above a bye team are wrong for this league. */
export function seedsAgreeWithByes(seeds: Map<number, number>, byeTeams: number[]): boolean {
  if (!byeTeams.length) return true;
  return byeTeams.every(t => (seeds.get(t) ?? 99) <= byeTeams.length);
}

