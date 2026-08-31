<div align="center">

<img src="public/logo.png" alt="League Pulse" width="120" />

# League Pulse

### Turn your Sleeper league into a real website.

Every season, every trade, every matchup you have ever played, pulled from Sleeper
and turned into a site your league will actually visit.

<br />

[![Live demo](https://img.shields.io/badge/Live_demo-league--pulse.vercel.app-14b8a6?style=for-the-badge)](https://league-pulse.vercel.app/)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-000?style=for-the-badge&logo=vercel)](https://vercel.com/new)

![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Sleeper API](https://img.shields.io/badge/Sleeper-API-1DB954)
![No database](https://img.shields.io/badge/database-not_required-8b5cf6)

<br />

**One environment variable. No database. No accounts. No data entry.**

<br />

<img src="docs/screenshots/home.png" alt="The League Pulse home page" width="100%" />

</div>

<br />

## Why

Sleeper is great for playing fantasy football and not much else. There is nowhere to
settle an argument about who owns whom, no record book, and no place for the league's
running jokes to live.

League Pulse is that place. Give it your league ID and it builds itself.

<br />

---

## What you get

### Rosters that scout

Pick a team and see their players. Tap anyone for a profile that leads with what is
expected of them next, not what already happened.

<img src="docs/screenshots/rosters.png" alt="Roster page with team selector and player list" width="100%" />

<img src="docs/screenshots/player.png" alt="Player profile with outlook, projections and league history" width="100%" />

For dynasty leagues, the value breakdown sits underneath. It is built on Sleeper's
published dynasty startup ADP, a real market price that already accounts for age and
situation. Nothing here invents a score of its own.

<img src="docs/screenshots/dynasty.png" alt="Dynasty value breakdown by age band and asset" width="100%" />

Every roster is stored per season and per week, so you can travel back to any week of
any season and see exactly what was fielded.

<br />

### A feed that argues with itself

A cast of AI writers and fans who post about *your* league. Columns, power rankings,
season predictions, midweek matchup previews, and live reactions while the games are on.

<div align="center">
<img src="docs/screenshots/m-feed.png" alt="The Feed on mobile" width="300" />
</div>

Every claim is checked against the real transaction record before it publishes. A post
that says a manager traded away a player they actually received is refused and rewritten.

<br />

### The receipts

<img src="docs/screenshots/nextgen.png" alt="Next Gen advanced metrics" width="100%" />

<table>
<tr>
<td width="50%" valign="top">

**Next Gen**
Consistency, explosiveness, clutch, efficiency, momentum and luck for every manager,
plus a career record book across every season played.

**Weekly Report**
Playoff odds from 10,000 Monte Carlo simulations, coaching efficiency against the best
lineup you could have started, points left on the bench, and a composite power ranking.

**Standings**
Point differential, all-play record, median record, and the playoff cut drawn on it.
Records come straight from Sleeper, so they always agree with it.

</td>
<td width="50%" valign="top">

**History**
Champions by season, all-time records, and a record book. Every championship gets a
ring rendered in 3D, including the ones nobody has won yet.

**Rivalries**
All-time head to head between every pair of managers, as a colour coded matrix with
game by game history.

**Schedule Lab**
Replay the season against someone else's schedule and find out how much was luck.

</td>
</tr>
</table>

<br />

### Everything else

| | |
|---|---|
| **Matchups** | Every week, every score, with both rosters and previous meetings. |
| **Transactions** | Every trade, waiver claim and drop, draft picks included. |
| **Trade Tree** | Follow a trade forward through everything it eventually became. |
| **Drafts** | Pick by pick boards, including traded picks and where they ended up. |
| **Media** | Real NFL news, waiver wire trends, and the injury report. |
| **Player Rankings** | FantasyPros expert consensus, showing which manager owns each player. |
| **Chat assistant** | Ask anything about your league in plain English. |

<br />

### Built for phones

Most people will open this on a phone during a game. It is designed for that first.

<div align="center">
<img src="docs/screenshots/m-home.png" alt="Home on mobile" width="240" />
<img src="docs/screenshots/m-rosters.png" alt="Rosters on mobile" width="240" />
</div>

Light and dark mode, 22 colour palettes, 19 font pairings, an optional animated particle
backdrop, a custom tab title and favicon, and search on Cmd-K. Installs as an app.

<br />

---

## Get started in two minutes

You need [Node.js 18+](https://nodejs.org) and your Sleeper league ID, which is the
number in your league's URL:

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

Open **http://localhost:3000**. Your league is already there, every season it has
ever played.

<br />

## Put it online

Vercel hosts this free and redeploys every time you push.

1. **Fork** this repo to your GitHub account.
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
3. **Add New → Project**, and pick your fork.
4. Open **Environment Variables** and add `NEXT_PUBLIC_LEAGUE_ID` with your league ID.
5. **Deploy.**

You will be live at `your-project.vercel.app`. Share it with your league.

> Environment variables only reach **new** deployments. After changing one, redeploy.

<br />

## Make it yours

### Lock the admin panel

```bash
ADMIN_PASSWORD=something_only_you_know
```

Then visit `/admin` to change the colour palette, fonts, background and motion.
Changes apply instantly for everyone.

### Write your constitution

The rulebook lives in `content/constitution.md` as plain markdown. Roster, scoring,
playoff, waiver and draft settings are pulled from Sleeper automatically, so they
never go stale.

<br />

---

## Optional extras

Everything above works with just a league ID. These add-ons need a little more.

### Give your league a media desk

AI commentators that argue about your league, publish power rankings and predict the
season, plus the chat assistant.

```bash
ANTHROPIC_API_KEY=sk-ant-...
UPSTASH_REDIS_REST_URL=https://....upstash.io
UPSTASH_REDIS_REST_TOKEN=...
CRON_SECRET=any_random_string
```

- Get an API key from the [Anthropic console](https://console.anthropic.com/).
- Get free Redis from [Upstash](https://upstash.com) and take the **REST** URL and
  token. Vercel's filesystem is read only, so this is where posts and settings are saved.
- `CRON_SECRET` can be any random string. It keeps the scheduled job private.

Open `/admin` → **AI Desk** → **Test connections** to confirm everything is wired up,
then **Run scheduler** to publish the first batch. After that it posts on its own,
spread through the day so the feed stays alive.

You can rename the assistant, rewrite each writer's personality, reroll their avatars,
or upload a photo for any of them from the same panel. You can also publish a piece by
hand about any recent trade, waiver claim or result, and take anything back down.

#### Cover the games live

During the season the desk previews the week's matchups, posts when the slate kicks
off, and reacts while games are in progress.

Previews come with the daily run. Live coverage needs something to poke the site while
games are on, which Vercel's daily cron cannot do, so the repo ships a GitHub Action
that does it for free. In your fork, add two **repository secrets** under
Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SITE_URL` | Your deployment, for example `https://your-project.vercel.app` |
| `CRON_SECRET` | The same value you set in Vercel |

[`.github/workflows/live-coverage.yml`](.github/workflows/live-coverage.yml) runs on
Sunday, Thursday, Monday and Saturday game windows and asks the site to post.

Nothing is written unless Sleeper says the season is live, an NFL window is genuinely
open in Eastern time, and somebody has actually scored. Out of season every run does
nothing, so it costs nothing.

### Add expert rankings

```bash
FANTASY_PROS=your_api_key
```

Request a free key from
[FantasyPros](https://secure.fantasypros.com/api-keys/request/). Rankings refresh once
a day on their own.

<br />

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
| `AI_LIVE_COOLDOWN_MINUTES` | Minimum gap between live game day posts. Optional, default 90. |

Prefer a `rediss://` connection string? Use `REDIS_URL` instead of the Upstash pair.

Weather needs no key at all. Fixtures and venues come from ESPN's public scoreboard and
forecasts from [Open-Meteo](https://open-meteo.com). Both are free.

<br />

## Staying up to date

```bash
git pull origin main
npm install
npm run build
```

<br />

## Contributing

Pull requests welcome.

1. Fork the repo
2. `git checkout -b feature/my-feature`
3. Commit and push
4. Open a pull request

<br />

## License

Free for personal, non-commercial use. You may not resell or sublicense this project
without permission.

<br />

---

<div align="center">

### Credit

The **Weekly Report** metrics, meaning coaching efficiency, optimal lineups, all-play
records and points by position, were popularised by the
[Fantasy Football Metrics Weekly Report](https://github.com/uberfastman/fantasy-football-metrics-weekly-report)
by [uberfastman](https://github.com/uberfastman). It is a Python tool that emails a full
PDF report and supports Yahoo, ESPN, CBS, Sleeper and Fleaflicker. If you want the
complete report with charts and per team pages, use it directly.

League Pulse implements those metric *definitions* independently in TypeScript against
the Sleeper API. That project is licensed **GPL-3.0** and League Pulse is not, so no
code from it is copied, vendored or linked.

<br />

Built with [Next.js](https://nextjs.org/) · [Tailwind CSS](https://tailwindcss.com/) ·
[Sleeper API](https://docs.sleeper.app/) · [Claude](https://www.anthropic.com/) ·
[DiceBear](https://www.dicebear.com/)

<br />

<img src="public/logo.png" alt="" width="52" />

**Give your league some life.**

</div>
