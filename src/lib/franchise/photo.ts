/**
 * The media desk's photographs: a stadium on game day, shot from somewhere a
 * photographer would stand. A post carries only the recipe (whose stadium,
 * against whom, the hour, how full, which shot); every reader's browser
 * develops it from the real 3D stadium (components/desk/StadiumPhoto), so the
 * picture is the host's stadium exactly as its manager dressed it.
 *
 *   exterior   the stadium from across the plaza
 *   drone      straight down over the tailgates in a lot
 *   tailgate   standing among the tents, the stadium behind
 *   crowd      from the field, up into the stands
 *   warmup     field level, both teams warming up in their colors
 *   interview  on the sideline with the writer, a selfie
 *   aerial     high over the whole bowl
 *
 * Pure.
 */

import { blueprint, type Outline } from './stadiumBlueprint.ts';
import { campusPlan } from './campusPlan.ts';
import type { StadiumLook } from './model.ts';
import type { Facilities } from '../tycoon/catalog.ts';

export const SHOTS = ['exterior', 'drone', 'tailgate', 'crowd', 'warmup', 'interview', 'aerial'] as const;
export type Shot = (typeof SHOTS)[number];

export interface PhotoSpec {
  shot: Shot;
  /** The host's and the visitor's franchise ids. */
  host: string;
  guest: string;
  season: string;
  week: number;
  /** Hour of day in New York when it was taken, 0 to 24: the light. */
  hour: number;
  /** How full the stands and the lots were (lib/franchise/venue gameDay). */
  stands: number;
  lots: number;
}

export interface PhotoView {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  field: 'game' | 'warmup' | 'empty';
}

/** Which shots suit each moment of game day. */
export const SHOTS_FOR: Record<'quiet' | 'tailgating' | 'gates' | 'live' | 'final', Shot[]> = {
  quiet: ['exterior', 'aerial'],
  tailgating: ['drone', 'tailgate', 'exterior'],
  gates: ['warmup', 'interview', 'crowd', 'drone'],
  live: ['crowd', 'aerial', 'interview'],
  final: ['exterior', 'aerial'],
};

/** Where the camera stands for a shot of this stadium. */
export function photoView(shot: Shot, facilities: Facilities, look: Pick<StadiumLook, 'style' | 'setting' | 'district' | 'tailgate' | 'plaza' | 'features'>, live: boolean): PhotoView {
  const bp = blueprint(look.style, facilities);
  const field: PhotoView['field'] = live ? 'game' : shot === 'warmup' || shot === 'interview' || shot === 'crowd' ? 'warmup' : 'empty';
  const top = bp.top, R = bp.footprint;
  switch (shot) {
    case 'exterior':
      return { position: [R * 1.9, Math.max(2.2, top * 0.75), R * 2.1], target: [0, top * 0.45, 0], fov: 46, field };
    case 'aerial':
      return { position: [R * 1.35, top + R * 1.9, R * 1.45], target: [0, 0, 0], fov: 40, field };
    case 'crowd':
      // From midfield, up into the home stand.
      return { position: [0.4, 0.55, 1.2], target: [-0.6, top * 0.7, -(bp.inner + R) / 2], fov: 62, field };
    case 'warmup':
      return { position: [-3.6, 0.42, 0.55], target: [1.2, 0.18, -0.15], fov: 52, field };
    case 'interview':
      return { position: [0.6, 0.38, (bp.inner + 0.15) * 0.92], target: [-0.4, 0.6, -bp.inner], fov: 58, field };
    case 'drone':
    case 'tailgate': {
      const lot = lotOf(bp.outline, bp.footprint, facilities.parking, look);
      if (shot === 'drone') return { position: [lot[0] + 0.6, 6.5, lot[1] + Math.sign(lot[1]) * 2.2], target: [lot[0], 0.1, lot[1]], fov: 48, field };
      // Among the tents, looking back at the stadium.
      return { position: [lot[0] * 1.08, 0.55, lot[1] * 1.12], target: [0, top * 0.5, 0], fov: 50, field };
    }
  }
}

/** The middle of the stadium's first lot, from its site plan. */
function lotOf(outline: Outline, footprint: number, parking: number, look: Pick<StadiumLook, 'setting' | 'district' | 'tailgate' | 'plaza' | 'features'>): [number, number] {
  const plan = campusPlan({ outline, footprint, parking, fill: 0.9, look });
  // A lot on the camera's side when there is one (z > 0), so the stadium is behind it.
  const lot = plan.lots.find(l => l.z > 0 && !l.grass) ?? plan.lots[0];
  return lot ? [lot.x, lot.z] : [0, footprint * 1.8];
}
