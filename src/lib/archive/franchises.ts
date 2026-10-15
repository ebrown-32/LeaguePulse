/**
 * Franchises, from the archive: every manager who has played in the league,
 * across every season, and the parts of a franchise's story that need every
 * season at once (its drafts, its trade partners, its best and worst days).
 *
 * The same rules as the rest of the site: records are each season's
 * standings (median results included where the league plays them), a title
 * is the bracket's final (teams.final_rank 1), and a game is two teams that
 * shared a matchup.
 *
 * Server only. Null when the archive is not set up or holds nothing.
 */

import { ensureArchive, T } from './db';

export interface FranchiseSummary {
  franchiseId: string;
  manager: string;
  teamName: string | null;
  avatar: string | null;
  seasons: number;
  firstSeason: number;
  lastSeason: number;
  /** Whether they play in the league's newest season. */
  active: boolean;
  wins: number; losses: number; ties: number;
  pointsFor: number;
  titles: number;
  finals: number;
  titleSeasons: number[];
}

export async function listFranchises(site: string): Promise<FranchiseSummary[] | null> {
  const db = await ensureArchive().catch(() => null);
  if (!db) return null;
  const { rows } = await db.query(`
    WITH t AS (
      SELECT t.*, s.season FROM ${T('teams')} t JOIN ${T('seasons')} s USING (site, season_id)
      WHERE t.site = $1 AND t.owner_id IS NOT NULL
    ), newest AS (SELECT max(season) AS season FROM t)
    SELECT t.owner_id AS franchise_id,
      max(coalesce(m.display_name, t.owner_id)) AS manager,
      (array_agg(t.team_name ORDER BY t.season DESC))[1] AS team_name,
      (array_agg(t.avatar ORDER BY t.season DESC))[1] AS avatar,
      count(*)::int AS seasons, min(t.season)::int AS first_season, max(t.season)::int AS last_season,
      bool_or(t.season = (SELECT season FROM newest)) AS active,
      sum(coalesce(t.wins, 0))::int AS wins, sum(coalesce(t.losses, 0))::int AS losses, sum(coalesce(t.ties, 0))::int AS ties,
      round(sum(coalesce(t.points_for, 0))::numeric, 2)::float AS points_for,
      count(*) FILTER (WHERE t.final_rank = 1)::int AS titles,
      count(*) FILTER (WHERE t.final_rank <= 2)::int AS finals,
      coalesce(array_agg(t.season ORDER BY t.season DESC) FILTER (WHERE t.final_rank = 1), '{}') AS title_seasons
    FROM t LEFT JOIN ${T('managers')} m ON m.site = t.site AND m.user_id = t.owner_id
    GROUP BY t.owner_id`, [site]);
  if (!rows.length) return null;
  return rows.map(r => ({
    franchiseId: r.franchise_id, manager: r.manager, teamName: r.team_name, avatar: r.avatar,
    seasons: r.seasons, firstSeason: r.first_season, lastSeason: r.last_season, active: r.active,
    wins: r.wins, losses: r.losses, ties: r.ties, pointsFor: r.points_for,
    titles: r.titles, finals: r.finals, titleSeasons: r.title_seasons.map(Number),
  })).sort((a, b) => Number(b.active) - Number(a.active) || b.titles - a.titles || winPct(b) - winPct(a));
}

const winPct = (f: { wins: number; losses: number; ties: number }) => {
  const g = f.wins + f.losses + f.ties;
  return g ? (f.wins + f.ties / 2) / g : 0;
};

export interface FranchiseStory {
  /** Their first pick each season, newest first. */
  firstPicks: { season: number; round: number | null; pick: number; player: string | null; position: string | null }[];
  /** Who they trade with, most trades first. */
  tradePartners: { franchiseId: string; manager: string; trades: number }[];
  trades: number;
  bestGame: GameLine | null;
  worstGame: GameLine | null;
  biggestWin: GameLine | null;
}
interface GameLine { season: number; week: number; points: number; opponent: string; opponentPoints: number }

