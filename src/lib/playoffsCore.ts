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


interface SeasonLike {
  season: string;
  status: string;
  teams: { rosterId: number; userId: string }[];
  winners: { winner: number | null; loser: number | null; status: string }[];
  settings: { medianGame: boolean };
}

/**
 * Each manager's playoff record: decided games in the title bracket, the
 * placement games (third place and so on) included and the consolation games
 * not. A two week round is one game, as the bracket records it.
 */
export function playoffRecords(seasons: SeasonLike[]): Map<string, { wins: number; losses: number }> {
  const out = new Map<string, { wins: number; losses: number }>();
  const add = (userId: string | undefined, won: boolean) => {
    if (!userId) return;
    const r = out.get(userId) ?? { wins: 0, losses: 0 };
    if (won) r.wins++; else r.losses++;
    out.set(userId, r);
  };
  for (const s of seasons) {
    const owner = new Map(s.teams.map(t => [t.rosterId, t.userId]));
    for (const m of s.winners) {
      if (m.winner == null || m.loser == null) continue;
      add(owner.get(m.winner), true);
      add(owner.get(m.loser), false);
    }
  }
  return out;
}

/** What a league's regular season records include, to say so beside them. */
export function recordNotes(seasons: SeasonLike[]): { medianGame: boolean; seasonInProgress: string | null } {
  const latest = [...seasons].sort((a, b) => Number(b.season) - Number(a.season))[0];
  return {
    medianGame: seasons.some(s => s.settings.medianGame),
    seasonInProgress: latest && latest.status !== 'complete' ? latest.season : null,
  };
}
