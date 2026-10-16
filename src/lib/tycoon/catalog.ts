/**
 * Everything a franchise can build, and what each level does.
 *
 * A stadium is a set of tracks (the bowl itself, seating, concessions,
 * restrooms, parking, the video board, suites, the team store, the
 * atmosphere), each with levels bought in order with VC. A level costs VC
 * once and upkeep every week after, and changes the numbers the economy
 * (economy.ts) runs on: capacity, appeal, comfort, what fans spend.
 *
 * Pure and shared: the server prices purchases with it, the page draws the
 * stadium and the shop from it.
 */

export type TrackId = 'stadium' | 'seating' | 'concessions' | 'restrooms' | 'parking' | 'videoboard' | 'suites' | 'store' | 'atmosphere';

export interface Level {
  name: string;
  /** VC to build. */
  cost: number;
  /** Dollars a week to keep running. */
  upkeep: number;
  blurb: string;
}

export interface Track {
  id: TrackId;
  name: string;
  /** What the track is for, in a line. */
  about: string;
  /** Levels after the starting one (level 0 is what every franchise has). */
  levels: Level[];
  /** A level of the stadium track this needs, for the track's first level. */
  needsStadium?: number;
}

/**
 * The bowl. Each level is a bigger stadium: capacity and appeal come mostly
 * from here. How it looks is the manager's pick (lib/franchise/stadiumStyles).
 */
export const STADIUMS = [
  { name: 'Sandlot', capacity: 9_000, appeal: 10 },
  { name: 'Proving Ground', capacity: 24_000, appeal: 26 },
  { name: 'Fortress', capacity: 46_000, appeal: 46 },
  { name: 'Cathedral', capacity: 64_000, appeal: 66 },
  { name: 'Monolith', capacity: 82_000, appeal: 88 },
] as const;

export const TRACKS: Track[] = [
  {
    id: 'stadium', name: 'Stadium', about: 'A bigger, better bowl. The biggest lever on capacity and appeal.',
    levels: [
      { name: 'Proving Ground', cost: 900, upkeep: 60_000, blurb: '24,000 seats and a real press box. You have arrived.' },
      { name: 'Fortress', cost: 4_200, upkeep: 180_000, blurb: '46,000 seats. Visitors hate it here.' },
      { name: 'Cathedral', cost: 12_500, upkeep: 420_000, blurb: '64,000 seats and a roar you feel in your chest.' },
      { name: 'Monolith', cost: 30_000, upkeep: 900_000, blurb: '82,000 seats. People plan trips around it.' },
    ],
  },
  {
    id: 'seating', name: 'Seating', about: 'More seats in the bowl you have: each level adds a tenth.',
    levels: [
      { name: 'Upper deck extension', cost: 350, upkeep: 15_000, blurb: '+10% capacity.' },
      { name: 'End zone bleachers', cost: 800, upkeep: 30_000, blurb: '+20% capacity.' },
      { name: 'Wraparound tier', cost: 1_900, upkeep: 60_000, blurb: '+30% capacity.' },
    ],
  },
  {
    id: 'concessions', name: 'Concessions', about: 'Better food sells more of it, at better prices.',
    levels: [
      { name: 'Hot dog carts', cost: 120, upkeep: 6_000, blurb: 'Fans buy a little more.' },
      { name: 'Concourse stands', cost: 450, upkeep: 18_000, blurb: 'Shorter lines, more choice.' },
      { name: 'Local food hall', cost: 1_400, upkeep: 45_000, blurb: 'Fans come hungry on purpose.' },
      { name: 'Chef-run kitchens', cost: 3_600, upkeep: 90_000, blurb: 'Premium spend per fan.' },
    ],
  },
  {
    id: 'restrooms', name: 'Restrooms', about: 'Nobody notices good restrooms. Everyone notices bad ones.',
    levels: [
      { name: 'More stalls', cost: 90, upkeep: 4_000, blurb: 'The halftime line moves.' },
      { name: 'Renovated restrooms', cost: 380, upkeep: 12_000, blurb: 'Clean, bright, quick.' },
      { name: 'Spa-grade restrooms', cost: 1_100, upkeep: 30_000, blurb: 'Fans talk about them. Really.' },
    ],
  },
  {
    id: 'parking', name: 'Parking', about: 'Spaces for the cars fans come in. Too few and fans stay home.',
    levels: [
      { name: 'Gravel lot', cost: 100, upkeep: 3_000, blurb: 'Room for 3,000 more cars.' },
      { name: 'Paved lots', cost: 420, upkeep: 10_000, blurb: 'Room for 8,000 more, and tailgating.' },
      { name: 'Parking garage', cost: 1_500, upkeep: 35_000, blurb: 'Room for 15,000 more.' },
      { name: 'Transit station', cost: 4_000, upkeep: 70_000, blurb: 'Room for 25,000 more, no traffic.' },
    ],
  },
  {
    id: 'videoboard', name: 'Video board', about: 'Replays, hype and sponsors. Adds appeal and sponsor money.',
    levels: [
      { name: 'Scoreboard', cost: 150, upkeep: 5_000, blurb: 'Sponsors notice you.' },
      { name: 'HD video board', cost: 900, upkeep: 20_000, blurb: 'Replays, kiss cam, sponsors pay more.' },
      { name: 'Halo board', cost: 3_200, upkeep: 60_000, blurb: 'The biggest screen in the league.' },
    ],
  },
  {
    id: 'suites', name: 'Luxury suites', about: 'Glass boxes for people with money. Premium income every game.',
    needsStadium: 2,
    levels: [
      { name: 'Club level', cost: 1_200, upkeep: 40_000, blurb: '24 suites.' },
      { name: 'Skybox ring', cost: 3_500, upkeep: 90_000, blurb: '60 suites.' },
      { name: 'Field-level lounges', cost: 8_000, upkeep: 160_000, blurb: '100 suites, inches from the action.' },
    ],
  },
  {
    id: 'store', name: 'Team store', about: 'Jerseys, hats and foam fingers. Merchandise money every day.',
    levels: [
      { name: 'Merch stand', cost: 80, upkeep: 2_500, blurb: 'Sells on game days and online.' },
      { name: 'Flagship store', cost: 600, upkeep: 15_000, blurb: 'Fans shop all week.' },
      { name: 'Megastore', cost: 2_400, upkeep: 40_000, blurb: 'A tourist stop.' },
    ],
  },
  {
    id: 'atmosphere', name: 'Atmosphere', about: 'Lights, sound and a drumline. Fans stay keen through rough patches.',
    levels: [
      { name: 'Stadium lights', cost: 200, upkeep: 6_000, blurb: 'Night games look the part.' },
      { name: 'Concert sound', cost: 700, upkeep: 15_000, blurb: 'You feel the bass in your seat.' },
      { name: 'Pyro and drumline', cost: 2_000, upkeep: 35_000, blurb: 'Every touchdown is an event.' },
    ],
  },
];

