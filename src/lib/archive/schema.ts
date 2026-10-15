/**
 * The archive's tables: one shape for every provider (Sleeper, ESPN, and
 * seasons entered by hand), keyed by the league site (`site`: the hosted
 * league's address, or `self` for a self-hosted install) so leagues never mix.
 *
 *   seasons        one row per season of a league, with its settings
 *   managers       the people, by the provider's user id
 *   teams          a manager's team in one season: name, record, points
 *   matchups       every team's week: score, lineup and each player's points
 *   transactions   trades, waivers and free agents, including ones entered by hand
 *   drafts / draft_picks
 *   players        names for the player ids the rest refers to (shared by every league)
 *   archive_runs   when each league was last archived, and what it held
 *
 * seasons.settled_week (migration 2): the weeks up to it are final.
 * teams.final_rank (migration 3): 1 for the champion, from the playoff bracket.
 *
 * Migrations only ever add: each entry runs once, in order, and is never
 * edited after it ships. `t` qualifies a table name with the schema.
 */

type Q = (table: string) => string;

export const MIGRATIONS: ((t: Q) => string)[] = [
  t => `
    CREATE TABLE ${t('seasons')} (
      site text NOT NULL,
      season_id text NOT NULL,
      provider text NOT NULL,
      season int NOT NULL,
      name text,
      status text,
      total_rosters int,
      previous_season_id text,
      settings jsonb,
      scoring jsonb,
      roster_positions jsonb,
      coverage jsonb,
      final boolean NOT NULL DEFAULT false,
      archived_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (site, season_id)
    );
    CREATE TABLE ${t('managers')} (
      site text NOT NULL,
      user_id text NOT NULL,
      display_name text,
      avatar text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (site, user_id)
    );
    CREATE TABLE ${t('teams')} (
      site text NOT NULL,
      season_id text NOT NULL,
      roster_id int NOT NULL,
      owner_id text,
      co_owner_ids jsonb,
      team_name text,
      avatar text,
      wins int, losses int, ties int,
      points_for numeric(10,2),
      points_against numeric(10,2),
      PRIMARY KEY (site, season_id, roster_id)
    );
    CREATE TABLE ${t('matchups')} (
      site text NOT NULL,
      season_id text NOT NULL,
      week int NOT NULL,
      roster_id int NOT NULL,
      matchup_id int,
      points numeric(10,2),
      starters jsonb,
      starters_points jsonb,
      players jsonb,
      players_points jsonb,
      PRIMARY KEY (site, season_id, week, roster_id)
    );
    CREATE TABLE ${t('transactions')} (
      site text NOT NULL,
      season_id text NOT NULL,
      transaction_id text NOT NULL,
      week int,
      type text,
      status text,
      created_at timestamptz,
      roster_ids jsonb,
      adds jsonb,
      drops jsonb,
      draft_picks jsonb,
      waiver_budget jsonb,
      faab_bid int,
      source text NOT NULL DEFAULT 'provider',
      PRIMARY KEY (site, season_id, transaction_id)
    );
    CREATE INDEX ON ${t('transactions')} (site, type);
    CREATE TABLE ${t('drafts')} (
      site text NOT NULL,
      draft_id text NOT NULL,
      season_id text NOT NULL,
      type text,
      status text,
      start_time timestamptz,
      rounds int,
      PRIMARY KEY (site, draft_id)
    );
    CREATE TABLE ${t('draft_picks')} (
      site text NOT NULL,
      draft_id text NOT NULL,
      pick_no int NOT NULL,
      season_id text NOT NULL,
      round int,
      draft_slot int,
      roster_id int,
      picked_by text,
      player_id text,
      player_name text,
      position text,
      nfl_team text,
      is_keeper boolean,
      amount int,
      PRIMARY KEY (site, draft_id, pick_no)
    );
    CREATE TABLE ${t('players')} (
      player_id text PRIMARY KEY,
      full_name text,
      position text,
      team text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE ${t('archive_runs')} (
      id bigserial PRIMARY KEY,
      site text NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      summary jsonb,
      error text
    );
    CREATE INDEX ON ${t('archive_runs')} (site, started_at DESC);
  `,
  // The last week of a season that can no longer change (stat corrections
  // are in), so later runs read only the weeks after it.
  t => `ALTER TABLE ${t('seasons')} ADD COLUMN settled_week int NOT NULL DEFAULT 0;`,
  // Where each team finished, from the playoff bracket's placement games:
  // 1 is the champion. Null until the season is over.
  t => `ALTER TABLE ${t('teams')} ADD COLUMN final_rank int;`,
];
