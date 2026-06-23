# League Pulse

A full-featured website for your Sleeper fantasy football league. Built with Next.js, TypeScript, and Tailwind CSS.

Live demo: https://league-pulse.vercel.app/

---

## What's included

### Weekly tools
- **Overview** — Standings, recent scores, league activity, and a snapshot of the current week at a glance.
- **Matchups** — Full matchup breakdown for every week of the season, with scores and team info.
- **Transactions** — A feed of every trade, waiver pickup, and drop across the whole season.

### League intelligence
- **Rivalry Tracker** — All-time head-to-head records between every pair of managers. Includes a color-coded matrix, win percentages, and a game-by-game history for any matchup.
- **History** — Season-by-season champions, runner-ups, all-time records, and a record book for high scores, low scores, and more. Champions get a 3D rotating championship ring.
- **Next-Gen Stats** — Advanced analytics for every manager: consistency, explosiveness, clutch factor, efficiency, momentum, and luck scores. Includes a radar chart and weekly score breakdown.

### League reference
- **Drafts** — Past draft results with full pick-by-pick boards. Shows traded picks and final ownership.
- **Constitution** — A beautiful, searchable league rulebook. League settings (roster, scoring, playoffs, waivers, draft format) are pulled live from Sleeper and stay up to date automatically. The rest is yours to customize in a single markdown file.
- **Media** — Live NFL news and league media content.

### Design
- Responsive layout that works on any screen size.
- Dark and light mode.
- Connects to your Sleeper account automatically using just your league ID.

---

## Setup

### What you need

- Node.js 18 or later
- A Sleeper fantasy football league
- Your Sleeper league ID (found in your league URL: `sleeper.app/leagues/YOUR_ID`)

### Run locally

```bash
git clone https://github.com/ebrown-32/LeaguePulse
cd LeaguePulse
npm install
```

Create a file named `.env.local` in the project folder:

```
NEXT_PUBLIC_LEAGUE_ID=your_sleeper_league_id
NEXT_PUBLIC_MIXPANEL_TOKEN=your_mixpanel_project_token
```

`NEXT_PUBLIC_MIXPANEL_TOKEN` is optional. If omitted, analytics are silently disabled.

Then start the app:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### Deploy to Vercel (free, recommended)

Vercel is the easiest way to put your league site online.

1. Fork this repo to your GitHub account.
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
3. Click **Add New > Project** and select your forked repo.
4. Before clicking Deploy, open **Environment Variables** and add:
   - Name: `NEXT_PUBLIC_LEAGUE_ID`
   - Value: your Sleeper league ID
5. Click **Deploy**.

Your site will be live at `your-project-name.vercel.app`. Any time you push changes to GitHub, Vercel redeploys automatically.

---

## Customizing the look and feel

League Pulse has a built-in appearance editor at `/admin/appearance`. From there you can change the accent color, font pairing, and border radius to match your league's style. Changes apply instantly and are saved for all visitors.

To access the admin page, you need to set an admin password in your environment variables:

```
ADMIN_PASSWORD=your_password_here
```

If you skip this, the default password is `admin123`. Change it before deploying publicly.

On Vercel, add `ADMIN_PASSWORD` the same way you added your league ID: go to your project settings, open **Environment Variables**, and add it there. Redeploy after saving.

Once logged in, go to `/admin/appearance` on your site to open the editor.

---

## Customizing the constitution

The league rulebook lives in `content/constitution.md`. Open it in any text editor and write your rules in standard markdown. The sections for roster, scoring, playoffs, waivers, and draft format are pulled from Sleeper automatically and do not need to be written manually.

---

## Updating

```bash
git pull origin main
npm install
npm run build
```

---

## Contributing

Pull requests are welcome.

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Commit your changes and push
4. Open a pull request

---

## License

Free for personal, non-commercial use. You may not resell or sublicense this project without permission.

---

Built with [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/), and the [Sleeper API](https://docs.sleeper.app/).
