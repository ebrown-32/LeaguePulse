import { getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getPlayersDirectory } from '@/lib/playerStats';

/**
 * Game-day weather for the week's NFL slate.
 *
 * Two free, keyless services do the work:
 *
 *   ESPN's public scoreboard gives the fixtures, the venue, whether it has a
 *   roof, and kickoff time. It does not give coordinates or weather.
 *   Open-Meteo geocodes the venue city and returns an hourly forecast, which
 *   is sampled at the actual kickoff hour rather than "today".
 *
 * Sampling at kickoff matters more than it sounds: a 1pm game and an 8pm game
 * in the same city routinely differ by fifteen degrees and a wind shift, and a
 * daily summary would call both the same.
 *
 * Rostered players are then attached to their game, so the question this
 * answers is not "what is the weather" but "which of my starters is playing in
 * it".
 */

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

/** Open-Meteo WMO codes, collapsed to what a fantasy manager cares about. */
const CONDITIONS: { max: number; label: string; icon: string }[] = [
  { max: 0,  label: 'Clear',          icon: 'sun' },
  { max: 3,  label: 'Cloudy',         icon: 'cloud' },
  { max: 48, label: 'Fog',            icon: 'fog' },
  { max: 57, label: 'Drizzle',        icon: 'rain' },
  { max: 67, label: 'Rain',           icon: 'rain' },
  { max: 77, label: 'Snow',           icon: 'snow' },
  { max: 82, label: 'Showers',        icon: 'rain' },
  { max: 86, label: 'Snow showers',   icon: 'snow' },
  { max: 99, label: 'Thunderstorms',  icon: 'storm' },
];

function describe(code: number): { label: string; icon: string } {
  return CONDITIONS.find(c => code <= c.max) ?? { label: 'Unknown', icon: 'cloud' };
}

export interface GameWeather {
  id: string;
  kickoff: string;
  venue: string;
  city: string;
  /** A dome or a closed roof: the forecast is irrelevant inside one. */
  indoor: boolean;
  /**
   * Why there is or is not a forecast. "No forecast" covers three different
   * situations and conflating them makes the page look broken when it is
   * working: a roof, a game that has already been played, and a game further
   * out than the forecast reaches.
   */
  status: 'forecast' | 'roof' | 'played' | 'too-far-out';
  teams: string[];
  weather: {
    tempF: number;
    feelsF: number;
    windMph: number;
    gustMph: number | null;
    precipChance: number;
    label: string;
    icon: string;
  } | null;
  /**
   * Conditions a fantasy manager would actually change a lineup over, worst
   * first. Empty for a fine day, which is most of them.
   */
  flags: string[];
  /** Rostered players in this game, by league team. */
  affected: { teamName: string; players: { name: string; position: string; nflTeam: string }[] }[];
}

export interface WeatherReport {
  week: number;
  season: string;
  games: GameWeather[];
  /** True when nothing in the week has a forecast to show. */
  nothingToShow: boolean;
  /** Plain explanation for that, shown instead of an empty page. */
  note: string | null;
}

/**
 * Conditions that actually move fantasy outcomes.
 *
 * Wind is first because it is the one that reliably matters: sustained wind
 * above about 15mph measurably suppresses deep passing and field goals, where
 * rain and cold mostly do not.
 */
function flagsFor(w: NonNullable<GameWeather['weather']>): string[] {
  const out: string[] = [];
  if (w.windMph >= 20) out.push(`Wind ${Math.round(w.windMph)}mph, deep passing and kicking suffer`);
  else if (w.windMph >= 15) out.push(`Breezy at ${Math.round(w.windMph)}mph, watch the kickers`);
  if (w.precipChance >= 60) out.push(`${w.precipChance}% chance of ${w.label.toLowerCase()}`);
  if (w.icon === 'snow') out.push('Snow in the forecast');
  if (w.icon === 'storm') out.push('Thunderstorms, possible delay');
  if (w.tempF <= 20) out.push(`Freezing at ${Math.round(w.tempF)}F`);
  else if (w.tempF >= 92) out.push(`Heat at ${Math.round(w.tempF)}F`);
  return out;
}

const geoCache = new Map<string, { lat: number; lon: number } | null>();

