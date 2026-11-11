"use client";
import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { BOIL_FRAMES, Pen, type Pt } from "@/lib/sketch";
import { Ink } from "./sketch-ink";
import "./onboarding-sketch.css";

/**
 * The onboarding's drawings (/start). Every figure is placed point by point here and inked by
 * `Pen` (src/lib/sketch.ts), in the same hand as the landing. They are decoration: each scene says
 * what a step is for, and none shows a measured result, a rank or a promise. The one exception is
 * `InkMeter`, which draws a real, measured score to exactly its value.
 *
 * Motion lives in onboarding-sketch.css: strokes draw on when a figure arrives, three redrawn
 * frames "boil" while it is on screen, and a few parts loop. Loops only run while the figure is
 * visible and the tab is shown (`useInkLive`), pause while someone types, and are off under
 * prefers-reduced-motion, where every drawing is shown complete.
 */

/** Marks a drawing as arrived (`data-inview`, which draws it on) and as live while it is on screen and the tab is shown. */
export function useInkLive<T extends Element>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = !("IntersectionObserver" in window);
    const sync = () => {
      if (visible) element.setAttribute("data-inview", "");
      if (visible && document.visibilityState === "visible") element.setAttribute("data-live", "");
      else element.removeAttribute("data-live");
    };
    const observer = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
      for (const entry of entries) visible = entry.isIntersecting;
      sync();
    }, { threshold: 0.12 }) : null;
    observer?.observe(element);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, []);
  return ref;
}

/** Draws the same marks three times with a different tremor; CSS shows one frame at a time. */
function Boil({ seed, rough = 1, children }: { seed: number; rough?: number; children: (pen: Pen, frame: number) => ReactNode }) {
  return <>{BOIL_FRAMES.map(frame => <g key={frame} className={`sk-frame sk-frame-${frame}`}>{children(new Pen(seed, frame, rough), frame)}</g>)}</>;
}
const fill = (d: string, tone: "sun" | "paper" | "mark" | "sky" | "lit", i = 0) => <path className={`sk-fill is-${tone} sk-pop`} style={{ "--i": i } as CSSProperties} d={d} />;
const at = (x: number, y: number): CSSProperties => ({ transformOrigin: `${x}px ${y}px` });

/* ── Scenes, one per step ──────────────────────────────────────────────────────────────────── */

function Art({ children, className }: { children: ReactNode; className?: string }) {
  return <svg className={`sk ob-art${className ? ` ${className}` : ""}`} viewBox="0 0 320 180" aria-hidden="true" focusable="false">{children}</svg>;
}

/** 1 · Website: a web page under a lens. */
const WebsiteScene = () => <Art>
  <Boil seed={401}>{pen => <>
    {fill(pen.poly([[34, 26], [226, 24], [228, 150], [32, 152]], true), "paper")}
    <Ink i={0} d={pen.poly([[34, 26], [226, 24], [228, 150], [32, 152]], true)} />
    <Ink i={2} weight="thin" d={pen.line([34, 46], [227, 45])} />
    {[45, 55, 65].map((x, index) => <Ink key={x} i={3 + index * 0.4} weight="thin" d={pen.loop(x, 35.5, 2.6)} />)}
    <Ink i={4} weight="thin" tone="soft" d={pen.poly([[80, 31], [206, 30], [206, 41], [80, 41.5]], true)} />
    <Ink i={5} weight="thin" tone="soft" d={pen.scribble(88, 36, 74, 3.2)} />
    <Ink i={6} d={pen.scribble(48, 66, 86, 6)} />
    <Ink i={7} weight="thin" tone="soft" d={pen.scribble(48, 86, 88, 4.2)} />
    <Ink i={8} weight="thin" tone="soft" d={pen.scribble(48, 100, 76, 4.2)} />
    <Ink i={9} weight="thin" tone="soft" d={pen.scribble(48, 114, 84, 4.2)} />
    <Ink i={7.5} weight="thin" d={pen.poly([[150, 58], [212, 58], [212, 84], [150, 84]], true)} />
    <Ink i={8.5} weight="thin" tone="line" d={pen.poly([[152, 82], [166, 69], [176, 77], [185, 70], [210, 82]])} />
    {fill(pen.loop(196, 66, 4, 4, true), "sun", 9)}
    <Ink i={10} tone="rust" weight="thin" d={pen.poly([[48, 128], [104, 128], [104, 141], [48, 141]], true)} />
  </>}</Boil>
  <g className="ob-drift">
    <Boil seed={402}>{pen => <>
      <Ink i={12} weight="bold" d={pen.loop(222, 108, 27)} />
      <Ink i={14} weight="bold" d={pen.line([242, 128], [272, 158])} />
      <Ink i={15} weight="thin" tone="soft" d={pen.curve([[204, 100], [208, 92], [216, 88]])} />
    </>}</Boil>
  </g>
  <Boil seed={403} rough={0.7}>{pen => <>
    <Ink i={16} weight="thin" tone="rust" d={pen.line([268, 52], [276, 44])} />
    <Ink i={16.5} weight="thin" tone="rust" d={pen.line([278, 64], [290, 62])} />
    <Ink i={17} weight="thin" tone="rust" d={pen.line([258, 42], [258, 32])} />
  </>}</Boil>
