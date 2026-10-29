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

### Running it locally

`npm run dev:hosted` runs the hosted product on http://localhost:3001 with the
settings in `.env.hosted.local` (stop `npm run dev` first; Next allows one dev
server per folder). It uses the Redis in `.env.local` but writes every key
under `dev:`, so local leagues never mix with the real site that database
serves.

To create a league locally, open http://localhost:3001/operator, sign in with
`LP_OPERATOR_SECRET`, and use "Add a beta league" (Stripe's webhooks cannot
reach a laptop, so checkout is for the deployed site). Open the setup link it
gives you to set the admin password, then visit
`http://<slug>.localhost:3001` (Chrome and Firefox resolve `*.localhost`;
Safari may not).

## Environment for the hosted project

| Variable | Value |
|---|---|
| `LP_HOSTED` | `1` |
| `LP_TENANCY` | `1` once you are ready to serve leagues (until then, league addresses show a holding page) |
| `NEXT_PUBLIC_LP_ROOT_DOMAIN` | `yourdomain.com` |
| `LP_SECRETS_KEY` | `openssl rand -base64 32`. Encrypts every league's API keys (Anthropic, FantasyPros). **Back it up**: losing it means every league re-enters its keys |
| `CRON_SECRET` | any long random string; required in hosted mode |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | a **separate** Redis database from your own league's |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_SEASON` | see Billing |
| `NEXT_PUBLIC_LP_PRICE_MONTHLY` / `_SEASON` / `_TRIAL_DAYS` | displayed prices, matching Stripe (defaults 8, 39, 14) |
| `STRIPE_PRICE_AI_MONTHLY`, `STRIPE_PRICE_AI_SEASON` | the League Pass + AI prices; see Billing. Without them, sign-up for that tier says billing is not ready |
| `NEXT_PUBLIC_LP_PRICE_AI_MONTHLY` / `_SEASON` | displayed League Pass + AI prices (defaults 16, 79) |
| `STRIPE_PRICE_MONTHLY_OLD` / `_SEASON_OLD` / `_AI_MONTHLY_OLD` / `_AI_SEASON_OLD` | optional: comma-separated Stripe prices no longer sold that subscriptions may still be on. Those leagues keep their tier, and the operator panel lists them with a button that moves them to today's price from their next renewal (api/platform/operator/reprice) |
| `LP_MANAGED_ANTHROPIC_API_KEY` | the platform's own Anthropic key, used **only** for League Pass + AI leagues that have no key of their own. Set a spend limit on it in the Anthropic console |
| `LP_MANAGED_DAILY_CHAT` / `LP_MANAGED_DAILY_ASK` | optional: daily chat and analytics questions for a League Pass + AI league on the platform key (defaults 40 and 20). Leagues on their own key keep `LP_AI_DAILY_CHAT` / `_ASK` (300 and 200). Each league's AI cost this month shows in the operator panel |
| `LP_MANAGED_MONTHLY_BUDGET` | optional: dollars of AI a month (at list prices) for a League Pass + AI league on the platform key, default 4. Past it, that league's AI runs on the fast model for the rest of the month instead of stopping. `0` turns the budget off |
| `STRIPE_PORTAL_CONFIGURATION` | optional: the customer portal setup (`bpc_…`) League Pass uses. Without it Stripe uses the account default, which must be saved once in the dashboard |
| `LP_OPERATOR_SECRET` | `openssl rand -hex 32`. Your key to the operator endpoints below. Keep it out of GitHub |
| `NEXT_PUBLIC_LP_SUPPORT_EMAIL` | where customers write; shown on the site, the legal pages and the admin sign-in |

Do **not** set `NEXT_PUBLIC_LEAGUE_ID`, `ANTHROPIC_API_KEY` or `FANTASY_PROS` on the hosted
project. Each league connects its own FantasyPros key in its admin's Rankings tab
(FantasyPros grants keys to people for their own use, and a free key's 50
requests a day cover one league's daily refresh, not a platform's). Public variables are baked into the build, and a platform Anthropic key
is never used for leagues anyway (League Pass + AI uses
`LP_MANAGED_ANTHROPIC_API_KEY`, and only for that tier).

