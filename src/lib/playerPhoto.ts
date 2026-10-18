/**
 * A player's picture: Sleeper's headshot, or the team logo for a defense.
 * Players known only by an ESPN id (espn_<id>) have none; callers show initials.
 *
 * Pure.
 */
export function playerPhoto(p: { playerId: string; position: string; nflTeam?: string | null }): string | null {
  if (p.position === 'DEF') {
    const team = p.nflTeam || (/^[A-Z]{2,3}$/.test(p.playerId) ? p.playerId : '');
    return team ? `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png` : null;
  }
  return /^\d+$/.test(p.playerId) ? `https://sleepercdn.com/content/nfl/players/thumb/${p.playerId}.jpg` : null;
}

export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
