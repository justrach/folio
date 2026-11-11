import type { CSSProperties, ReactNode } from "react";
import { BOIL_FRAMES, Pen, type Pt } from "@/lib/sketch";
import { Ink } from "./sketch-ink";
import "./workspace-sketches.css";

/**
 * The workspace's drawings, in the same hand as the landing: spot sketches for empty and first-run
 * states, the horizon above shared empty states, the loader, the small "still working" mark beside
 * inline loading text, and a few marks that stand in for symbols in the sample demo.
 *
 * All of it is decoration beside plain words: no drawing shows a measured result, a rank or a
 * score, and every one is hidden from assistive technology. Each is drawn once, when this module
 * loads, so rendering does no drawing work and the server and the browser draw the same strokes.
 *
 * Motion (workspace-sketches.css), only without a reduced-motion preference: spots and the horizon
 * draw on when they appear, then boil slowly (three tracings shown in turn); the loader and the
 * inline mark draw on a loop. With reduced motion every drawing is shown finished and still.
 */

/** Draws the same picture three times with a different tremor; CSS shows one frame at a time. */
function boil(seed: number, draw: (pen: Pen) => ReactNode) {
  return BOIL_FRAMES.map(frame => <g key={frame} className={`sk-frame sk-frame-${frame}`}>{draw(new Pen(seed, frame))}</g>);
}
function spot(seed: number, draw: (pen: Pen) => ReactNode) {
  return <svg className="sk sk-spot" viewBox="0 0 140 100" aria-hidden="true" focusable="false">{boil(seed, draw)}</svg>;
}
const sun = (pen: Pen, x: number, y: number, radius: number, from = 0, rays = 10) => <>
  <path className="sk-fill is-sun" d={pen.loop(x, y, radius, radius, true)} />
  <Ink tone="deep" weight="thin" i={2} d={pen.loop(x, y, radius + 2)} />
  {Array.from({ length: rays }, (_, index) => {
    const angle = (from + index * (360 / rays)) * Math.PI / 180, far = radius + (index % 2 ? 11 : 14);
    return <Ink key={index} tone="sun" i={4 + index} d={pen.line([x + Math.cos(angle) * (radius + 6), y + Math.sin(angle) * (radius + 6)], [x + Math.cos(angle) * far, y + Math.sin(angle) * far])} />;
  })}
</>;
const page = (x: number, y: number, width: number, height: number, fold = 14): Pt[] =>
  [[x, y], [x + width - fold, y], [x + width, y + fold], [x + width, y + height], [x, y + height]];

/* ── Spot sketches ─────────────────────────────────────────────────────────────────────────── */

const START = spot(201, pen => <>
  {sun(pen, 104, 27, 11, 8)}
  <Ink i={0} d={pen.curve([[4, 88], [36, 80], [62, 62], [78, 50], [98, 58], [136, 66]], false, 0)} />
  <Ink tone="soft" weight="thin" i={6} d={pen.curve([[4, 96], [50, 90], [96, 80], [136, 84]])} />
  <Ink tone="rust" i={10} d={pen.line([52, 71], [52, 46])} />
  <Ink tone="rust" i={12} d={pen.poly([[52, 46], [66, 51.5], [52, 57]])} />
</>);
/** Nothing saved yet: a dune, one flag, and the sun coming up. */
export function StartSpot() { return START; }

const HISTORY = spot(202, pen => <>
  <Ink i={0} d={pen.poly([[20, 12], [20, 88], [128, 88]])} />
  {[16, 27, 40, 56].map((height, index) => <Ink key={height} tone={index === 3 ? "rust" : "ink"} i={4 + index * 3}
    d={pen.poly([[32 + index * 24, 88], [32 + index * 24, 88 - height], [46 + index * 24, 88 - height], [46 + index * 24, 88]])} />)}
  <Ink tone="soft" weight="thin" i={16} d={pen.curve([[39, 62], [63, 52], [87, 39], [111, 22]])} />
</>);
/** History grows with every audit: four bars, each taller than the last. Decoration, not data. */
export function HistorySpot() { return HISTORY; }

const ALL_CLEAR = spot(203, pen => <>
  <Ink i={0} d={pen.poly(page(34, 10, 58, 80), true)} />
  <Ink weight="thin" i={3} d={pen.poly([[78, 10], [78, 24], [92, 24]])} />
  {[32, 44, 56, 68].map((y, index) => <Ink key={y} tone="soft" weight="thin" i={5 + index * 2} d={pen.scribble(42, y, [30, 42, 38, 24][index], 3.6)} />)}
  <Ink tone="rust" weight="bold" i={14} d={pen.poly([[76, 66], [90, 80], [118, 44]])} />
</>);
/** Nothing to repair: a finished page with a tick across its corner. */
export function AllClearSpot() { return ALL_CLEAR; }

