/**
 * The app's icon set, in one place.
 *
 * Backed by Phosphor, in two registers:
 *
 *   duotone  for anything that names a thing: a page, a section, a stat, a
 *            post type. A full-weight outline over a soft tint of the same
 *            colour, which gives an icon presence at 12 to 20 pixels where a
 *            hairline outline reads as a placeholder.
 *   bold     for controls: chevrons, close, arrows, plus and minus. Chrome
 *            should be crisp and quiet, and a tinted chevron is noise.
 *
 * Exported under the names the app already used (lucide's, plus a few
 * heroicons), so swapping the library touched import lines only, and so that
 * the next restyle is an edit to this file rather than to fifty.
 *
 * Every icon takes `weight` to override its register, which is how a liked
 * heart becomes a filled one.
 */

import { forwardRef, type ComponentType } from 'react';
import type { IconProps as PhosphorProps, IconWeight } from '@phosphor-icons/react';
import {
  Pulse, Warning, ArrowDown as PArrowDown, ArrowLeft as PArrowLeft, ArrowsLeftRight,
  ArrowRight as PArrowRight, ArrowUp as PArrowUp, ArrowUpRight as PArrowUpRight,
  ChartBar, BookOpenText, CalendarDots, Check as PCheck, CaretDown, CaretLeft, CaretRight,
  ClipboardText, ListChecks, Clock as PClock, Cloud as PCloud, CloudFog as PCloudFog,
  CloudLightning as PCloudLightning, CloudRain as PCloudRain, CloudSnow as PCloudSnow,
  Copy as PCopy, ArrowElbowDownLeft, Database as PDatabase, Drop, Eraser as PEraser,
  ArrowSquareOut, Funnel, Fire, Flask, Gavel as PGavel, GitBranch as PGitBranch,
  GithubLogo, DotsSixVertical, Heart as PHeart, House, Info as PInfo, Stack, SquaresFour,
  ChartLine, ListNumbers, Lock as PLock, ArrowsOut, Megaphone as PMegaphone, List,
  ChatCircle, ArrowsIn, Minus as PMinus, Moon as PMoon, CursorClick, Newspaper as PNewspaper,
  Plus as PPlus, Broadcast, Receipt as PReceipt, ArrowsClockwise, Repeat, RocketLaunch,
  ArrowCounterClockwise, Scales, Scroll as PScroll, MagnifyingGlass, GearSix, ShareNetwork,
  ShieldCheck as PShieldCheck, TShirt, Shuffle as PShuffle, SlidersHorizontal as PSliders,
  Couch, Sparkle, Star as PStar, Sun as PSun, Sword as PSword, Target as PTarget,
  Thermometer as PThermometer, Ticket as PTicket, Trash, TrendDown, TrendUp, Trophy as PTrophy,
  UploadSimple, User as PUser, UserPlus as PUserPlus, Users as PUsers, Wind as PWind, X as PX,
  Lightning, Eye, WarningCircle, FootballHelmet, Football, Crown, Handshake, Fire as PFire,
  CheckCircle, Lightbulb,
} from '@phosphor-icons/react/dist/ssr';

export type IconProps = Omit<PhosphorProps, 'ref'> & { weight?: IconWeight };
export type Icon = ComponentType<IconProps>;

function make(Glyph: ComponentType<PhosphorProps>, register: IconWeight, name: string): Icon {
  const C = forwardRef<SVGSVGElement, IconProps>(({ weight, ...props }, ref) => (
    <Glyph ref={ref} weight={weight ?? register} aria-hidden={props['aria-label'] ? undefined : true} {...props} />
  ));
  C.displayName = name;
  return C as unknown as Icon;
}

const duo = (g: ComponentType<PhosphorProps>, n: string) => make(g, 'duotone', n);
const bold = (g: ComponentType<PhosphorProps>, n: string) => make(g, 'bold', n);

