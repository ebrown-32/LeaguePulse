/**
 * Live dependency checks for the AI desk.
 *
 * Deliberately independent of lib/ai/store.ts's module-level Redis singleton.
 * That singleton nulls itself on any connection error, which makes the failure
 * indistinguishable from "REDIS_URL was never set" and sends you debugging the
 * wrong thing. Here every check reports what actually happened.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { MODEL_FAST } from './claude';
import { getRedis } from '../redisClient';
import { getPosts, getQueuedCount, lastGeneratedAt, lastPublishAt } from './store';

export type CheckStatus = 'pass' | 'fail' | 'warn';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** What to actually do about it. Empty when passing. */
  fix?: string;
}

const ok = (id: string, label: string, detail: string): Check =>
  ({ id, label, status: 'pass', detail });
const bad = (id: string, label: string, detail: string, fix: string): Check =>
  ({ id, label, status: 'fail', detail, fix });
const warn = (id: string, label: string, detail: string, fix?: string): Check =>
  ({ id, label, status: 'warn', detail, fix });

/** Never echo a secret back to the browser; show only enough to identify it. */
function fingerprint(value: string): string {
  if (value.length <= 8) return `${value.length} chars`;
  return `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`;
}

function checkAnthropicKey(): Check {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return bad('anthropic_key', 'Anthropic API key', 'ANTHROPIC_API_KEY is not set',
      'Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.');
  }
  if (!key.startsWith('sk-ant-')) {
    return warn('anthropic_key', 'Anthropic API key',
      `Set, but does not look like an Anthropic key: ${fingerprint(key)}`,
      'Anthropic keys normally begin with "sk-ant-". Check you pasted the right value.');
  }
  return ok('anthropic_key', 'Anthropic API key', `Set: ${fingerprint(key)}`);
}

/** The only way to know a key works and has credit is to spend a token on it. */
async function checkAnthropicLive(): Promise<Check> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return bad('anthropic_live', 'Anthropic connection', 'Skipped, no API key set',
      'Set ANTHROPIC_API_KEY first.');
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_FAST,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (res.ok) {
      return ok('anthropic_live', 'Anthropic connection', `${MODEL_FAST} responded`);
    }
    const body = await res.text().catch(() => '');
    if (res.status === 401) {
      return bad('anthropic_live', 'Anthropic connection', `401 Unauthorized: ${body.slice(0, 160)}`,
        'The key is rejected. Regenerate it in the Anthropic console and update the env var.');
    }
    if (res.status === 400 && /credit|balance/i.test(body)) {
      return bad('anthropic_live', 'Anthropic connection', `Out of credit: ${body.slice(0, 160)}`,
        'Add credit to the Anthropic account.');
    }
    if (res.status === 429) {
      return warn('anthropic_live', 'Anthropic connection', 'Rate limited (429)',
        'The key works but is being throttled. Retry shortly.');
    }
    return bad('anthropic_live', 'Anthropic connection', `HTTP ${res.status}: ${body.slice(0, 160)}`,
      'Check the key and the Anthropic account status.');
  } catch (err) {
    return bad('anthropic_live', 'Anthropic connection',
      `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      'Network or DNS problem reaching api.anthropic.com.');
  }
}

/**
 * Full Redis round trip: connect, write a probe, read it back, delete it.
 *
 * This is the check that matters in production. A URL that parses is not the
 * same as a Redis you can write to, and the difference is exactly where the
 * AI desk silently stops working.
 */
async function checkRedis(): Promise<Check> {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const tcp = process.env.REDIS_URL?.trim();

  // Half-configured REST is the easy mistake: Upstash shows both values and it
  // is simple to copy one and miss the other.
  if (restUrl && !restToken) {
    return bad('redis', 'Redis', 'UPSTASH_REDIS_REST_URL is set but UPSTASH_REDIS_REST_TOKEN is empty',
      'Copy the REST token from the Upstash database page (it sits directly under the REST URL) and redeploy.');
  }
  if (restToken && !restUrl) {
    return bad('redis', 'Redis', 'UPSTASH_REDIS_REST_TOKEN is set but UPSTASH_REDIS_REST_URL is empty',
      'Add the REST URL (https://….upstash.io) and redeploy.');
  }
  if (!restUrl && !tcp) {
    return bad('redis', 'Redis', 'No Redis configured',
      'On Vercel the filesystem is read-only, so without Redis nothing the cron generates ' +
      'can be saved. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (preferred on ' +
      'Vercel), or REDIS_URL with a rediss:// connection string.');
  }
  if (!restUrl && tcp) {
    if (tcp.includes('your-redis')) {
      return bad('redis', 'Redis', 'REDIS_URL is still the placeholder value',
        'Replace it with the real connection string.');
    }
    if (tcp.startsWith('https://')) {
      return bad('redis', 'Redis', 'REDIS_URL holds an HTTPS URL, not a Redis connection string',
        'That looks like the Upstash REST URL. Either set it as UPSTASH_REDIS_REST_URL ' +
        '(with UPSTASH_REDIS_REST_TOKEN), or use the rediss:// TCP endpoint here instead.');
    }
    if (!/^rediss?:\/\//.test(tcp)) {
      return bad('redis', 'Redis', `REDIS_URL has an unexpected scheme: ${tcp.split(':')[0]}://`,
        'It should start with rediss:// (TLS, what Upstash uses) or redis://.');
    }
  }

  // Round trip through whichever transport resolved. A URL that parses is not
  // the same as a Redis you can write to, and the difference is exactly where
  // the AI desk silently stops working.
  const { client, backend, reason } = getRedis();
  if (!client) {
    return bad('redis', 'Redis', reason ?? 'No client could be created',
      'Check the connection variables and redeploy.');
  }
  const transport = backend === 'upstash-rest' ? 'Upstash REST' : 'Redis TCP';
  try {
    const probe = `lp_diag_${Date.now()}`;
    await client.set(probe, 'ok');
    const read = await client.get(probe);
    await client.del(probe);
    if (read !== 'ok') {
      return bad('redis', 'Redis', `${transport}: wrote a value but it did not read back`,
        'The instance is reachable but not behaving. Check the Upstash dashboard.');
    }
    return ok('redis', 'Redis', `${transport}: connected, write and read verified`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let fix = 'Check the connection details and that the database is running.';
    if (/401|403|unauthor|WRONGPASS|NOAUTH/i.test(msg)) {
      fix = 'Credentials rejected. Copy a fresh token or connection string from Upstash.';
    } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) {
      fix = 'Host not found. The URL hostname looks wrong.';
    } else if (/ETIMEDOUT|timeout|ECONNREFUSED/i.test(msg)) {
      fix = 'Could not reach the server. On Vercel prefer the REST transport, which is plain HTTPS.';
    } else if (/SSL|TLS|wrong version number/i.test(msg)) {
      fix = 'TLS mismatch. Upstash TCP requires rediss:// rather than redis://.';
    }
    return bad('redis', 'Redis', `${transport} failed: ${msg.slice(0, 200)}`, fix);
  }
}

