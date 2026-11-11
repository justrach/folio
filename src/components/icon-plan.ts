import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import type { TraceOptions } from "../lib/sketch";

/**
 * Reads an icon's planned geometry (src/components/icons.tsx) into path data for the pen to trace.
 * Paths, circles and rectangles are understood, through fragments. Anything else throws, so a
 * glyph drawn with an element the pen cannot trace (line, polyline, ellipse…) fails when the
 * module loads and in tests, instead of quietly disappearing from the icon.
 * A shape may carry `data-trace` (TraceOptions) to steady the hand for that stroke.
 */
export type Plan = { d: string; props: Record<string, unknown>; options?: TraceOptions };
const f = (value: unknown) => Number(value ?? 0);

/** A circle as path data, starting at `start` radians. */
export function circlePath(cx: number, cy: number, r: number, start: number) {
  const ax = cx + r * Math.cos(start), ay = cy + r * Math.sin(start), bx = cx * 2 - ax, by = cy * 2 - ay;
  return `M${ax} ${ay}A${r} ${r} 0 0 1 ${bx} ${by}A${r} ${r} 0 0 1 ${ax} ${ay}Z`;
}
export function rectPath(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

export function planGlyph(node: ReactNode, out: Plan[] = []): Plan[] {
  Children.forEach(node, child => {
    if (child === null || child === undefined || typeof child === "boolean") return;
    if (!isValidElement(child)) throw new Error(`An icon can only hold shapes, not ${JSON.stringify(child)}`);
    const { children, d, cx, cy, r, x, y, width, height, rx, "data-trace": trace, ...props } = (child as ReactElement<Record<string, unknown> & { children?: ReactNode }>).props;
    const options = trace as TraceOptions | undefined;
    if (child.type === "path") out.push({ d: String(d), props, options });
    // A circle starts a little left of the top, at a different place for each circle in the glyph.
    else if (child.type === "circle") out.push({ d: circlePath(f(cx), f(cy), f(r), -1.9 - out.length * 0.7), props, options });
    else if (child.type === "rect") out.push({ d: rectPath(f(x), f(y), f(width), f(height), f(rx)), props, options });
    else if (child.type === Fragment) planGlyph(children, out);
    else throw new Error(`The pen cannot trace <${typeof child.type === "string" ? child.type : "component"}> in an icon; draw it as a path, circle or rect.`);
  });
  return out;
}