async function geocode(city: string, state?: string): Promise<{ lat: number; lon: number } | null> {
  const key = `${city}|${state ?? ''}`;
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const res = await fetch(`${GEO}?name=${encodeURIComponent(city)}&count=5&language=en&format=json`,
      { next: { revalidate: 86400 } });
    const data = await res.json();
    const results: any[] = data?.results ?? [];
    // Prefer the match in the right state: there is a Kansas City in two of
    // them, and several Charlottes.
    const hit = (state && results.find(r => r.admin1_id && r.admin1?.startsWith(state)))
      ?? results.find(r => !state || r.country_code === 'US')
      ?? results[0];
    const value = hit ? { lat: hit.latitude, lon: hit.longitude } : null;
    geoCache.set(key, value);
    return value;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

/** The forecast at one specific hour, or null when it is out of range. */
async function forecastAt(lat: number, lon: number, kickoff: string) {
  try {
    const res = await fetch(
      `${FORECAST}?latitude=${lat}&longitude=${lon}` +
      '&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=16' +
      // Without this the hourly stamps come back on the venue's local clock
      // with no offset, and parsing them as UTC shifted every kickoff by
      // hours, which put them all outside the match window.
      '&timezone=UTC',
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const h = (await res.json())?.hourly;
    if (!h?.time?.length) return null;

    // Open-Meteo returns local time for the venue, and ESPN gives kickoff in
    // UTC. Compare as instants rather than as strings.
    const target = new Date(kickoff).getTime();
    let best = -1, bestGap = Infinity;
    for (let i = 0; i < h.time.length; i++) {
      const gap = Math.abs(new Date(`${h.time[i]}Z`).getTime() - target);
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    // More than 90 minutes from any forecast hour means the game is outside
    // the window; a stale reading is worse than saying nothing.
    if (best < 0 || bestGap > 90 * 60 * 1000) return null;

    const code = Number(h.weather_code[best] ?? 0);
    const d = describe(code);
    return {
      tempF: Number(h.temperature_2m[best]),
      feelsF: Number(h.apparent_temperature[best]),
      windMph: Number(h.wind_speed_10m[best]),
      gustMph: h.wind_gusts_10m?.[best] != null ? Number(h.wind_gusts_10m[best]) : null,
      precipChance: Number(h.precipitation_probability?.[best] ?? 0),
      label: d.label,
      icon: d.icon,
    };
  } catch {
    return null;
  }
}

/** Build the report for the current NFL week. */
export async function buildWeatherReport(): Promise<WeatherReport | null> {
  const nflState = await getNFLState().catch(() => null);
  const week = Number(nflState?.week ?? 0);
  const season = String(nflState?.season ?? '');
  const seasonType = String(nflState?.season_type ?? '');
  if (!week || seasonType === 'off') return null;

  // ESPN's seasontype: 1 preseason, 2 regular, 3 post.
  const type = seasonType === 'post' ? 3 : seasonType === 'pre' ? 1 : 2;
  let events: any[] = [];
  try {
    const res = await fetch(`${ESPN}?dates=${season}&seasontype=${type}&week=${week}`,
      { next: { revalidate: 1800 } });
    events = (await res.json())?.events ?? [];
  } catch {
    return null;
  }
  if (!events.length) return null;

  // Which NFL teams the league actually rosters, so the report can say who is
  // affected rather than just listing the slate.
  const rosterByNflTeam = new Map<string, { teamName: string; players: any[] }[]>();
  try {
    const leagueId = await getCurrentLeagueId();
    const [rosters, users, players] = await Promise.all([
      getLeagueRosters(leagueId), getLeagueUsers(leagueId), getPlayersDirectory(),
    ]);
    const userById = new Map(users.map(u => [u.user_id, u]));
    for (const r of rosters as any[]) {
      const u: any = userById.get(r.owner_id);
      const teamName = u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`;
      // Starters only: a bench player's weather is not a decision.
      for (const id of (r.starters ?? []).filter((x: string) => x && x !== '0')) {
        const p = players[id];
        const nfl = p?.team;
        if (!nfl) continue;
        const list = rosterByNflTeam.get(nfl) ?? [];
        let entry = list.find(e => e.teamName === teamName);
        if (!entry) { entry = { teamName, players: [] }; list.push(entry); }
        entry.players.push({
          name: p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(' '),
          position: p.position ?? '',
          nflTeam: nfl,
        });
        rosterByNflTeam.set(nfl, list);
      }
    }
  } catch { /* the slate is still worth showing without roster mapping */ }

  const games: GameWeather[] = [];
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const venue = comp.venue ?? {};
    const addr = venue.address ?? {};
    const indoor = Boolean(venue.indoor);
    // ESPN does not guarantee competitor order, so read the flag rather than
    // trusting the array; otherwise the fixture renders back to front.
    const competitors: any[] = comp.competitors ?? [];
    const away = competitors.find(c => c?.homeAway === 'away') ?? competitors[1];
    const home = competitors.find(c => c?.homeAway === 'home') ?? competitors[0];
    const teams: string[] = [away?.team?.abbreviation, home?.team?.abbreviation].filter(Boolean);

    const played = new Date(ev.date).getTime() < Date.now();
    let weather: GameWeather['weather'] = null;
    // A roof means the forecast is irrelevant, and a game already played means
    // there is nothing to forecast. Neither is worth an API call.
    if (!indoor && !played && addr.city) {
      const geo = await geocode(addr.city, addr.state);
      if (geo) weather = await forecastAt(geo.lat, geo.lon, ev.date);
    }
    const status: GameWeather['status'] =
      indoor ? 'roof' : played ? 'played' : weather ? 'forecast' : 'too-far-out';

    // Merge both sides' affected rosters into one list per league team.
    const affectedMap = new Map<string, { teamName: string; players: any[] }>();
    for (const abbr of teams) {
      for (const entry of rosterByNflTeam.get(abbr) ?? []) {
        const cur = affectedMap.get(entry.teamName) ?? { teamName: entry.teamName, players: [] };
        cur.players.push(...entry.players);
        affectedMap.set(entry.teamName, cur);
      }
    }

    games.push({
      id: String(ev.id),
      kickoff: ev.date,
      venue: venue.fullName ?? 'Unknown venue',
      city: [addr.city, addr.state].filter(Boolean).join(', '),
      indoor,
      teams,
      weather,
      status,
      flags: weather ? flagsFor(weather) : [],
      affected: [...affectedMap.values()].sort((a, b) => b.players.length - a.players.length),
    });
  }

  games.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  const withForecast = games.filter(g => g.status === 'forecast').length;
  // Roofed games are never going to have a forecast, so they should not decide
  // what the explanation says. The reason is whatever is true of the games
  // that could have had one.
  const openAir = games.filter(g => g.status !== 'roof');
  const note =
    withForecast > 0 ? null
      : !openAir.length ? 'Every game this week is played under a roof.'
      : openAir.every(g => g.status === 'played')
        ? 'Every outdoor game this week has already kicked off.'
        : 'These games are further out than the forecast reaches. Check back within about two weeks of kickoff.';

  return { week, season, games, nothingToShow: withForecast === 0, note };
}
