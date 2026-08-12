import type { SleeperNFLState } from '@/types/sleeper';

/**
 * Where the season is, and what actually matters at that point.
 *
 * Without this the assistant gives the same generic advice in March as it does
 * in week 15. "Who should I start" is meaningless in the offseason, and
 * "should I stash a rookie" is meaningless during a playoff push, so the phase
 * is stated explicitly along with what a good answer focuses on.
 */

export type SeasonPhase =
  | 'offseason' | 'preseason' | 'early' | 'mid' | 'late' | 'playoffs' | 'complete';

export interface PhaseContext {
  phase: SeasonPhase;
  label: string;
  week: number;
  season: string;
  /** What analysis is relevant right now. */
  guidance: string;
}

const GUIDANCE: Record<SeasonPhase, string> = {
  offseason:
    'No games have been played. Do not discuss start/sit, waivers or matchups as if they matter ' +
    'yet. Relevant topics: roster construction, dynasty asset value, age curves, draft capital, ' +
    'offseason trades, and last season as the most recent evidence. Be explicit that any ranking ' +
    'now is projection, not results.',
  preseason:
    'Rosters are set but nothing counts yet. Relevant topics: draft grades, projected starters, ' +
    'positional strengths and holes, sleepers, and depth risk. Avoid implying results exist.',
  early:
    'Weeks 1 to 4. Samples are tiny, so resist overreacting: usage and snap share matter more ' +
    'than fantasy points. Relevant topics: which early results look real versus noise, waiver ' +
    'priorities, and buy-low windows on slow starters.',
  mid:
    'Weeks 5 to 9. The sample is meaningful now. Relevant topics: genuine contenders versus ' +
    'pretenders, trade deadline planning, bye week coverage, and whether a team should buy or sell.',
  late:
    'Weeks 10 to 14, the playoff push. Relevant topics: playoff seeding scenarios, must-win ' +
    'matchups, schedule strength down the stretch, and whether a team is mathematically alive. ' +
    'Long-term dynasty value matters much less than winning now.',
  playoffs:
    'League playoffs. Only what wins this week matters: matchups, injuries, and start/sit calls. ' +
    'Do not discuss waiver stashes or future value unless asked.',
  complete:
    'The season is over. Relevant topics: final standings, the champion, season records, and what ' +
    'each team should do next offseason.',
};

const LABEL: Record<SeasonPhase, string> = {
  offseason: 'OFFSEASON', preseason: 'PRESEASON', early: 'EARLY SEASON',
  mid: 'MIDSEASON', late: 'LATE SEASON (playoff push)', playoffs: 'LEAGUE PLAYOFFS',
  complete: 'SEASON COMPLETE',
};

export function resolvePhase(
  nflState: SleeperNFLState | null | undefined,
  league: any,
): PhaseContext {
  const season = String(nflState?.season ?? league?.season ?? new Date().getFullYear());
  const week = Number(nflState?.week ?? 0);
  const seasonType = nflState?.season_type ?? '';
  const status = league?.status ?? '';
  const playoffStart = Number(league?.settings?.playoff_week_start ?? 15);

  let phase: SeasonPhase;
  if (status === 'complete') phase = 'complete';
  // Sleeper reports season_type as pre/regular/post only, so the offseason is
  // identified by league status rather than by a season type.
  else if (status === 'pre_draft' || status === 'drafting') phase = 'offseason';
  else if (seasonType === 'pre' || week < 1) phase = 'preseason';
  else if (week >= playoffStart) phase = 'playoffs';
  else if (week <= 4) phase = 'early';
  else if (week <= 9) phase = 'mid';
  else phase = 'late';

  return { phase, label: LABEL[phase], week, season, guidance: GUIDANCE[phase] };
}
