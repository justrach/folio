"use client";

// Actual Bencho Stacked Bars (MIT), configured for published Folio observations.
import { type CSSProperties, useEffect, useRef, useState, useLayoutEffect } from "react";
import { animate, motion, useMotionValue } from "motion/react";

/* ══ Stacked bars ═════════════════════════════════════════
   An alert-volume card: a stack of four sources for every day (or
   week), and under the baseline the few that were escalated.

   ── RUN ALONG IT ────────────────────────────────────────
   The column under the pointer gets a ring round its whole stack,
   the rest step back (their colour mixed toward the slab, never
   faded), and one tooltip glides beside it on a spring with the
   date, the total and what made it up.

   ── DAY / WEEK ──────────────────────────────────────────
   Swaps the dataset; every segment eases to its new height and
   offset a beat after its left neighbour. The same transition
   grows the bars out of the baseline the first time the card is
   seen. */

const DEFAULT_WIDTH = 500;
const PAD = 16;
const CH = 104; // room above the baseline
const BH = 0; // room below it for the escalated bars
const SEG_GAP = 2;
const LIFT = 2; // air between the baseline and the bars either side of it
const TIP_W = 132;
const SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

type Mode = "Day" | "Week";
export type Bar = { vals: number[]; esc: number; label: string; short: string };