## Billing

1. In Stripe, create a product **League Pass** with a monthly price and a
   season price (a yearly recurring price is simplest). Their ids go in
   `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_SEASON`. Create a second product,
   **League Pass + AI**, the same way (same tax code); its prices go in
   `STRIPE_PRICE_AI_MONTHLY` and `STRIPE_PRICE_AI_SEASON`. The webhook reads a
   subscription's tier from its price, so a switch in the portal just works.
2. Add a webhook endpoint at `https://yourdomain.com/api/platform/stripe-webhook`
   for `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`.
   Its signing secret is `STRIPE_WEBHOOK_SECRET`.
3. Use a **restricted key** (`rk_live_…`) for `STRIPE_SECRET_KEY` in live mode,
   with only: Checkout Sessions (write), Customer portal (write) and
   Subscriptions (write; the webhook reads subscriptions and cancels a checkout
   whose address was taken). Test it in a sandbox first; a `403` names any
   missing permission.
4. **Turn on the customer portal** (Settings, Billing, Customer portal) and
   save it once: allow updating the payment method, cancelling, viewing
   invoices and, if you like, switching between the League Pass and League Pass + AI prices
   (add both products to the portal's product catalogue).
   League admins reach it from "Manage billing" on their admin page. Until it
   is saved, that button returns an error.
5. Do all of this in **test mode** first and run a full sign-up with card
   `4242 4242 4242 4242`. Then repeat steps 1 to 4 in live mode and swap the
   Stripe variables for the live ones.
6. In the Dashboard: set the public business name and support email, turn on
   customer emails (receipts, trial ending, failed payments), and decide on
   Stripe Tax (it collects nothing until you add a registration).

## The scheduler

Both GitHub workflows poke your own league (`SITE_URL`, `CRON_SECRET`) and, if
set, the hosted product (`HOSTED_SITE_URL`, `HOSTED_CRON_SECRET`). Add the
latter two as repository secrets: `HOSTED_SITE_URL` is the bare domain,
`https://yourdomain.com`, and `HOSTED_CRON_SECRET` is the hosted project's
`CRON_SECRET`. Scheduled workflows only run from the default branch, so the
workflow changes take effect once they are on `main`.

One poke fans out one run per live league that has an AI key, each called on
the real domain in its own invocation.

## ESPN leagues

A league can come from Sleeper or ESPN. Sleeper is untouched: every Sleeper
request goes to Sleeper exactly as before. An ESPN league is translated into
Sleeper's shapes, so every page works on it without knowing.

- **Ids.** An ESPN league is `espn-<league id>-<season>` and a manager
  `espn-<league id>-u-<member>` (`src/lib/providers/ids.ts`). Sleeper ids are
  all digits, so the two cannot collide.
- **Routing.** Call sites fetch Sleeper URLs through `leagueFetch`
  (`src/lib/providers/leagueFetch.ts`). A URL naming an ESPN id is answered by
  the adapter (`src/lib/providers/espn/`): on the server directly, registered
  by `src/instrumentation.ts`; in the browser through `/api/league-data/v1/...`.
  Only the site's own ESPN league is ever served.
- **Kept copies.** Translated data is stored under the league's prefix and
  served from there: finished seasons are fetched once, this week refreshes
  every 90 seconds while open, and when ESPN fails the last good copy is shown.
  `/api/espn/sync` (Vercel cron, every five minutes) keeps current seasons warm.
- **Private leagues.** Most need the `SWID` and `espn_s2` cookies of any member.
  Sign-up asks for them only when ESPN says the league is private, tests them,
  and keeps them encrypted (`LP_SECRETS_KEY`) under `lp_espn_creds:<league>`:
  two days until payment, then permanently. ESPN signs them out after about a
  year; the league admin page shows the connection's health and takes new ones,
  and the health record (`lp_espn_creds_health:<league>`) says when they lapsed.
- **Trades.** This season's come from ESPN's league activity feed, which
  lists each trade's players, and are kept for good (ESPN deletes the feed
  when the season ends). A finished season with none kept has its trades
  rebuilt from its weekly rosters (`rebuildTrades` in `translate.ts`): a
  player who changed teams between two weeks with no pickup to explain it was
  traded, checked against ESPN's per-team trade counts. On a real league this
  matched ESPN exactly for 2020 to 2025 and matched the feed for 2026.
  Seasons ESPN only serves through `leagueHistory` (2019 and earlier there)
  return the final roster for every week, so their trades cannot be recovered.
