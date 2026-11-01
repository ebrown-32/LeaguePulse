/**
 * A guide page on the product site (lib/seo/pages): a plain, fast, server-rendered page that
 * answers one question well and ends at a free trial. The brand frame matches the landing page,
 * without its scroll-driven chrome, so every word is in the first HTML a crawler reads.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { cn } from '@/lib/utils';
import { PLATFORM, PLANS } from '@/lib/platform/config';
import { SEO_PAGES, type SeoPage } from '@/lib/seo/pages';
import { SEO_SLUGS, type SeoSlug } from '@/lib/seo/paths';
import { requestSite } from '@/lib/seo/site';
import { productDisplay } from './fonts';
import { Lockup, Route, Tick } from './marks';

export function seoMetadata(slug: SeoSlug): Metadata {
  const p = SEO_PAGES[slug];
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: p.h1, description: p.description, type: 'article', siteName: PLATFORM.name, images: [{ url: p.shot.src, width: 1280, height: 720, alt: p.shot.alt }] },
    twitter: { card: 'summary_large_image', title: p.h1, description: p.description, images: [p.shot.src] },
  };
}

function structuredData(p: SeoPage, origin: string) {
  return [
    { '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: p.faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: PLATFORM.name, item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: p.label, item: `${origin}/${p.slug}` },
    ] },
    ...(p.steps ? [{ '@context': 'https://schema.org', '@type': 'HowTo', name: p.steps.heading,
      step: p.steps.items.map(([name, text], i) => ({ '@type': 'HowToStep', position: i + 1, name, text })) }] : []),
  ];
}

const button = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-semibold transition';

/** The two ways in. Inside an `lp-ink` band the tokens flip, so the same classes read light on dark. */
function Ctas() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/start" className={cn(button, 'bg-foreground text-background hover:bg-foreground/90')}>
        Start {PLANS.pro.trialDays} days free <Route size={16} />
      </Link>
      <a href={`https://demo.${PLATFORM.rootDomain}`} className={cn(button, 'border border-border hover:bg-muted')}>
        See the live demo
      </a>
    </div>
  );
}

export default async function SeoPageView({ slug }: { slug: SeoSlug }) {
  const { kind, origin } = await requestSite();
  // The product site's pages: a league's site has none of these.
  if (kind === 'league' || kind === 'demo') notFound();
  const p = SEO_PAGES[slug];
  const others = SEO_SLUGS.filter(s => s !== slug).map(s => SEO_PAGES[s]);

  return (
    <div className={cn('lp-brand min-h-screen overflow-x-clip font-body', productDisplay.variable)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(p, origin)).replace(/</g, '\\u003c') }} />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-5">
        <Link href="/" aria-label={`${PLATFORM.name} home`}><Lockup size={30} text={20} /></Link>
        <nav className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Link href="/#pricing" className="hidden rounded-full px-3 py-2 text-muted-foreground hover:text-foreground sm:inline-flex">Pricing</Link>
          <Link href="/start" className="rounded-full bg-foreground px-4 py-2 text-background">Get started</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 pb-10 pt-8 sm:px-5 sm:pt-14">
          <nav aria-label="Breadcrumb" className="text-[12.5px] text-muted-foreground">
            <Link href="/" className="hover:text-foreground">{PLATFORM.name}</Link> <span aria-hidden>/</span> <span>{p.eyebrow}</span>
          </nav>
          <h1 className="lp-display mt-4 text-[38px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[56px]">{p.h1}</h1>
          <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-muted-foreground sm:text-[18.5px]">{p.intro}</p>
          <div className="mt-7"><Ctas /></div>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            ${PLANS.pro.season} a year for the whole league, ${(PLANS.pro.season / 12).toFixed(2)} a manager in a 12-team league. No card needed for the trial.
          </p>
        </section>

        <figure className="mx-auto max-w-5xl px-4 sm:px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.shot.src} alt={p.shot.alt} width={1280} height={720} fetchPriority="high"
            className="w-full rounded-[22px] border border-border shadow-[0_30px_60px_-30px_hsl(var(--foreground)/0.45)]" />
          <figcaption className="mt-3 text-center text-[12.5px] text-muted-foreground">
            From the demo league: made-up managers, real NFL players, scored from the real games.
            {p.credit && <> {p.credit.text} <a href={p.credit.href} className="font-semibold text-primary underline-offset-2 hover:underline">{p.credit.name}</a>.</>}
          </figcaption>
        </figure>

        <article className="mx-auto max-w-4xl space-y-14 px-4 py-16 sm:px-5">
          {p.sections.map(s => (
            <section key={s.heading}>
              <h2 className="lp-display text-[26px] font-extrabold tracking-[-0.025em] sm:text-[32px]">{s.heading}</h2>
              {s.body?.map(t => <p key={t.slice(0, 40)} className="mt-4 text-[16px] leading-relaxed text-muted-foreground">{t}</p>)}
              {s.points && (
                <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                  {s.points.map(([t, d]) => (
                    <li key={t} className="rounded-2xl border border-border bg-card p-5">
                      <p className="flex items-center gap-2 font-semibold"><Tick className="shrink-0" />{t}</p>
                      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{d}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {p.steps && (
            <section>
              <h2 className="lp-display text-[26px] font-extrabold tracking-[-0.025em] sm:text-[32px]">{p.steps.heading}</h2>
              <ol className="mt-6 grid gap-4 sm:grid-cols-3">
                {p.steps.items.map(([t, d], i) => (
                  <li key={t} className="rounded-2xl border border-border bg-card p-5">
                    <span className="lp-num text-[30px] font-extrabold leading-none text-primary">{i + 1}</span>
                    <p className="mt-2 font-semibold">{t}</p>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground">{d}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h2 className="lp-display text-[26px] font-extrabold tracking-[-0.025em] sm:text-[32px]">Questions</h2>
            <dl className="mt-4 divide-y divide-border border-y border-border">
              {p.faqs.map(([q, a]) => (
                <div key={q} className="py-5">
                  <dt className="font-semibold">{q}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </article>

        <section className="lp-ink">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-5">
            <h2 className="lp-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[40px]">Give your league some life.</h2>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
              Paste your Sleeper or ESPN league ID and your site builds itself, every season included. {PLANS.pro.trialDays} days free.
            </p>
            <div className="mt-6"><Ctas /></div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">More from {PLATFORM.name}</p>
        <ul className="mt-4 grid gap-2 text-[14px] sm:grid-cols-2">
          {others.map(o => <li key={o.slug}><Link href={`/${o.slug}`} className="hover:text-primary">{o.label}</Link></li>)}
          <li><Link href="/" className="hover:text-primary">{PLATFORM.name} home and pricing</Link></li>
        </ul>
        <p className="mt-10 border-t border-border pt-6 text-[12.5px] text-muted-foreground">
          &copy; {new Date().getFullYear()} {PLATFORM.name}. Not affiliated with Sleeper, the NFL or ESPN. <Link href="/legal/terms" className="hover:text-foreground">Terms</Link> &middot; <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
        </p>
      </footer>
    </div>
  );
}
