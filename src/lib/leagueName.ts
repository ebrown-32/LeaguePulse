/**
 * The league's name as its site shows it: the admin's, else the hosted league's, else the
 * site's title. Server only.
 */
import { getTheme } from '@/lib/themeStorage';

export async function leagueDisplayName(): Promise<string> {
  const theme = await getTheme().catch(() => null);
  let name = theme?.leagueName?.trim() || '';
  if (!name && process.env.LP_HOSTED === '1') {
    const { currentTenant } = await import('@/lib/tenant/context');
    name = (await currentTenant().catch(() => null))?.leagueName?.trim() || '';
  }
  return name || theme?.siteTitle?.trim() || 'The League';
}
