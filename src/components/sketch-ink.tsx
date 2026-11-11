import type { CSSProperties } from "react";
import "./sketch-ink.css";

export type Tone = "ink" | "rust" | "soft" | "sun" | "deep" | "line";
export type InkProps = { d: string; tone?: Tone; weight?: "thin" | "bold"; i?: number; still?: boolean; className?: string };

/** One stroke. `i` staggers when it is drawn; `still` strokes appear without being drawn on. */
export function Ink({ d, tone = "ink", weight, i = 0, still, className }: InkProps) {
  const classes = ["sk-ink", `is-${tone}`, weight && `is-${weight}`, !still && "sk-draw", className].filter(Boolean).join(" ");
  return <path d={d} pathLength={1} className={classes} style={{ "--i": i } as CSSProperties} />;
}
