/**
 * Guide pages on the product site, one per thing people search for when they want what
 * LeaguePulse does: a website for a Sleeper or ESPN league, a trade finder, a record book, or how
 * to make a league website at all. Each answers its question properly, with a real screenshot
 * from the demo league, and ends at a free trial. Rendered by components/platform/SeoPage.
 *
 * Prices come from the plan config, so a page never quotes a price the checkout doesn't charge.
 */

import { PLANS } from '@/lib/platform/config';
import type { SeoSlug } from './paths';

export interface SeoSection { heading: string; body?: string[]; points?: [title: string, text: string][] }

export interface SeoPage {
  slug: SeoSlug;
  /** The search result's title and description. */
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  shot: { src: string; alt: string };
  sections: SeoSection[];
  steps?: { heading: string; items: [title: string, text: string][] };
  faqs: [question: string, answer: string][];
  /** The link label other guides use for this one. */
  label: string;
  /** A source the page must credit with a visible link (FantasyCalc's terms ask it of every page showing its values). */
  credit?: { text: string; name: string; href: string };
}

const each = (n: number) => `$${(n / 12).toFixed(2)}`;
const price = `From ${each(PLANS.pro.season)} a manager a year in a 12-team league ($${PLANS.pro.season} for the whole league), with ${PLANS.pro.trialDays} days free and no card needed.`;

