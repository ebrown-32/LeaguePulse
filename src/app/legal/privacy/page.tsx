import LegalPage from '@/components/platform/LegalPage';
import { PLATFORM } from '@/lib/platform/config';

export const metadata = { title: `Privacy Policy | ${PLATFORM.name}` };

export default function PrivacyPage() {
  const n = PLATFORM.name;
  const contact = PLATFORM.supportEmail
    ? <a href={`mailto:${PLATFORM.supportEmail}`}>{PLATFORM.supportEmail}</a>
    : 'the support address on our site';
  return (
    <LegalPage title="Privacy Policy" updated="October 13, 2026">
      <p>This policy explains what {n} collects, why, and who it is shared with. We don&apos;t sell personal data and we don&apos;t run advertising.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>League data from Sleeper or ESPN.</strong> League information: team and manager names, avatars and team logos, rosters, matchups and transactions. We fetch it from Sleeper&apos;s public API, or from ESPN, to build the site. For ESPN managers we show a first name and last initial.</li>
        <li><strong>A copy of each finished season</strong> of a league&apos;s data, kept so its site loads quickly and its history does not depend on Sleeper or ESPN keeping it.</li>
        <li><strong>ESPN session cookies</strong> (SWID and espn_s2), for a private ESPN league, when a member of the league gives them to us. They are stored encrypted, used only to read that league from ESPN, and never shown again. Cookies given at sign-up are deleted after two days if no site is started; otherwise they are kept until the site&apos;s admin replaces them or the site is removed.</li>
        <li><strong>Account and billing details.</strong> When you subscribe, the email you give and your Stripe customer and subscription ids. Card details go to Stripe and never reach us.</li>
        <li><strong>Your admin password,</strong> stored only as a salted hash, so it cannot be read back.</li>
        <li><strong>Your Anthropic API key,</strong> stored encrypted, used only to run your league&apos;s AI features, and never shown again in full.</li>
        <li><strong>Site settings and uploads,</strong> such as colours and your league logo.</li>
        <li><strong>Content the AI writes</strong> for your league, and questions sent to AI features on your site.</li>
        <li><strong>IP addresses,</strong> used to limit how often AI and sign-up features can be called. We store only a one-way hash of the address, and it is deleted automatically within about an hour.</li>
      </ul>

      <h2>Your browser</h2>
      <p>
        We don&apos;t use advertising or tracking cookies. Your browser stores a few preferences locally, such as
        the admin tab you last opened, posts you liked, saved analytics reports and dismissed banners. That data
        stays on your device.
      </p>

      <h2>Who we share it with</h2>
      <p>Only the services that run {n}, for that purpose:</p>
      <ul>
        <li><strong>Vercel</strong> hosts the site and keeps standard request logs, which include IP addresses, for a limited time.</li>
        <li><strong>Upstash</strong> stores site data.</li>
        <li><strong>Stripe</strong> processes payments.</li>
        <li><strong>Anthropic</strong> receives league data and questions when AI features run, under your own API key and your agreement with Anthropic.</li>
      </ul>
      <p>We also request data from Sleeper and ESPN. For a private ESPN league that request carries the league&apos;s ESPN cookies, as described above; otherwise we don&apos;t send them anything about you.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep a league&apos;s data while its subscription is active. After cancellation we may delete it after a
        grace period, and we will delete it sooner on request. Stripe keeps billing records as the law requires.
      </p>

      <h2>Your choices</h2>
      <p>
        You can remove your API key from your admin page at any time. To get a copy of your data, or to have it
        deleted, contact {contact}. Depending on where you live you may have further rights, such as correction or
        objection; contact us to use them.
      </p>

      <h2>Children</h2>
      <p>{n} is not directed at children under 13, and we don&apos;t knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a material way, we will say so on this page before the change takes effect.</p>

      <h2>Contact</h2>
      <p>Privacy questions: {contact}.</p>
    </LegalPage>
  );
}
