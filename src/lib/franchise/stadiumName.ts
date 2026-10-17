/**
 * A stadium's name until its manager gives it one: from the team's own name
 * ("Trash Pandas Stadium", "Pandas Field") or a made-up local sponsor with a
 * football habit ("Red Zone Pizza Field", "Hail Mary Mutual Stadium"). Picked
 * from the franchise's id, so a team's stadium keeps its name on every page.
 *
 * The sponsors are invented; none is a real company.
 *
 * Pure.
 */

const SPONSORS = [
  'Red Zone Pizza', 'Fourth & Long Insurance', 'Hail Mary Mutual', 'Blitz Cola', 'Two Minute Oil Change',
  'Goal Line Hardware', 'Audible Auto Group', 'Sideline Savings', 'Waiver Wire Credit Union', 'Bye Week Mattress',
  'Pigskin Pretzel Co.', 'Touchback Tacos', 'Gridiron Gas & Electric', 'Hash Mark Hot Dogs', 'Play Action Pharmacy',
  'End Zone Energy', 'Flea Flicker Furniture', 'Shotgun Shipping', 'Overtime Outfitters', 'Draft Day Dental',
  'Trade Deadline Title', 'Stat Line Steakhouse', 'Trophy Case Trucking', 'Fair Catch Fitness', 'Onside Kick Insurance',
  'Two Point Plumbing', 'Gameday Grills', 'Chain Gang Hardware', 'Kickoff Coffee', 'Victory Formation Bank',
] as const;

/** For a sponsor's name. */
const SPONSORED = ['Stadium', 'Field', 'Park', 'Bowl', 'Coliseum'] as const;

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** A team name as it would read on a building: letters, numbers and plain punctuation, no leading "The". */
function clean(teamName: string): string {
  return teamName.replace(/[^\p{L}\p{N} '&.-]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^the\s+/i, '');
}

export function defaultStadiumName(franchiseId: string, teamName: string | null | undefined): string {
  const r = rng(`stadium-name:${franchiseId}`);
  const team = clean(teamName ?? '');
  const words = team.split(' ').filter(Boolean);
  const last = words.at(-1) ?? '';
  // A name that reads well on a building: a couple of words, and not too long.
  const usable = words.length > 0 && words.length <= 3 && team.length <= 22 && /\p{L}{3}/u.test(team);
  const roll = r();
  if (usable && roll < 0.25) return `${team} Stadium`;
  if (usable && roll < 0.4 && last.length >= 4) return `${last} Field`;
  if (usable && roll < 0.48 && last.length >= 4) return `${last} Park`;
  return `${pick(r, SPONSORS)} ${pick(r, SPONSORED)}`;
}