export const TRACK = Object.fromEntries(TRACKS.map(t => [t.id, t])) as Record<TrackId, Track>;

export type Facilities = Record<TrackId, number>;
export const EMPTY_FACILITIES: Facilities = Object.fromEntries(TRACKS.map(t => [t.id, 0])) as Facilities;

/** Parking spaces each level adds, cumulative from 2,500 at level 0. */
const PARKING = [2_500, 5_500, 13_500, 28_500, 53_500];

/** What a set of facilities adds up to. */
export function facilityStats(f: Facilities) {
  const bowl = STADIUMS[Math.min(f.stadium, STADIUMS.length - 1)];
  const capacity = Math.round(bowl.capacity * (1 + 0.1 * f.seating * (f.seating + 1) / 2));
  const comfort = 0.82 + 0.06 * f.restrooms; // a multiplier on how happy a crowd leaves
  const appeal = bowl.appeal + 4 * f.videoboard + 3 * f.atmosphere + 2 * f.concessions + 3 * f.restrooms + 4 * f.suites;
  const upkeep = TRACKS.reduce((sum, t) => sum + t.levels.slice(0, f[t.id]).reduce((s, l) => s + l.upkeep, 0), 0);
  return {
    stadiumName: bowl.name,
    capacity,
    parking: PARKING[Math.min(f.parking, PARKING.length - 1)],
    /** Concession quality, 0 to 4. */
    food: f.concessions,
    comfort,
    appeal: Math.min(100, appeal),
    suites: [0, 24, 60, 100][f.suites] ?? 0,
    store: f.store,
    board: f.videoboard,
    atmosphere: f.atmosphere,
    upkeep,
  };
}
export type FacilityStats = ReturnType<typeof facilityStats>;

/** The next level of a track, or null when it is built out. Checks the stadium a track needs. */
export function nextLevel(f: Facilities, id: TrackId): { level: number; spec: Level } | { blocked: string } | null {
  const t = TRACK[id];
  const at = f[id];
  if (at >= t.levels.length) return null;
  if (t.needsStadium && at === 0 && f.stadium < t.needsStadium) return { blocked: `Build up to the ${STADIUMS[t.needsStadium].name} first.` };
  return { level: at + 1, spec: t.levels[at] };
}