</Art>;

/** 2 · Report: a page being read and marked in the margin. */
const ReportScene = () => <Art>
  <Boil seed={411}>{pen => <>
    {fill(pen.poly([[70, 16], [190, 16], [212, 38], [212, 166], [70, 166]], true), "paper")}
    <Ink i={0} d={pen.poly([[70, 16], [190, 16], [212, 38], [212, 166], [70, 166]], true)} />
    <Ink i={2} weight="thin" d={pen.poly([[190, 16], [190, 38], [212, 38]])} />
    <Ink i={3} d={pen.scribble(96, 50, 74, 5.4)} />
    {[[70, 98], [90, 84], [110, 92], [130, 64], [150, 88]].map(([y, width], index) =>
      <Ink key={y} i={4 + index} weight="thin" tone={index === 2 ? "ink" : "soft"} d={pen.scribble(96, y, width, 4.2)} />)}
    <Ink i={10} tone="rust" d={pen.poly([[80, 48], [84, 53], [91, 43]])} />
    <Ink i={11} tone="rust" d={pen.poly([[80, 68], [84, 73], [91, 63]])} />
    <Ink i={12} tone="rust" weight="thin" d={pen.curve([[218, 102], [236, 92], [250, 88]])} />
    <Ink i={13} tone="rust" weight="thin" d={pen.scribble(254, 86, 44, 4)} />
    <Ink i={14} tone="rust" weight="thin" d={pen.scribble(254, 100, 30, 4)} />
  </>}</Boil>
  <g className="ob-redraw"><Boil seed={412}>{pen => <path pathLength={1} className="sk-ink is-rust" d={pen.loop(146, 110, 58, 12)} />}</Boil></g>
  <g className="ob-bob" style={at(262, 140)}>
    <Boil seed={413} rough={0.6}>{pen => <>
      <Ink i={16} d={pen.poly([[232, 156], [228, 168], [240, 162]])} />
      <Ink i={17} d={pen.poly([[240, 162], [292, 112], [284, 104], [232, 156]], true)} />
      <Ink i={18} weight="thin" d={pen.line([286, 118], [279, 110])} />
    </>}</Boil>
  </g>
</Art>;

/** 3 · Account: a folder with the report tucked in, and its key. */
const AccountScene = () => <Art>
  <Boil seed={421}>{pen => <>
    <Ink i={0} d={pen.poly([[60, 156], [60, 50], [112, 50], [124, 62], [250, 62], [250, 156]])} />
    {fill(pen.poly([[80, 74], [86, 30], [222, 34], [214, 74]], true), "paper", 2)}
    <Ink i={2} weight="thin" d={pen.poly([[80, 74], [86, 30], [222, 34], [214, 74]])} />
    <Ink i={3} weight="thin" tone="soft" d={pen.scribble(100, 44, 92, 4)} />
    <Ink i={4} weight="thin" tone="soft" d={pen.scribble(98, 58, 64, 4)} />
    {fill(pen.poly([[54, 82], [256, 80], [248, 158], [62, 158]], true), "sky", 5)}
    <Ink i={5} d={pen.poly([[54, 82], [256, 80], [248, 158], [62, 158]], true)} />
    <Ink i={7} weight="thin" tone="soft" d={pen.line([86, 100], [146, 99])} />
  </>}</Boil>
  <g className="ob-swing" style={at(232, 92)}>
    <Boil seed={422} rough={0.8}>{pen => <>
      <Ink i={9} weight="thin" d={pen.curve([[232, 92], [252, 98], [266, 112]])} />
      {fill(pen.loop(268, 122, 9, 9, true), "sun", 10)}
      <Ink i={10} d={pen.loop(268, 122, 9.5)} />
      <Ink i={11} weight="thin" d={pen.loop(268, 120, 2.6)} />
      <Ink i={12} d={pen.line([268, 132], [268, 166])} />
      <Ink i={13} d={pen.poly([[268, 156], [277, 156], [277, 151]])} />
      <Ink i={14} d={pen.line([268, 163], [275, 163])} />
    </>}</Boil>
  </g>
