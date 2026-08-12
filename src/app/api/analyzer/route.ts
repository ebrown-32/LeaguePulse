import { NextResponse } from 'next/server';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getPlayersDirectory, type PlayerCard } from '@/lib/playerStats';
import { getSnapshot } from '@/lib/fantasyProsStore';

export const dynamic = 'force-dynamic';

/**
 * League analyzer: power rankings from FantasyPros expert consensus.
 *
 * Forward-looking by construction. Nothing here uses past production; a team's
 * standing is the expert-ranked talent it rosters, under whichever lens is
 * selected.
 *
 * THE COVERAGE CEILING. The free API tier truncates every board to 10 rows and
 * offers no pagination, so only ~40 players per mode are ranked at all against
 * ~200 rostered. Every team's `coverage` is reported so the gap is visible
 * rather than hidden behind a confident-looking number: this measures the
 * concentration of expert-ranked talent, not a complete roster valuation.
 * Adding positions to the refresh widens it; a paid tier would remove the cap.
 */

export const ANALYZER_MODES = ['weekly', 'dynasty'] as const;
export type AnalyzerMode = (typeof ANALYZER_MODES)[number];

const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
type PositionGroup = (typeof POSITION_GROUPS)[number];

/** Top of each board is worth 10, the last row 1. A player appearing on both
 *  the overall and his positional board accumulates from each, which is what
 *  separates a genuine elite from a good starter at a thin position. */
const BOARD_DEPTH = 10;

export interface SlotEntry {
  slot: string;
  player: PlayerCard | null;
  /** Expert value, 0 when no expert board ranks him. */
  value: number;
  /** Best consensus rank across the boards he appears on. */
  bestRank: number | null;
  rank: number;
}

export interface AnalyzerTeam {
  userId: string;
  rosterId: number;
  teamName: string;
  manager: string;
  avatar: string;
  record: string;
  scores: Record<AnalyzerMode, number>;
  ranks: Record<AnalyzerMode, number>;
  /** Ranked vs total rostered, per mode. The honesty check on every score. */
  coverage: Record<AnalyzerMode, { ranked: number; total: number }>;
  avgAge: number | null;
  startersValue: Record<AnalyzerMode, number>;
  benchValue: Record<AnalyzerMode, number>;
  startersRank: Record<AnalyzerMode, number>;
  positions: Record<AnalyzerMode, Record<PositionGroup, { value: number; rank: number; starters: number; bench: number }>>;
  slots: Record<AnalyzerMode, SlotEntry[]>;
  elitePlayers: Record<AnalyzerMode, { name: string; position: string; posRank: string | null; rankEcr: number }[]>;
}

export interface AnalyzerResponse {
  slotOrder: string[];
  teams: AnalyzerTeam[];
  /** False when FantasyPros has never been refreshed. There is deliberately no
   *  production fallback, so the page says so rather than quietly substituting
   *  a different metric. */
  ecrAvailable: boolean;
  modesAvailable: AnalyzerMode[];
  fetchedAt: string | null;
  season: string | null;
}

function slotLabels(rosterPositions: string[]): string[] {
  const active = rosterPositions.filter(p => p !== 'BN' && p !== 'IR' && p !== 'TAXI');
  const counts: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const p of active) totals[p] = (totals[p] ?? 0) + 1;
  return active.map(p => {
    counts[p] = (counts[p] ?? 0) + 1;
    const label = p === 'DEF' ? 'DST' : p;
    return totals[p] > 1 ? `${label}${counts[p]}` : label;
  });
}

