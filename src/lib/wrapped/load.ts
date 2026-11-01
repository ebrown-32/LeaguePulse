/**
 * League Wrapped's data: one league's archive, a season of it or all of it (lib/archive), handed
 * to the engine (lib/wrapped/engine). Kept in memory for half an hour per league and scope: the
 * archive itself only changes once an hour.
 *
 * Server only. Null when the league has no archive (a self-hosted league without a database).
 */

import { ensureArchive, T } from '@/lib/archive/db';
import { boxScore, computeWrapped, type Game, type Standing, type WrapInput, type Wrapped } from './engine';
import { historyFacts, type BookGame, type Facts } from './facts';

const TTL_MS = 30 * 60_000;
const memo = new Map<string, { at: number; value: Promise<Wrapped | null> }>();

/** The seasons a league can be wrapped for, newest first, with whether each is over. */
export async function wrappableSeasons(site: string): Promise<{ season: number; final: boolean }[]> {
  const db = await ensureArchive().catch(() => null);
  if (!db) return [];
  const { rows } = await db.query(
    `SELECT s.season, s.final FROM ${T('seasons')} s WHERE s.site = $1
       AND EXISTS (SELECT 1 FROM ${T('matchups')} m WHERE m.site = s.site AND m.season_id = s.season_id AND m.points > 0)
     ORDER BY s.season DESC`,
    [site],
  );
  return rows.map(r => ({ season: Number(r.season), final: Boolean(r.final) }));
}

export function wrappedFor(site: string, season: number | null): Promise<Wrapped | null> {
  const key = `${site}:${season ?? 'all'}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = Promise.all([load(site, season), historyFacts(site, season).catch(err => {
    console.error('[wrapped] history facts unavailable', err instanceof Error ? err.message : err);
    return null;
  })]).then(([input, facts]) => (input ? withFacts(computeWrapped(input, season, standingOf(facts)), facts, input) : null))
    .catch(err => { memo.delete(key); throw err; });
  memo.set(key, { at: Date.now(), value });
  return value;
}

/** Titles and finishes as the History page has them, for the engine. */
function standingOf(f: Facts | null): Standing | undefined {
  if (!f) return undefined;
  const finishes: Standing['finishes'] = {};
  const runnerUps: Standing['runnerUps'] = [];
  for (const [owner, m] of Object.entries(f.managers)) {
    finishes[owner] = Object.fromEntries(m.finishes.map(x => [Number(x.season), x.finish]));
    for (const s of m.runnerUps) runnerUps.push({ season: Number(s), ownerId: owner });
  }
  return { champions: f.league.champions.map(c => ({ season: Number(c.season), ownerId: c.ownerId })), runnerUps, finishes };
}

/**
 * Each story gets what the rest of the site knows, and its rivalries are the Rivalries page's:
 * the nemesis is the opponent with the worst record against (two games at least), the favorite
 * victim the best.
 */
function withFacts(w: Wrapped, f: Facts | null, input: WrapInput): Wrapped {
  if (!f) return w;
  for (const m of w.managers) {
    const facts = f.managers[m.ownerId];
    if (!facts) continue;
    m.facts = facts;
    // Records as the profile and History page count them.
    m.record = facts.record;
    m.history = m.history.map(h => ({ ...h, ...(facts.seasonRecords[String(h.season)] ?? {}) }));
    const rivals = facts.rivals.filter(r => r.w + r.l >= 2);
    const nemesis = [...rivals].sort((a, b) => (b.l - b.w) - (a.l - a.w) || b.l - a.l)[0];
    const victim = [...rivals].sort((a, b) => (b.w - b.l) - (a.w - a.l) || b.w - a.w)[0];
    const nameOf = (id: string) => w.managers.find(x => x.ownerId === id)?.name ?? f.names[id] ?? 'A manager';
    m.nemesis = nemesis && nemesis.l > nemesis.w ? { id: nemesis.id, name: nameOf(nemesis.id), w: nemesis.w, l: nemesis.l } : null;
    m.victim = victim && victim.w > victim.l ? { id: victim.id, name: nameOf(victim.id), w: victim.w, l: victim.l } : null;
  }
  for (const c of w.league.champions) {
    const r = f.managers[c.ownerId]?.seasonRecords[String(c.season)];
    if (r) c.record = `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;
  }
  // The league's best, biggest and closest games are the Record Book's, with their box scores.
  const nameOf = (id: string) => w.managers.find(x => x.ownerId === id)?.name ?? f.names[id] ?? 'A manager';
  // A box score only when the archive has the game as the Record Book does.
  const agrees = (b: ReturnType<typeof boxScore>, g: BookGame) =>
    b && Math.abs(Math.max(b.winner.pts, b.loser.pts) - Math.max(g.pts, g.opp)) < 0.01 && Math.abs(Math.min(b.winner.pts, b.loser.pts) - Math.min(g.pts, g.opp)) < 0.01 ? b : null;
  const asGame = (g: BookGame | null | undefined, kept: (Game & { ownerId: string; name: string }) | null) => {
    if (!g) return kept;
    if (kept && kept.season === g.season && kept.week === g.week && kept.ownerId === g.ownerId) return { ...kept, stage: g.stage };
    return {
      season: g.season, week: g.week, pts: g.pts, opp: g.opp, oppId: g.oppId, oppName: nameOf(g.oppId),
      result: g.pts > g.opp ? 'W' as const : g.pts < g.opp ? 'L' as const : 'T' as const, margin: Math.round(Math.abs(g.pts - g.opp) * 100) / 100,
      ownerId: g.ownerId, name: nameOf(g.ownerId), stage: g.stage, box: agrees(boxScore(input, g.season, g.week, g.ownerId), g),
    };
  };
  const games = f.league.games;
  w.league.best = asGame(games?.best, w.league.best);
  w.league.blowout = asGame(games?.blowout, w.league.blowout);
  w.league.closest = asGame(games?.closest, w.league.closest);

  // Record Book names are the provider's display names; the story uses the same names it does everywhere else.
  w.league.facts = { ...f.league, records: f.league.records.map(r => ({ ...r, name: w.managers.find(x => x.ownerId === r.ownerId)?.name ?? r.name })) };
  return w;
}