function checkCronSecret(): Check {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return warn('cron_secret', 'Cron secret', 'CRON_SECRET is not set',
      'Without it /api/ai/cron is publicly callable and anyone can trigger generation ' +
      'against your Anthropic credit. Set it in Vercel; scheduled runs pick it up automatically.');
  }
  return ok('cron_secret', 'Cron secret', `Set: ${fingerprint(secret)}`);
}

function checkAdminPassword(): Check {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  if (!pw) {
    return warn('admin_password', 'Admin password', 'ADMIN_PASSWORD is not set',
      'Set it so this back office is protected in production.');
  }
  return ok('admin_password', 'Admin password', 'Set');
}

/** Whether the filesystem fallback would work. Informational: on Vercel it
 *  never does, which is precisely why Redis is required. */
async function checkFilesystem(): Promise<Check> {
  const dir = path.join(process.cwd(), 'data');
  try {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, '.diag');
    await fs.writeFile(probe, 'ok');
    await fs.unlink(probe);
    return ok('filesystem', 'Filesystem fallback', 'Writable (local development)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return warn('filesystem', 'Filesystem fallback', `Read-only: ${msg.slice(0, 120)}`,
      'Expected on Vercel. Redis must work, since there is no other place to persist.');
  }
}

async function checkContent(): Promise<Check[]> {
  const [visible, queued, generatedAt, publishAt] = await Promise.all([
    getPosts(200).catch(() => []),
    getQueuedCount().catch(() => 0),
    lastGeneratedAt().catch(() => 0),
    lastPublishAt().catch(() => 0),
  ]);

  const hours = (t: number) => (t ? Math.round((Date.now() - t) / 3_600_000) : null);
  const sinceGen = hours(generatedAt);

  const feed: Check = visible.length
    ? ok('feed', 'Published posts', `${visible.length} visible in the feed`)
    : warn('feed', 'Published posts', 'Nothing visible yet',
        'Either no batch has run, or everything written is still scheduled for later today.');

  const batch: Check = sinceGen == null
    ? warn('last_batch', 'Last generation', 'No post has ever been generated',
        'Run the scheduler from this panel to produce the first batch.')
    : sinceGen > 36
      ? warn('last_batch', 'Last generation', `${sinceGen}h ago`,
          'The daily cron may not be firing. Check Vercel → Settings → Cron Jobs.')
      : ok('last_batch', 'Last generation', `${sinceGen}h ago`);

  return [
    feed,
    batch,
    ok('queued', 'Queued posts', `${queued} written but not yet due`),
    publishAt
      ? ok('next_publish', 'Next release',
          publishAt > Date.now()
            ? `in ${Math.max(1, Math.round((publishAt - Date.now()) / 60000))} min`
            : 'all released')
      : warn('next_publish', 'Next release', 'Nothing scheduled'),
  ];
}

export async function runDiagnostics(opts: { live: boolean }): Promise<{
  checks: Check[];
  summary: { pass: number; warn: number; fail: number };
}> {
  const checks: Check[] = [
    checkAnthropicKey(),
    ...(opts.live ? [await checkAnthropicLive()] : []),
    await checkRedis(),
    checkCronSecret(),
    checkAdminPassword(),
    await checkFilesystem(),
    ...(await checkContent()),
  ];

  return {
    checks,
    summary: {
      pass: checks.filter(c => c.status === 'pass').length,
      warn: checks.filter(c => c.status === 'warn').length,
      fail: checks.filter(c => c.status === 'fail').length,
    },
  };
}
