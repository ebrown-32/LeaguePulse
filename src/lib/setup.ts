/**
 * Getting a new league's site ready: the handful of things an owner does once,
 * in the order worth doing them. The admin panel's setup guide walks through
 * them (app/admin/SetupGuide), and the league's own pages nudge an owner who
 * hasn't finished (components/layout/SetupBar).
 *
 * Each step is checked off by what is actually saved, except sharing, which
 * leaves nothing behind to look at. An admin can also mark any step done by
 * hand, to skip what their league doesn't want.
 *
 * Pure: the status itself is worked out on the server, in setupStatus.ts.
 */

export type SetupStepId = 'appearance' | 'ai' | 'managers' | 'constitution' | 'share';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  blurb: string;
  /** The admin tab that does it; sharing is done in the guide itself. */
  tab: 'appearance' | 'ai' | 'managers' | 'constitution' | null;
}

export const SETUP_STEPS: readonly SetupStep[] = [
  { id: 'appearance', title: 'Make it yours', blurb: 'Your logo, colors and fonts, on every page.', tab: 'appearance' },
  { id: 'ai', title: 'Switch on the media desk', blurb: 'AI writers who cover your league all week.', tab: 'ai' },
  { id: 'managers', title: 'Invite your managers', blurb: 'Each one claims their franchise and runs their stadium.', tab: 'managers' },
  { id: 'constitution', title: 'Add your rules', blurb: 'The league constitution, with every version kept.', tab: 'constitution' },
  { id: 'share', title: 'Share it with the league', blurb: 'Drop the link in the group chat.', tab: null },
];

export interface SetupStatus {
  /**
   * The steps that apply to this site, in order (managers is hosted only).
   * `marked`: done because an admin said so, not because it was saved.
   */
  steps: { id: SetupStepId; done: boolean; marked: boolean }[];
  /** When an admin hid the guide; it stays hidden for every admin. */
  dismissed: boolean;
}

export const setupLeft = (s: SetupStatus) => s.steps.filter(x => !x.done).length;