const FOUND = spot(204, pen => <>
  <Ink tone="soft" weight="thin" i={0} d={pen.line([14, 86], [96, 86])} />
  {[22, 38, 30].map((height, index) => <Ink key={index} tone="soft" i={2 + index * 2}
    d={pen.poly([[22 + index * 24, 86], [22 + index * 24, 86 - height], [36 + index * 24, 86 - height], [36 + index * 24, 86]])} />)}
  <path className="sk-fill is-paper" d={new Pen(204, 0, 0).loop(84, 44, 23, 23, true)} />
  <Ink tone="rust" i={10} d={pen.poly([[70, 54], [70, 40], [80, 40], [80, 54]])} />
  <Ink tone="rust" i={12} d={pen.poly([[86, 54], [86, 31], [96, 31], [96, 54]])} />
  <Ink weight="bold" i={8} d={pen.loop(84, 44, 24)} />
  <Ink weight="bold" i={14} d={pen.line([101, 62], [124, 88])} />
</>);
/** See how a website is found: a lens over a few bars. */
export function FoundSpot() { return FOUND; }

const AUDIT = spot(205, pen => <>
  <Ink i={0} d={pen.poly(page(44, 16, 52, 68, 12), true)} />
  <Ink weight="thin" i={3} d={pen.poly([[84, 16], [84, 28], [96, 28]])} />
  {[40, 52, 64].map((y, index) => <Ink key={y} tone="soft" weight="thin" i={5 + index * 2} d={pen.scribble(52, y, [34, 26, 30][index], 3.4)} />)}
  {([[26, 22, 1, 1], [114, 22, -1, 1], [114, 78, -1, -1], [26, 78, 1, -1]] as const).map(([x, y, dx, dy], index) =>
    <Ink key={index} tone="rust" i={11 + index} d={pen.poly([[x + dx * 12, y], [x, y], [x, y + dy * 14]])} />)}
  <Ink tone="rust" weight="thin" i={16} d={pen.line([30, 50], [110, 50])} />
</>);
/** No page audits yet: a blank page inside scan corners. */
export function AuditSpot() { return AUDIT; }

const TEAM = spot(206, pen => {
  const person = (x: number, y: number, key: number, lead = false) => <g key={key}>
    <Ink tone={lead ? "rust" : "ink"} i={key * 4} d={pen.loop(x, y, lead ? 10 : 8.5)} />
    <Ink tone={lead ? "rust" : "ink"} i={key * 4 + 2} d={pen.curve([[x - 17, y + 34], [x - 13, y + 18], [x, y + 13], [x + 13, y + 18], [x + 17, y + 34]], false, 0.5)} />
  </g>;
  return <>
    {person(32, 34, 0)}
    {person(108, 34, 1)}
    {person(70, 28, 2, true)}
    <Ink tone="soft" weight="thin" i={12} d={pen.curve([[8, 92], [50, 86], [92, 88], [132, 92]])} />
  </>;
});
/** Work on websites together: three people around one shared page. */
export function TeamSpot() { return TEAM; }

/* ── The horizon above shared empty states ─────────────────────────────────────────────────── */

const HORIZON = <svg className="sk sk-horizon workspace-empty-art" viewBox="0 0 300 100" aria-hidden="true" focusable="false">
  <path className="sk-fill is-sky" d={new Pen(211, 0, 0.6).poly([[0, 8], [300, 4], [300, 74], [0, 80]], true)} />
  {boil(211, pen => <>
    <path className="sk-fill is-sun" d={pen.loop(210, 58, 17, 17, true)} />
    <Ink tone="deep" weight="thin" i={4} d={pen.loop(210, 58, 20)} />
    {Array.from({ length: 7 }, (_, index) => {
      const angle = (192 + index * 26) * Math.PI / 180, near = 26, far = index % 2 ? 34 : 39;
      return <Ink key={index} tone="sun" weight="thin" i={7 + index} d={pen.line([210 + Math.cos(angle) * near, 58 + Math.sin(angle) * near], [210 + Math.cos(angle) * far, 58 + Math.sin(angle) * far])} />;
    })}
    <path className="sk-fill is-dune" d={`${pen.curve([[0, 74], [60, 64], [120, 70], [176, 60], [236, 70], [300, 64]], false, 0.4)}L300 100L0 100Z`} />
    <Ink i={0} d={pen.curve([[0, 74], [60, 64], [120, 70], [176, 60], [236, 70], [300, 64]], false, 0.4)} />
    <Ink tone="line" weight="thin" i={2} d={pen.curve([[18, 86], [90, 80], [170, 88], [262, 82]])} />
    <Ink tone="line" weight="thin" i={3} d={pen.curve([[60, 95], [140, 91], [220, 96]])} />
    <Ink tone="rust" weight="thin" i={14} d={pen.curve([[62, 30], [67, 26], [71, 30]], false, 0.2) + pen.curve([[71, 30], [75, 26], [80, 30]], false, 0.2).replace(/^M/, "L")} />
    <Ink tone="soft" weight="thin" i={16} d={pen.curve([[92, 22], [96, 19], [99, 22]], false, 0.2) + pen.curve([[99, 22], [102, 19], [106, 22]], false, 0.2).replace(/^M/, "L")} />
  </>)}
