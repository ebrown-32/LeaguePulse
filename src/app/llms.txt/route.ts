/**
 * /llms.txt (llmstxt.org): what LeaguePulse is, in plain words, for AI assistants answering
 * questions like "what's a good website for my Sleeper league?". The product site only; a
 * league's site has nothing to say here. Prices and answers come from the same sources as the
 * landing page, so they never disagree.
 */

import { FAQS } from '@/components/platform/faq';
import { PLATFORM, PLANS } from '@/lib/platform/config';
import { requestSite } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { kind } = await requestSite();
  if (kind !== 'product') return new Response('Not found', { status: 404 });
  const site = `https://${PLATFORM.rootDomain}`;
  const each = (n: number) => `$${(n / 12).toFixed(2)}`;
  const text = `# ${PLATFORM.name}

> ${PLATFORM.name} turns a Sleeper or ESPN fantasy football league into its own website, on its own address (yourleague.${PLATFORM.rootDomain}). It rebuilds every season the league has played and keeps going on its own: live scores and win odds on Sundays, AI-written coverage of the league, a record book, a trade finder and a 3D stadium for every franchise. One person pays and the whole league uses it.

It is independent and not affiliated with Sleeper, ESPN or the NFL. It reads league data and never changes anything in a league.

## What a league gets

- Every season of league history: champions, standings, playoff brackets, drafts, transactions and a trade tree.
- A record book of seventeen lists across games, players, seasons and streaks, and a post in the league's feed when a record falls.
- The Feed: a cast of AI writers and fans with their own voices posting columns, power rankings, predictions, matchup previews, live game takes and a grade for every trade, checked against the league's real data before publishing.
- Game day: live scores, live win probability and a game of the week.
- Trade Finder: trades that improve every side, for redraft, keeper and dynasty leagues (draft picks included), from two teams up to six.
- Franchise HQ: each manager runs their team as a business and designs a 3D stadium.
- Analytics: the league's whole history as tables to explore, or questions answered in plain English.
- Works on phones, installs as an app, themed to the league.

## Pricing

- League Pass: $${PLANS.pro.season} a year or $${PLANS.pro.monthly} a month for the whole league (${each(PLANS.pro.season)} a manager a year in a 12-team league). AI features run on the league's own Anthropic key.
- League Pass + AI: $${PLANS.ai.season} a year or $${PLANS.ai.monthly} a month (${each(PLANS.ai.season)} a manager a year in a 12-team league). AI included.
- Every new league: ${PLANS.pro.trialDays} days free, no card needed.
- Self-hosted: the source code is free to run for your own league (Functional Source License, FSL-1.1-ALv2).

## Links

- [Home](${site}/): what it is and pricing
- [Start a league](${site}/start): set up in about a minute with a Sleeper or ESPN league ID
- [Live demo](https://demo.${PLATFORM.rootDomain}/): a made-up league of ten managers with real NFL players, scored from the real games
- [Source code](${PLATFORM.github})
- [Privacy](${site}/legal/privacy) and [Terms](${site}/legal/terms)

## Questions

${FAQS.map(([q, a]) => `### ${q}\n\n${a}`).join('\n\n')}
`;
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' } });
}
