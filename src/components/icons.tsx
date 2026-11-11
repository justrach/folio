import type { ReactNode, SVGProps } from "react";
import { BOIL_FRAMES, Pen } from "../lib/sketch";
import { planGlyph } from "./icon-plan";

/**
 * Folio's own icon set, drawn by hand. Nothing is taken from an icon library.
 *
 * Each glyph below is written as plain geometry on a 24-unit grid (3-unit margin, round caps and
 * joins, no fills, 2.5-unit box corners; a dot is a zero-length line, `h.01`). That geometry is the
 * plan, not what is shown: when this module loads, the pen in src/lib/sketch.ts traces every
 * glyph once (`Pen.trace`), so corners land a little off, straight runs bow and closed outlines
 * run past where they began. The trace is seeded by the icon's name, so the server and the
 * browser draw the same strokes, and no render does any drawing work.
 *
 * Use: `<ArrowRight size={15} />`. `size` sets width and height; any SVG attribute passes through.
 * An icon is decorative (`aria-hidden`) unless it is given `aria-label`, `aria-labelledby` or `role`.
 * `boil` adds two more tracings of the same glyph (three frames); CSS in src/app/ink.css shows one
 * at a time where a boil is wanted (the current page in the rail, a hovered rail link). Without
 * it the icon is a single tracing, so ordinary icons cost no extra nodes.
 *
 * Adding one: draw it on the same grid, add `export const Name = icon("Name", <>…</>)` in the
 * matching group, and look at it at both sizes with `node --import tsx scripts/icon-sheet.ts`.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number | string; boil?: boolean };
export type FolioIcon = { (props: IconProps): ReactNode; displayName?: string };

/** A stable seed from the icon's name. */
const seedOf = (name: string) => [...name].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261) % 100000;

function icon(name: string, body: ReactNode): FolioIcon {
  const shapes = planGlyph(body), seed = seedOf(name);
  // Traced once, here, for all three frames.
  const frames = BOIL_FRAMES.map(frame => {
    const pen = new Pen(seed, frame);
    return shapes.map((shape, index) => <path key={index} d={pen.trace(shape.d, shape.options)} {...shape.props} />);
  });
  const still = frames[0];
  const boiling = frames.map((paths, frame) => <g key={frame} className={`folio-icon-frame is-${frame}`}>{paths}</g>);
  function Icon({ size = 24, strokeWidth = 1.75, className, boil, ...rest }: IconProps) {
    const labelled = rest["aria-label"] !== undefined || rest["aria-labelledby"] !== undefined || rest.role !== undefined;
    const classes = `folio-icon${boil ? " is-boil" : ""}${className ? ` ${className}` : ""}`;
    return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={classes}
      aria-hidden={labelled ? undefined : true} focusable="false" {...rest}>{boil ? boiling : still}</svg>;
  }
  Icon.displayName = name;
  return Icon;
}

/* Shared parts. */
const ring = <circle cx="12" cy="12" r="9" />;
const meridians = <><path d="M12 3a13.5 13.5 0 0 1 0 18" /><path d="M12 3a13.5 13.5 0 0 0 0 18" /></>;
const shield = <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.7 7 9.3 4.1-1.6 7-5 7-9.3V5.8L12 3Z" />;
const sheet = <><path d="M13.5 3h-6A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-10L13.5 3Z" /><path d="M13.5 3v5.5H19" /></>;
const corners = <><path d="M4 8.5v-2A2.5 2.5 0 0 1 6.5 4h2" /><path d="M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2" /><path d="M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2" /><path d="M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2" /></>;
const lens = <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.8-4.8" /></>;
const speaker = <path d="M11.5 5.5v13l-4.5-4H4.5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1H7l4.5-4Z" />;
const plug = <><path d="M9 3v5" /><path d="M15 3v5" /><path d="M6.5 8h11v2.5a5.5 5.5 0 0 1-11 0V8Z" /><path d="M12 16v5" /></>;
const warningTriangle = <><path d="M10.3 4.9 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z" /><path d="M12 10v4" /><path d="M12 17.2h.01" /></>;

