/**
 * A league's history, answered from the archive with a few SQL queries
 * instead of re-reading every season from Sleeper or ESPN. What the AI's
 * league brief and history features read.
 *
 * Every number follows the site's own rules, so the two never disagree:
 *   champions        the winner of the bracket's final (teams.final_rank 1),
 *                    as the History page decides it
 *   all-time high    the best score in any game, postseason included
 *   records          from each season's standings (wins include median
 *                    results in median leagues), as the standings page shows them
 *
 * Server only. Null when the archive is not set up or holds nothing for the league.
 */

import { ensureArchive, T } from './db';

export interface ArchiveHistory {
  seasons: number;
  /** Newest first. */
  champions: { season: number; manager: string; team: string | null }[];
  allTimeHigh: { points: number; manager: string; season: number; week: number } | null;
  /** By manager, best record first. */
  managers: { manager: string; seasons: number; wins: number; losses: number; ties: number; titles: number; finals: number }[];
}

export async function archiveHistory(site: string): Promise<ArchiveHistory | null> {
  const db = await ensureArchive().catch(() => null);
  if (!db) return null;
  const [seasons, champions, high, managers] = await Promise.all([
    db.query(`SELECT count(*)::int AS n FROM ${T('seasons')} WHERE site = $1`, [site]),
    db.query(`
      SELECT s.season, coalesce(mg.display_name, t.owner_id) AS manager, t.team_name AS team
      FROM ${T('teams')} t JOIN ${T('seasons')} s USING (site, season_id)
      LEFT JOIN ${T('managers')} mg ON mg.site = t.site AND mg.user_id = t.owner_id
      WHERE t.site = $1 AND t.final_rank = 1 ORDER BY s.season DESC`, [site]),
    // Only scores from real games (two teams sharing the matchup), as the site counts them.
    db.query(`
      SELECT m.points::float AS points, coalesce(mg.display_name, t.owner_id) AS manager, s.season, m.week
      FROM ${T('matchups')} m JOIN ${T('seasons')} s USING (site, season_id)
      JOIN ${T('teams')} t ON t.site = m.site AND t.season_id = m.season_id AND t.roster_id = m.roster_id
      LEFT JOIN ${T('managers')} mg ON mg.site = t.site AND mg.user_id = t.owner_id
      WHERE m.site = $1 AND m.matchup_id IS NOT NULL
        AND (SELECT count(*) FROM ${T('matchups')} o WHERE o.site = m.site AND o.season_id = m.season_id AND o.week = m.week AND o.matchup_id = m.matchup_id) = 2
      ORDER BY m.points DESC LIMIT 1`, [site]),
    db.query(`
      SELECT max(coalesce(mg.display_name, t.owner_id)) AS manager, count(*)::int AS seasons,
        sum(coalesce(t.wins, 0))::int AS wins, sum(coalesce(t.losses, 0))::int AS losses, sum(coalesce(t.ties, 0))::int AS ties,
        count(*) FILTER (WHERE t.final_rank = 1)::int AS titles, count(*) FILTER (WHERE t.final_rank <= 2)::int AS finals
      FROM ${T('teams')} t LEFT JOIN ${T('managers')} mg ON mg.site = t.site AND mg.user_id = t.owner_id
      WHERE t.site = $1 AND t.owner_id IS NOT NULL
      GROUP BY t.owner_id ORDER BY sum(coalesce(t.wins, 0))::float / nullif(sum(coalesce(t.wins, 0) + coalesce(t.losses, 0) + coalesce(t.ties, 0)), 0) DESC NULLS LAST`, [site]),
  ]);
  if (!seasons.rows[0]?.n) return null;
  const h = high.rows[0];
  return {
    seasons: seasons.rows[0].n,
    champions: champions.rows.map(r => ({ season: r.season, manager: r.manager, team: r.team })),
    allTimeHigh: h ? { points: Math.round(h.points * 10) / 10, manager: h.manager, season: h.season, week: h.week } : null,
    managers: managers.rows,
  };
}
