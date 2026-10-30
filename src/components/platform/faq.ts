/**
 * The product site's questions and answers: shown on the landing page (Landing, Faq) and handed to
 * search engines and AI assistants as the page's FAQ structured data (app/landing/page.tsx) and
 * in /llms.txt. One list, so what's read and what's indexed never disagree.
 */

import { PLATFORM, PLANS } from '@/lib/platform/config';
import { STYLE_ORDER } from '@/lib/franchise/stadiumStyles';

const perManager = `$${(PLANS.pro.season / 12).toFixed(2)}`;

export const FAQS: [question: string, answer: string][] = [
  ['Is this made by Sleeper or ESPN?', `No. ${PLATFORM.name} is independent. It reads the public data Sleeper publishes for every league, or your league’s data from ESPN. It never asks for your password and never changes anything in your league.`],
  ['Does it work with ESPN?', 'Yes. Paste your ESPN league ID. Most ESPN leagues are private, so one member copies two cookies from their browser once (sign-up shows how). ESPN signs those out after about a year, and your admin page asks for fresh ones when it does. Scores, standings, history, drafts and trades all come across.'],
  ['Does everyone in the league have to pay?', 'No. One subscription covers the whole league. Everyone else just opens the link.'],
  ['How much does it cost?', `League Pass is $${PLANS.pro.season} a year or $${PLANS.pro.monthly} a month for the whole league, about ${perManager} a manager for a year in a 12-team league. League Pass + AI is $${PLANS.ai.season} a year or $${PLANS.ai.monthly} a month. Every new league gets ${PLANS.pro.trialDays} days free, no card needed.`],
  ['Why isn’t it free?', `The code is free to run yourself. The paid plan is for convenience, because running a site that a dozen people refresh every thirty seconds on Sunday costs real money, and so does the person keeping it up. Split across a 12-team league, the hosted version is ${perManager} a head for the year. I’m happy to handle it for you.`],
  ['Dynasty, keeper, redraft?', 'All of them. Any Sleeper or ESPN league, any scoring. Every season is linked together, so dynasty and keeper history carries through.'],
  ['Is our league’s data ours?', 'Yes. Every season LeaguePulse reads, every score, lineup, trade and draft pick, is kept in your league’s own archive, even if Sleeper or ESPN later lets it go. Admins can download all of it as Excel, CSV or JSON whenever they like, so you are never locked in.'],
  ['How does the AI get paid for?', 'Two ways. On League Pass, your league adds its own Anthropic API key and pays Anthropic directly, with a monthly cap you set. On League Pass + AI it’s included: we run it, within generous limits. Everything that isn’t AI works either way.'],
  ['Will the AI make things up?', 'It writes from your league’s real data, and every post is checked against the standings, trades and live game status before it goes up. Anything that fails the check is rewritten or dropped.'],
  ['What is Franchise HQ?', `A game inside the app, included with League Pass. Each manager claims their team and runs it as a business on your league’s real results: ticket prices, crowds, upgrades, and a 3D stadium in one of ${STYLE_ORDER.length} styles, dressed in their own colors. Franchise values count every season you have played, championships included.`],
  ['Who controls the settings?', 'Whoever sets it up is the admin: name, colors, logo, the cast of writers and what gets posted.'],
  ['What about the offseason?', 'The site stays up with all its history. On the monthly plan you can cancel and come back before the draft.'],
];
