/**
 * The demo site: demo.<root domain>, the league of src/lib/demo. Tiny on purpose, so anything
 * can ask whether it's serving the demo without pulling in the demo's data.
 */

export const DEMO_SLUG = 'demo';

/**
 * The demo franchises' owners are deep-pocketed: a starting bankroll of this many times what
 * every upgrade costs, so their stadiums are the showpieces a demo should show (see seed.ts)
 * and the bank never runs dry under the upkeep.
 */
export const DEMO_BANKROLL = 1.6;

/** Whether this request is for the demo site. */
export async function isDemoSite(): Promise<boolean> {
  if (process.env.LP_HOSTED !== '1') return false;
  const { currentTenant } = await import('@/lib/tenant/context');
  return (await currentTenant())?.slug === DEMO_SLUG;
}