/* Arrows and chevrons. */
export const ArrowRight = icon("ArrowRight", <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>);
export const ArrowLeft = icon("ArrowLeft", <><path d="M20 12H4" /><path d="m10 6-6 6 6 6" /></>);
export const ArrowUp = icon("ArrowUp", <><path d="M12 20V4" /><path d="m6 10 6-6 6 6" /></>);
export const ArrowDown = icon("ArrowDown", <><path d="M12 4v16" /><path d="m6 14 6 6 6-6" /></>);
export const ArrowUpRight = icon("ArrowUpRight", <><path d="M6 18 18 6" /><path d="M9 6h9v9" /></>);
export const ArrowDownRight = icon("ArrowDownRight", <><path d="m6 6 12 12" /><path d="M18 9v9H9" /></>);
export const ArrowDownToLine = icon("ArrowDownToLine", <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>);
export const ArrowLeftRight = icon("ArrowLeftRight", <><path d="M4 8h15" /><path d="m16 5 3 3-3 3" /><path d="M20 16H5" /><path d="m8 13-3 3 3 3" /></>);
export const ArrowUpDown = icon("ArrowUpDown", <><path d="M8 20V5" /><path d="m5 8 3-3 3 3" /><path d="M16 4v15" /><path d="m13 16 3 3 3-3" /></>);
export const ChevronDown = icon("ChevronDown", <path d="m6 9 6 6 6-6" />);
export const ChevronLeft = icon("ChevronLeft", <path d="m15 6-6 6 6 6" />);
export const ChevronRight = icon("ChevronRight", <path d="m9 6 6 6-6 6" />);
export const ChevronsUpDown = icon("ChevronsUpDown", <><path d="m8 9 4-4 4 4" /><path d="m8 15 4 4 4-4" /></>);
export const ExternalLink = icon("ExternalLink", <><path d="M11 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5V13" /><path d="M14.5 4H20v5.5" /><path d="m20 4-8.5 8.5" /></>);
export const Download = icon("Download", <><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 16.5v1A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-1" /></>);
export const RefreshCw = icon("RefreshCw", <><path d="M4 12a8 8 0 0 1 13.9-5.4L20 8.7" /><path d="M20 4v4.7h-4.7" /><path d="M20 12a8 8 0 0 1-13.9 5.4L4 15.3" /><path d="M4 20v-4.7h4.7" /></>);
export const RotateCcw = icon("RotateCcw", <><path d="M4.5 9.3a8 8 0 1 1-.4 3.7" /><path d="M4 4v5.3h5.3" /></>);
export const LogIn = icon("LogIn", <><path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" /><path d="M4 12h10" /><path d="m10 8 4 4-4 4" /></>);
export const LogOut = icon("LogOut", <><path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" /><path d="M10 12h10" /><path d="m16 8 4 4-4 4" /></>);

/* Marks and controls. */
export const Check = icon("Check", <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const CheckCheck = icon("CheckCheck", <><path d="m2.5 12.5 4 4 8-8.5" /><path d="m12 15 1.5 1.5 8-8.5" /></>);
export const X = icon("X", <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>);
export const Plus = icon("Plus", <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const Minus = icon("Minus", <path d="M5 12h14" />);
export const Menu = icon("Menu", <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>);
export const MoreHorizontal = icon("MoreHorizontal", <><path d="M5.5 12h.01" strokeWidth="3" /><path d="M12 12h.01" strokeWidth="3" /><path d="M18.5 12h.01" strokeWidth="3" /></>);
export const List = icon("List", <><path d="M9 7h11" /><path d="M9 12h11" /><path d="M9 17h11" /><path d="M4.5 7h.01" /><path d="M4.5 12h.01" /><path d="M4.5 17h.01" /></>);
export const ListChecks = icon("ListChecks", <><path d="m3.5 7 1.5 1.5 3-3" /><path d="m3.5 16.5 1.5 1.5 3-3" /><path d="M12 7h8.5" /><path d="M12 16.5h8.5" /></>);
export const Play = icon("Play", <path d="M7 5.5v13a1 1 0 0 0 1.5.9l10.6-6.5a1 1 0 0 0 0-1.8L8.5 4.6a1 1 0 0 0-1.5.9Z" />);
export const Pause = icon("Pause", <><rect x="6.5" y="5" width="3.5" height="14" rx="1.25" /><rect x="14" y="5" width="3.5" height="14" rx="1.25" /></>);
// Spins: a steady hand, so the arc turns about its centre instead of orbiting.
export const Loader2 = icon("Loader2", <path d="M21 12a9 9 0 1 1-6.2-8.56" data-trace={{ hand: 0.12, boil: 0.08, bow: 0.02, maxBow: 0.3 }} />);
export const Settings2 = icon("Settings2", <><path d="M4 8h9" /><path d="M17 8h3" /><circle cx="15" cy="8" r="2" /><path d="M4 16h3" /><path d="M11 16h9" /><circle cx="9" cy="16" r="2" /></>);
export const Settings = icon("Settings", <><path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9L12 3Z" /><circle cx="12" cy="12" r="3" /></>);

/* Status. */
export const Info = icon("Info", <>{ring}<path d="M12 11v5.5" /><path d="M12 7.5h.01" /></>);
export const CircleHelp = icon("CircleHelp", <>{ring}<path d="M9.4 9.5a2.7 2.7 0 0 1 5.2.9c0 1.7-2.6 2.2-2.6 3.9" /><path d="M12 17h.01" /></>);
export const CircleCheck = icon("CircleCheck", <>{ring}<path d="m8.2 12.3 2.6 2.6 5-5.3" /></>);
// Dashes measured along the drawn stroke (pathLength), so eight of them close evenly however the ring was traced.
export const CircleDashed = icon("CircleDashed", <circle cx="12" cy="12" r="9" pathLength={8} strokeDasharray=".47 .53" data-trace={{ overshoot: 0, hand: 0.3 }} />);
export const TriangleAlert = icon("TriangleAlert", warningTriangle);
export const AlertTriangle = icon("AlertTriangle", warningTriangle);
export const OctagonAlert = icon("OctagonAlert", <><path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3L8.3 3Z" /><path d="M12 8v4.5" /><path d="M12 16h.01" /></>);
export const ShieldCheck = icon("ShieldCheck", <>{shield}<path d="m9 11.8 2.2 2.2 3.8-4" /></>);
export const ShieldAlert = icon("ShieldAlert", <>{shield}<path d="M12 8v4.5" /><path d="M12 15.8h.01" /></>);
export const Clock3 = icon("Clock3", <>{ring}<path d="M12 7v5h4.5" /></>);

/* Search and reading. */
export const Search = icon("Search", lens);
export const SearchCheck = icon("SearchCheck", <>{lens}<path d="m7.8 10.7 1.9 1.9 3.5-3.7" /></>);
export const ScanSearch = icon("ScanSearch", <>{corners}<circle cx="11.5" cy="11.5" r="3" /><path d="m16 16-2.3-2.3" /></>);
export const ScanLine = icon("ScanLine", <>{corners}<path d="M7.5 12h9" /></>);
export const Eye = icon("Eye", <><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.75" /></>);
export const EyeOff = icon("EyeOff", <><path d="m4 4 16 16" /><path d="M10 5.7a9.6 9.6 0 0 1 2-.2c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.3 3.2" /><path d="M6.6 7.4C4 9.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.3 9.3 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const Compass = icon("Compass", <>{ring}<path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" /></>);
export const Globe = icon("Globe", <>{ring}<path d="M3 12h18" />{meridians}</>);
export const Globe2 = icon("Globe2", <>{ring}<path d="M3.7 8.5h16.6" /><path d="M3.7 15.5h16.6" />{meridians}</>);

/* Files and writing. */
export const FileText = icon("FileText", <>{sheet}<path d="M9 13h6" /><path d="M9 16.5h4" /></>);
export const FileCheck2 = icon("FileCheck2", <>{sheet}<path d="m9 14.8 2 2 4-4.2" /></>);
export const FileCode2 = icon("FileCode2", <>{sheet}<path d="m10.5 12.5-2 2.2 2 2.2" /><path d="m13.5 12.5 2 2.2-2 2.2" /></>);
export const FileSpreadsheet = icon("FileSpreadsheet", <>{sheet}<path d="M8.5 12.5h7v5h-7v-5Z" /><path d="M8.5 15h7" /><path d="M12 12.5v5" /></>);
export const BookOpen = icon("BookOpen", <><path d="M12 6.5v13" /><path d="M12 6.5c-1.5-1.5-3.8-2-8.5-2v13c4.7 0 7 .5 8.5 2" /><path d="M12 6.5c1.5-1.5 3.8-2 8.5-2v13c-4.7 0-7 .5-8.5 2" /></>);
export const Copy = icon("Copy", <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" /></>);
export const Clipboard = icon("Clipboard", <><rect x="9" y="3" width="6" height="4" rx="1.25" /><path d="M9 5H7.5A2.5 2.5 0 0 0 5 7.5v11A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 16.5 5H15" /></>);
export const PencilLine = icon("PencilLine", <><path d="M12.5 20h8" /><path d="M16 4.5a2.2 2.2 0 0 1 3 3L8.5 18 4 19.5 5.5 15 16 4.5Z" /><path d="m14 6.5 3 3" /></>);
export const Trash2 = icon("Trash2", <><path d="M4 7h16" /><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" /><path d="m6 7 .8 11.2A2 2 0 0 0 8.8 20h6.4a2 2 0 0 0 2-1.8L18 7" /><path d="M10 11v5" /><path d="M14 11v5" /></>);
export const Layers = icon("Layers", <><path d="m12 3.5 9 4.5-9 4.5L3 8l9-4.5Z" /><path d="m3 12 9 4.5 9-4.5" /><path d="m3 16 9 4.5 9-4.5" /></>);

/* People and messages. */
export const Users = icon("Users", <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4" /><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>);
export const UserPlus = icon("UserPlus", <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20a6.5 6.5 0 0 1 13 0" /><path d="M19 8v6" /><path d="M16 11h6" /></>);
export const Bot = icon("Bot", <><rect x="4" y="8" width="16" height="11.5" rx="3" /><path d="M12 8V5" /><circle cx="12" cy="3.75" r="1.25" /><path d="M9 12.5v2" /><path d="M15 12.5v2" /><path d="M2 12.5v3" /><path d="M22 12.5v3" /></>);
export const Building2 = icon("Building2", <><path d="M5 21V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V21" /><path d="M15 10h2.5a1.5 1.5 0 0 1 1.5 1.5V21" /><path d="M3 21h18" /><path d="M8.5 8h3" /><path d="M8.5 12h3" /><path d="M8.5 16h3" /></>);
export const Mail = icon("Mail", <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7.5 8.5 6 8.5-6" /></>);
export const MessageCircle = icon("MessageCircle", <path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5Z" />);
export const MessageSquareText = icon("MessageSquareText", <><path d="M21 14.5a2.5 2.5 0 0 1-2.5 2.5H8l-5 4V6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v8Z" /><path d="M8 9h8" /><path d="M8 12.5h5" /></>);
export const Send = icon("Send", <><path d="M20.5 3.5 3.5 10l6.5 3.5 3.5 7 7-17Z" /><path d="M10 13.5 20.5 3.5" /></>);
export const Share2 = icon("Share2", <><circle cx="17.5" cy="5.5" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="18.5" r="2.5" /><path d="m8.7 10.7 6.6-3.9" /><path d="m8.7 13.3 6.6 3.9" /></>);
export const Link2 = icon("Link2", <><path d="M9 16.5H7.5a4.5 4.5 0 0 1 0-9H9" /><path d="M15 7.5h1.5a4.5 4.5 0 0 1 0 9H15" /><path d="M8.5 12h7" /></>);
export const Heart = icon("Heart", <path d="M12 20.5C6.5 16.9 3.5 13.4 3.5 9.6A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.5 2.4c0 3.8-3 7.3-8.5 10.9Z" />);

/* Access and money. */
export const LockKeyhole = icon("LockKeyhole", <><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /><circle cx="12" cy="14.5" r="1" /><path d="M12 15.5v2" /></>);
export const KeyRound = icon("KeyRound", <><circle cx="8" cy="16" r="4.5" /><path d="M11.2 12.8 20 4" /><path d="M16.5 7.5 19 10" /><path d="m19 5 2 2" /></>);
export const Fingerprint = icon("Fingerprint", <><path d="M12 10.5v3a9 9 0 0 1-1.5 5" /><path d="M8.5 17.5a11 11 0 0 0 .5-3.5v-3.5a3 3 0 0 1 6 0V14a14 14 0 0 1-1 5.5" /><path d="M5.5 14.5c.3-.8.5-1.7.5-2.6v-1.4a6 6 0 0 1 12 0v3c0 1.2-.1 2.3-.4 3.5" /><path d="M4.5 7.5A9 9 0 0 1 17 4.6" /></>);
export const CreditCard = icon("CreditCard", <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18" /><path d="M7 15h3" /></>);
export const Coins = icon("Coins", <><circle cx="9" cy="9" r="5.5" /><path d="M14.5 9.5a5.5 5.5 0 1 1-5 5" /></>);

/* Layout, screens and code. */
export const LayoutDashboard = icon("LayoutDashboard", <><rect x="3.5" y="3.5" width="7" height="9" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.5" /></>);
export const LayoutGrid = icon("LayoutGrid", <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>);
export const Monitor = icon("Monitor", <><rect x="3" y="4" width="18" height="12" rx="2.5" /><path d="M12 16v4" /><path d="M8 20h8" /></>);
export const AppWindow = icon("AppWindow", <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M3 9h18" /><path d="M6.5 6.8h.01" /><path d="M9.5 6.8h.01" /></>);
export const Terminal = icon("Terminal", <><path d="m5 7 5 5-5 5" /><path d="M12 18h7" /></>);
export const SquareTerminal = icon("SquareTerminal", <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m7.5 9 3 3-3 3" /><path d="M12.5 15h4" /></>);
export const Code2 = icon("Code2", <><path d="m8.5 8-4.5 4 4.5 4" /><path d="m15.5 8 4.5 4-4.5 4" /><path d="m13.5 5-3 14" /></>);
export const MousePointer2 = icon("MousePointer2", <path d="m5 4.5 14.5 5.3-6 2.9-2.9 6L5 4.5Z" />);
export const GitCompareArrows = icon("GitCompareArrows", <><circle cx="5.5" cy="6" r="2.5" /><circle cx="18.5" cy="18" r="2.5" /><path d="M11 6h4a3.5 3.5 0 0 1 3.5 3.5v6" /><path d="M13.5 3.5 11 6l2.5 2.5" /><path d="M13 18H9a3.5 3.5 0 0 1-3.5-3.5v-6" /><path d="m10.5 15.5 2.5 2.5-2.5 2.5" /></>);

/* Charts and time. */
export const BarChart3 = icon("BarChart3", <><path d="M4 4v16h16" /><path d="M8.5 16v-3.5" /><path d="M13 16V8.5" /><path d="M17.5 16v-6" /></>);
export const ChartNoAxesCombined = icon("ChartNoAxesCombined", <><path d="M5 20v-4" /><path d="M10 20v-7" /><path d="M15 20v-5" /><path d="M20 20v-9" /><path d="m4 11 5-4 4 3 7-6" /></>);
export const CalendarRange = icon("CalendarRange", <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M3.5 10h17" /><path d="M8 15h8" /></>);
export const Trophy = icon("Trophy", <><path d="M7 4h10v5.5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 7.4 11" /><path d="M17 6h2.5v1.5a3.5 3.5 0 0 1-2.9 3.5" /><path d="M12 14.5V17" /><path d="M9 17h6l1 3.5H8L9 17Z" /></>);

/* Tools and making. */
export const Wrench = icon("Wrench", <path d="M15.4 4 13.6 5.9l4.5 4.5L20 8.6a5 5 0 0 1-7.1 4.9l-6.4 6.4a1.75 1.75 0 0 1-2.4-2.4l6.4-6.4A5 5 0 0 1 15.4 4Z" />);
export const Plug = icon("Plug", plug);
export const PlugZap = icon("PlugZap", <>{plug}<path d="m12.6 9.5-1.8 2.5h2.4l-1.8 2.5" /></>);
export const FlaskConical = icon("FlaskConical", <><path d="M9 3h6" /><path d="M10 3v6.2L4.6 18.2A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.8L14 9.2V3" /><path d="M7.3 14.5h9.4" /></>);
export const Sparkles = icon("Sparkles", <><path d="M10 4.5 11.6 9a2 2 0 0 0 1.2 1.2l4.7 1.8-4.7 1.8a2 2 0 0 0-1.2 1.2L10 19.5 8.4 15a2 2 0 0 0-1.2-1.2L2.5 12l4.7-1.8A2 2 0 0 0 8.4 9L10 4.5Z" /><path d="M19 3.5v4" /><path d="M17 5.5h4" /><path d="M19.5 17.5v3" /><path d="M18 19h3" /></>);
export const WandSparkles = icon("WandSparkles", <><path d="m15.2 5.6 3.2 3.2L7.2 20 4 16.8 15.2 5.6Z" /><path d="m12.4 8.4 3.2 3.2" /><path d="M7 3.5v3" /><path d="M5.5 5h3" /><path d="M19.5 14v3" /><path d="M18 15.5h3" /></>);

/* Weather, light and sound. */
export const Sun = icon("Sun", <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2" /><path d="M12 19.5v2" /><path d="M2.5 12h2" /><path d="M19.5 12h2" /><path d="m5.3 5.3 1.4 1.4" /><path d="m17.3 17.3 1.4 1.4" /><path d="m5.3 18.7 1.4-1.4" /><path d="m17.3 6.7 1.4-1.4" /></>);
export const Moon = icon("Moon", <path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7.5 7.5 0 0 0 10 10Z" />);
export const SunMoon = icon("SunMoon", <><path d="M12 7.5a4.5 4.5 0 1 0 4.5 4.5 3.5 3.5 0 0 1-4.5-4.5Z" /><path d="M12 2.5V4" /><path d="M12 20v1.5" /><path d="M2.5 12H4" /><path d="M20 12h1.5" /><path d="m5.3 5.3 1 1" /><path d="m17.7 17.7 1 1" /><path d="m5.3 18.7 1-1" /><path d="m17.7 6.3 1-1" /></>);
export const Cloud = icon("Cloud", <path d="M7.5 18.5a4 4 0 0 1-.7-7.94A5.5 5.5 0 0 1 17.4 9.6a4.5 4.5 0 0 1-.4 8.9h-9.5Z" />);
export const Volume2 = icon("Volume2", <>{speaker}<path d="M15 9.2a4 4 0 0 1 0 5.6" /><path d="M17.8 6.4a8 8 0 0 1 0 11.2" /></>);
export const VolumeX = icon("VolumeX", <>{speaker}<path d="m16 9.5 5 5" /><path d="m21 9.5-5 5" /></>);
