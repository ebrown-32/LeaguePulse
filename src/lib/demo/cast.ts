/**
 * The demo league's cast: ten made-up managers and their teams. Everyone here is invented, as is
 * every name, team and stadium; only the NFL players they roster are real (see league.ts).
 *
 * A manager's style is what makes their seasons theirs: how they draft, how sharp their lineups
 * are, how often they work the waiver wire or trade. The results come from the real games.
 */

export type Style =
  | 'balanced'   // takes the best player on the board
  | 'zeroRB'     // receivers early, running backs late
  | 'robustRB'   // running backs early and often
  | 'qbFirst'    // a quarterback in the first rounds
  | 'waiverHawk' // lives on the waiver wire
  | 'trader'     // can't stop making offers
  | 'analytics'  // the sharpest lineups in the league
  | 'couch';     // sets a lineup in August and leaves it

export interface CastMember {
  /** The manager's id is demo-u-<key>; the team logo is /demo/teams/<key>.svg. */
  key: string;
  manager: string;
  /** The display name, as on Sleeper. */
  handle: string;
  team: string;
  color: string;
  stadium: string;
  motto: string;
  bio: string;
  style: Style;
  /** 0 to 1: how well they read a week (their lineups, their draft board). */
  skill: number;
  /** The commissioner. */
  owner?: boolean;
}

export const LEAGUE_NAME = 'The Gridiron Gazette League';

export const CAST: CastMember[] = [
  {
    key: 'gus', manager: 'Gus Pardee', handle: 'CommishGus', team: "Commissioner's Revenge", color: '#b91c1c',
    stadium: 'The Bylaws Bowl', motto: 'I wrote the rules. I will rewrite them.',
    bio: 'Founded the league in a sports bar in 2017 and has chaired every rules vote since, including the ones about himself.',
    style: 'balanced', skill: 0.72, owner: true,
  },
  {
    key: 'marty', manager: 'Marty Krebs', handle: 'GoblinKing', team: 'Gridiron Goblins', color: '#16a34a',
    stadium: 'The Goblin Pit', motto: 'Running backs are a social construct.',
    bio: 'Zero RB evangelist. Will explain it to you at a wedding.',
    style: 'zeroRB', skill: 0.62,
  },
  {
    key: 'dee', manager: 'Dee Okafor', handle: 'WaiverWizard', team: 'Waiver Wire Wizards', color: '#7c3aed',
    stadium: 'Free Agency Field', motto: 'The draft is a suggestion.',
    bio: 'Has set an alarm for every waiver run since 2017. The alarm is named Kevin.',
    style: 'waiverHawk', skill: 0.7,
  },
  {
    key: 'rosa', manager: 'Rosa Delgado', handle: 'TacoTitan', team: 'Taco Tuesday Titans', color: '#ea580c',
    stadium: 'The Taco Bowl', motto: 'Every day is a running back day.',
    bio: 'Drafts four running backs before anyone else has taken two, and hosts the draft party every year to make sure of it.',
    style: 'robustRB', skill: 0.66,
  },
  {
    key: 'brent', manager: 'Brent Holloway', handle: 'BrentAFK', team: 'Couch Potato Cartel', color: '#a16207',
    stadium: 'Couch Cushion Coliseum', motto: 'Set it and forget it.',
    bio: 'Last logged in during the preseason. Somehow always in the playoff hunt.',
    style: 'couch', skill: 0.38,
  },
  {
    key: 'priya', manager: 'Priya Natarajan', handle: 'ByeWeekBandit', team: 'Bye Week Bandits', color: '#0284c7',
    stadium: 'Bandit Bluffs Field', motto: 'Trust the projections.',
    bio: 'Keeps a spreadsheet with forty tabs. Thirty-nine of them are about you.',
    style: 'analytics', skill: 0.9,
  },
  {
    key: 'hank', manager: 'Hank Brubaker', handle: 'FourthAndHank', team: 'Fourth & Forever', color: '#334155',
    stadium: 'Forever Field', motto: 'Quarterbacks win championships. Eventually.',
    bio: 'Takes a quarterback in round one every single year, and has the trophy case to show for it: one trophy.',
    style: 'qbFirst', skill: 0.58,
  },
  {
    key: 'jules', manager: 'Jules Fontaine', handle: 'JulesTradesAll', team: 'Punt Intended', color: '#db2777',
    stadium: 'Punt Palace', motto: 'Everyone is available. Including you.',
    bio: 'Sends trade offers at 2 a.m. with the message "hear me out".',
    style: 'trader', skill: 0.64,
  },
  {
    key: 'theo', manager: 'Theo Vance', handle: 'CtrlAltTheo', team: 'Ctrl Alt Defeat', color: '#0d9488',
    stadium: 'The Server Farm', motto: 'Have you tried turning your lineup off and on again?',
    bio: 'IT guy. Fixes everyone’s printer, cannot fix his flex spot.',
    style: 'balanced', skill: 0.55,
  },
  {
    key: 'bev', manager: 'Bev Okonkwo', handle: 'GrandmaBev', team: "Grandma's Two-Point Conversion", color: '#4f46e5',
    stadium: "Bev's Backyard Dome", motto: 'I have been doing this since before your app existed.',
    bio: 'Joined because her grandson needed a tenth team. Has beaten him eleven straight times.',
    style: 'analytics', skill: 0.8,
  },
];

export const castByKey = new Map(CAST.map(c => [c.key, c]));
