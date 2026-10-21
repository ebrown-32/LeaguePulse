/**
 * A dynasty league's draft picks as trade assets: who owns which, and what each is worth.
 *
 *   Owners   every team holds its own picks in each round of the next three drafts, less any it
 *            has traded away and plus any it has traded for (Sleeper's traded_picks).
 *   Value    FantasyCalc's: next year's picks by where they're likely to land (the weakest third
 *            of the league's rosters pick early, the strongest late), later years by round alone.
 *            A year FantasyCalc doesn't price yet takes its furthest year's value for the round.
 *
 * Pure.
 */

export interface TradedPick {
  season: string;
  round: number;
  /** The team the pick originally belonged to. */
  roster_id: number;
  owner_id: number;
}

export interface PickAsset {
  id: string;
  season: string;
  round: number;
  originalRosterId: number;
  ownerRosterId: number;
  tier: 'Early' | 'Mid' | 'Late' | null;
  value: number;
  /** "2027 1st". */
  name: string;
}

export const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export function leaguePicks(o: {
  seasons: string[];
  rounds: number;
  rosterIds: number[];
  traded: TradedPick[];
  /** Roster strength by roster id: higher is stronger. */
  strength: Map<number, number>;
  /** FantasyCalc's pick values by its name for them. */
  values: Record<string, number>;
}): PickAsset[] {
  const ranked = [...o.rosterIds].sort((a, b) => (o.strength.get(a) ?? 0) - (o.strength.get(b) ?? 0));
  const third = Math.max(1, Math.ceil(ranked.length / 3));
  const tierOf = (rid: number): PickAsset['tier'] => {
    const i = ranked.indexOf(rid);
    return i < third ? 'Early' : i >= ranked.length - third ? 'Late' : 'Mid';
  };
  const priced = Object.keys(o.values).map(k => Number(k.slice(0, 4))).filter(Number.isFinite);
  const firstYear = Math.min(...priced), lastYear = Math.max(...priced);
  const valueOf = (season: string, round: number, tier: PickAsset['tier']) => {
    const year = Math.min(Number(season), lastYear);
    const plain = `${year} ${ordinal(round)}`;
    return (tier && o.values[`${plain} (${tier})`]) || o.values[plain] || 0;
  };

  const owner = new Map<string, number>();
  for (const t of o.traded) owner.set(`${t.season}:${t.round}:${t.roster_id}`, Number(t.owner_id));

  const out: PickAsset[] = [];
  for (const season of o.seasons) for (let round = 1; round <= o.rounds; round++) for (const rid of o.rosterIds) {
    const tier = Number(season) === firstYear || (Number(season) < firstYear) ? tierOf(rid) : null;
    out.push({
      id: `pick:${season}:${round}:${rid}`, season, round, originalRosterId: rid,
      ownerRosterId: owner.get(`${season}:${round}:${rid}`) ?? rid,
      tier, value: valueOf(season, round, tier), name: `${season} ${ordinal(round)}`,
    });
  }
  return out.filter(p => p.value > 0);
}