</Art>;

/** 4 · Customers: people, and the question one of them asks. */
const CustomersScene = () => <Art>
  <Boil seed={431}>{pen => <>
    <Ink i={0} d={pen.loop(70, 104, 12)} />
    <Ink i={1} d={pen.curve([[48, 162], [52, 134], [70, 126], [88, 134], [92, 162]], false, 0.5)} />
    {fill(pen.loop(116, 92, 15, 15, true), "lit", 2)}
    <Ink i={2} d={pen.loop(116, 92, 15)} />
    <Ink i={3} d={pen.curve([[88, 166], [92, 128], [116, 118], [140, 128], [144, 166]], false, 0.5)} />
    <Ink i={4} d={pen.loop(160, 108, 11)} />
    <Ink i={5} d={pen.curve([[142, 164], [146, 138], [160, 130], [174, 138], [178, 164]], false, 0.5)} />
    <Ink i={6} weight="thin" tone="soft" d={pen.line([30, 166], [196, 166])} />
  </>}</Boil>
  <g className="ob-nod" style={at(176, 104)}>
    <Boil seed={432}>{pen => <>
      {fill(pen.curve([[178, 22], [272, 22], [288, 36], [288, 74], [272, 88], [210, 88], [176, 106], [192, 88], [178, 88], [164, 74], [164, 36]], true, 0.6), "paper", 8)}
      <Ink i={8} d={pen.curve([[178, 22], [272, 22], [288, 36], [288, 74], [272, 88], [210, 88], [176, 106], [192, 88], [178, 88], [164, 74], [164, 36]], true, 0.6)} />
      <Ink i={11} weight="thin" d={pen.scribble(182, 46, 66, 4.6)} />
      <Ink i={13} weight="thin" d={pen.scribble(182, 64, 46, 4.6)} />
      <Ink i={15} tone="rust" weight="bold" d={pen.curve([[256, 44], [262, 34], [273, 36], [274, 46], [266, 54], [265, 64]], false, 0.3)} />
      <Ink i={17} tone="rust" weight="bold" d={pen.line([265, 73], [265.4, 74])} />
    </>}</Boil>
  </g>
</Art>;

const ROWS = [50, 82, 114, 146];
/** 5 · Questions: a list being ticked off. */
const QuestionsScene = () => <Art>
  <Boil seed={441}>{pen => <>
    {fill(pen.poly([[86, 22], [234, 22], [236, 170], [84, 168]], true), "paper")}
    <Ink i={0} d={pen.poly([[86, 22], [234, 22], [236, 170], [84, 168]], true)} />
    {fill(pen.poly([[134, 12], [186, 12], [186, 30], [134, 30]], true), "sun", 2)}
    <Ink i={2} weight="thin" d={pen.poly([[134, 12], [186, 12], [186, 30], [134, 30]], true)} />
    {ROWS.map((y, index) => <g key={y}>
      <Ink i={3 + index * 2} weight="thin" d={pen.poly([[102, y - 8], [118, y - 8], [118, y + 8], [102, y + 8]], true)} />
      <Ink i={4 + index * 2} weight="thin" tone={index === 2 ? "soft" : "ink"} d={pen.scribble(130, y, [86, 70, 80, 62][index], 4.6)} />
    </g>)}
  </>}</Boil>
  {ROWS.map((y, index) => index === 2 ? null : <g key={y} className="ob-tick-loop" style={{ "--t": index } as CSSProperties}>
    <Boil seed={442 + index} rough={0.7}>{pen => <path pathLength={1} className="sk-ink is-rust is-bold" d={pen.poly([[103, y - 1], [109, y + 6], [122, y - 11]])} />}</Boil>
  </g>)}
  <Boil seed={447} rough={0.7}>{pen => <>
    <Ink i={14} weight="thin" tone="soft" d={pen.line([252, 60], [266, 52])} />
    <Ink i={14.5} weight="thin" tone="soft" d={pen.line([254, 78], [270, 78])} />
  </>}</Boil>
