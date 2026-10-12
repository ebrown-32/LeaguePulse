# Hosted LeaguePulse

How the subscription product works, how to switch it on, and what is left.

The same codebase runs two ways. **Self-hosted** is the default and is
unchanged: one league, set by `NEXT_PUBLIC_LEAGUE_ID`, secrets in the
environment. **Hosted** (`LP_HOSTED=1`) serves the product site on the bare
domain and each league on its own subdomain, with its own admin and its own
Anthropic key.

## The model

- One subscription per league (League Pass), paid through Stripe.
- **Each league brings its own Anthropic API key** and pays Anthropic directly
  for its AI. The platform never pays for a league's model usage, and there is
  deliberately no fallback to a platform key. A league without a key has every
  feature except the AI ones.
- Whoever pays sets the league's admin password, right after checkout.

## How tenancy works

| Concern | How it is handled | Where |
|---|---|---|
| Which league a request is for | Read from the request **Host**, never a header: API routes skip the proxy, so a header could be forged | `src/lib/tenant/context.ts` |
| League id for pages and APIs | `getRootLeagueId()` / `getCurrentLeagueId()` / `leagueConfigured()`; the browser gets the league from the layout | `src/config/league.ts`, `src/app/layout.tsx` |
| Stored data | Every Redis key is prefixed `t:<slug>:` inside `getRedis()`, so no call site can forget. Platform and shared keys are listed in `SHARED_PREFIXES` | `src/lib/redisClient.ts` |
| In-memory caches | League data caches go through `perLeague()` | `src/lib/tenant/perLeague.ts` |
| Admin | One check, `isAdminRequest()`. Per league: salted scrypt hash. Self-hosted: `ADMIN_PASSWORD` | `src/lib/tenant/admin.ts` |
| AI key | Encrypted with AES-256-GCM under `LP_SECRETS_KEY`, never returned, injected per request | `src/lib/tenant/secrets.ts`, `src/lib/ai/claude.ts` |
| Scheduler | A poke to the bare domain fans out one invocation per live league; only the cron secret may name a league | `src/app/api/ai/cron/route.ts` |
| Address with no league, or a lapsed subscription | A plain "nothing here" or "paused" page | `src/components/platform/LeagueUnavailable.tsx` |

### Verified end to end

Against a second server in hosted mode with a throwaway league (since removed):
the bare domain serves the product, unknown addresses get the plain page, a
league subdomain serves *that* league's data and not the server's, the feed is
the league's own, the self-hosted admin password does not open a hosted league,
a league's password does not work on another address, forged tenant headers are
ignored, a league admin cannot make the scheduler run another league, keys are
tested before saving and stored only as ciphertext, an AI request runs on the
league's own key, and a cancelled league shows as paused.

## Setting up the domain

Wildcard subdomains on Vercel need **Vercel's nameservers**: Vercel has to answer
DNS challenges to issue and renew the wildcard certificate. A wildcard covers
one level, so leagues live at `league.yourdomain.com`.

1. **Buy the domain** at any registrar (or in Vercel).
2. **Create a new Vercel project** from this repository, separate from your own
   league's project, so your current site is untouched. It must be on the
   **Pro** plan: Hobby is limited to non-commercial, personal use.
3. **Point the domain's nameservers** at your registrar to `ns1.vercel-dns.com`
   and `ns2.vercel-dns.com`. Propagation can take up to a day; check with
   `dig NS yourdomain.com +short`.
4. **Add three domains** to the new project under Settings, Domains:
   `yourdomain.com`, `www.yourdomain.com` (set to redirect to the apex) and
   `*.yourdomain.com`.
5. **Set the environment** (below) and redeploy.
6. **Check**: `https://yourdomain.com` shows the landing page and
   `https://anything.yourdomain.com` shows "No league lives at this address".

If you cannot move the nameservers, Vercel has a guide for wildcard domains
with an external DNS provider, which delegates only certificate validation.

Locally, `http://<slug>.localhost:3000` works in Chrome with no setup.

## Environment for the hosted project

| Variable | Value |
|---|---|
| `LP_HOSTED` | `1` |
| `LP_TENANCY` | `1` once you are ready to serve leagues (until then, league addresses show a holding page) |
| `NEXT_PUBLIC_LP_ROOT_DOMAIN` | `yourdomain.com` |
| `LP_SECRETS_KEY` | `openssl rand -base64 32`. Encrypts every league's API key. **Back it up**: losing it means every league re-enters its key |
| `CRON_SECRET` | any long random string; required in hosted mode |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | a **separate** Redis database from your own league's |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_SEASON` | see Billing |
| `NEXT_PUBLIC_LP_PRICE_MONTHLY` / `_SEASON` / `_TRIAL_DAYS` | displayed prices, matching Stripe (defaults 12, 49, 14) |

Do **not** set `NEXT_PUBLIC_LEAGUE_ID` or `ANTHROPIC_API_KEY` on the hosted
project. Public variables are baked into the build, and a platform Anthropic key
is never used for leagues anyway.

## Billing

1. In Stripe, create a product **League Pass** with a monthly price and a
   season price (a yearly recurring price is simplest).
2. Add a webhook endpoint at `https://yourdomain.com/api/platform/stripe-webhook`
   for `checkout.session.completed`, `customer.subscription.updated` and
   `customer.subscription.deleted`.
3. Point the GitHub Actions `SITE_URL` secret for this project at
   `https://yourdomain.com` so the scheduler pokes reach the fan-out.

## Still to build

- **Billing self-service**: a link from a league's admin to the Stripe customer
  portal, to update a card or cancel. Until then, cancellations go through you.
- **Admin password reset**, and inviting a second admin such as the commissioner.
- **Purging a cancelled league's data** after a grace period (the registry entry
  can be removed with `deleteTenant`; its `t:<slug>:` keys are left).
- **Custom domains** per league, such as moving your own league onto the platform.
- **A platform admin view**: leagues, statuses, trials ending.