- **Not yet:** keeper or dynasty traded draft picks.
- **Tests:** `npm test` checks that Sleeper URLs pass through untouched and pins
  the translation.

## Finished seasons are kept

A season that is over (from the March after it) never changes, so it is
recorded once and kept: every response a page can ask for about it (league,
managers, rosters, each week's matchups and moves, playoffs, draft), exactly
as Sleeper or the ESPN adapter gave it, gzipped in Redis under the league's
prefix (`league_bundle_v1:<league id>`). See `src/lib/bundles/`.

`leagueFetch` answers those requests from the season's bundle (one request
per season in the browser, instead of one per week), and sends everything
else, including the whole current season, to the source exactly as before.
A season that cannot be recorded completely is not kept, and pages read it
live. Measured locally on a ten-season league: about 1,000 requests and 22
seconds before, about 50 requests and 3 seconds after.

- Kill switch: `NEXT_PUBLIC_LP_BUNDLES=0` turns bundles off everywhere.
- Changing what a bundle holds: bump `BUNDLE_VERSION` in `paths.ts`; every
  season is recorded again on its next visit.
- One season again (a late stat correction): `dropBundle(leagueId)` in
  `store.ts`. No button for it yet.

**Settled weeks of the current season** are kept the same way, one week at a
time (`settled.ts`): two NFL weeks after a week is played (the archive's
rule, `src/lib/archive/plan.ts`), its matchups and transactions are recorded
the first time a server page asks and served from then on. A week that has
not settled is always read live. Server side and Sleeper leagues only.
Measured on a Sleeper league in week 6: a page that read 19 weeks from
Sleeper now reads 15, and the saving grows every week of the season. Stored
responses were compared with Sleeper's live answers: identical.

## The league archive

Every league's data is also kept in Postgres (Neon, through the Vercel
Marketplace: `DATABASE_URL`), in one shape for Sleeper, ESPN and hand-entered
seasons: seasons, managers, teams with final places, every game with
lineups and player points, transactions, drafts and picks. Redis stays the
fast cache; the archive is the record. See `src/lib/archive/`.

- **Kept, not mirrored.** A season Sleeper or ESPN stops returning keeps
  what the archive has. Only a season the commissioner entered and then
  deleted is removed.
- **Downloads.** Admin, Your data: Excel, CSV or JSON, one table or all, one
  season or all. Games are listed once each, with both teams and the winner.
- **The AI** reads the league's history (champions, all-time high, records
  by manager) from the archive, falling back to reading every season when
  it has none.
- **Without `DATABASE_URL`** none of this runs; a self-hosted copy works as before.

### Keeping it current within Sleeper's limit

Sleeper asks apps to stay under 1,000 calls a minute. Three things keep the
archive well inside it as leagues are added:

1. **Read only what can change** (`plan.ts`). A finished season is read once.
   In the current one a week settles two NFL weeks after it is played, once
   stat corrections are in, and is never read again. A mid-season update is
   about 8 Sleeper calls a league: league, users, rosters, drafts, and the
   matchups and moves of the two weeks still open. ESPN leagues use none.
2. **One count of Sleeper calls for the platform** (`sleeperBudget.ts`,
   Redis key `lp_sleeper_rpm:<minute>`). Every server-side call is counted,
   pages included. Before each batch the archive waits until the minute has
   room under `LP_SLEEPER_JOB_RPM` (600), leaving at least 400 a minute for
   pages. A league that runs out of room is left as it was and is first in
   line on the next run.