</Art>;

/** 6 · Competitors: websites side by side, watched. */
const CompetitorsScene = () => <Art>
  <Boil seed={451}>{pen => [[22, 30], [118, 22], [214, 32]].map(([x, y], index) => <g key={x}>
    {fill(pen.poly([[x, y], [x + 84, y], [x + 84, y + 72], [x, y + 72]], true), "paper", index * 3)}
    <Ink i={index * 3} d={pen.poly([[x, y], [x + 84, y], [x + 84, y + 72], [x, y + 72]], true)} />
    <Ink i={index * 3 + 1} weight="thin" d={pen.line([x, y + 13], [x + 84, y + 13])} />
    <Ink i={index * 3 + 1.2} weight="thin" d={pen.loop(x + 7, y + 6.6, 2)} />
    <Ink i={index * 3 + 1.4} weight="thin" d={pen.loop(x + 14, y + 6.6, 2)} />
    {index === 0 && <Ink i={2} tone="deep" d={pen.loop(x + 20, y + 32, 9)} />}
    {index === 1 && <Ink i={5} tone="deep" d={pen.poly([[x + 11, y + 41], [x + 20, y + 23], [x + 29, y + 41]], true)} />}
    {index === 2 && <Ink i={8} tone="deep" d={pen.poly([[x + 12, y + 24], [x + 28, y + 24], [x + 28, y + 40], [x + 12, y + 40]], true)} />}
    <Ink i={index * 3 + 2} weight="thin" d={pen.scribble(x + 38, y + 30, 38, 4)} />
    <Ink i={index * 3 + 2.4} weight="thin" tone="soft" d={pen.scribble(x + 10, y + 56, 64, 3.6)} />
  </g>)}</Boil>
  <Boil seed={452} rough={0.7}>{pen => <>
    {[[64, 104], [160, 96], [256, 106]].map(([x, y], index) => <path key={x} pathLength={1} className="sk-ink is-soft is-thin is-dashed sk-draw" style={{ "--i": 10 + index } as CSSProperties} d={pen.line([160, 150], [x, y])} />)}
    {fill(pen.curve([[136, 156], [160, 140], [184, 156], [160, 170]], true, 0.4), "paper", 12)}
    <Ink i={12} d={pen.curve([[136, 156], [160, 140], [184, 156], [160, 170]], true, 0.4)} />
  </>}</Boil>
  <g className="ob-look"><Boil seed={453} rough={0.5}>{pen => <>
    {fill(pen.loop(160, 155, 5.5, 5.5, true), "sun", 13)}
    <Ink i={13} weight="thin" d={pen.loop(160, 155, 6)} />
  </>}</Boil></g>
</Art>;

