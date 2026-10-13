/**
 * Run the hosted product locally: `npm run dev:hosted`, then open
 * http://localhost:3001 (the product site), http://<slug>.localhost:3001
 * (a league) and http://localhost:3001/operator.
 *
 * Reads .env.hosted.local over your usual .env.local, so the hosted settings
 * win, and blanks NEXT_PUBLIC_LEAGUE_ID so no single league is baked in.
 * Anything not in .env.hosted.local, such as Redis, still comes from
 * .env.local. Next allows one dev server per folder, so stop `npm run dev`
 * first.
 */

import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';

const file = '.env.hosted.local';
if (!existsSync(file)) {
  console.error(`${file} is missing. See docs/HOSTED.md for what goes in it.`);
  process.exit(1);
}
const vars = parseEnv(readFileSync(file, 'utf8'));
const env = { ...process.env, ...Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== '')), NEXT_PUBLIC_LEAGUE_ID: '' };

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-p', process.env.PORT || '3001'], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