// ── Things: pages, sections, stats, post types ───────────────────────────────
export const Activity        = duo(Pulse, 'Activity');
export const AlertTriangle   = duo(Warning, 'AlertTriangle');
export const BarChart3       = duo(ChartBar, 'BarChart3');
export const BookOpen        = duo(BookOpenText, 'BookOpen');
export const CalendarDays    = duo(CalendarDots, 'CalendarDays');
export const ClipboardCheck  = duo(ListChecks, 'ClipboardCheck');
export const ClipboardList   = duo(ClipboardText, 'ClipboardList');
export const Clock           = duo(PClock, 'Clock');
export const Cloud           = duo(PCloud, 'Cloud');
export const CloudFog        = duo(PCloudFog, 'CloudFog');
export const CloudLightning  = duo(PCloudLightning, 'CloudLightning');
export const CloudRain       = duo(PCloudRain, 'CloudRain');
export const CloudSnow       = duo(PCloudSnow, 'CloudSnow');
export const Database        = duo(PDatabase, 'Database');
export const Droplets        = duo(Drop, 'Droplets');
export const Flame           = duo(Fire, 'Flame');
export const FlaskConical    = duo(Flask, 'FlaskConical');
export const Gavel           = duo(PGavel, 'Gavel');
export const GitBranch       = duo(PGitBranch, 'GitBranch');
export const Heart           = bold(PHeart, 'Heart');
export const Home            = duo(House, 'Home');
export const Info            = duo(PInfo, 'Info');
export const Layers          = duo(Stack, 'Layers');
export const LayoutDashboard = duo(SquaresFour, 'LayoutDashboard');
export const LineChart       = duo(ChartLine, 'LineChart');
export const ListOrdered     = duo(ListNumbers, 'ListOrdered');
export const Lock            = duo(PLock, 'Lock');
export const Megaphone       = duo(PMegaphone, 'Megaphone');
export const MessageCircle   = duo(ChatCircle, 'MessageCircle');
export const MousePointerClick = duo(CursorClick, 'MousePointerClick');
export const Newspaper       = duo(PNewspaper, 'Newspaper');
export const Radio           = duo(Broadcast, 'Radio');
export const Receipt         = duo(PReceipt, 'Receipt');
export const Rocket          = duo(RocketLaunch, 'Rocket');
export const Scale           = duo(Scales, 'Scale');
export const Scroll          = duo(PScroll, 'Scroll');
export const ShieldCheck     = duo(PShieldCheck, 'ShieldCheck');
export const Shirt           = duo(TShirt, 'Shirt');
export const Shuffle         = duo(PShuffle, 'Shuffle');
export const Sofa            = duo(Couch, 'Sofa');
export const Sparkles        = duo(Sparkle, 'Sparkles');
export const Star            = duo(PStar, 'Star');
export const Sword           = duo(PSword, 'Sword');
// Lucide's crossed swords. Phosphor has no pair, and a helmet says "matchup"
// in football better than any weapon did.
export const Swords          = duo(FootballHelmet, 'Swords');
export const Target          = duo(PTarget, 'Target');
export const Thermometer     = duo(PThermometer, 'Thermometer');
export const Ticket          = duo(PTicket, 'Ticket');
export const TrendingDown    = duo(TrendDown, 'TrendingDown');
export const TrendingUp      = duo(TrendUp, 'TrendingUp');
export const Trophy          = duo(PTrophy, 'Trophy');
export const User            = duo(PUser, 'User');
export const UserPlus        = duo(PUserPlus, 'UserPlus');
export const Users           = duo(PUsers, 'Users');
export const Wind            = duo(PWind, 'Wind');
export const Zap             = duo(Lightning, 'Zap');

// New, for features the old set had nothing for.
export const Helmet          = duo(FootballHelmet, 'Helmet');
export const Ball            = duo(Football, 'Ball');
export const CrownIcon       = duo(Crown, 'CrownIcon');
export const Rivalry         = duo(Handshake, 'Rivalry');
export const Idea            = duo(Lightbulb, 'Idea');
export const Verified        = duo(CheckCircle, 'Verified');

// ── Controls ─────────────────────────────────────────────────────────────────
export const ArrowDown       = bold(PArrowDown, 'ArrowDown');
export const ArrowLeft       = bold(PArrowLeft, 'ArrowLeft');
export const ArrowLeftRight  = bold(ArrowsLeftRight, 'ArrowLeftRight');
export const ArrowRight      = bold(PArrowRight, 'ArrowRight');
export const ArrowRightLeft  = bold(ArrowsLeftRight, 'ArrowRightLeft');
export const ArrowUp         = bold(PArrowUp, 'ArrowUp');
export const ArrowUpRight    = bold(PArrowUpRight, 'ArrowUpRight');
export const Check           = bold(PCheck, 'Check');
export const ChevronDown     = bold(CaretDown, 'ChevronDown');
export const ChevronLeft     = bold(CaretLeft, 'ChevronLeft');
export const ChevronRight    = bold(CaretRight, 'ChevronRight');
export const Copy            = bold(PCopy, 'Copy');
export const CornerDownLeft  = bold(ArrowElbowDownLeft, 'CornerDownLeft');
export const Eraser          = bold(PEraser, 'Eraser');
export const ExternalLink    = bold(ArrowSquareOut, 'ExternalLink');
export const Filter          = bold(Funnel, 'Filter');
export const GithubIcon      = bold(GithubLogo, 'GithubIcon');
export const GripHorizontal  = bold(DotsSixVertical, 'GripHorizontal');
export const Maximize2       = bold(ArrowsOut, 'Maximize2');
export const Menu            = bold(List, 'Menu');
export const Minimize2       = bold(ArrowsIn, 'Minimize2');
export const Minus           = bold(PMinus, 'Minus');
export const Moon            = bold(PMoon, 'Moon');
export const Plus            = bold(PPlus, 'Plus');
export const RefreshCw       = bold(ArrowsClockwise, 'RefreshCw');
export const Repeat2         = bold(Repeat, 'Repeat2');
export const RotateCcw       = bold(ArrowCounterClockwise, 'RotateCcw');
export const Search          = bold(MagnifyingGlass, 'Search');
export const Settings        = bold(GearSix, 'Settings');
export const Share2          = bold(ShareNetwork, 'Share2');
export const SlidersHorizontal = bold(PSliders, 'SlidersHorizontal');
export const Sun             = bold(PSun, 'Sun');
export const Trash2          = bold(Trash, 'Trash2');
export const Upload          = bold(UploadSimple, 'Upload');
export const X               = bold(PX, 'X');

// ── Heroicons names, still used by a few older views ─────────────────────────
export const ArrowPathIcon         = bold(ArrowsClockwise, 'ArrowPathIcon');
export const ArrowTrendingDownIcon = TrendingDown;
export const ArrowTrendingUpIcon   = TrendingUp;
export const BoltIcon              = Zap;
export const ChartBarIcon          = BarChart3;
export const CheckIcon             = Check;
export const ExclamationCircleIcon = duo(WarningCircle, 'ExclamationCircleIcon');
export const EyeIcon               = duo(Eye, 'EyeIcon');
export const FireIcon              = duo(PFire, 'FireIcon');
export const HeartIcon             = duo(PHeart, 'HeartIcon');
export const LockClosedIcon        = Lock;
export const StarIcon              = Star;
export const TrophyIcon            = Trophy;