export const SEO_PAGES: Record<SeoSlug, SeoPage> = {
  'sleeper-league-website': {
    slug: 'sleeper-league-website',
    label: 'A website for your Sleeper league',
    title: 'Sleeper League Website: History, Records & AI | LeaguePulse',
    description: `Turn your Sleeper fantasy league into its own website with every season of history, a record book, live win odds and AI beat writers. Set up with your league ID in a minute. ${price}`,
    eyebrow: 'For Sleeper leagues',
    h1: 'A real website for your Sleeper league',
    intro: 'Sleeper is a great place to set lineups and talk trash in the chat. It is not a great place to remember anything. LeaguePulse reads your Sleeper league and builds the site it deserves: every season since the league started, a record book, live game day and writers who cover your league like a beat.',
    shot: { src: '/seo/gameday.jpg', alt: 'A Sleeper league home page on game day, with the game of the week and live win odds' },
    sections: [
      { heading: 'What your Sleeper league gets', points: [
        ['Every season, linked', 'Sleeper starts a new league each season and links it to the last. LeaguePulse follows that chain back to your first season, so dynasty and keeper history carries through and every all-time record counts every year.'],
        ['A record book', 'Seventeen lists across games, players, seasons and streaks: biggest blowouts, closest games, the most points that still lost, the best player games and streaks that run across seasons.'],
        ['Game day, live', 'Live scores and win probability while the games are on, a game of the week, and a board that knows whose players are still to play.'],
        ['AI beat writers', 'Columns, power rankings, previews and a grade for every trade, written about your league and checked against its real data before they post.'],
        ['A trade finder', 'Trade ideas that make both sides better, for redraft, keeper and dynasty leagues, from two teams up to six.'],
        ['A franchise for every manager', 'Each manager runs their team as a business and designs a 3D stadium for it.'],
      ] },
      { heading: 'How it works with Sleeper', body: [
        'Sleeper publishes every league’s data through its public API: rosters, matchups, transactions, drafts and playoff brackets. LeaguePulse reads that, nothing more. It never asks for your Sleeper password and never changes anything in your league.',
        'Each finished season is archived on our side, so your history keeps loading quickly and stays yours even if a season ever disappears from Sleeper. Admins can export all of it as Excel, CSV or JSON.',
      ] },
      { heading: 'What it costs', body: [`One person pays and the whole league uses it. League Pass is $${PLANS.pro.season} a year or $${PLANS.pro.monthly} a month for the league, which is ${each(PLANS.pro.season)} a manager a year split twelve ways. League Pass + AI, with the AI writers included, is $${PLANS.ai.season} a year. Every league starts with ${PLANS.pro.trialDays} days free, no card needed.`] },
    ],
    steps: { heading: 'Set it up in a minute', items: [
      ['Copy your league ID', 'Open your league on sleeper.com. The long number at the end of the address is the league ID.'],
      ['Paste it at leaguepulse.io/start', 'Pick your address, like yourleague.leaguepulse.io. Your whole history builds while you watch.'],
      ['Send the link to the group chat', 'Everyone else just opens it. No accounts or downloads needed, though it installs as an app on phones.'],
    ] },
    faqs: [
      ['Is LeaguePulse made by Sleeper?', 'No. LeaguePulse is independent and not affiliated with Sleeper. It reads the public data Sleeper publishes for every league.'],
      ['Does it need my Sleeper password?', 'No. It only needs your league ID, and it never changes anything in your league.'],
      ['Does it work for dynasty and keeper leagues?', 'Yes. Every season is linked to the one before, so dynasty and keeper history, records and rivalries carry through every year.'],
      ['How far back does the history go?', 'To your league’s first season on Sleeper, as long as each season was renewed from the last.'],
      ['Does everyone in the league have to pay?', 'No. One subscription covers the whole league.'],
    ],
  },

  'espn-fantasy-league-website': {
    slug: 'espn-fantasy-league-website',
    label: 'A website for your ESPN league',
    title: 'ESPN Fantasy League Website: History & Records | LeaguePulse',
    description: `Give your ESPN fantasy football league its own website: every season of history, a record book, live win odds, a trade finder and AI writers. Works with private ESPN leagues. ${price}`,
    eyebrow: 'For ESPN leagues',
    h1: 'A website for your ESPN fantasy league',
    intro: 'ESPN keeps your league running. It does not keep your league’s story. LeaguePulse reads your ESPN league, private ones included, and turns every season you have played into a site with its own record book, live game day and writers covering your league.',
    shot: { src: '/seo/records.jpg', alt: 'An ESPN league record book showing the best player games in league history' },
    sections: [
      { heading: 'What your ESPN league gets', points: [
        ['Every season you have played', 'ESPN keeps one league ID across seasons. LeaguePulse reads each of them, so champions, records and head-to-head history go back to the start.'],
        ['A record book that keeps itself', 'Seventeen lists, with playoff and consolation games told apart from the bracket, and a post in the feed when a record falls.'],
        ['Game day, live', 'Live scores, live win probability and a game of the week while the games are on.'],
        ['AI beat writers', 'Columns, trade grades and live takes about your league, checked against its real data before they post.'],
        ['Rivalries and analytics', 'All-time head to head between every pair of managers, and your league’s whole history as tables you can explore or ask about in plain English.'],
        ['Franchises', 'Every manager runs their team and designs a 3D stadium for it.'],
      ] },
      { heading: 'Private ESPN leagues', body: [
        'Most ESPN leagues are private, so ESPN only shares them with signed-in members. One member copies two cookies from their browser, called SWID and espn_s2, once during setup. Sign-up shows exactly where to find them.',
        'They are stored encrypted, used only to read your league, and never shown again. ESPN signs them out after about a year, and your admin page asks for fresh ones when it does. LeaguePulse never sees an ESPN password and never changes anything in your league.',
      ] },
      { heading: 'What it costs', body: [`League Pass is $${PLANS.pro.season} a year or $${PLANS.pro.monthly} a month for the whole league, ${each(PLANS.pro.season)} a manager a year in a 12-team league. League Pass + AI is $${PLANS.ai.season} a year. ${PLANS.pro.trialDays} days free, no card needed.`] },
    ],
    steps: { heading: 'Set it up', items: [
      ['Find your league ID', 'Open your league on ESPN. The leagueId in the address is the number you need.'],
      ['Start at leaguepulse.io/start', 'Paste the ID. If the league is private, sign-up shows where to copy the two cookies from.'],
      ['Share the link', 'Your league’s site is live at its own address. Everyone else just opens it.'],
    ] },
    faqs: [
      ['Is LeaguePulse made by ESPN?', 'No. LeaguePulse is independent and not affiliated with ESPN or the NFL.'],
      ['Does it work with private ESPN leagues?', 'Yes. One member provides two ESPN cookies once during setup. They are stored encrypted and used only to read the league.'],
      ['Will it change anything in my ESPN league?', 'No. It only reads your league’s data.'],
      ['What happens when the ESPN cookies expire?', 'ESPN signs them out after about a year. Your league’s admin page asks for fresh ones, and nothing is lost in the meantime.'],
      ['Does it support dynasty and keeper ESPN leagues?', 'Yes, with history carried through every season.'],
    ],
  },

  'fantasy-football-trade-finder': {
    slug: 'fantasy-football-trade-finder',
    label: 'A trade finder for your league',
    credit: { text: 'Trade values from', name: 'FantasyCalc', href: 'https://fantasycalc.com' },
    title: 'Fantasy Football Trade Finder for Dynasty & Redraft | LeaguePulse',
    description: `Find fantasy football trades that help both sides, built from your league’s real rosters. Redraft, keeper and dynasty leagues, draft picks included, up to six teams. For Sleeper and ESPN.`,
    eyebrow: 'Trade Finder',
    h1: 'A fantasy football trade finder that helps both sides',
    intro: 'Most trade offers fail because they only help the person sending them. LeaguePulse’s Trade Finder looks at every roster in your league and deals out trades where every team comes away better, as a feed you swipe through like highlights.',
    shot: { src: '/seo/trades.jpg', alt: 'A three-team trade suggestion showing what each team gets and how its lineup improves' },
    sections: [
      { heading: 'How it finds trades', points: [
        ['Built from your league', 'It reads every roster, every lineup slot and your league’s scoring, then looks for trades that fill each team’s holes from someone else’s depth.'],
        ['Both sides better', 'Each suggestion shows how many points a week it adds to every starting lineup involved, and how fair the values are, graded A+ to F.'],
        ['Redraft, keeper or dynasty', 'Win-now leagues weigh this season’s points. Dynasty leagues weigh long-term value too, and draft picks are part of the deals.'],
        ['Two teams to six', 'Simple swaps, three-way deals, and loops of five or six teams when that is what it takes for everyone to win.'],
        ['A creativity dial', 'Slide from safe, even swaps to consolidations, buy-lows and blockbusters.'],
        ['Filters', 'Pick the teams, positions and goals that matter to you.'],
      ] },
      { heading: 'Where the values come from', body: [
        'Player values come from FantasyCalc’s market values, which follow real trades across thousands of leagues, combined with weekly projections and your league’s own scoring. Trade Finder is part of your league’s LeaguePulse site, alongside its history, records, live game day and AI writers.',
      ] },
    ],
    steps: { heading: 'Try it on your league', items: [
      ['Start a free trial', 'Paste your Sleeper or ESPN league ID at leaguepulse.io/start.'],
      ['Open Trade Finder', 'Trades for your league are ready in a minute, and refreshed through the day.'],
      ['Send one', 'Found a good one? Share it with the managers involved.'],
    ] },
    faqs: [
      ['Does the trade finder work for dynasty leagues?', 'Yes. Dynasty leagues weigh long-term value and include draft picks in the trades.'],
      ['Can it suggest trades with more than two teams?', 'Yes, from two teams up to six.'],
      ['How does it decide a trade is fair?', 'It compares the value each side gives and gets, and how much each starting lineup improves, and grades the balance from A+ to F.'],
      ['Which platforms does it support?', 'Sleeper and ESPN leagues.'],
    ],
  },

  'fantasy-league-record-book': {
    slug: 'fantasy-league-record-book',
    label: 'A record book for your league',
    title: 'Fantasy Football League Record Book | LeaguePulse',
    description: 'An all-time record book for your fantasy football league, built automatically from every season you have played on Sleeper or ESPN: records, streaks, champions and rivalries.',
    eyebrow: 'Record Book',
    h1: 'An all-time record book for your fantasy league',
    intro: 'Every league has the argument: was that the highest score ever, or does someone remember a bigger one? LeaguePulse settles it. It builds your league’s record book from every season you have played, keeps it up to date every week, and tells the whole league when a record falls.',
    shot: { src: '/seo/records.jpg', alt: 'A fantasy league record book listing the best player games in league history' },
    sections: [
      { heading: 'Seventeen records, kept automatically', points: [
        ['Games', 'Highest and lowest scores, biggest blowouts, closest games, shootouts, the most points that still lost and the fewest that still won.'],
        ['Players', 'The best single-game performances by a starter, and the best ones left on the bench.'],
        ['Seasons', 'Most and fewest points, best records, toughest schedules and regular-season titles.'],
        ['Streaks', 'Winning and losing streaks that carry from one season into the next, and runs of winning seasons.'],
      ] },
      { heading: 'Done properly', body: [
        'Playoff games are told apart from consolation games using your league’s actual bracket, so a meaningless consolation matchup never passes for postseason history. Seasons still in progress don’t count for season records until they are finished.',
        'When a result breaks a record, the league’s feed covers it: a writer on the AI desk, or the record holder’s own franchise account.',
      ] },
      { heading: 'The rest of your league’s history', points: [
        ['Champions', 'Every champion, with a ring rendered in 3D, and every playoff bracket.'],
        ['Rivalries', 'All-time head to head between every pair of managers, game by game.'],
        ['Manager profiles', 'Career records, finishes and the records each manager holds.'],
      ] },
    ],
    faqs: [
      ['How far back does the record book go?', 'To your league’s first season on Sleeper or ESPN.'],
      ['Do playoff games count?', 'Yes. Title-bracket games are marked as playoffs, and consolation games are marked separately.'],
      ['Do I have to enter anything?', 'No. Everything is read from your league automatically and updated every week.'],
    ],
  },

  'how-to-make-a-fantasy-football-league-website': {
    slug: 'how-to-make-a-fantasy-football-league-website',
    label: 'How to make a league website',
    title: 'How to Make a Fantasy Football League Website (2026)',
    description: 'Four ways to make a website for your fantasy football league, from a shared spreadsheet to a site built automatically from Sleeper or ESPN, with what each costs in time and money.',
    eyebrow: 'Guide',
    h1: 'How to make a website for your fantasy football league',
    intro: 'A league website is where the history lives: champions, records, rivalries and the trash talk that outlasts the group chat. Here are the four ways commissioners usually do it, and what each one costs you.',
    shot: { src: '/seo/stadium.jpg', alt: 'A fantasy league franchise page with a 3D stadium designed by its manager' },
    sections: [
      { heading: '1. A shared spreadsheet or document', body: [
        'Free and quick to start. Someone records champions and records by hand in Google Sheets or a shared doc. It works for a season or two, then falls behind, because every number has to be typed in and nobody wants to be the one doing it.',
      ] },
      { heading: '2. A website builder', body: [
        'Google Sites, Squarespace or WordPress give you pages that look nicer than a spreadsheet, for free up to about $20 a month. The content is still entered by hand, so it has the same problem: it is only as current as the commissioner’s free time.',
      ] },
      { heading: '3. Build your own from the league’s data', body: [
        'Sleeper and ESPN expose league data, so a site can build itself from it. That is how LeaguePulse works, and its source code is free to run for your own league: you host it on Vercel, add your league ID, and add a database and an AI key if you want the AI writers. It is free in money but not in time, and you keep it updated yourself.',
      ] },
      { heading: '4. A hosted league site', body: [
        `The same thing, done for you. With LeaguePulse’s hosted version you paste your league ID and get a site at its own address in about a minute, with every season of history, a record book, live game day, a trade finder, AI writers and a 3D stadium for every franchise. It is $${PLANS.pro.season} a year for the whole league, ${each(PLANS.pro.season)} a manager in a 12-team league, with ${PLANS.pro.trialDays} days free.`,
      ] },
      { heading: 'What a good league website has', points: [
        ['Every season, not just this one', 'The history is the point. It should go back to the league’s first year, automatically.'],
        ['Records that update themselves', 'If someone has to type them in, they stop being updated.'],
        ['Something new every week', 'Previews, recaps and power rankings give people a reason to come back.'],
        ['Works on phones', 'Most people open it during a game, on a phone.'],
      ] },
    ],
    steps: { heading: 'The quickest way', items: [
      ['Find your league ID', 'On Sleeper it is the number in your league’s address. On ESPN it is the leagueId in the address.'],
      ['Paste it at leaguepulse.io/start', 'Pick an address for your league. The history builds while you watch.'],
      ['Share the link', 'Send it to the group chat. Done.'],
    ] },
    faqs: [
      ['What is the easiest way to make a fantasy league website?', 'Use a site that builds itself from your league’s data, so nothing has to be entered by hand. LeaguePulse does that for Sleeper and ESPN leagues in about a minute.'],
      ['Can I make a fantasy league website for free?', 'Yes. A spreadsheet or website builder is free, and LeaguePulse’s source code is free to run yourself if you are comfortable hosting it.'],
      ['How much does a hosted league website cost?', `LeaguePulse is $${PLANS.pro.season} a year for the whole league, about ${each(PLANS.pro.season)} a manager in a 12-team league, with ${PLANS.pro.trialDays} days free.`],
    ],
  },
};
