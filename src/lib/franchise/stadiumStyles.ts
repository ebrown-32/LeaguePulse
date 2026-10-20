/**
 * The stadium styles a manager picks from. Every style buys the same upgrades
 * (lib/tycoon/catalog) for the same money and the same numbers; what differs
 * is how each one is built into the building, which the 3D view draws
 * (team/[userId]/tycoon/Stadium3D) and the shop describes from here.
 *
 * Pure, shared by the page and the studio.
 */

import type { TrackId } from '@/lib/tycoon/catalog';
import type { StadiumLook } from './model';

export type StadiumStyle = StadiumLook['style'];

export interface StyleInfo {
  name: string;
  /** A line on the picker card. */
  tagline: string;
  /** Whether it has a roof that opens and closes (at some level). */
  movingRoof: boolean;
  /** How each upgrade track shows up in this style, for the shop. Tracks not named build the same everywhere. */
  builds: Partial<Record<TrackId, string>>;
}

export const STYLES: Record<StadiumStyle, StyleInfo> = {
  bowl: {
    name: 'Classic Bowl',
    tagline: 'Seats all the way around. Loud from every angle.',
    movingRoof: false,
    builds: {
      stadium: 'Adds a full ring of seats around the bowl, and a canopy at the top levels.',
      seating: 'Every deck gets deeper, all the way around.',
      suites: 'A glass ring of suites between the lower and middle decks.',
      videoboard: 'A board over the east end zone, then one over each end.',
      atmosphere: 'Light towers in the four corners.',
    },
  },
  horseshoe: {
    name: 'Horseshoe',
    tagline: 'Open at one end, with a view out to the city.',
    movingRoof: false,
    builds: {
      stadium: 'Adds a deck along both sidelines and the closed end; the open end stays open.',
      seating: 'Deeper decks along the horseshoe.',
      suites: 'Suites along both sidelines.',
      videoboard: 'A giant board fills the open end, on its own tower at the top level.',
      atmosphere: 'Light towers along both sidelines.',
    },
  },
  grandstand: {
    name: 'Grandstand',
    tagline: 'Two tall sideline stands under pitched roofs. Old school.',
    movingRoof: false,
    builds: {
      stadium: 'Stacks another deck on both sideline stands; the home side always stands taller.',
      seating: 'Bleachers fill in behind each end zone, then get deeper.',
      suites: 'A press box and boxes along the top of the home stand.',
      videoboard: 'A classic scoreboard on posts behind the east end zone.',
      atmosphere: 'Banks of lights along both roofs.',
    },
  },
  dome: {
    name: 'Dome',
    tagline: 'A roof over everything. Weatherproof, and deafening.',
    movingRoof: false,
    builds: {
      stadium: 'A bigger, higher dome with another deck under it.',
      seating: 'Deeper decks all the way around.',
      suites: 'A glass ring of suites between the decks.',
      videoboard: 'A board hung over midfield, with a screen to each side.',
      atmosphere: 'Lights in the roof, so it glows from outside at night.',
    },
  },
  cantilever: {
    name: 'Cantilever',
    tagline: 'Glass, steel and a floating roof. The home side towers.',
    movingRoof: true,
    builds: {
      stadium: 'Adds a deck, tallest on the home side; a roof that opens and closes from the Cathedral up.',
      seating: 'Deeper decks, steepest on the home side.',
      suites: 'Suites stacked in the home side tower.',
      videoboard: 'Boards over both end zones and a ribbon board around the bowl.',
      atmosphere: 'Lights along the edge of the roof.',
    },
  },
  coliseum: {
    name: 'Coliseum',
    tagline: 'Sunk into the ground, with a colonnade at the open end.',
    movingRoof: false,
    builds: {
      stadium: 'Raises another deck above the sunken bowl; the colonnade grows with it.',
      seating: 'Deeper decks around the oval.',
      suites: 'Suites along both sidelines.',
      videoboard: 'A board above the colonnade.',
      atmosphere: 'A torch on top of the colonnade, lit for every game.',
    },
  },
  memorial: {
    // After Nebraska's Memorial Stadium: four stands that meet at the corners, brick and arches outside.
    name: 'Memorial',
    tagline: 'Brick arches, towering sidelines, and a sea of color on Saturdays.',
    movingRoof: false,
    builds: {
      stadium: 'Stacks another deck on both sideline stands and the ends; the home side always stands tallest.',
      seating: 'Every stand gets deeper, end zones included.',
      suites: 'Skyboxes along both sidelines, under press boxes on top of both stands.',
      videoboard: 'A giant board over the south end zone, then one over the north.',
      atmosphere: 'Light towers at the ends of both sideline stands.',
    },
  },
  wall: {
    // After Dortmund's south stand: one end a single towering terrace.
    name: 'The Wall',
    tagline: 'One end zone is a single towering terrace. The loudest seats anywhere.',
    movingRoof: false,
    builds: {
      stadium: 'The wall climbs higher; the other three sides add a tier, all open to the sky.',
      seating: 'Deeper tiers, and a steeper wall.',
      suites: 'Suites along both sidelines.',
      videoboard: 'A board over the far end zone, facing the wall.',
      atmosphere: 'Light towers in the four corners.',
    },
  },
  twintowers: {
    // After the old Wembley: a low oval behind two white towers.
    name: 'Twin Towers',
    tagline: 'A low oval behind two white domed towers at the gates. Pure history.',
    movingRoof: false,
    builds: {
      stadium: 'Another tier around the oval, and a canopy over it from the Cathedral up; the towers grow with it.',
      seating: 'Deeper tiers all the way around.',
      suites: 'A ring of suites between the tiers.',
      videoboard: 'A board over the east end, facing the towers.',
      atmosphere: 'Light towers in the corners, and the towers lit at night.',
    },
  },
};

export const STYLE_ORDER = Object.keys(STYLES) as StadiumStyle[];

/** How a track builds in a style, for the shop; null when it is the same everywhere. */
export function styleBuild(style: StadiumStyle, track: TrackId): string | null {
  return STYLES[style]?.builds[track] ?? null;
}