/** 7 · Baseline: a question setting off. */
const BaselineScene = () => <Art>
  <Boil seed={461}>{pen => <>
    <Ink i={0} d={pen.curve([[-4, 156], [70, 148], [150, 154], [230, 144], [324, 150]], false, 0.4)} />
    <Ink i={1} weight="thin" tone="soft" d={pen.curve([[20, 168], [120, 162], [220, 168], [310, 160]])} />
    <path pathLength={1} className="sk-ink is-soft is-thin is-dashed sk-draw" style={{ "--i": 3 } as CSSProperties} d={pen.curve([[66, 118], [120, 104], [176, 72], [238, 52], [292, 46]])} />
    {fill(pen.curve([[22, 96], [76, 96], [84, 104], [84, 126], [76, 132], [44, 132], [30, 146], [34, 132], [22, 132], [14, 126], [14, 104]], true, 0.5), "paper", 4)}
    <Ink i={4} d={pen.curve([[22, 96], [76, 96], [84, 104], [84, 126], [76, 132], [44, 132], [30, 146], [34, 132], [22, 132], [14, 126], [14, 104]], true, 0.5)} />
    <Ink i={6} tone="rust" weight="bold" d={pen.curve([[42, 108], [47, 100], [56, 102], [56, 110], [50, 116], [49, 122]], false, 0.3)} />
    <Ink i={7} tone="rust" weight="bold" d={pen.line([49, 128], [49.3, 129])} />
    <Ink i={9} weight="thin" tone="soft" d={pen.curve([[226, 26], [240, 18], [256, 22], [266, 16], [282, 22]])} />
    <Ink i={10} weight="thin" tone="soft" d={pen.curve([[110, 36], [122, 30], [134, 34], [144, 30]])} />
  </>}</Boil>
  <g className="ob-fly" style={at(186, 74)}>
    <Boil seed={462} rough={0.7}>{pen => <>
      {fill(pen.poly([[164, 88], [214, 60], [182, 96]], true), "paper", 11)}
      <Ink i={11} d={pen.poly([[164, 88], [214, 60], [182, 96]], true)} />
      <Ink i={12} weight="thin" d={pen.poly([[182, 96], [184, 84], [214, 60]])} />
      <Ink i={13} weight="thin" d={pen.line([184, 84], [176, 102])} />
    </>}</Boil>
  </g>
</Art>;

const BARS: [number, number][] = [[176, 38], [204, 62], [232, 50], [260, 84]];
/** 8 · Search Console: bars that come from a real source. */
const SearchConsoleScene = () => <Art>
  <Boil seed={471}>{pen => <>
    {fill(pen.loop(70, 100, 34, 34, true), "sky")}
    <Ink i={0} d={pen.loop(70, 100, 34)} />
    <Ink i={2} weight="thin" d={pen.curve([[70, 66], [56, 84], [54, 116], [70, 134]], false, 0.3)} />
    <Ink i={3} weight="thin" d={pen.curve([[70, 66], [84, 84], [86, 116], [70, 134]], false, 0.3)} />
    <Ink i={4} weight="thin" d={pen.line([37, 92], [103, 92])} />
    <Ink i={5} weight="thin" d={pen.line([39, 110], [101, 110])} />
    <path pathLength={1} className="sk-ink is-soft is-thin is-dashed sk-draw" style={{ "--i": 6 } as CSSProperties} d={pen.curve([[106, 104], [130, 118], [150, 142], [164, 150]])} />
    <Ink i={7} d={pen.line([160, 152], [294, 152])} />
  </>}</Boil>
  {BARS.map(([x, height], index) => <g key={x} className="ob-bar-grow" style={{ ...at(x + 10, 152), "--g": index } as CSSProperties}>
    <Boil seed={472 + index} rough={0.8}>{pen => <>
      {fill(pen.poly([[x, 152], [x, 152 - height], [x + 20, 152 - height], [x + 20, 152]], true), index === 3 ? "sun" : "lit", 8 + index)}
      <Ink i={8 + index} d={pen.poly([[x, 152], [x, 152 - height], [x + 20, 152 - height], [x + 20, 152]])} />
    </>}</Boil>
  </g>)}
</Art>;

const SCENES = [WebsiteScene, ReportScene, AccountScene, CustomersScene, QuestionsScene, CompetitorsScene, BaselineScene, SearchConsoleScene];

/** The drawing for one step: aria-hidden decoration, drawn on as the step arrives. */
export const StepScene = memo(function StepScene({ step }: { step: number }) {
  const ref = useInkLive<HTMLDivElement>();
  const Drawing = SCENES[Math.max(0, Math.min(SCENES.length - 1, step - 1))];
  return <div className="ob-scene" data-scene={step} data-reveal="" ref={ref} aria-hidden="true"><Drawing /></div>;
});

/* ── The trail: seven waypoints joined by a drawn path ─────────────────────────────────────── */

