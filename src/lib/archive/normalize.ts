/**
 * One season of a league, as the app reads it (Sleeper's shapes, which the
 * ESPN adapter and hand-entered seasons also speak), turned into archive rows.
 *
 * Pure: no network, no database. The column order of each row matches COLUMNS.
 */

export interface SeasonData {
  league: any;
  users: any[];
  rosters: any[];
  /** Week number to that week's matchups. Only weeks that have been played. */
  weeks: Record<number, any[]>;
  transactions: any[];
  drafts: any[];
  /** Draft id to its picks. */
  picks: Record<string, any[]>;
  /** The playoff bracket, once the season is over (Sleeper's shape; the ESPN adapter and hand-entered seasons serve it too). */
  winnersBracket?: any[];
}

export const COLUMNS = {
  seasons: ['site', 'season_id', 'provider', 'season', 'name', 'status', 'total_rosters', 'previous_season_id', 'settings', 'scoring', 'roster_positions', 'coverage', 'final', 'archived_at'],
  managers: ['site', 'user_id', 'display_name', 'avatar', 'updated_at'],
  teams: ['site', 'season_id', 'roster_id', 'owner_id', 'co_owner_ids', 'team_name', 'avatar', 'wins', 'losses', 'ties', 'points_for', 'points_against', 'final_rank'],
  matchups: ['site', 'season_id', 'week', 'roster_id', 'matchup_id', 'points', 'starters', 'starters_points', 'players', 'players_points'],
  transactions: ['site', 'season_id', 'transaction_id', 'week', 'type', 'status', 'created_at', 'roster_ids', 'adds', 'drops', 'draft_picks', 'waiver_budget', 'faab_bid', 'source'],
  drafts: ['site', 'draft_id', 'season_id', 'type', 'status', 'start_time', 'rounds'],
  draft_picks: ['site', 'draft_id', 'pick_no', 'season_id', 'round', 'draft_slot', 'roster_id', 'picked_by', 'player_id', 'player_name', 'position', 'nfl_team', 'is_keeper', 'amount'],
} as const;

export type Rows = { [K in keyof typeof COLUMNS]: unknown[][] };

