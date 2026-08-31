/**
 * Which picture represents a manager in this league.
 *
 * Sleeper keeps two, and they are not the same image:
 *
 *   user.avatar        the account picture, a bare id served from
 *                      sleepercdn.com/avatars/<id>
 *   metadata.avatar    the picture that manager set for THIS league's team,
 *                      stored as a full uploads URL
 *
 * The app read only the account one, so a manager who set a team logo saw
 * someone else's idea of their picture everywhere in LeaguePulse while Sleeper
 * showed the logo they chose. Verified against the live league: all eight
 * managers' two images differ, and two of them noticeably.
 *
 * The team picture wins where it exists, which is what Sleeper itself shows in
 * a league context, and the account picture is the fallback.
 */
export interface AvatarSource {
  avatar?: string | null;
  metadata?: { avatar?: string | null } | null;
}

export function teamAvatar(user: AvatarSource | null | undefined): string {
  return user?.metadata?.avatar || user?.avatar || '';
}
