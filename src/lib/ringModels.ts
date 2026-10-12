/**
 * Which seasons have a 3D championship ring model.
 *
 * The models in public/models/rings are the default set for every league,
 * hosted or self-hosted. They cover a fixed range of years, so a title won in
 * a season outside it has no model, and callers show it without a ring rather
 * than requesting a file that is not there.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export const ringModelPath = (season: string) => `/models/rings/ring-${season}.glb`;

let cached: Promise<string[]> | null = null;

/** Seasons with a ring model, oldest first. */
export function ringSeasons(): Promise<string[]> {
  cached ??= fs.readdir(path.join(process.cwd(), 'public', 'models', 'rings'))
    .then(names => names
      .map(f => /^ring-(\d{4})\.glb$/.exec(f)?.[1])
      .filter((s): s is string => Boolean(s))
      .sort())
    .catch(() => []);
  return cached;
}