const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export function StackedBars({
  colour = "Colour",
  series,
  categories,
  gap = 6,
}: {
  colour?: "Mono" | "Colour";
  series: Record<Mode, Bar[]>;
  categories: string[];
  gap?: number;
}) {
  const CATS = categories;
  const [mode, setMode] = useState<Mode>("Day");
  const [at, setAt] = useState<number | null>(null);
  const [seen, setSeen] = useState(true);
  const root = useRef<HTMLDivElement | null>(null);
  const plot = useRef<HTMLDivElement | null>(null);

  /* grow in once, the first time the card is on screen */
  useEffect(() => {
    const el = root.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const data = series[mode];
  const n = data.length;
  const [W, setWidth] = useState(DEFAULT_WIDTH);
  const CW = Math.max(100, W - PAD * 2);
  useLayoutEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width + PAD * 2));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  /* geometry: the gap gives way before a bar gets thinner than 3px,
     so 30 bars at the widest gap still draw */
  const g = Math.max(1, Math.min(gap, (CW - 3 * n) / (n - 1)));
  const bw = (CW - g * (n - 1)) / n;
  const r = Math.min(2.5, bw / 2);
  const totals = data.map((b) => sum(b.vals));
  const maxT = Math.max(1, ...totals);
  const maxE = Math.max(1, ...data.map((b) => b.esc));
  const scale = (CH - LIFT - 2 - SEG_GAP * (CATS.length - 1)) / maxT;
  const layout = data.map((b) => {
    let y = 0;
    const segs = b.vals.map((v) => {
      const h = v > 0 ? Math.max(2, v * scale) : 0;
      const s = { bottom: y, h };
      if (h > 0) y += h + SEG_GAP;
      return s;
    });
    return { segs, top: Math.max(0, y - SEG_GAP), esc: Math.max(3, (b.esc / maxE) * (BH - LIFT - 2)) };
  });

  /* the headline pops in on a change, Price flow's way: every
     character is keyed by a generation, so a new total is new
     elements and each plays one short entrance, left to right.
     The first paint does not play it; only a change does. */
  const total = sum(totals);
  const [gen, setGen] = useState(0);
  const last = useRef(total);
  useEffect(() => {
    if (last.current === total) return;
    last.current = total;
    setGen((g) => g + 1);
  }, [total]);

  /* ring and tooltip: placed at once when they appear, glide after */
  const ringX = useMotionValue(0);
  const ringY = useMotionValue(0);
  const ringH = useMotionValue(0);
  const tipX = useMotionValue(0);
  const was = useRef<number | null>(null);
  useEffect(() => {
    if (at === null || at >= n) { was.current = null; return; }
    const L = layout[at];
    const left = at * (bw + g);
    const x = left - 3;
    const up = seen ? L.top : 0;
    const down = seen ? L.esc : 0;
    const y = CH - LIFT - up - 3;
    const h = up + LIFT + 1 + LIFT + down + 6;
    /* beside the column: right while it fits there, else left */
    const right = left + bw + 8;
    const tx = right + TIP_W <= CW || left - 8 - TIP_W < 0
      ? Math.min(CW - TIP_W, right)
      : left - 8 - TIP_W;
    const go = (mv: typeof ringX, v: number) => {
      if (was.current === null) mv.set(v);
      else animate(mv, v, SPRING);
    };
    go(ringX, x); go(ringY, y); go(ringH, h); go(tipX, tx);
    was.current = at;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, n, bw, g, mode, seen]);

  const pick = (e: React.PointerEvent) => {
    const b = plot.current?.getBoundingClientRect();
    if (!b || b.width === 0) return;
    const i = Math.floor(((e.clientX - b.left) / b.width) * n);
    setAt(Math.max(0, Math.min(n - 1, i)));
  };

  const cur = at !== null && at < n ? data[at] : null;
  const top2 = cur
    ? cur.vals.map((v, k) => ({ v, k })).sort((a, b) => b.v - a.v).slice(0, 2)
    : [];

  return (
    <div
      ref={root}
      className="stb"
      data-colour={colour === "Colour" ? "on" : "off"}
      data-scrub={cur ? "" : undefined}
      style={{ width: "100%", ["--stb-r" as string]: `${r}px`, ["--stb-rr" as string]: `${r + 3}px` } as CSSProperties}
    >
      <div className="stb-head">
        <div className="stb-titles">
          <div className="stb-title">Published observations</div>
          <div className="stb-sub">{n} {mode === "Day" ? "days" : "weeks"} ending {data[n - 1].label}</div>
        </div>
        <div className="stb-seg-ctl" data-mode={mode} role="group" aria-label="Observation interval">
          <span className="stb-thumb" aria-hidden />
          {(["Day", "Week"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              data-on={mode === m || undefined}
              className="stb-tab"
              onClick={() => { setMode(m); }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="stb-figure">
        <span className="stb-num" aria-label={fmt(total)}>
          {fmt(total).split("").map((ch, i) => (
            <span key={`${gen}-${i}`} className="stb-digit" data-pop={gen > 0 || undefined} style={{ ["--i" as string]: i } as CSSProperties} aria-hidden>
              {ch}
            </span>
          ))}
        </span>
        <span className="stb-unit">saved observations in this window</span>
      </div>

      <div
        ref={plot}
        className="stb-plot"
        style={{ height: CH + 1 + BH }}
        onPointerDown={(e) => {
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* scripted */ }
          pick(e);
        }}
        onPointerMove={pick}
        onPointerUp={(e) => {
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* scripted */ }
          if (e.pointerType !== "mouse") setAt(null);
        }}
        onPointerCancel={() => setAt(null)}
        onPointerLeave={() => setAt(null)}
      >
        <span className="stb-base" style={{ top: CH }} />
        {data.map((_, i) => (
          <div
            key={i}
            className="stb-col"
            data-on={at === i || undefined}
            style={{ left: i * (bw + g), width: bw, ["--i" as string]: i } as CSSProperties}
          >
            {layout[i].segs.map((s, k) => (
              <span
                key={k}
                className="stb-bar"
                style={{
                  ["--c" as string]: `var(--stb-c${k + 1})`,
                  bottom: BH + 1 + LIFT + (seen ? s.bottom : 0),
                  height: seen ? s.h : 0,
                } as CSSProperties}
              />
            ))}
            <span
              className="stb-esc"
              style={{ top: CH + 1 + LIFT, height: seen ? layout[i].esc : 0 }}
            />
          </div>
        ))}

        <motion.span
          className="stb-ring"
          aria-hidden
          style={{ x: ringX, y: ringY, height: ringH, width: bw + 6 }}
        />

        <motion.div className="stb-tip" style={{ x: tipX, width: TIP_W }} aria-hidden={!cur}>
          {cur && (
            <>
              <div className="stb-tip-head">
                <span>{cur.label}</span>
                <b>{fmt(totals[at!])}</b>
              </div>
              {top2.map(({ v, k }) => (
                <div className="stb-tip-row" key={CATS[k]}>
                  <i style={{ ["--c" as string]: `var(--stb-c${k + 1})` } as CSSProperties} />
                  <span>{CATS[k]}</span>
                  <b>{fmt(v)}</b>
                </div>
              ))}
            </>
          )}
        </motion.div>
      </div>

      <div className="stb-axis">
        <span>{data[0].short}</span>
        <span>{data[n - 1].short}</span>
      </div>
    </div>
  );
}