const WAYPOINT = { next: new Pen(481, 0, 0.6).loop(14, 14, 9.5), flagPole: new Pen(482, 0, 0.5).line([9, 24], [9, 4.5]), flag: new Pen(483, 0, 0.5).poly([[9, 4.8], [22, 9], [9, 13.4]], true), ground: new Pen(484, 0, 0.5).line([4, 24.2], [15, 23.8]) };
const NOW_FRAMES = BOIL_FRAMES.map(frame => new Pen(485, frame, 0.8).loop(14, 14, 11.5));
const LEGS = Array.from({ length: 7 }, (_, index) => new Pen(490 + index, 0, 0.5).curve([[1, 6], [8, 3.8], [15, 6.6], [23, 4.6]]));

/** One waypoint: a planted flag when done, a circled number when current, a faint ring ahead. */
export function TrailWaypoint({ state, n }: { state: "done" | "now" | "next"; n: number }) {
  return <span className={`ob-step-dot is-${state}`} aria-hidden="true">
    <svg className="ob-waypoint" viewBox="0 0 28 28" focusable="false">
      {state === "done" ? <g className="ob-flag" style={{ "--n": n } as CSSProperties}>
        <path className="sk-ink is-soft is-thin sk-draw" pathLength={1} style={{ "--i": 0 } as CSSProperties} d={WAYPOINT.ground} />
        <path className="sk-ink sk-draw" pathLength={1} style={{ "--i": 1 } as CSSProperties} d={WAYPOINT.flagPole} />
        <path className="sk-fill is-sun sk-pop" style={{ "--i": 3 } as CSSProperties} d={WAYPOINT.flag} />
        <path className="sk-ink sk-draw" pathLength={1} style={{ "--i": 2 } as CSSProperties} d={WAYPOINT.flag} />
      </g> : state === "now"
        ? NOW_FRAMES.map((d, frame) => <g key={frame} className={`sk-frame sk-frame-${frame}`}><path className="sk-ink is-rust" pathLength={1} d={d} /></g>)
        : <path className="sk-ink is-soft is-thin" d={WAYPOINT.next} />}
    </svg>
    {state !== "done" && <span className="ob-step-n">{n}</span>}
  </span>;
}

/** The stretch of path before a waypoint; it is inked in once the walker has passed it. */
export function TrailLeg({ n }: { n: number }) {
  const d = LEGS[n % LEGS.length];
  return <svg className="ob-leg" viewBox="0 0 24 10" aria-hidden="true" focusable="false">
    <path className="sk-ink is-soft is-thin is-dashed" d={d} />
    <path className="sk-ink ob-leg-ink" pathLength={1} d={d} />
  </svg>;
}

const MINI_TRAIL = new Pen(500, 0, 0.6).curve([[3, 9], [40, 6], [84, 10], [128, 6.5], [165, 8.5]]);
const MINI_POINTS = Array.from({ length: 7 }, (_, index) => 3 + index * 27);
const MINI_NOW = BOIL_FRAMES.map(frame => MINI_POINTS.map(x => new Pen(501 + x, frame, 0.6).loop(x, 8, 5.4)));
/** The narrow-screen trail: the same path, inked up to the current step. */
export function TrailMini({ step, total }: { step: number; total: number }) {
  const reached = Math.min(step, total), share = (MINI_POINTS[reached - 1] ?? 165) / 168;
  return <svg className="ob-mini-trail" viewBox="0 0 168 16" aria-hidden="true" focusable="false" style={{ "--reach": `${(1 - share) * 100}%` } as CSSProperties}>
    <path className="sk-ink is-soft is-thin is-dashed" d={MINI_TRAIL} />
    <path className="sk-ink ob-mini-ink" d={MINI_TRAIL} />
    {MINI_POINTS.map((x, index) => index + 1 < reached || step > total
      ? <path key={x} className="sk-fill is-ink ob-mini-done" d={new Pen(510 + index, 0, 0.5).loop(x, 8, 2.6, 2.6, true)} />
      : index + 1 === reached ? <g key={x}>{BOIL_FRAMES.map(frame => <g key={frame} className={`sk-frame sk-frame-${frame}`}><path className="sk-ink is-rust" d={MINI_NOW[frame][index]} /></g>)}</g>
        : <path key={x} className="sk-fill ob-mini-next" d={new Pen(520 + index, 0, 0.5).loop(x, 8, 2, 2, true)} />)}
  </svg>;
}

