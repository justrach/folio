import type { ReactNode } from "react";
import { Pen, type Pt } from "@/lib/sketch";
import { Ink } from "./sketch-ink";

/**
 * Spot sketches for the workspace's empty and first-run states, in the same hand as the landing.
 * Each is decoration beside a plain statement: none shows a measured result, and the statement
 * carries the meaning, so every sketch is hidden from assistive technology. They are drawn on
 * once and then stay still (sketch-ink.css).
 */
function Spot({ children }: { children: ReactNode }) {
  return <svg className="sk sk-spot" viewBox="0 0 140 100" aria-hidden="true" focusable="false">{children}</svg>;
}
const sun = (pen: Pen, x: number, y: number, radius: number, from = 0, rays = 10) => <>
  <path className="sk-fill is-sun" d={pen.loop(x, y, radius, radius, true)} />
  <Ink tone="deep" weight="thin" i={2} d={pen.loop(x, y, radius + 2)} />
  {Array.from({ length: rays }, (_, index) => {
    const angle = (from + index * (360 / rays)) * Math.PI / 180, far = radius + (index % 2 ? 11 : 14);
    return <Ink key={index} tone="sun" i={4 + index} d={pen.line([x + Math.cos(angle) * (radius + 6), y + Math.sin(angle) * (radius + 6)], [x + Math.cos(angle) * far, y + Math.sin(angle) * far])} />;
  })}
</>;
const page = (pen: Pen, x: number, y: number, width: number, height: number, fold = 14): Pt[] =>
  [[x, y], [x + width - fold, y], [x + width, y + fold], [x + width, y + height], [x, y + height]];

/** Nothing saved yet: a dune, one flag, and the sun coming up. */
export function StartSpot() {
  const pen = new Pen(201);
  return <Spot>
    {sun(pen, 104, 27, 11, 8)}
    <Ink i={0} d={pen.curve([[4, 88], [36, 80], [62, 62], [78, 50], [98, 58], [136, 66]], false, 0)} />
    <Ink tone="soft" weight="thin" i={6} d={pen.curve([[4, 96], [50, 90], [96, 80], [136, 84]])} />
    <Ink tone="rust" i={10} d={pen.line([52, 71], [52, 46])} />
    <Ink tone="rust" i={12} d={pen.poly([[52, 46], [66, 51.5], [52, 57]])} />
  </Spot>;
}

/** History grows with every audit: four bars, each taller than the last. */
export function HistorySpot() {
  const pen = new Pen(202);
  return <Spot>
    <Ink i={0} d={pen.poly([[20, 12], [20, 88], [128, 88]])} />
    {[16, 27, 40, 56].map((height, index) => <Ink key={height} tone={index === 3 ? "rust" : "ink"} i={4 + index * 3}
      d={pen.poly([[32 + index * 24, 88], [32 + index * 24, 88 - height], [46 + index * 24, 88 - height], [46 + index * 24, 88]])} />)}
    <Ink tone="soft" weight="thin" i={16} d={pen.curve([[39, 62], [63, 52], [87, 39], [111, 22]])} />
  </Spot>;
}

/** Nothing to repair: a finished page with a tick across its corner. */
export function AllClearSpot() {
  const pen = new Pen(203);
  return <Spot>
    <Ink i={0} d={pen.poly(page(pen, 34, 10, 58, 80), true)} />
    <Ink weight="thin" i={3} d={pen.poly([[78, 10], [78, 24], [92, 24]])} />
    {[32, 44, 56, 68].map((y, index) => <Ink key={y} tone="soft" weight="thin" i={5 + index * 2} d={pen.scribble(42, y, [30, 42, 38, 24][index], 3.6)} />)}
    <Ink tone="rust" weight="bold" i={14} d={pen.poly([[76, 66], [90, 80], [118, 44]])} />
  </Spot>;
}

/** See how a website is found: a lens over a few bars. */
export function FoundSpot() {
  const pen = new Pen(204);
  return <Spot>
    <Ink tone="soft" weight="thin" i={0} d={pen.line([14, 86], [96, 86])} />
    {[22, 38, 30].map((height, index) => <Ink key={index} tone="soft" i={2 + index * 2}
      d={pen.poly([[22 + index * 24, 86], [22 + index * 24, 86 - height], [36 + index * 24, 86 - height], [36 + index * 24, 86]])} />)}
    <path className="sk-fill is-paper" d={new Pen(204, 0, 0).loop(84, 44, 23, 23, true)} />
    <Ink tone="rust" i={10} d={pen.poly([[70, 54], [70, 40], [80, 40], [80, 54]])} />
    <Ink tone="rust" i={12} d={pen.poly([[86, 54], [86, 31], [96, 31], [96, 54]])} />
    <Ink weight="bold" i={8} d={pen.loop(84, 44, 24)} />
    <Ink weight="bold" i={14} d={pen.line([101, 62], [124, 88])} />
  </Spot>;
}

/** No page audits yet: a blank page inside scan corners. */
export function AuditSpot() {
  const pen = new Pen(205);
  return <Spot>
    <Ink i={0} d={pen.poly(page(pen, 44, 16, 52, 68, 12), true)} />
    <Ink weight="thin" i={3} d={pen.poly([[84, 16], [84, 28], [96, 28]])} />
    {[40, 52, 64].map((y, index) => <Ink key={y} tone="soft" weight="thin" i={5 + index * 2} d={pen.scribble(52, y, [34, 26, 30][index], 3.4)} />)}
    {([[26, 22, 1, 1], [114, 22, -1, 1], [114, 78, -1, -1], [26, 78, 1, -1]] as const).map(([x, y, dx, dy], index) =>
      <Ink key={index} tone="rust" i={11 + index} d={pen.poly([[x + dx * 12, y], [x, y], [x, y + dy * 14]])} />)}
    <Ink tone="rust" weight="thin" i={16} d={pen.line([30, 50], [110, 50])} />
  </Spot>;
}

/** Work on websites together: three people around one shared page. */
export function TeamSpot() {
  const pen = new Pen(206);
  const person = (x: number, y: number, key: number, lead = false) => <g key={key}>
    <Ink tone={lead ? "rust" : "ink"} i={key * 4} d={pen.loop(x, y, lead ? 10 : 8.5)} />
    <Ink tone={lead ? "rust" : "ink"} i={key * 4 + 2} d={pen.curve([[x - 17, y + 34], [x - 13, y + 18], [x, y + 13], [x + 13, y + 18], [x + 17, y + 34]], false, 0.5)} />
  </g>;
  return <Spot>
    {person(32, 34, 0)}
    {person(108, 34, 1)}
    {person(70, 28, 2, true)}
    <Ink tone="soft" weight="thin" i={12} d={pen.curve([[8, 92], [50, 86], [92, 88], [132, 92]])} />
  </Spot>;
}
