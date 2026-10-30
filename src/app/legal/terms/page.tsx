import LegalPage from '@/components/platform/LegalPage';
import { PLATFORM, PLANS } from '@/lib/platform/config';

export const metadata = { title: `Terms of Service | ${PLATFORM.name}` };

export default function TermsPage() {
  const n = PLATFORM.name;
  const contact = PLATFORM.supportEmail
    ? <a href={`mailto:${PLATFORM.supportEmail}`}>{PLATFORM.supportEmail}</a>
    : 'the support address on our site';
  return (
    <LegalPage title="Terms of Service" updated="October 29, 2026">
      <p>
        These terms cover your use of {n}&apos;s hosted service at {PLATFORM.rootDomain} and its league sites. By
        starting a trial or subscription, or by using a league site, you agree to them.
      </p>

      <h2>The service</h2>
      <p>
        {n} builds a website for a fantasy football league from that league&apos;s data on Sleeper or ESPN. {n} is
        not affiliated with, endorsed by or sponsored by Sleeper, the NFL or ESPN. Data from those sources can be
        late, incomplete or wrong, and features that depend on it can stop working if a source changes.
      </p>
      <p>
        A private ESPN league is read with ESPN session cookies that a member of the league gives us. By giving them,
        you confirm you are a member of that league. We use them only to read it, and the site&apos;s admin can replace them at any
        time.
      </p>

      <h2>Subscriptions and trials</h2>
      <ul>
        <li>A subscription (League Pass, or League Pass + AI) covers one league site. Payments are processed by Stripe.</li>
        <li>New sites start with a {PLANS.pro.trialDays}-day free trial. No card is needed for it, and if no card is added the trial simply ends.</li>
        <li>Subscriptions renew automatically at the end of each billing period until cancelled.</li>
        <li>You can update your card, change plan or cancel at any time from your site&apos;s admin page, under Manage billing. Cancelling stops future renewals; the site stays up until the end of the period you have paid for.</li>
        <li>Payments are non-refundable except where the law requires otherwise, or where we choose to refund at our discretion.</li>
        <li>We may change prices. A price increase applies only from a renewal at least 30 days after we tell you about it. A price decrease may apply from your next renewal without notice.</li>
      </ul>

      <h2>Your Anthropic API key and AI features</h2>
      <p>
        On League Pass, AI features run on an Anthropic API key that you provide. You are responsible for that
        account, its usage and its charges, and for complying with Anthropic&apos;s terms. We store your key encrypted
        and use it only to run your league&apos;s AI features. On League Pass + AI, we provide the AI instead, within
        reasonable daily limits and a monthly allowance that keep it running for every league. If a league uses up its
        monthly allowance, its AI features keep working for the rest of the month on a faster, lighter model. You
        can still use your own key if you prefer. Either way, AI-written content can be inaccurate; it is
        entertainment, not fact.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your admin password safe. Anyone with it can change your site and its settings.</li>
        <li>Only upload logos and other content you have the right to use, and nothing unlawful, hateful or harassing.</li>
        <li>Don&apos;t attempt to access another league&apos;s site or data, disrupt the service, or use it to send spam or abuse.</li>
      </ul>
      <p>We may suspend or remove a site that breaks these rules.</p>

      <h2>Feedback</h2>
      <p>
        If you send us a bug report, idea or other feedback, we may use it to improve {n} without any obligation to
        you. Please don&apos;t include anything private you wouldn&apos;t want us to read.
      </p>

      <h2>Source code</h2>
      <p>
        The software behind {n} is source available under the Functional Source License, Version 1.1 (FSL-1.1-ALv2):
        anyone may read it and run it for their own league, but not offer it as a competing product or service. Each
        version becomes available under the Apache License 2.0 two years after its release. These terms govern the
        hosted service; the licence governs the code.
      </p>

      <h2>Availability and liability</h2>
      <p>
        The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind. We
        don&apos;t guarantee it will be uninterrupted or error-free. To the fullest extent the law allows, our total
        liability for any claim relating to the service is limited to the amount you paid us in the twelve months
        before the claim.
      </p>

      <h2>Ending the service</h2>
      <p>
        You can stop using the service at any time by cancelling. If we discontinue the service, we will give at
        least 30 days&apos; notice and refund any unused prepaid period.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. If a change is material, we will say so on this page before it takes effect.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: {contact}.</p>
    </LegalPage>
  );
}