function rankBy<T>(items: T[], value: (t: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const out = new Map<T, number>();
  sorted.forEach((item, i) => {
    if (i > 0 && value(item) === value(sorted[i - 1])) out.set(item, out.get(sorted[i - 1])!);
    else out.set(item, i + 1);
  });
  return out;
}

const groupOf = (p: string): PositionGroup | null =>
  (POSITION_GROUPS as readonly string[]).includes(p) ? (p as PositionGroup) : null;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[.'`]/g, '').replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '').trim();
}

interface Valuation {
  value: number;
  bestRank: number;
  posRank: string | null;
  name: string;
  position: string;
  rankEcr: number;
}

export async function GET() {
  try {
    const snapshot = await getSnapshot();

    const leagueId = await getCurrentLeagueId();
    const [league, rosters, users, players] = await Promise.all([
      getLeagueInfo(leagueId),
      getLeagueRosters(leagueId),
      getLeagueUsers(leagueId),
      getPlayersDirectory(),
    ]);

    const slotOrder = slotLabels(league?.roster_positions ?? []);
    const modesAvailable = ANALYZER_MODES.filter(m => snapshot?.boards?.[m]);

    if (!snapshot || !modesAvailable.length) {
      return NextResponse.json({
        slotOrder, teams: [], ecrAvailable: false, modesAvailable: [],
        fetchedAt: null, season: null,
      } satisfies AnalyzerResponse);
    }

    // Expert valuation per player, per mode. A player on both the overall and
    // his positional board accumulates from each.
    const valueByMode: Record<string, Map<string, Valuation>> = {};
    for (const mode of modesAvailable) {
      const map = new Map<string, Valuation>();
      for (const board of Object.values(snapshot.boards[mode] ?? {})) {
        for (const p of board?.players ?? []) {
          const key = `${normalizeName(p.name)}|${p.position}`;
          const add = Math.max(BOARD_DEPTH + 1 - p.rankEcr, 1);
          const prev = map.get(key);
          map.set(key, {
            value: (prev?.value ?? 0) + add,
            bestRank: Math.min(prev?.bestRank ?? Infinity, p.rankEcr),
            posRank: prev?.posRank ?? p.posRank,
            name: p.name,
            position: p.position,
            rankEcr: Math.min(prev?.rankEcr ?? Infinity, p.rankEcr),
          });
        }
      }
      valueByMode[mode] = map;
    }

    const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));

    // Roster metadata only. No stats are fetched: this view is forward-looking
    // and must not fall back to production.
    const card = (id: string): PlayerCard => {
      const p = players[id] ?? {};
      const name = p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || id;
      return {
        playerId: id,
        name,
        position: p.position ?? '',
        nflTeam: p.team ?? '',
        number: p.number != null ? String(p.number) : null,
        age: typeof p.age === 'number' ? p.age : null,
        yearsExp: typeof p.years_exp === 'number' ? p.years_exp : null,
        injuryStatus: p.injury_status ?? null,
        points: null,
      } as PlayerCard;
    };

    const base = rosters.map((r: any) => {
      const u = userById.get(r.owner_id);
      const starterIds: string[] = (r.starters ?? []).filter((id: string) => id && id !== '0');
      const starterSet = new Set(starterIds);
      const benchIds: string[] = (r.players ?? []).filter((id: string) => id && !starterSet.has(id));
      const starterCards = starterIds.map(card);
      const benchCards = benchIds.map(card);
      const all = [...starterCards, ...benchCards];

      const lookup = (mode: string, c: PlayerCard) =>
        valueByMode[mode]?.get(`${normalizeName(c.name)}|${c.position}`) ?? null;
      const valOf = (mode: string, c: PlayerCard) => lookup(mode, c)?.value ?? 0;
      const sum = (mode: string, cards: PlayerCard[]) => cards.reduce((s, c) => s + valOf(mode, c), 0);

      const perMode = <T,>(fn: (m: AnalyzerMode) => T) =>
        Object.fromEntries(ANALYZER_MODES.map(m => [m, fn(m)])) as Record<AnalyzerMode, T>;

      const aged = all.map(c => c.age).filter((a): a is number => a != null);
      const s = r.settings ?? {};

      return {
        userId: r.owner_id,
        rosterId: r.roster_id,
        teamName: u?.metadata?.team_name || u?.display_name || 'Unknown',
        manager: u?.display_name ?? '',
        avatar: u?.avatar ?? '',
        record: `${s.wins ?? 0}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ''}`,
        avgAge: aged.length ? Math.round((aged.reduce((x, y) => x + y, 0) / aged.length) * 10) / 10 : null,

        startersValue: perMode(m => sum(m, starterCards)),
        benchValue: perMode(m => sum(m, benchCards)),
        coverage: perMode(m => ({
          ranked: all.filter(c => lookup(m, c)).length,
          total: all.length,
        })),
        positions: perMode(m =>
          Object.fromEntries(POSITION_GROUPS.map(g => {
            const st = starterCards.filter(c => groupOf(c.position) === g);
            const bn = benchCards.filter(c => groupOf(c.position) === g);
            return [g, { value: sum(m, st) + sum(m, bn), rank: 0, starters: sum(m, st), bench: sum(m, bn) }];
          })) as AnalyzerTeam['positions'][AnalyzerMode],
        ),
        slots: perMode(m => slotOrder.map((slot, i) => {
          const p = starterCards[i] ?? null;
          const v = p ? lookup(m, p) : null;
          return { slot, player: p, value: v?.value ?? 0, bestRank: v?.bestRank ?? null, rank: 0 };
        })),
        elitePlayers: perMode(m =>
          all.map(c => lookup(m, c))
             .filter((x): x is Valuation => Boolean(x))
             .sort((a, b) => a.rankEcr - b.rankEcr)
             .map(v => ({ name: v.name, position: v.position, posRank: v.posRank, rankEcr: v.rankEcr })),
        ),

        scores: { weekly: 0, dynasty: 0 },
        ranks: { weekly: 0, dynasty: 0 },
        startersRank: { weekly: 0, dynasty: 0 },
      } as AnalyzerTeam;
    });

    for (const mode of ANALYZER_MODES) {
      // Weekly is about who you start, so the bench is discounted. Dynasty
      // counts every ranked asset, which is the point of the lens.
      const raw = (t: AnalyzerTeam) =>
        mode === 'weekly'
          ? t.startersValue[mode] + 0.35 * t.benchValue[mode]
          : t.startersValue[mode] + t.benchValue[mode];

      const best = Math.max(...base.map(raw), 1);
      base.forEach(t => { t.scores[mode] = Math.round((raw(t) / best) * 100); });
      // Rank on raw, not the rounded score, or near-ties share a place.
      const ranked = rankBy(base, raw);
      base.forEach(t => { t.ranks[mode] = ranked.get(t)!; });

      const sr = rankBy(base, t => t.startersValue[mode]);
      base.forEach(t => { t.startersRank[mode] = sr.get(t)!; });

      for (const g of POSITION_GROUPS) {
        const pr = rankBy(base, t => t.positions[mode][g].value);
        base.forEach(t => { t.positions[mode][g].rank = pr.get(t)!; });
      }
      slotOrder.forEach((_, i) => {
        const slr = rankBy(base, t => t.slots[mode][i]?.value ?? 0);
        base.forEach(t => { if (t.slots[mode][i]) t.slots[mode][i].rank = slr.get(t)!; });
      });
    }

    base.sort((a, b) => a.ranks.weekly - b.ranks.weekly);

    return NextResponse.json({
      slotOrder,
      teams: base,
      ecrAvailable: true,
      modesAvailable,
      fetchedAt: snapshot.fetchedAt,
      season: snapshot.season,
    } satisfies AnalyzerResponse);
  } catch (err) {
    console.error('[api/analyzer]', err);
    return NextResponse.json({ error: 'Failed to build analyzer' }, { status: 500 });
  }
}
