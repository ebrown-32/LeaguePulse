/**
 * Recent league events an admin can commission a piece about.
 *
 * Built entirely from `buildLeagueBrief()` rather than from Sleeper directly.
 * That is the point: the brief is what every writer is handed as context, so
 * an event offered here is guaranteed to be something the model can actually
 * see and write about. Deriving the list from a second, independent read would
 * let an admin commission coverage of a trade the writer has no record of, and
 * the model would either refuse or invent the details.
 *
 * The brief is cached, so listing events costs nothing beyond the first call.
 */
import { buildLeagueBrief } from './leagueBrief';

export type LeagueEventType = 'trade' | 'waiver' | 'free_agent' | 'result';

export interface LeagueEvent {
  /** Deterministic, so the id the panel lists still resolves when the publish
   *  request arrives. Derived from the content, never from an array index:
   *  a new trade landing between the two calls would shift every index. */
  id: string;
  type: LeagueEventType;
  /** One line for the picker. */
  label: string;
  /** The full description handed to the writer as the thing to cover. */
  detail: string;
  /** The team the piece should be about, where there is a single obvious one.
   *  Trades involve several, so they deliberately have none. */
  subject?: string;
  week: number;
}

/** djb2. Only needs to be stable and short, not cryptographic. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** "week 4", or "the offseason" for the moves Sleeper reports with no leg. */
function whenLabel(week: number): string {
  return week > 0 ? `week ${week}` : 'the offseason';
}

/** Trim a long transaction summary down to something that fits a dropdown. */
function short(s: string, max = 72): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The teams in a trade summary.
 *
 * `buildLeagueBrief` renders each leg as "<team> gets ... and gives up ...",
 * joined by " | ", so the team is everything before the first " gets ".
 */
function tradeTeams(summary: string): string[] {
  return summary
    .split(' | ')
    .map(leg => leg.split(' gets ')[0]?.trim())
    .filter((t): t is string => Boolean(t));
}

export async function buildLeagueEvents(): Promise<LeagueEvent[]> {
  const brief = await buildLeagueBrief();
  const events: LeagueEvent[] = [];

  for (const move of brief.recentMoves) {
    const id = `mv-${hash(`${move.type}:${move.week}:${move.summary}`)}`;
    if (move.type === 'trade') {
      const teams = tradeTeams(move.summary);
      events.push({
        id,
        type: 'trade',
        // Named by who was involved. A trade has no single subject, so the
        // label has to carry both sides or the admin cannot tell two apart.
        // Multi-team deals are counted rather than listed: this league has run
        // a five team trade, and spelling that one out ran past the width of
        // the dropdown and buried the teams that followed it.
        label: teams.length
          ? `Trade, ${teams.length > 2
              ? `${teams[0]} and ${teams.length - 1} others`
              : teams.join(' and ')}`
          : `Trade in ${whenLabel(move.week)}`,
        detail: `A trade in ${whenLabel(move.week)} of the ${move.season} season: ${move.summary}`,
        week: move.week,
      });
    } else {
      const team = move.summary.split(' added ')[0].split(' dropped ')[0].trim();
      events.push({
        id,
        type: move.type,
        label: `${move.type === 'waiver' ? 'Waiver' : 'Signing'}, ${short(move.summary)}`,
        detail: `A ${move.type === 'waiver' ? 'waiver claim' : 'free agent signing'} in `
          + `${whenLabel(move.week)} of the ${move.season} season: ${move.summary}`,
        subject: team || undefined,
        week: move.week,
      });
    }
  }

  for (const m of brief.recentMatchups) {
    const homeWon = m.home.points >= m.away.points;
    const winner = homeWon ? m.home : m.away;
    const loser = homeWon ? m.away : m.home;
    events.push({
      id: `gm-${hash(`${m.week}:${m.home.teamName}:${m.away.teamName}:${m.home.points}`)}`,
      type: 'result',
      label: `Week ${m.week}, ${winner.teamName} beat ${loser.teamName} ${winner.points} to ${loser.points}`,
      detail: `The week ${m.week} result: ${winner.teamName} beat ${loser.teamName} `
        + `${winner.points} to ${loser.points}, a margin of ${m.margin} points.`,
      subject: winner.teamName,
      week: m.week,
    });
  }

  // Trades first, then the rest of the moves, then results: a trade is the
  // most worth commissioning a piece about, a routine waiver claim the least.
  const rank: Record<LeagueEventType, number> = {
    trade: 0, result: 1, waiver: 2, free_agent: 3,
  };
  return events
    .sort((a, b) => rank[a.type] - rank[b.type] || b.week - a.week)
    .slice(0, 40);
}

export async function findLeagueEvent(id: string): Promise<LeagueEvent | null> {
  return (await buildLeagueEvents()).find(e => e.id === id) ?? null;
}
