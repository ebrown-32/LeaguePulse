/**
 * The archive as tables a person can read: names rather than ids, each
 * game with its opponent, each transaction spelled out. What the downloads
 * (CSV, Excel, JSON) are made of.
 *
 * Pure: takes rows as they come out of the database (see export.ts).
 */

export type Cell = string | number | null;
export interface Table { name: string; title: string; columns: string[]; rows: Cell[][] }

export const DATASETS = [
  { id: 'standings', title: 'Standings', blurb: 'Every team’s record and points, season by season' },
  { id: 'games', title: 'Games', blurb: 'Every game once, both teams and the winner' },
  { id: 'lineups', title: 'Lineups', blurb: 'Every player on every roster, every week, with points' },
  { id: 'transactions', title: 'Transactions', blurb: 'Trades, waiver claims and free agent moves' },
  { id: 'draft', title: 'Draft', blurb: 'Every pick of every draft' },
] as const;
export type DatasetId = (typeof DATASETS)[number]['id'];

export interface ArchiveRows {
  seasons: { season_id: string; season: number; name: string | null; settings: any }[];
  managers: { user_id: string; display_name: string | null }[];
  teams: { season_id: string; roster_id: number; owner_id: string | null; team_name: string | null; wins: number | null; losses: number | null; ties: number | null; points_for: string | number | null; points_against: string | number | null }[];
  matchups: { season_id: string; week: number; roster_id: number; matchup_id: number | null; points: string | number | null; starters: string[] | null; players: string[] | null; players_points: Record<string, number> | null }[];
  transactions: { season_id: string; week: number | null; type: string | null; status: string | null; created_at: Date | string | null; roster_ids: number[] | null; adds: Record<string, number> | null; drops: Record<string, number> | null; draft_picks: any[] | null; faab_bid: number | null; source: string }[];
  draft_picks: { season_id: string; round: number | null; pick_no: number; roster_id: number | null; picked_by: string | null; player_id: string | null; player_name: string | null; position: string | null; nfl_team: string | null; is_keeper: boolean | null; amount: number | null }[];
  players: { player_id: string; full_name: string | null; position: string | null; team: string | null }[];
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
/** Points to two decimals: sums of fractional scores carry floating point noise. */
const pts = (v: unknown): number | null => { const x = n(v); return x === null ? null : Math.round(x * 100) / 100; };
const TYPE: Record<string, string> = { trade: 'Trade', waiver: 'Waiver', free_agent: 'Free agent', commissioner: 'Commissioner' };
const STATUS: Record<string, string> = { complete: 'Completed', failed: 'Failed', pending: 'Pending' };
const date = (v: Date | string | null) => (v ? new Date(v).toISOString().slice(0, 10) : null);

export function buildTables(a: ArchiveRows, only?: DatasetId[]): Table[] {
  const want = (id: DatasetId) => !only || only.includes(id);
  const seasonOf = new Map(a.seasons.map(s => [s.season_id, s.season]));
  const playoffStart = new Map(a.seasons.map(s => [s.season_id, Number(s.settings?.playoff_week_start) || 0]));
  const managerName = new Map(a.managers.map(m => [m.user_id, m.display_name ?? '']));
  const teamKey = (season: string, roster: number | null) => `${season}|${roster}`;
  const team = new Map(a.teams.map(t => [teamKey(t.season_id, t.roster_id), t]));
  const teamName = (season: string, roster: number | null) => {
    const t = team.get(teamKey(season, roster));
    return t?.team_name || (t?.owner_id ? managerName.get(t.owner_id) : '') || (roster != null ? `Team ${roster}` : '');
  };
  const managerOf = (season: string, roster: number | null) => {
    const owner = team.get(teamKey(season, roster))?.owner_id;
    return owner ? managerName.get(owner) ?? '' : '';
  };
  const player = new Map(a.players.map(p => [p.player_id, p]));
  const playerName = (id: string) => player.get(id)?.full_name || id;
  const bySeasonDesc = (x: { season_id: string }, y: { season_id: string }) => (seasonOf.get(y.season_id) ?? 0) - (seasonOf.get(x.season_id) ?? 0);
  const tables: Table[] = [];

  if (want('standings')) {
    const rows = [...a.teams]
      .sort((x, y) => bySeasonDesc(x, y) || (n(y.wins) ?? 0) - (n(x.wins) ?? 0) || (n(y.points_for) ?? 0) - (n(x.points_for) ?? 0))
      .map(t => [seasonOf.get(t.season_id) ?? null, teamName(t.season_id, t.roster_id), managerOf(t.season_id, t.roster_id),
        n(t.wins), n(t.losses), n(t.ties), pts(t.points_for), pts(t.points_against)]);
    tables.push({ name: 'standings', title: 'Standings', columns: ['Season', 'Team', 'Manager', 'Wins', 'Losses', 'Ties', 'Points for', 'Points against'], rows });
  }

  const sortedMatchups = [...a.matchups].sort((x, y) => bySeasonDesc(x, y) || x.week - y.week || (x.matchup_id ?? 99) - (y.matchup_id ?? 99) || x.roster_id - y.roster_id);

  if (want('games')) {
    // One row per game: the two teams that shared a matchup that week. A team
    // with no opponent (sitting out a playoff week) played no game.
    const game = new Map<string, typeof a.matchups>();
    for (const m of sortedMatchups) {
      if (m.matchup_id == null) continue;
      const k = `${m.season_id}|${m.week}|${m.matchup_id}`;
      game.set(k, [...(game.get(k) ?? []), m]);
    }
    const rows: Cell[][] = [];
    for (const pair of game.values()) {
      if (pair.length !== 2) continue;
      const [x, y] = pair;
      const sx = pts(x.points) ?? 0, sy = pts(y.points) ?? 0;
      const start = playoffStart.get(x.season_id) ?? 0;
      rows.push([seasonOf.get(x.season_id) ?? null, x.week, start && x.week >= start ? 'Postseason' : 'Regular season',
        teamName(x.season_id, x.roster_id), managerOf(x.season_id, x.roster_id), sx,
        teamName(y.season_id, y.roster_id), managerOf(y.season_id, y.roster_id), sy,
        sx === sy ? 'Tie' : teamName(x.season_id, sx > sy ? x.roster_id : y.roster_id)]);
    }
    tables.push({ name: 'games', title: 'Games', columns: ['Season', 'Week', 'Stage', 'Team', 'Manager', 'Points', 'Opponent', 'Opponent manager', 'Opponent points', 'Winner'], rows });
  }

  if (want('lineups')) {
    const rows: Cell[][] = [];
    for (const m of sortedMatchups) {
      const starters = new Set(m.starters ?? []);
      for (const id of m.players ?? []) {
        const p = player.get(id);
        rows.push([seasonOf.get(m.season_id) ?? null, m.week, teamName(m.season_id, m.roster_id), playerName(id),
          p?.position ?? null, p?.team ?? null, starters.has(id) ? 'Starter' : 'Bench', pts(m.players_points?.[id])]);
      }
    }
    tables.push({ name: 'lineups', title: 'Lineups', columns: ['Season', 'Week', 'Team', 'Player', 'Position', 'NFL team', 'Role', 'Points'], rows });
  }

  if (want('transactions')) {
    const rows = [...a.transactions]
      .sort((x, y) => bySeasonDesc(x, y) || (x.week ?? 0) - (y.week ?? 0) || String(x.created_at ?? '').localeCompare(String(y.created_at ?? '')))
      .map(t => {
        const moves = (m: Record<string, number> | null, word: string) =>
          Object.entries(m ?? {}).map(([id, roster]) => `${playerName(id)} ${word} ${teamName(t.season_id, roster)}`).join('; ') || null;
        const picks = (t.draft_picks ?? []).map((p: any) =>
          `${p.season} round ${p.round} pick to ${teamName(t.season_id, p.owner_id)}`).join('; ') || null;
        return [seasonOf.get(t.season_id) ?? null, t.week, date(t.created_at), TYPE[t.type ?? ''] ?? t.type, STATUS[t.status ?? ''] ?? t.status,
          (t.roster_ids ?? []).map(r => teamName(t.season_id, r)).join(' & ') || null,
          // In a trade every player who moved is in both lists; Dropped keeps only the ones released.
          moves(t.adds, 'to'), moves(t.type === 'trade' ? Object.fromEntries(Object.entries(t.drops ?? {}).filter(([id]) => !(id in (t.adds ?? {})))) : t.drops, 'from'), picks, t.faab_bid, t.source === 'manual' ? 'Yes' : 'No'];
      });
    tables.push({ name: 'transactions', title: 'Transactions', columns: ['Season', 'Week', 'Date', 'Type', 'Status', 'Teams', 'Added', 'Dropped', 'Draft picks', 'FAAB bid', 'Entered by hand'], rows });
  }

  if (want('draft')) {
    const rows = [...a.draft_picks]
      .sort((x, y) => bySeasonDesc(x, y) || x.pick_no - y.pick_no)
      .map(p => [seasonOf.get(p.season_id) ?? null, p.round, p.pick_no, teamName(p.season_id, p.roster_id),
        p.picked_by ? managerName.get(p.picked_by) ?? managerOf(p.season_id, p.roster_id) : managerOf(p.season_id, p.roster_id),
        p.player_name || (p.player_id ? playerName(p.player_id) : null), p.position, p.nfl_team, p.is_keeper ? 'Yes' : 'No', p.amount]);
    tables.push({ name: 'draft', title: 'Draft', columns: ['Season', 'Round', 'Pick', 'Team', 'Manager', 'Player', 'Position', 'NFL team', 'Keeper', 'Amount'], rows });
  }

  return tables;
}

/** RFC 4180 CSV, with a byte order mark so Excel reads names with accents correctly. */
export function toCsv(t: Table): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [t.columns, ...t.rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** A table as a list of objects keyed by column, for JSON. */
export function toRecords(t: Table): Record<string, Cell>[] {
  return t.rows.map(r => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])));
}
