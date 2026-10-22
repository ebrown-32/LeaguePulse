/**
 * Product analytics and session replay (Mixpanel), in the browser only.
 *
 * Off unless NEXT_PUBLIC_MIXPANEL_TOKEN is set, so a self-hosted league sends nothing anywhere
 * unless its owner adds a token of their own. Started once, by <Analytics /> in the root layout.
 *
 *   Events      snake_case, a fixed name each; what varies goes in properties, never in the name
 *   People      identified by their LeaguePulse account id (never an email), reset on sign out
 *   Replays     NEXT_PUBLIC_MIXPANEL_REPLAY_PERCENT of sessions (100 unless set). Every input is
 *               masked, and anything marked data-mp-mask has its text masked too
 *   Never       the back office (/operator): its pages hold secrets and other people's feedback
 */

import mixpanel from 'mixpanel-browser';

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim() ?? '';
const REPLAY = Math.min(100, Math.max(0, Number(process.env.NEXT_PUBLIC_MIXPANEL_REPLAY_PERCENT ?? 100) || 0));

let initialized = false;
let base: Record<string, unknown> = {};

/** Properties sent with every event: which surface and league the visitor is on. Empty values are left out. */
export type SuperProps = Record<string, string | number | boolean | null | undefined>;

const clean = (props: Record<string, unknown> = {}) =>
  Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined && v !== ''));

export function initMixpanel(props?: SuperProps) {
  if (typeof window === 'undefined' || initialized || !TOKEN) return;
  if (window.location.pathname.startsWith('/operator')) return;
  mixpanel.init(TOKEN, {
    debug: process.env.NODE_ENV !== 'production',
    persistence: 'localStorage',
    // page_viewed is tracked by <Analytics /> with a page name, so autocapture skips its own.
    track_pageview: false,
    autocapture: { pageview: false, click: true, input: true, scroll: true, submit: true, capture_text_content: false },
    record_sessions_percent: REPLAY,
    record_mask_text_selector: '[data-mp-mask]',
    // Player photos, logos and team art are public, so replays show them; mark anything else to hide.
    record_block_selector: '[data-mp-block]',
  });
  base = clean(props);
  mixpanel.register(base);
  initialized = true;
}

export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !initialized) return;
  try {
    mixpanel.track(event, clean(props));
  } catch {
    // silently ignore if initialization hasn't completed
  }
}

/**
 * A signed-in visitor, by their account id; the same id on the product site and every league's site.
 * `props` describe them on this site (their role in this league), so they go with this browser's
 * events rather than onto the person, who may be in several leagues.
 */
export function identify(accountId: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !initialized || !accountId) return;
  try {
    if (mixpanel.get_distinct_id() !== accountId) mixpanel.identify(accountId);
    const p = clean(props);
    if (Object.keys(p).length) mixpanel.register(p);
  } catch { /* ignore */ }
}

/** Signed out: start a new anonymous visitor, so the next person on this browser isn't merged in. */
export function resetIdentity() {
  if (typeof window === 'undefined' || !initialized) return;
  // reset() also clears the surface and league, which still hold.
  try { mixpanel.reset(); mixpanel.register(base); } catch { /* ignore */ }
}
