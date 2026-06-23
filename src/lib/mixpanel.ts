import mixpanel from 'mixpanel-browser';

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ?? '';

let initialized = false;

export function initMixpanel() {
  if (typeof window === 'undefined' || initialized || !TOKEN) return;
  mixpanel.init(TOKEN, {
    debug: process.env.NODE_ENV !== 'production',
    track_pageview: false, // handled manually via usePathname
    persistence: 'localStorage',
  });
  initialized = true;
}

export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !initialized) return;
  try {
    mixpanel.track(event, props);
  } catch {
    // silently ignore if initialization hasn't completed
  }
}