export async function franchiseStory(site: string, franchiseId: string): Promise<FranchiseStory | null> {
  const db = await ensureArchive().catch(() => null);
  if (!db) return null;
  const [picks, trades, games] = await Promise.all([
    db.query(`
      SELECT DISTINCT ON (s.season) s.season, p.round, p.pick_no, p.player_name, p.position
      FROM ${T('draft_picks')} p JOIN ${T('seasons')} s USING (site, season_id)
      LEFT JOIN ${T('teams')} t ON t.site = p.site AND t.season_id = p.season_id AND t.roster_id = p.roster_id
      WHERE p.site = $1 AND coalesce(p.picked_by, t.owner_id) = $2
      ORDER BY s.season DESC, p.pick_no`, [site, franchiseId]),
    // Each completed trade they were part of, with the other side's franchise.
    db.query(`
      SELECT o.owner_id AS partner, max(coalesce(m.display_name, o.owner_id)) AS manager, count(*)::int AS trades
      FROM ${T('transactions')} x
      JOIN ${T('teams')} me ON me.site = x.site AND me.season_id = x.season_id AND me.owner_id = $2
        AND x.roster_ids @> to_jsonb(me.roster_id)
      CROSS JOIN LATERAL jsonb_array_elements(x.roster_ids) r(id)
      JOIN ${T('teams')} o ON o.site = x.site AND o.season_id = x.season_id AND o.roster_id = (r.id)::int AND o.roster_id <> me.roster_id
      LEFT JOIN ${T('managers')} m ON m.site = o.site AND m.user_id = o.owner_id
      WHERE x.site = $1 AND x.type = 'trade' AND x.status = 'complete' AND o.owner_id IS NOT NULL
      GROUP BY o.owner_id ORDER BY trades DESC`, [site, franchiseId]),
    db.query(`
      SELECT s.season, a.week, a.points::float AS points, b.points::float AS opp_points,
        coalesce(ot.team_name, om.display_name, ot.owner_id) AS opponent
      FROM ${T('matchups')} a
      JOIN ${T('teams')} me ON me.site = a.site AND me.season_id = a.season_id AND me.roster_id = a.roster_id AND me.owner_id = $2
      JOIN ${T('matchups')} b ON b.site = a.site AND b.season_id = a.season_id AND b.week = a.week AND b.matchup_id = a.matchup_id AND b.roster_id <> a.roster_id
      JOIN ${T('seasons')} s ON s.site = a.site AND s.season_id = a.season_id
      LEFT JOIN ${T('teams')} ot ON ot.site = b.site AND ot.season_id = b.season_id AND ot.roster_id = b.roster_id
      LEFT JOIN ${T('managers')} om ON om.site = ot.site AND om.user_id = ot.owner_id
      WHERE a.site = $1 AND a.matchup_id IS NOT NULL`, [site, franchiseId]),
  ]);
  const lines: GameLine[] = games.rows.map(g => ({ season: g.season, week: g.week, points: round(g.points), opponent: g.opponent, opponentPoints: round(g.opp_points) }));
  const pick = (score: (g: GameLine) => number, keep: (g: GameLine) => boolean = () => true) =>
    lines.filter(keep).reduce<GameLine | null>((best, g) => (!best || score(g) > score(best) ? g : best), null);
  return {
    firstPicks: picks.rows.map(p => ({ season: p.season, round: p.round, pick: p.pick_no, player: p.player_name, position: p.position })),
    tradePartners: trades.rows.map(t => ({ franchiseId: t.partner, manager: t.manager, trades: t.trades })),
    trades: (await db.query(`
      SELECT count(*)::int AS n FROM ${T('transactions')} x
      JOIN ${T('teams')} me ON me.site = x.site AND me.season_id = x.season_id AND me.owner_id = $2 AND x.roster_ids @> to_jsonb(me.roster_id)
      WHERE x.site = $1 AND x.type = 'trade' AND x.status = 'complete'`, [site, franchiseId])).rows[0]?.n ?? 0,
    bestGame: pick(g => g.points),
    worstGame: pick(g => -g.points, g => g.points > 0),
    biggestWin: pick(g => g.points - g.opponentPoints, g => g.points > g.opponentPoints),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