/* ── Glyphs: the marks the onboarding uses in place of icons ───────────────────────────────── */

type GlyphProps = { size?: number; className?: string };
function Glyph({ size = 16, className, children }: GlyphProps & { children: ReactNode }) {
  return <svg className={className ? `sk-glyph ${className}` : "sk-glyph"} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">{children}</svg>;
}
const GLYPH = {
  back: [new Pen(531, 0, 0.5).line([13.4, 8], [3, 8]), new Pen(532, 0, 0.5).poly([[7.4, 3.6], [2.7, 8], [7.2, 12.4]])],
  cross: [new Pen(533, 0, 0.5).line([3.6, 3.8], [12.4, 12.2]), new Pen(534, 0, 0.5).line([12.3, 3.6], [3.7, 12.4])],
  shield: [new Pen(535, 0, 0.45).curve([[8, 1.8], [11, 3.2], [13.4, 3.4], [13, 8.6], [8, 14.4], [3, 8.6], [2.6, 3.4], [5, 3.2]], true, 0.2), new Pen(536, 0, 0.45).poly([[5.4, 8.2], [7.3, 10.1], [10.8, 5.9]])],
  tick: [new Pen(537, 0, 0.5).poly([[2.8, 8.6], [6.2, 12], [13.2, 3.8]])],
};
/** Back the way you came. */
export const InkBack = (props: GlyphProps) => <Glyph {...props} className={`sk-back ${props.className ?? ""}`.trim()}>{GLYPH.back.map((d, index) => <path key={index} className="sk-ink" d={d} />)}</Glyph>;
/** Remove: two quick strokes. */
export const InkCross = (props: GlyphProps) => <Glyph {...props}>{GLYPH.cross.map((d, index) => <path key={index} className="sk-ink" d={d} />)}</Glyph>;
/** A shield with a tick: the line that says what stays safe. */
export const InkShield = (props: GlyphProps) => <Glyph {...props}>{GLYPH.shield.map((d, index) => <path key={index} className="sk-ink" d={d} />)}</Glyph>;
/** A tick. */
export const InkTick = (props: GlyphProps) => <Glyph {...props}>{GLYPH.tick.map((d, index) => <path key={index} className="sk-ink" d={d} />)}</Glyph>;

const BOX = new Pen(541, 0, 0.55).poly([[2.6, 2.9], [17.4, 2.4], [17.7, 17.4], [2.4, 17.6]], true);
const BOX_TICK = new Pen(542, 0, 0.5).poly([[4.8, 10.2], [8.6, 14.4], [16.4, 4.6]]);
/** A drawn checkbox. The tick draws itself in when the box is checked (see `.ob-check` in onboarding.css). */
export function InkBox({ ghost }: { ghost?: boolean }) {
  return <svg className={`ob-inkbox${ghost ? " is-ghost" : ""}`} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path className="sk-fill ob-inkbox-fill" d={BOX} />
    <path className={`sk-ink ob-inkbox-edge${ghost ? " is-dashed" : ""}`} d={BOX} />
    {!ghost && <path className="sk-ink ob-inkbox-tick" pathLength={1} d={BOX_TICK} />}
  </svg>;
}

/** A small drawn indicator for one baseline question: waiting, running, saved or stopped. */
const RUN = { ring: new Pen(551, 0, 0.6).loop(9, 9, 6.4), tick: new Pen(552, 0, 0.5).poly([[4.6, 9.4], [7.8, 12.6], [13.6, 5.4]]), a: new Pen(553, 0, 0.5).line([5.4, 5.4], [12.6, 12.6]), b: new Pen(554, 0, 0.5).line([12.6, 5.4], [5.4, 12.6]) };
export function InkRunState({ state }: { state: "waiting" | "live" | "done" | "bad" }) {
  return <svg className={`ob-runmark is-${state}`} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    {state === "waiting" && <path className="sk-ink is-soft is-thin is-dashed" d={RUN.ring} />}
    {state === "live" && <><path className="sk-ink is-soft is-thin" d={RUN.ring} /><path className="sk-ink is-rust ob-runmark-loop" pathLength={1} d={RUN.ring} /></>}
    {state === "done" && <path className="sk-ink" d={RUN.tick} />}
    {state === "bad" && <><path className="sk-ink is-rust" d={RUN.a} /><path className="sk-ink is-rust" d={RUN.b} /></>}
  </svg>;
}

