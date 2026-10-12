/**
 * The product's own marks: the logo and a small icon set drawn for it.
 *
 * Drawn here rather than taken from an icon library, so the marketing site has
 * a hand of its own. One grammar throughout: a 32 unit grid, a 1.75 stroke in
 * ink with flat ends, and exactly one solid accent shape per icon, set slightly
 * off the line work like a misregistered print. The accent defaults to the
 * signal colour and can be changed per use with `--mark-accent`.
 */

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Frame({ size = 28, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="butt" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

/** The accent shape: solid, no stroke. */
const A = (props: SVGProps<SVGPathElement>) =>
  <path fill="var(--mark-accent, hsl(var(--signal)))" stroke="none" {...props} />;

/**
 * The logo: a goalpost whose crossbar is a heartbeat. Uprights, a post, and
 * the pulse running across where the bar would be.
 */
export function Logomark({ size = 30, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden {...rest}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="hsl(var(--foreground))" />
      <g stroke="hsl(var(--background))" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 6.5v11.5M25 6.5v11.5M16 22v4.5" />
        <path d="M7 18h4.2l1.9-4.8 3.1 8.6 2.4-6.2 1.3 2.4H25" />
      </g>
      <circle cx="25" cy="6.5" r="2" fill="hsl(var(--signal))" />
    </svg>
  );
}

/** The media desk: a press microphone with an on-air light. */
export function DeskMark(p: P) {
  return (
    <Frame {...p}>
      <A d="M21.5 4.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
      <rect x="9" y="5" width="8" height="13" rx="4" />
      <path d="M6 14.5a7 7 0 0 0 14 0M13 21.5V27M9 27h8" />
      <path d="M11.5 9.5h3M11.5 12.5h3" />
    </Frame>
  );
}

/** Game Day: a screen showing a field, the ball on it. */
export function GameDayMark(p: P) {
  return (
    <Frame {...p}>
      <rect x="3.5" y="6" width="25" height="16" rx="2.5" />
      <path d="M8 6v16M24 6v16M16 6v3M16 19v3M12 13.9h.01M20 13.9h.01" />
      <A d="M13.6 11.9c1.4-1 3.4-1 4.8 0 .5.4.5 1.6 0 2-1.4 1-3.4 1-4.8 0-.5-.4-.5-1.6 0-2Z" transform="translate(.8 .2)" />
      <path d="M11 26.5h10" />
    </Frame>
  );
}

/** Win odds: a dial with its needle past halfway. */
export function OddsMark(p: P) {
  return (
    <Frame {...p}>
      <A d="M16 20 25.4 13.6A11 11 0 0 1 27 20Z" />
      <path d="M5 20a11 11 0 0 1 22 0" />
      <path d="M16 20l6.5-7.5" />
      <path d="M5 24h22M8.4 12.2l1.4 1.4M16 9v2" />
      <circle cx="16" cy="20" r="1.4" fill="currentColor" stroke="none" />
    </Frame>
  );
}

/** Game of the Week: a game ball with a spark. */
export function GameBallMark(p: P) {
  return (
    <Frame {...p}>
      <A d="M24.5 3.5l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1Z" />
      <path d="M6.2 25.8c-2.4-2.4-.7-8.7 3.8-13.2s10.8-6.2 13.2-3.8.7 8.7-3.8 13.2-10.8 6.2-13.2 3.8Z" />
      <path d="M11.3 20.7l7.4-7.4M13.6 14.9l1.5 1.5M15.8 12.7l1.5 1.5M11.4 17.1l1.5 1.5" />
    </Frame>
  );
}

/** Analytics: a sheet of cells with a bar rising out of it. */
export function SheetMark(p: P) {
  return (
    <Frame {...p}>
      <A d="M21 6h5v15h-5Z" />
      <path d="M4 12h17M4 18h17M4 24h17M10.5 12v16M4 12v16h17" />
      <path d="M21 6h5v22" />
    </Frame>
  );
}

/** The simulator: one season branching into many outcomes. */
export function BranchMark(p: P) {
  return (
    <Frame {...p}>
      <path d="M4 16h7c4 0 5-9 10-9h3M11 16h13M11 16c4 0 5 9 10 9h3" />
      <circle cx="4" cy="16" r="1.6" fill="currentColor" stroke="none" />
      <A d="M27 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
      <circle cx="27" cy="16" r="2.2" />
      <circle cx="27" cy="25" r="2.2" />
    </Frame>
  );
}

/** History: a championship ring. */
export function RingMark(p: P) {
  return (
    <Frame {...p}>
      <A d="M16 3.5l4 4-4 4.5-4-4.5Z" />
      <path d="M11.3 10.2a9 9 0 1 0 9.4 0" />
      <path d="M13.6 13.2a5.4 5.4 0 1 0 4.8 0" />
    </Frame>
  );
}

/** The weekly report: a play drawn on a card. */
export function PlayMark(p: P) {
  return (
    <Frame {...p}>
      <rect x="4.5" y="4.5" width="23" height="23" rx="3" />
      <path d="M9 10l4 4M13 10l-4 4" />
      <A d="M19.5 18a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
      <path d="M11 17c0 4 3 5 6 5" strokeDasharray="2 2" />
      <path d="M22.5 9.5l-5 5M22.5 9.5h-3.5M22.5 9.5V13" />
    </Frame>
  );
}

/** Your colours: a pennant on a pole. */
export function PennantMark(p: P) {
  return (
    <Frame {...p}>
      <path d="M7 3.5V28.5" />
      <A d="M8 5.5 26 10.5 8 16Z" />
      <path d="M7 5l19 5.5L7 16.5" />
    </Frame>
  );
}

/** Step one: find your league. */
export function FindMark(p: P) {
  return (
    <Frame {...p}>
      <A d="M13.5 6.5a7 7 0 0 1 7 7h-7Z" opacity={0.9} />
      <circle cx="13.5" cy="13.5" r="8" />
      <path d="M19.4 19.4l7.1 7.1M9.5 13.5h8M13.5 9.5v8" opacity={0.35} />
    </Frame>
  );
}

/** Step two: your own address, a goalpost with a tag. */
export function AddressMark(p: P) {
  return (
    <Frame {...p}>
      <path d="M7 4v11h18V4M16 15v13" />
      <A d="M18 19h9l2 2.5-2 2.5h-9Z" />
    </Frame>
  );
}

/** Step three: drop the link in the group chat. */
export function ChatMark(p: P) {
  return (
    <Frame {...p}>
      <path d="M5 7.5h17a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-5 4.5v-4.5H5A2.5 2.5 0 0 1 2.5 18v-8A2.5 2.5 0 0 1 5 7.5Z" />
      <A d="M24 2.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" />
      <path d="M8 14h9" />
    </Frame>
  );
}

/** A tick for lists: short and long strokes, like a referee's mark. */
export function Tick({ size = 18, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden {...rest}>
      <path d="M4 10.5l3.6 3.5L16 5.5" stroke="hsl(var(--primary))" strokeWidth={2.2} strokeLinecap="square" />
    </svg>
  );
}

/** An arrow drawn like a route on a play card: a stem and a cut. */
export function Route({ size = 18, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="square" aria-hidden {...rest}>
      <path d="M3 10h12M11 5.5 15.5 10 11 14.5" />
    </svg>
  );
}
