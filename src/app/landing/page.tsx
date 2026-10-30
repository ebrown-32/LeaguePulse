import type { Metadata } from 'next';
import Landing from '@/components/platform/Landing';
import { FAQS } from '@/components/platform/faq';
import { PLATFORM, PLANS } from '@/lib/platform/config';

// The product's front page (the bare domain rewrites here, see proxy.ts): its one address.
export const metadata: Metadata = { alternates: { canonical: '/' } };

/**
 * Structured data for search engines and AI assistants: who makes LeaguePulse, what it is and
 * costs, and the same questions and answers the page shows (components/platform/faq).
 */
function structuredData() {
  const site = `https://${PLATFORM.rootDomain}`;
  const offer = (name: string, price: number, period: 'P1Y' | 'P1M') => ({
    '@type': 'Offer', name, price, priceCurrency: 'USD', url: `${site}/start`,
    priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'USD', billingDuration: period, unitText: period === 'P1Y' ? 'YEAR' : 'MONTH' },
  });
  return [
    {
      '@context': 'https://schema.org', '@type': 'Organization', name: PLATFORM.name, url: site,
      logo: `${site}/brand/leaguepulse-512.png`, sameAs: [PLATFORM.github],
    },
    {
      '@context': 'https://schema.org', '@type': 'WebSite', name: PLATFORM.name, url: site,
    },
    {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: PLATFORM.name, url: site,
      applicationCategory: 'SportsApplication', operatingSystem: 'Web, iOS, Android',
      description: 'Turns a Sleeper or ESPN fantasy football league into its own website: full league history and record book, AI-written coverage, live win odds, a trade finder and 3D franchise stadiums.',
      featureList: ['Sleeper and ESPN leagues', 'Every season of league history and a record book', 'AI beat writers and trade grades', 'Live scores and win probability', 'Trade finder for up to six teams', '3D stadiums for every franchise', 'Self-serve analytics in plain English'],
      offers: [
        offer('League Pass, yearly', PLANS.pro.season, 'P1Y'), offer('League Pass, monthly', PLANS.pro.monthly, 'P1M'),
        offer('League Pass + AI, yearly', PLANS.ai.season, 'P1Y'), offer('League Pass + AI, monthly', PLANS.ai.monthly, 'P1M'),
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: FAQS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];
}

export default function LandingPage() {
  return (
    <>
      {/* JSON in a script tag: '<' escaped so no answer can close the tag early. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, '\\u003c') }} />
      <Landing />
    </>
  );
}
