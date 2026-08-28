<div align="center">

# League Pulse

**Turn your Sleeper league into a real website.**

Standings, rivalries, history, drafts, roster tools, expert rankings, an AI media desk, and a chat assistant that actually knows your league — all from a single league ID.

[**View the live demo →**](https://league-pulse.vercel.app/)

Next.js · TypeScript · Tailwind CSS · Sleeper API

</div>

---

## What this is

Sleeper is great for playing fantasy football and not much else. There is nowhere to settle an argument about who owns whom, no record book, no place for the league's running jokes to live.

League Pulse is that place. Give it your league ID and it pulls everything from Sleeper automatically — every season, every trade, every matchup you have ever played — and turns it into a site your league will actually visit.

**No database to set up. No accounts to create. No data to enter.** One environment variable and it builds itself.

---

## What you get

### Every week
- **Home** — league status, the current story, and this week's matchups. Tap any matchup for both rosters, previous meetings, and a rivalry score.
- **Matchups** — every week, every score, same drill-down.
- **Rosters** — every team, with player production and a drill-down into any player's stats and transaction history.
- **Transactions** — every trade, waiver claim, and drop, draft picks included.

### The receipts
- **Rivalries** — all-time head-to-head between every pair of managers, as a colour-coded matrix with game-by-game history.
- **History** — champions by season, all-time records, and a record book. Champions get a 3D championship ring.
- **Next Gen** — consistency, explosiveness, clutch, efficiency, momentum, and luck for every manager.
- **Schedule Lab** — replay the season against someone else's schedule and find out how much was luck.
- **Drafts** — pick-by-pick boards, including traded picks and where they ended up.
- **Trade Tree** — follow a trade forward through everything it eventually became.

### The fun part
- **Media** — real NFL news, waiver wire trends, and the injury report.
- **AI Desk** — a cast of AI sports commentators who write opinion columns, power rankings, and season predictions about *your* league. They read the actual record, take sides, and name names.
- **Game day** — midweek previews that pick every matchup, a post when the slate kicks off, and live reactions while the games are on, all read off the real scoreboard.
- **Player Rankings** — FantasyPros expert consensus, weekly and dynasty, showing which of your managers owns each player.
- **Chat assistant** — ask anything about your league in plain English. It reads your live Sleeper data and can search the web for NFL news.

Light and dark mode, 22 colour palettes, 19 font pairings, works on any screen, installs as an app.

---

## Get started in two minutes

You need [Node.js 18+](https://nodejs.org) and your Sleeper league ID — the number in your league's URL:

```
https://sleeper.app/leagues/1234567890123456789
                            └──── this ────┘
```

```bash
git clone https://github.com/ebrown-32/LeaguePulse
cd LeaguePulse
npm install
```

Create a file called `.env.local`:

```bash
NEXT_PUBLIC_LEAGUE_ID=paste_your_league_id_here
```

```bash
npm run dev
```

Open **http://localhost:3000**. Your league is already there — every season it has ever played.

---

## Put it online

Vercel hosts this free and redeploys every time you push.

1. **Fork** this repo to your GitHub account.
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
3. **Add New → Project**, and pick your fork.
4. Open **Environment Variables** and add `NEXT_PUBLIC_LEAGUE_ID` with your league ID.
5. **Deploy.**

You will be live at `your-project.vercel.app`. Share it with your league.

> Environment variables only reach **new** deployments. After changing one, redeploy.

---

## Make it yours

### Lock the admin panel

```bash
ADMIN_PASSWORD=something_only_you_know
```

Then visit `/admin` to change the colour palette, fonts, background, and motion. Changes apply instantly for everyone.

### Write your constitution

The rulebook lives in `content/constitution.md` — plain markdown, write whatever your league needs. Roster, scoring, playoff, waiver, and draft settings are pulled from Sleeper automatically, so they never go stale.

---

## Optional extras

Everything above works with just a league ID. These two add-ons need a little more.

### Give your league a media desk

AI commentators that argue about your league, publish power rankings, and predict the season — plus the chat assistant.

```bash
ANTHROPIC_API_KEY=sk-ant-...
UPSTASH_REDIS_REST_URL=https://....upstash.io
UPSTASH_REDIS_REST_TOKEN=...
CRON_SECRET=any_random_string
```

- Get an API key from the [Anthropic console](https://console.anthropic.com/).
- Get free Redis from [Upstash](https://upstash.com) — take the **REST** URL and token. Vercel's filesystem is read-only, so this is where posts and settings are saved.
- `CRON_SECRET` can be any random string; it keeps the scheduled job private.

Then open `/admin` → **AI Desk** → **Test connections** to confirm everything is wired up, and **Run scheduler** to publish the first batch. After that it posts on its own, twice a day, spread out so the feed stays alive.

You can rename the assistant, rewrite each commentator's personality, reroll their avatars, or upload a photo for any of them from the same panel.

#### Cover the games live

During the season the desk also previews the week's matchups, posts when the slate kicks off, and reacts while games are in progress.

Previews come with the daily run. Live coverage needs something to poke the site while games are on, which Vercel's daily cron cannot do, so the repo ships a GitHub Action that does it for free. In your fork, add two **repository secrets** under Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SITE_URL` | Your deployment, e.g. `https://your-project.vercel.app` |
| `CRON_SECRET` | The same value you set in Vercel |

That is all. [`.github/workflows/live-coverage.yml`](.github/workflows/live-coverage.yml) runs on Sunday, Thursday, Monday and Saturday game windows and asks the site to post.

Nothing is written unless Sleeper says the season is live, an NFL window is genuinely open in Eastern time, and somebody has actually scored. Out of season every run is a no-op, so it costs nothing. Set `AI_LIVE_COOLDOWN_MINUTES` to change how often it may post (default 90).

### Add expert rankings

```bash
FANTASY_PROS=your_api_key
```

Request a free key from [FantasyPros](https://secure.fantasypros.com/api-keys/request/). Rankings refresh once a day on their own.

---

## All environment variables

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_LEAGUE_ID` | **Everything.** Your Sleeper league ID. |
| `ADMIN_PASSWORD` | The admin panel. Set this before going public. |
| `ANTHROPIC_API_KEY` | AI desk and chat assistant. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Saving anything in production. |
| `CRON_SECRET` | Keeping the scheduled jobs private. |
| `FANTASY_PROS` | Player Rankings. |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Analytics. Optional. |
| `AI_LIVE_COOLDOWN_MINUTES` | Minimum gap between live game-day posts. Optional, default 90. |

Prefer a `rediss://` connection string? Use `REDIS_URL` instead of the Upstash pair.

---

## Staying up to date

```bash
git pull origin main
npm install
npm run build
```

---

## Contributing

Pull requests welcome.

1. Fork the repo
2. `git checkout -b feature/my-feature`
3. Commit and push
4. Open a pull request

---

## License

Free for personal, non-commercial use. You may not resell or sublicense this project without permission.

---

<div align="center">

Built with [Next.js](https://nextjs.org/) · [Tailwind CSS](https://tailwindcss.com/) · [Sleeper API](https://docs.sleeper.app/) · [Claude](https://www.anthropic.com/) · [DiceBear](https://www.dicebear.com/)

</div>
