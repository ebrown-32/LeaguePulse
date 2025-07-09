export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string;
  metadata: {
    team_name?: string;
  };
  is_owner: boolean;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  league_id: string;
  starters: string[];
  players: string[];
  settings: {
    wins: number;
    waiver_position: number;
    waiver_budget_used: number;
    total_moves: number;
    ties: number;
    losses: number;
    fpts_decimal: number;
    fpts_against_decimal: number;
    fpts_against: number;
    fpts: number;
    playoff_seed?: number;
    rank?: number;
  };
}

export interface SleeperMatchup {
  matchup_id: number;
  roster_id: number;
  players: string[];
  starters: string[];
  points: number;
  custom_points?: number;
}

export interface SleeperLeague {
  total_rosters: number;
  status: "pre_draft" | "drafting" | "in_season" | "complete";
  sport: "nfl";
  settings: {
    playoff_week_start: number;
    playoff_type: number;
    playoff_teams: number;
    num_teams: number;
    max_keepers: number;
    draft_rounds: number;
    daily_waivers: number;
    bench_slots: number;
    trade_deadline: number;
    median_wins?: boolean; // Median games enabled
  };
  season: string;
  scoring_settings: Record<string, number>;
  roster_positions: string[];
  name: string;
  league_id: string;
  draft_id: string;
  avatar: string;
  previous_league_id?: string;
}

export interface SleeperNFLState {
  week: number;
  season_type: "pre" | "regular" | "post";
  season_start_date: string;
  season: string;
  previous_season: string;
  leg: number;
  league_season: string;
  league_create_season: string;
  display_week: number;
}

export interface SleeperPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string;
  team: string;
  status: string;
  injury_status: string | null;
  number: string;
  fantasy_positions: string[];
} 