export function providerOf(seasonId: string): 'espn' | 'manual' | 'sleeper' {
  if (seasonId.startsWith('espn-')) return 'espn';
  if (seasonId.startsWith('manual-')) return 'manual';
  return 'sleeper';
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
/** Sleeper splits season points into a whole part and hundredths. */
const points = (whole: unknown, hundredths: unknown) => Math.round(((num(whole) ?? 0) + (num(hundredths) ?? 0) / 100) * 100) / 100;
const when = (ms: unknown) => (num(ms) ? new Date(Number(ms)) : null);
/** A Sleeper avatar is a bare id; anything with a slash is already an address (ESPN logos, our own logo proxy). */
const avatarUrl = (a: unknown) => {
  const s = text(a);
  return s && /^[A-Za-z0-9]+$/.test(s) ? `https://sleepercdn.com/avatars/${s}` : s;
};

/**
 * Final places from a bracket's placement games: the game for place `p` is
 * won by place p and lost by place p + 1 (p 1 is the final). The same rule the
 * site uses for its champion: the winner of the game marked p 1.
 */
export function finalRanks(bracket: any[] | undefined): Map<number, number> {
  const ranks = new Map<number, number>();
  for (const g of bracket ?? []) {
    const p = Number(g?.p);
    if (!p || g?.w == null || g?.l == null) continue;
    ranks.set(Number(g.w), p);
    ranks.set(Number(g.l), p + 1);
  }
  return ranks;
}

export function seasonRows(site: string, seasonId: string, d: SeasonData, now = new Date()): Rows {
  const L = d.league ?? {};
  const userById = new Map((d.users ?? []).map(u => [String(u.user_id), u]));

  const seasons = [[
    site, seasonId, providerOf(seasonId), num(L.season) ?? 0, text(L.name), text(L.status), num(L.total_rosters),
    text(L.previous_league_id), L.settings ?? null, L.scoring_settings ?? null, L.roster_positions ?? null,
    L.metadata?.coverage ?? null, L.status === 'complete', now,
  ]];

  const managers = (d.users ?? []).filter(u => u?.user_id).map(u => [
    site, String(u.user_id), text(u.display_name), avatarUrl(u.metadata?.avatar || u.avatar), now,
  ]);

  const ranks = finalRanks(d.winnersBracket);
  const teams = (d.rosters ?? []).filter(r => r?.roster_id != null).map(r => {
    const s = r.settings ?? {};
    const owner = r.owner_id ? userById.get(String(r.owner_id)) : undefined;
    return [
      site, seasonId, Number(r.roster_id), text(r.owner_id), r.co_owners ?? null,
      text(r.metadata?.team_name) ?? text(owner?.metadata?.team_name) ?? text(owner?.display_name),
      avatarUrl(r.metadata?.logo || owner?.metadata?.avatar || owner?.avatar),
      num(s.wins), num(s.losses), num(s.ties), points(s.fpts, s.fpts_decimal), points(s.fpts_against, s.fpts_against_decimal),
      ranks.get(Number(r.roster_id)) ?? null,
    ];
  });

  const matchups: unknown[][] = [];
  for (const [week, list] of Object.entries(d.weeks ?? {})) {
    for (const m of list ?? []) {
      if (m?.roster_id == null) continue;
      matchups.push([
        site, seasonId, Number(week), Number(m.roster_id), num(m.matchup_id), num(m.points) ?? num(m.custom_points) ?? 0,
        m.starters ?? null, m.starters_points ?? null, m.players ?? null, m.players_points ?? null,
      ]);
    }
  }

  // The same transaction can come back from more than one week's list.
  const seen = new Set<string>();
  const transactions = (d.transactions ?? []).filter(x => {
    const id = text(x?.transaction_id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(x => [
    site, seasonId, String(x.transaction_id), num(x.leg) ?? num(x.week), text(x.type), text(x.status), when(x.created ?? x.status_updated),
    x.roster_ids ?? null, x.adds ?? null, x.drops ?? null, x.draft_picks?.length ? x.draft_picks : null,
    x.waiver_budget?.length ? x.waiver_budget : null, num(x.settings?.waiver_bid),
    String(x.transaction_id).startsWith('manual') ? 'manual' : 'provider',
  ]);

  const drafts = (d.drafts ?? []).filter(x => x?.draft_id).map(x => [
    site, String(x.draft_id), seasonId, text(x.type), text(x.status), when(x.start_time), num(x.settings?.rounds),
  ]);

  const draft_picks: unknown[][] = [];
  for (const [draftId, list] of Object.entries(d.picks ?? {})) {
    for (const p of list ?? []) {
      if (p?.pick_no == null) continue;
      const m = p.metadata ?? {};
      const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
      draft_picks.push([
        site, draftId, Number(p.pick_no), seasonId, num(p.round), num(p.draft_slot), num(p.roster_id), text(p.picked_by),
        text(p.player_id), name || null, text(m.position), text(m.team), Boolean(p.is_keeper), num(m.amount),
      ]);
    }
  }

  return { seasons, managers, teams, matchups, transactions, drafts, draft_picks };
}

/** Every player id a season's rows mention, for the players table. */
export function playerIds(rows: Rows): Set<string> {
  const ids = new Set<string>();
  const add = (v: unknown) => { if (v && typeof v === 'string' && v !== '0') ids.add(v); };
  const ix = (table: keyof typeof COLUMNS, col: string) => (COLUMNS[table] as readonly string[]).indexOf(col);
  for (const r of rows.matchups) {
    for (const col of ['starters', 'players']) for (const id of (r[ix('matchups', col)] as string[] | null) ?? []) add(id);
  }
  for (const r of rows.transactions) {
    for (const col of ['adds', 'drops']) for (const id of Object.keys((r[ix('transactions', col)] as object | null) ?? {})) add(id);
  }
  for (const r of rows.draft_picks) add(r[ix('draft_picks', 'player_id')]);
  return ids;
}
