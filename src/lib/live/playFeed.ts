/**
 * Your players, play by play.
 *
 * Every play in the week's games that one of your starters (or your
 * opponent's) took part in, newest first, with what it was worth.
 *
 * ── The points are an estimate ───────────────────────────────────────────────
 *
 * Worked out from the play's type, the player's role and the yardage, using
 * the league's own scoring settings: a 12 yard catch in a PPR league is
 * 1 + 1.2. That covers the plays that make up nearly all fantasy scoring
 * (runs, catches, passes, touchdowns, interceptions) and is shown with a "≈".
 * It ignores bonuses, two point conversions, kicking and stat corrections, so
 * Sleeper's total on the scoreboard stays the official figure.
 */

import { espnPlays, espnScoreboard } from './espn';
import { crosswalkFor } from './crosswalk';

export interface FeedPlay {
  id: string;
  gameId: string;
  matchup: string;
  at: string | null;
  period: number;
  clock: string;
  text: string;
  type: string;
  scoring: boolean;
  /** The Sleeper player this play is about. */
  playerId: string;
  role: string;
  side: 'mine' | 'theirs';
  /** Estimated fantasy points, or null where it cannot be estimated. */
  points: number | null;
}

type Scoring = Record<string, number>;

/** What one play was worth to one player, from their role in it. */
export function estimatePoints(
  type: string, role: string, yards: number, scoring: boolean, s: Scoring, text = '',
): number | null {
  const v = (k: string) => Number(s[k] ?? 0);
  const t = type.toLowerCase();

  // Kicking: field goals by distance, read from the play text ("41 yard field
  // goal"), and the extra point that rides along on a touchdown play.
  if (role === 'kicker') {
    if (t.includes('field goal')) {
      const d = Number(/(\d+)\s*yard field goal/i.exec(text)?.[1] ?? 0);
      const band = d >= 50 ? '50p' : d >= 40 ? '40_49' : d >= 30 ? '30_39' : d >= 20 ? '20_29' : '0_19';
      return t.includes('good') ? v(`fgm_${band}`) + v('fgm') : v('fgmiss') + v(`fgmiss_${band}`);
    }
    if (/extra point is good/i.test(text)) return v('xpm');
    if (/extra point is (no good|blocked)/i.test(text)) return v('xpmiss');
    return null;
  }
  if (t.includes('penalty') || t.includes('timeout') || t.includes('kickoff') || t.includes('punt')) return null;

  if (role === 'rusher' && (t.startsWith('rush') || t.includes('rushing'))) {
    return yards * v('rush_yd') + (scoring ? v('rush_td') : 0);
  }
  if (t.includes('pass reception') || t.includes('passing touchdown')) {
    if (role === 'receiver') return v('rec') + yards * v('rec_yd') + (scoring ? v('rec_td') : 0);
    if (role === 'passer') return yards * v('pass_yd') + (scoring ? v('pass_td') : 0);
  }
  if (t.includes('interception') && role === 'passer') return v('pass_int');
  if (t.includes('sack') && role === 'passer') return v('pass_sack');
  if (t.includes('pass incompletion') && role === 'passer') return 0;
  return null;
}

const ROLE_WEIGHT: Record<string, number> = { rusher: 1, receiver: 1, kicker: 1, passer: 2, fumbler: 3, scorer: 8, patScorer: 8 };

export async function playFeed(opts: {
  mine: string[];
  theirs: string[];
  scoring: Scoring;
  limit?: number;
}): Promise<FeedPlay[]> {
  const all = [...opts.mine, ...opts.theirs];
  if (!all.length) return [];
  const [games, xw] = await Promise.all([espnScoreboard(), crosswalkFor(all)]);
  const side = new Map<string, 'mine' | 'theirs'>();
  for (const id of opts.mine) side.set(id, 'mine');
  for (const id of opts.theirs) if (!side.has(id)) side.set(id, 'theirs');
  const espnIds = new Set(all.map(id => xw.toEspn.get(id)).filter((x): x is string => Boolean(x)));

  // Only games that have started; plays for an unplayed game are empty anyway.
  const started = games.filter(g => g.state !== 'pre');
  const perGame = await Promise.all(started.map(async g => ({ g, plays: await espnPlays(g.id, g.state === 'in') })));

  const out: FeedPlay[] = [];
  for (const { g, plays } of perGame) {
    for (const p of plays) {
      // A play wiped out by a penalty never happened for fantasy purposes.
      if (/penalty/i.test(p.type) || /\bno play\b/i.test(p.text)) continue;
      // One entry per player per play, using the role that scores: a rushing
      // touchdown lists the runner as rusher and scorer, and should count once.
      const seen = new Set<string>();
      const parts = [...p.participants].sort((a, b) => (ROLE_WEIGHT[a.role] ?? 9) - (ROLE_WEIGHT[b.role] ?? 9));
      for (const part of parts) {
        if (!espnIds.has(part.id)) continue;
        const sid = xw.toSleeper.get(part.id)!;
        if (seen.has(sid)) continue;
        seen.add(sid);
        const points = estimatePoints(p.type, part.role, p.yards ?? 0, p.scoring, opts.scoring, p.text);
        out.push({
          id: `${p.id}:${sid}`, gameId: g.id, matchup: `${g.away.abbr} @ ${g.home.abbr}`,
          at: p.at, period: p.period, clock: p.clock, text: p.text, type: p.type,
          scoring: p.scoring, playerId: sid, role: part.role, side: side.get(sid)!,
          points: points == null ? null : Math.round(points * 10) / 10,
        });
      }
    }
  }
  out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || b.id.localeCompare(a.id));
  return out.slice(0, opts.limit ?? 60);
}
