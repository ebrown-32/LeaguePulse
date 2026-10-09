/**
 * The analytics semantic layer: what can be asked about, in words.
 *
 * Five datasets, each one table with typed fields. Shared by the server that
 * builds the rows, the client that queries them, and the AI that writes
 * queries, so all three agree on what a field is called and what it means.
 * The descriptions are written for the model as much as for people: they are
 * what it reads to decide which field answers a question.
 *
 * Client-safe: no server imports.
 */

export type FieldType = 'string' | 'number' | 'boolean';
/** Dimensions group, measures aggregate. A number can be either. */
export type FieldRole = 'dimension' | 'measure';
export type Format = 'int' | 'points' | 'pct' | 'text' | 'money';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  role: FieldRole;
  format?: Format;
  description: string;
  /** For dimensions with a natural order (season, week), sort by value not count. */
  ordinal?: boolean;
}

export type DatasetId = 'matchups' | 'seasons' | 'players' | 'transactions' | 'drafts';

export interface Dataset {
  id: DatasetId;
  label: string;
  /** One line for the picker. */
  blurb: string;
  /** What one row is. */
  grain: string;
  fields: Field[];
}

const dim = (key: string, label: string, description: string, extra: Partial<Field> = {}): Field =>
  ({ key, label, type: 'string', role: 'dimension', format: 'text', description, ...extra });
const num = (key: string, label: string, description: string, format: Format = 'points', extra: Partial<Field> = {}): Field =>
  ({ key, label, type: 'number', role: 'measure', format, description, ...extra });
const flag = (key: string, label: string, description: string): Field =>
  ({ key, label, type: 'boolean', role: 'dimension', format: 'text', description });

const SEASON = dim('season', 'Season', 'NFL season year, e.g. 2025.', { ordinal: true });
const MANAGER = dim('manager', 'Manager', 'The manager (Sleeper display name). Stable across seasons; use this to compare people over time.');
const TEAM = dim('team', 'Team', "The manager's current team name.");