3. **Spread out** (`/api/archive/cron`, hourly). Each run takes leagues not
   updated in `LP_ARCHIVE_EVERY_HOURS` (20), oldest first, for up to four
   minutes. At 8 calls a league and 600 a minute, one run covers a few
   hundred leagues and a day several thousand; past that, raise the share
   or the interval, not the burst.

Environment: `DATABASE_URL` (added by the Neon integration),
`LP_DB_SCHEMA` (defaults to `public`; `npm run dev:hosted` uses `dev` so a
laptop never writes over the real archive), `LP_SLEEPER_JOB_RPM`,
`LP_ARCHIVE_EVERY_HOURS`.

Operating: `POST /api/platform/operator/archive { slug, full? }` archives a
league now (`full` re-reads every season, for example after a change to
what is kept); `GET ?slug=` shows what it holds, season by season. Schema
changes go in `schema.ts` as a new migration, never an edit to a shipped one.

## Constitution and rankings

**Constitution.** Each league's admin writes it in the admin panel
(`/admin?tab=constitution`); it is stored under the league's own prefix as
Markdown (`lp_constitution`, the last 30 published versions in
`lp_constitution_history`). A hosted league with nothing published shows only
its league settings: never the repository's `content/constitution.md`, which is
one particular league's rules. Admin text is rendered with raw HTML escaped
and script links removed (`safeMarkdown` in `src/lib/constitutionDoc.ts`).

**Rankings.** `src/lib/fantasyProsRefresh.ts`. The league's key (encrypted in
`lp_secrets`), its settings (`lp_fp_settings`: boards, scoring, daily on or
off) and its last run (`lp_fp_last_run`). The daily cron fans out one request
per live league, like the AI desk's; a league without a key returns at once.

## Franchises and Franchise HQ

Every manager in a league's history is a franchise (`/franchises`, built from
the archive). Someone with an account claims one from its page; an admin
approves it, or it is approved at once for the league's own admins and for
an email the admins invited. One franchise per account per league. See
`src/lib/franchise/`.

**Managing a franchise is a hosted perk.** Claims, the manage page and the
game itself (prices, building) need a LeaguePulse account, and accounts exist
only on the hosted product. A self-hosted copy with `DATABASE_URL` still gets
the franchise pages, stadiums, crowds, the front office log and the value
ranking, with every franchise on autopilot; its admin can edit a franchise's
public face (logo, color, motto, bio, and the stadium's style and look) at `/team/<id>/manage`
but not set prices or build. Without `DATABASE_URL` there are no franchises,
and the Franchises link is left out of the navigation.

**Stadium styles** (`src/lib/franchise/stadiumStyles.ts`,
`stadiumBlueprint.ts`) are cosmetic: a manager picks one of six (Classic Bowl,
Horseshoe, Grandstand, Dome, Cantilever, Coliseum) and dresses it (accent
color, seats, facade, lights, crowd, field, end zones, surroundings). Every
style buys the same upgrades for the same money and numbers; the blueprint
decides how each upgrade is built into that style, and the 3D view and the
studio's plan drawings both draw from it. Looks saved before styles existed
load as a Classic Bowl with their old choices kept (`normalizeLook`).

**Franchise HQ** (`src/lib/tycoon/`) runs each franchise as a business on real
results. `economy.ts` is a pure, deterministic replay of the franchise's whole
history, from opening day of its first archived season to now (a franchise that
left stops a week after its last game): daily merchandise, sponsors and upkeep; a game day each archived week
(crowds from fan interest against ticket price, then concessions, parking,
suites and sponsors); and the manager's decisions (prices, upgrades) in order,
from `tycoon_log:<franchiseId>` in the league's storage. Fan interest follows
form, weekly scoring rank, the stadium and the franchise's history; prices
well above fair breed resentment. Profit becomes VC (one per $4,000), spent in
the shop (`catalog.ts`). Every franchise starts the same; its history is what
separates them. Until a manager's first decision, the old front office runs it:
fair prices, and each offseason a share of the season's earnings reinvested
(60% after a winning season, 30% after a losing one; more seats and parking
only when crowds fill nine in ten), the owner taking the rest down to a small
reserve. The page's charts and books show the latest season. Stadiums, crowds and
the league's value ranking are public; prices and books are the manager's.

Balancing: the numbers live in `economy.ts` and `catalog.ts`, and
`tests/tycoon.test.ts` pins the behaviour (winning helps, gouging hurts,
no buying on credit, the replay is deterministic). A change to them reprices
every franchise's history at once, since the replay is recomputed each time.

## Gaps, and what admins can fill in

Old ESPN seasons (those ESPN only serves from `leagueHistory`) have scores,
standings, playoffs and the draft, but no lineups, moves or trades, only
ESPN's counts. The adapter marks such a season (`metadata.coverage` on its
league record), and pages say so in one quiet line, only for the season on
screen (`src/components/ui/DataGapNote.tsx`): Transactions and Matchups.
Rebuilt trades say so on hover over their week.