/* ── The meter: the one drawing that carries data ──────────────────────────────────────────── */

const TRACK = new Pen(561, 0, 0.5).curve([[4, 10], [100, 9], [200, 10.6], [300, 9.4], [396, 10]], false, 0);
/**
 * A drawn meter for a measured score. The ink ends at exactly `value` out of 100; the pen's wobble
 * only moves the line up and down, never along. Without a value, or with a score of 0, it is an empty track:
 * no value ink and no end mark. At 100 the ink ends exactly where the track ends.
 */
export function InkMeter({ value, reveal, checking }: { value?: number; reveal?: boolean; checking?: boolean }) {
  const end = value === undefined || !(value > 0) ? null : 4 + 392 * Math.min(100, value) / 100;
  const ink = end === null ? null : `M4 10${Array.from({ length: 6 }, (_, index) => {
    const x = 4 + (end - 4) * (index + 1) / 6, y = 10 + [-.9, .7, -.5, .8, -.6, 0][index];
    return `L${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join("")}`;
  return <svg className={`ob-meter-ink${reveal ? " is-reveal" : ""}${checking ? " is-checking" : ""}`} viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path className="sk-ink is-soft is-thin" d={TRACK} />
    {ink && end !== null && <>
      <path className="sk-ink ob-meter-value" pathLength={1} d={ink} />
      {/* The end mark sits just inside the value (its 2-unit stroke spans end − 2 to end), so nothing is painted past the score;
          a value too small to hold it inside has none. */}
      {end - 4 >= 2 && <path className="sk-ink ob-meter-end" pathLength={1} d={`M${(end - 1).toFixed(1)} 4.5L${(end - 1).toFixed(1)} 15.5`} />}
    </>}
    {checking && <path className="sk-ink is-rust ob-meter-reading" pathLength={1} d={TRACK} />}
  </svg>;
}

/**
 * "Reading the page": three faint lines of handwriting stand for the page. While the check runs they
 * are written again and again. The drawing is always present, so the card keeps its height when a check starts or ends.
 */
const READING = BOIL_FRAMES.map(index => new Pen(571 + index, 0, 0.8).scribble(4, 8, [180, 150, 120][index], 5.4));
export function InkReading({ active }: { active: boolean }) {
  return <svg className={`ob-reading${active ? " is-active" : ""}`} viewBox="0 0 190 52" aria-hidden="true" focusable="false">
    {READING.map((d, index) => <path key={index} className="sk-ink is-thin" pathLength={1} transform={`translate(0 ${index * 16})`} style={{ "--r": index } as CSSProperties} d={d} />)}
  </svg>;
}

/** A hand-drawn rule, as a CSS mask: `--ob-rule-*` custom properties set on the onboarding root. */
function ruleMask(seed: number, dashed = false) {
  const pen = new Pen(seed, 0, 0.9), points: Pt[] = [[1, 4], [80, 3.1], [170, 4.8], [260, 3.3], [340, 4.6], [399, 3.8]];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 8' preserveAspectRatio='none'><path d='${pen.curve(points)}' fill='none' stroke='black' stroke-width='1.25' stroke-linecap='round'${dashed ? " stroke-dasharray='5 6'" : ""}/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
/** A drawn frame for a sheet of any size; the stroke keeps its weight however far the frame is stretched. */
function frameMask(seed: number) {
  const d = new Pen(seed, 0, 0.75).poly([[4, 4.5], [396, 3.5], [396.5, 296], [3.5, 296.5]], true);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300' preserveAspectRatio='none'><path d='${d}' fill='none' stroke='black' stroke-width='1.4' stroke-linejoin='round' vector-effect='non-scaling-stroke'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
export const INK_RULES = { "--ob-rule-a": ruleMask(581), "--ob-rule-b": ruleMask(582), "--ob-rule-c": ruleMask(583), "--ob-rule-dash": ruleMask(584, true), "--ob-frame": frameMask(585) } as CSSProperties;