/** One game's box score (engine boxScore), read from the archive: kept ten minutes per league and season. */
const inputs = new Map<string, { at: number; value: Promise<WrapInput | null> }>();
export async function boxScoreFor(site: string, season: number, week: number, owner: string) {
  const key = `${site}:${season}`;
  let hit = inputs.get(key);
  if (!hit || Date.now() - hit.at > 10 * 60_000) { hit = { at: Date.now(), value: load(site, season).catch(() => null) }; inputs.set(key, hit); }
  const input = await hit.value;
  const { boxScore } = await import('./engine');
  return input ? boxScore(input, season, week, owner) : null;
}

async function load(site: string, season: number | null): Promise<WrapInput | null> {
  const db = await ensureArchive().catch(() => null);
  if (!db) return null;
  const seasons = (await db.query(
    `SELECT season_id, season, settings, roster_positions, final FROM ${T('seasons')} WHERE site = $1 AND ($2::int IS NULL OR season = $2)`,
    [site, season],
  )).rows;
  if (!seasons.length) return null;
  const ids = seasons.map(s => s.season_id);
  const q = async (sql: string) => (await db.query(sql, [site, ids])).rows;
  const where = `WHERE site = $1 AND season_id = ANY($2)`;
  const [managers, teams, matchups, transactions, picks] = await Promise.all([
    db.query(`SELECT user_id, display_name FROM ${T('managers')} WHERE site = $1`, [site]).then(r => r.rows),
    q(`SELECT season_id, roster_id, owner_id, team_name, avatar, wins, losses, ties, points_for, final_rank FROM ${T('teams')} ${where}`),
    q(`SELECT season_id, week, roster_id, matchup_id, points, starters, players, players_points FROM ${T('matchups')} ${where}`),
    q(`SELECT season_id, week, type, status, roster_ids, adds, drops, faab_bid FROM ${T('transactions')} ${where}`),
    q(`SELECT season_id, round, pick_no, roster_id, player_id FROM ${T('draft_picks')} ${where}`),
  ]);
  const playerIds = new Set<string>();
  for (const m of matchups) for (const id of m.players ?? []) playerIds.add(id);
  for (const t of transactions) for (const id of [...Object.keys(t.adds ?? {}), ...Object.keys(t.drops ?? {})]) playerIds.add(id);
  for (const p of picks) if (p.player_id) playerIds.add(p.player_id);
  const players = (await db.query(`SELECT player_id, full_name, position, team FROM ${T('players')} WHERE player_id = ANY($1)`, [[...playerIds]])).rows;
  return { seasons, managers, teams, matchups, transactions, picks, players };
}