</svg>;
/** The horizon over shared empty states: a dune and the sun coming up. Decorative only: never progress or evidence. */
export function HorizonSketch() { return HORIZON; }

/* ── Loading ───────────────────────────────────────────────────────────────────────────────── */

const LOADER = (() => {
  const pen = new Pen(221, 0, 0.8);
  const strokes: { d: string; tone?: "rust" | "soft"; weight?: "thin" | "bold" }[] = [
    { d: pen.poly(page(22, 6, 52, 64, 12), true) },
    { d: pen.poly([[62, 6], [62, 18], [74, 18]]), weight: "thin" },
    { d: pen.scribble(30, 30, 34, 3.6), tone: "soft", weight: "thin" },
    { d: pen.scribble(30, 41, 28, 3.6), tone: "soft", weight: "thin" },
    { d: pen.scribble(30, 52, 22, 3.6), tone: "soft", weight: "thin" },
    { d: pen.poly([[54, 54], [62, 62], [82, 36]]), tone: "rust", weight: "bold" },
  ];
  return <svg className="sk ink-loader" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
    {strokes.map((stroke, index) => <path key={index} d={stroke.d} pathLength={1} style={{ "--i": index } as CSSProperties}
      className={["sk-ink", stroke.tone && `is-${stroke.tone}`, stroke.weight && `is-${stroke.weight}`].filter(Boolean).join(" ")} />)}
  </svg>;
})();
/** A page being written and ticked, on a loop: the workspace loader's drawing. */
export function InkLoader() { return LOADER; }

const SPINNER = <svg className="sk-glyph ink-spinner" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path className="sk-ink" pathLength={1} d={new Pen(231, 0, 0.5).loop(8, 8, 5.4)} />
</svg>;
/** The small mark beside inline "Loading…" text: a loop drawn and undrawn while the words say what is happening. */
export function InkSpinner() { return SPINNER; }

/* ── Marks that replace text symbols ───────────────────────────────────────────────────────── */

const glyph = (className: string, paths: string[]) => <svg className={`sk-glyph ${className}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  {paths.map((d, index) => <path key={index} className="sk-ink" d={d} />)}
</svg>;
const SYMBOLS = (() => {
  const pen = new Pen(241, 0, 0.45);
  return {
    asterisk: glyph("ink-symbol", [pen.line([8, 2.5], [8, 13.5]), pen.line([3.2, 5.2], [12.8, 10.8]), pen.line([3.2, 10.8], [12.8, 5.2])]),
    columns: glyph("ink-symbol", [pen.poly([[2.5, 3], [13.5, 3], [13.5, 13], [2.5, 13]], true), pen.line([6.2, 6], [6.2, 10.5]), pen.line([9.8, 6], [9.8, 10.5])]),
    spark: glyph("ink-symbol", [pen.curve([[8, 1.8], [8.7, 6.6], [14.2, 8], [8.7, 9.4], [8, 14.2], [7.3, 9.4], [1.8, 8], [7.3, 6.6]], true, 0.15)]),
    dots: glyph("ink-dots", [`${pen.sprinkle(3.6, 7.6, 0.6, 0.6, 1)}${pen.sprinkle(7.7, 7.9, 0.6, 0.6, 1)}${pen.sprinkle(11.8, 7.7, 0.6, 0.6, 1)}`]),
  };
})();
export type InkSymbolKind = keyof typeof SYMBOLS;
/** A small drawn mark used where a text symbol (✳ ▥ ✦ ···) used to stand. Decoration: the words beside it carry the meaning. */
export function InkSymbol({ kind }: { kind: InkSymbolKind }) { return SYMBOLS[kind]; }
