/**
 * Features switched off for now, in one place. Plain constants, so the server and the browser
 * read the same switch.
 */

/**
 * The Desk Weekly (lib/ai/podcast): off. Nothing records (the Tuesday cron skips it, so no
 * ElevenLabs characters are spent), /podcast and its API answer 404, and it's out of the menus,
 * the Feed, the personality pages, the AI Desk admin and the landing page. Episodes and recordings
 * already made are kept. Set to true to bring it all back.
 */
export const DESK_WEEKLY_ON = false;