Admins fill gaps in under Admin → League data (`src/app/admin/data/`):

- **Trades and pickups** for any season, shown everywhere marked "Added by
  commissioner", with ESPN's count as the target.
- **Older seasons** from before the league used Sleeper or ESPN: teams (tied
  to existing managers so all-time records combine), weekly scores (typed, or
  pasted from a spreadsheet), the champion. Each is a league of its own,
  `manual-<year>`, linked in before the earliest real season.

Entries live in `manual_data_v1` under the league's prefix and are joined in
by `leagueFetch` as data is read (`src/lib/manual/`), so they show on every
page and deleting one restores the source exactly. Not yet: lineups and
corrections to the platform's own data.

## Operating it

Operator endpoints take `Authorization: Bearer $LP_OPERATOR_SECRET`.

```sh
# Every league, newest first, with status and plan
curl https://yourdomain.com/api/platform/operator/leagues -H "Authorization: Bearer $LP_OPERATOR_SECRET"

# A one-time admin recovery link (valid 24 hours) for a locked-out owner.
# Check the request comes from the league's Stripe customer email first.
curl -X POST https://yourdomain.com/api/platform/recover \
  -H "Authorization: Bearer $LP_OPERATOR_SECRET" -d '{"slug":"theirleague"}'
```

Terms of Service and the Privacy Policy are at `/legal/terms` and
`/legal/privacy`, linked from the landing page footer and the checkout step.
They are a reasonable starting point written from what the code actually
stores, not legal advice; have them read by someone qualified, and add your
legal entity and governing law, before charging real customers.

## Security notes

- Admin sign-in locks an IP out of a league for 15 minutes after 10 wrong
  passwords. Clerk accounts have their own lockout, breach checks and bot
  protection.
- Public AI features (the assistant, analytics questions) are limited per
  visitor and per league per day: `LP_AI_DAILY_CHAT` (default 300) and
  `LP_AI_DAILY_ASK` (default 200). Each league pays for its own AI.
- Every response refuses framing and sends the standard hardening headers
  (`next.config.js`). The vercel.app address redirects to the real domain.
- Commits are scanned for secret keys by `.githooks/pre-commit`; enable it per
  clone with `git config core.hooksPath .githooks`.
- A checkout whose address was taken while it was open is cancelled before
  any charge and listed in the operator panel.
- "Hand over" in the operator panel makes someone owner when they sign in with
  that email. Billing stays with whoever subscribed in Stripe.

## Still to build

- **Self-service password reset** by email (today the operator issues a
  recovery link), and inviting a second admin such as the commissioner.
- **Purging a cancelled league's data** after a grace period (the registry entry
  can be removed with `deleteTenant`; its `t:<slug>:` keys are left).
- **Custom domains** per league, such as moving your own league onto the platform.
- **A platform admin page** (today: the operator leagues endpoint).