export const DATASETS: Dataset[] = [
  {
    id: 'matchups',
    label: 'Matchups',
    blurb: 'Every team, every week: scores, margins, results',
    grain: 'One row per team per week',
    fields: [
      SEASON,
      { ...dim('week', 'Week', 'Week number of the season.', { ordinal: true }), type: 'number' },
      dim('phase', 'Phase', '"Regular season", "Playoffs" (a game in the winners bracket) or "Consolation".'),
      MANAGER, TEAM,
      dim('opponent', 'Opponent', "The opposing manager's display name."),
      dim('result', 'Result', '"Win", "Loss" or "Tie" in the head to head game. In a two week playoff round the result is on the round\'s last week only, decided on the combined total; the first week is blank.'),
      flag('beat_median', 'Beat median', 'Whether the team outscored the league median that week (median games).'),
      flag('top_score', 'Top score of week', 'Whether this was the highest score in the league that week.'),
      num('points', 'Points', 'Points the team scored that week.'),
      num('opp_points', 'Points against', 'Points the opponent scored.'),
      num('margin', 'Margin', 'Points minus opponent points. Negative in a loss.'),
      num('win', 'Wins', '1 for a head to head win, 0 for a loss, blank where there is no result. Sum it to count wins; average it for win rate.', 'int'),
      num('bench_points', 'Bench points', 'Points left on the bench that week.'),
    ],
  },
  {
    id: 'seasons',
    label: 'Seasons',
    blurb: 'Final records, points and finishes by season',
    grain: 'One row per team per season',
    fields: [
      SEASON, MANAGER, TEAM,
      flag('made_playoffs', 'Made playoffs', 'Whether the team finished in a playoff spot.'),
      flag('champion', 'Champion', 'Whether the team won the title that season.'),
      num('wins', 'Wins', 'Wins, median games included.', 'int'),
      num('losses', 'Losses', 'Losses, median games included.', 'int'),
      num('win_pct', 'Win %', 'Wins divided by games played.', 'pct'),
      num('points_for', 'Points for', 'Total points scored in the season.'),
      num('points_against', 'Points against', 'Total points scored against the team.'),
      num('ppg', 'Points per game', 'Average points per week.'),
      { ...num('finish', 'Standings rank', 'Final regular season rank, 1 is best.', 'int'), role: 'dimension', ordinal: true },
      num('titles', 'Titles', '1 if champion that season, else 0. Sum for career titles.', 'int'),
    ],
  },
  {
    id: 'players',
    label: 'Player weeks',
    blurb: 'Every rostered player, every week, started or benched',
    grain: 'One row per player on a roster per week',
    fields: [
      SEASON,
      { ...dim('week', 'Week', 'Week number.', { ordinal: true }), type: 'number' },
      MANAGER, TEAM,
      dim('player', 'Player', 'NFL player name.'),
      dim('position', 'Position', 'QB, RB, WR, TE, K or DEF.'),
      dim('nfl_team', 'NFL team', 'The NFL team the player is on now.'),
      flag('started', 'Started', 'Whether the player was in the starting lineup that week.'),
      num('points', 'Points', 'Fantasy points the player scored that week.'),
      num('started_points', 'Points started', 'Points scored while in the starting lineup (0 if benched).'),
      num('bench_points', 'Points benched', 'Points scored while on the bench (0 if started).'),
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    blurb: 'Trades, waiver claims and free agent moves',
    grain: 'One row per team per completed transaction',
    fields: [
      SEASON,
      { ...dim('week', 'Week', 'Week the move was processed.', { ordinal: true }), type: 'number' },
      dim('month', 'Month', 'Calendar month, e.g. "2025-09".', { ordinal: true }),
      MANAGER, TEAM,
      dim('type', 'Type', '"Trade", "Waiver", "Free agent" or "Commissioner" (a move the commissioner made).'),
      dim('added', 'Players added', 'Names of players this team received, comma separated.'),
      dim('dropped', 'Players dropped', 'Names of players this team gave up or dropped.'),
      num('moves', 'Moves', '1 per transaction. Sum to count moves.', 'int'),
      num('adds', 'Adds', 'Number of players added.', 'int'),
      num('drops', 'Drops', 'Number of players dropped.', 'int'),
      num('faab', 'FAAB spent', 'Waiver budget bid, when the league uses FAAB.', 'money'),
      num('picks_moved', 'Draft picks moved', 'Draft picks included in a trade, for this team.', 'int'),
    ],
  },
  {
    id: 'drafts',
    label: 'Draft picks',
    blurb: 'Every pick, and what the player went on to score',
    grain: 'One row per draft pick',
    fields: [
      SEASON,
      { ...dim('round', 'Round', 'Draft round.', { ordinal: true }), type: 'number' },
      MANAGER, TEAM,
      dim('player', 'Player', 'Player selected.'),
      dim('position', 'Position', 'Player position.'),
      num('pick', 'Overall pick', 'Overall pick number.', 'int', { role: 'dimension', ordinal: true }),
      num('season_points', 'Season points', "Fantasy points the player scored that season for any team in this league's records (rostered weeks only)."),
      num('picks', 'Picks', '1 per pick. Sum to count picks.', 'int'),
    ],
  },
];

export const datasetById = (id: string) => DATASETS.find(d => d.id === id);
export const fieldOf = (ds: Dataset, key: string) => ds.fields.find(f => f.key === key);

// ── Queries ──────────────────────────────────────────────────────────────────

export type Agg = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'distinct';
export const AGGS: { id: Agg; label: string }[] = [
  { id: 'sum', label: 'Sum' }, { id: 'avg', label: 'Average' }, { id: 'count', label: 'Count' },
  { id: 'min', label: 'Min' }, { id: 'max', label: 'Max' }, { id: 'median', label: 'Median' },
  { id: 'distinct', label: 'Count distinct' },
];

export type FilterOp = 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'is' ;
export interface Filter { field: string; op: FilterOp; value: string | number | boolean | (string | number)[] }
export interface Measure { field: string; agg: Agg }

export type ChartType = 'auto' | 'bar' | 'hbar' | 'line' | 'area' | 'donut' | 'scatter' | 'kpi' | 'table';

export interface QuerySpec {
  dataset: DatasetId;
  /** Group by, in order. The second, when present, becomes the series. */
  dimensions: string[];
  measures: Measure[];
  filters: Filter[];
  sort?: { by: string; dir: 'asc' | 'desc' };
  limit?: number;
  chart: ChartType;
  title?: string;
}

export const emptySpec = (dataset: DatasetId = 'matchups'): QuerySpec =>
  ({ dataset, dimensions: [], measures: [], filters: [], chart: 'auto' });

/** "Sum of Points", the way a column is named in a result. */
export function measureLabel(ds: Dataset, m: Measure): string {
  const f = fieldOf(ds, m.field);
  const name = f?.label ?? m.field;
  if (m.agg === 'count') return m.field === '*' ? 'Rows' : `Count of ${name}`;
  if (m.agg === 'distinct') return `Distinct ${name}`;
  if (m.agg === 'sum' && (f?.format === 'int' || f?.format === 'points')) return name;
  return `${AGGS.find(a => a.id === m.agg)?.label} ${name.toLowerCase()}`;
}

export const measureKey = (m: Measure) => `${m.agg}(${m.field})`;
