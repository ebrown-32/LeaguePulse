/**
 * The site soundtrack's tracks (lib/soundtrack): every audio file in public/soundtrack, in file-name
 * order, titled from the name ("02 - Fourth Quarter.mp3" plays second, as "Fourth Quarter").
 * Read once a server. Hosted only: a self-hosted site has no soundtrack. Server only.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Track } from './soundtrack';

const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|webm)$/i;
let cached: Promise<Track[]> | null = null;

export function soundtrackTracks(): Promise<Track[]> {
  if (process.env.LP_HOSTED !== '1') return Promise.resolve([]);
  cached ??= fs.readdir(path.join(process.cwd(), 'public', 'soundtrack'))
    .then(names => names.filter(n => AUDIO.test(n) && !n.startsWith('.')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(n => ({
        src: `/soundtrack/${encodeURIComponent(n)}`,
        title: n.replace(AUDIO, '').replace(/^\s*\d+\s*[-._)]*\s*/, '').replace(/[_]+/g, ' ').trim() || n,
      })))
    .catch(() => []);
  return cached;
}
