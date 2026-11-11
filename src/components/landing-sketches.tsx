import type { CSSProperties, ReactNode } from "react";
import { BOIL_FRAMES, Pen, type Pt } from "@/lib/sketch";

/**
 * The landing's drawings. Each one is placed point by point in this file and inked by `Pen`
 * (src/lib/sketch.ts); none comes from an icon set or a generated image. They are decoration:
 * no drawing shows a measured result.
 *
 * Motion is CSS (landing-sketch.css): strokes draw on when the figure scrolls into view, three
 * redrawn frames alternate so the line "boils", and a few parts loop. All of it is off under
 * prefers-reduced-motion, where the first frame is shown complete.
 */
type Tone = "ink" | "rust" | "soft" | "sun" | "deep" | "line";
type InkProps = { d: string; tone?: Tone; weight?: "thin" | "bold"; i?: number; still?: boolean; className?: string };

/** One stroke. `i` staggers when it is drawn; `still` strokes appear without being drawn on. */
function Ink({ d, tone = "ink", weight, i = 0, still, className }: InkProps) {
  const classes = ["sk-ink", `is-${tone}`, weight && `is-${weight}`, !still && "sk-draw", className].filter(Boolean).join(" ");
  return <path d={d} pathLength={1} className={classes} style={{ "--i": i } as CSSProperties} />;
}

/** Draws the same marks three times with a different tremor; CSS shows one frame at a time. */
function Boil({ seed, rough = 1, children }: { seed: number; rough?: number; children: (pen: Pen, frame: number) => ReactNode }) {
  return <>{BOIL_FRAMES.map(frame => <g key={frame} className={`sk-frame sk-frame-${frame}`}>{children(new Pen(seed, frame, rough), frame)}</g>)}</>;
}

/** Continues one path with another, replacing the second's move with a line. */
const join = (first: string, second: string) => `${first}${second.replace(/^M/, "L")}`;
const shift = (points: readonly Pt[], x: number, y: number, scale = 1): Pt[] => points.map(([px, py]) => [x + px * scale, y + py * scale]);

/* Numerals, each in a 6 × 9 box. */
const DIGITS: Record<number, { curves?: Pt[][]; lines?: Pt[][] }> = {
  1: { lines: [[[1.2, 2.6], [3.4, 0.4], [3.4, 9]]] },
  2: { curves: [[[0.8, 2.4], [3, 0.4], [5.2, 2.4], [3.2, 5.6], [0.6, 9]]], lines: [[[0.6, 9], [5.6, 9]]] },
  3: { curves: [[[0.8, 1.2], [3, 0.3], [5, 2.2], [2.8, 4.4]], [[2.8, 4.4], [5.4, 6.4], [3, 9], [0.6, 8]]] },
  4: { lines: [[[4.2, 9], [4.2, 0.5], [0.5, 6.2], [5.8, 6.2]]] },
};
function digit(pen: Pen, value: number, x: number, y: number, scale = 1): string {
  const shape = DIGITS[value];
  return [...(shape.curves ?? []).map(points => pen.curve(shift(points, x, y, scale), false, 0.2)),
    ...(shape.lines ?? []).map(points => pen.poly(shift(points, x, y, scale)))].join("");
}

/* ── Hero poster ───────────────────────────────────────────────────────────────────────────── */

const CREST: Pt[] = [[-6, 420], [70, 394], [140, 354], [196, 302], [224, 262], [240, 240]];
const SHOULDER: Pt[] = [[240, 240], [276, 236], [330, 250], [406, 272]];
const SLIP: Pt[] = [[240, 240], [254, 272], [244, 318], [204, 368], [136, 408], [62, 432], [-6, 448]];
const CONTOURS: Pt[][] = [
  [[264, 290], [258, 338], [216, 394], [142, 438], [60, 464], [-6, 478]],
  [[302, 296], [296, 356], [244, 422], [164, 470], [92, 502]],
  [[352, 300], [346, 372], [302, 442], [242, 502]],
];
const FLAGS: { at: Pt; rank: number }[] = [{ at: [70, 394], rank: 4 }, { at: [140, 354], rank: 3 }, { at: [196, 302], rank: 2 }, { at: [240, 240], rank: 1 }];
const SUN: Pt = [286, 142];

/** The dune poster: a dark dune under a small sun, with four numbered flags up its ridge. */
export function DunePoster() {
  return <svg className="sk sk-poster" viewBox="0 0 400 500" role="img"
    aria-label="A hand-drawn dark sculptural dune beneath a small orange sun, with four numbered flags climbing its ridge and a circle drawn around the third">
    <defs>
      {BOIL_FRAMES.map(frame => {
        const pen = new Pen(11, frame);
        return <clipPath key={frame} id={`sk-lit-${frame}`}><path d={`${join(pen.curve(CREST, false, 0), pen.curve(SLIP, false, 0))}Z`} /></clipPath>;
      })}
    </defs>
    <rect className="sk-fill is-sky" x="0" y="0" width="400" height="500" />

    <g className="sk-wind">
      <Boil seed={21} rough={0.8}>{pen => <>
        <Ink still tone="soft" weight="thin" d={pen.curve([[26, 92], [84, 85], [146, 93], [212, 86]])} />
        <Ink still tone="soft" weight="thin" d={pen.curve([[52, 196], [100, 190], [150, 197]])} />
        <Ink still tone="soft" weight="thin" d={pen.curve([[300, 62], [338, 56], [382, 63]])} />
      </>}</Boil>
    </g>
    <g className="sk-birds">
      <Boil seed={22} rough={0.6}>{pen => <>
        <Ink tone="ink" weight="thin" i={16} d={pen.curve([[88, 134], [93, 128], [98, 133], [103, 128], [108, 134]])} />
        <Ink tone="ink" weight="thin" i={17} d={pen.curve([[118, 119], [121.5, 115], [125, 118.5], [128.5, 115], [132, 119]])} />
      </>}</Boil>
    </g>

    <g className="sk-sun-bob">
      <Boil seed={23}>{pen => <>
        <path className="sk-fill is-sun" d={pen.loop(SUN[0], SUN[1], 27, 27, true)} />
        <Ink tone="deep" weight="thin" i={2} d={pen.loop(SUN[0], SUN[1], 29.5)} />
        <Ink tone="deep" weight="thin" i={4} d={pen.curve([[270, 132], [278, 124], [289, 121]])} />
      </>}</Boil>
      <g className="sk-rays" style={{ transformOrigin: `${SUN[0]}px ${SUN[1]}px` }}>
        <Boil seed={24} rough={0.8}>{pen => Array.from({ length: 12 }, (_, index) => {
          const angle = (index * 30 + 12) * Math.PI / 180, near = 39, far = index % 2 ? 46 : 51;
          return <Ink key={index} tone="sun" i={5 + index} d={pen.line([SUN[0] + Math.cos(angle) * near, SUN[1] + Math.sin(angle) * near], [SUN[0] + Math.cos(angle) * far, SUN[1] + Math.sin(angle) * far])} />;
        })}</Boil>
      </g>
    </g>

    <Boil seed={11}>{(pen, frame) => {
      const crest = pen.curve(CREST, false, 0), slip = pen.curve(SLIP, false, 0), shoulder = pen.curve(SHOULDER, false, 0);
      return <>
        <path className="sk-fill is-dune" d={`${join(crest, shoulder)}L406 506L-6 506Z`} />
        <path className="sk-fill is-lit" d={`${join(crest, slip)}Z`} />
        <g clipPath={`url(#sk-lit-${frame})`}>
          {pen.hatch(-10, 236, 290, 216, 8.5, -0.85).map((d, index) => <Ink key={index} tone="deep" weight="thin" i={10 + index * 0.35} d={d} />)}
        </g>
        {CONTOURS.map((points, index) => <Ink key={index} tone="line" weight="thin" i={14 + index * 3} d={pen.curve(points)} />)}
        <path className="sk-ink is-line is-thin sk-grain" d={pen.sprinkle(10, 452, 250, 44, 34)} />
        <Ink tone="ink" i={0} d={join(crest, shoulder)} />
      </>;
    }}</Boil>

    <Boil seed={12} rough={0.7}>{pen => FLAGS.map(({ at: [x, y], rank }, index) => {
      const first = rank === 1, tone: Tone = first ? "rust" : "ink";
      return <g key={rank}>
        <Ink tone={tone} i={20 + index * 3} d={pen.line([x, y + 2], [x, y - 24])} />
        {first && <path className="sk-fill is-sun sk-pop" style={{ "--i": 30 } as CSSProperties} d={`${pen.poly([[x, y - 24], [x + 14, y - 18.5], [x, y - 13]])}Z`} />}
        <Ink tone={tone} i={21 + index * 3} d={`${pen.poly([[x, y - 24], [x + 14, y - 18.5], [x, y - 13]])}`} />
        <Ink tone={tone} weight="thin" i={22 + index * 3} d={digit(pen, rank, x - 12, y - 38, 1.15)} />
      </g>;
    })}</Boil>

    {/* "Where you stand": a circle drawn, and redrawn, around the third flag. */}
    <g className="sk-here"><Boil seed={13}>{pen => <path pathLength={1} className="sk-ink is-rust" d={pen.loop(141, 337, 27, 31)} />}</Boil></g>
  </svg>;
}

/* ── Storyboard: ask, inspect, improve ─────────────────────────────────────────────────────── */

/** A speech bubble being written, and the question it asks. */
export function AskSketch() {
  return <svg className="sk sk-scene" viewBox="0 0 300 200" aria-hidden="true" focusable="false">
    <Boil seed={31}>{pen => <>
      <Ink i={0} d={pen.curve([[52, 26], [200, 26], [216, 42], [216, 112], [200, 128], [116, 128], [78, 162], [86, 128], [52, 128], [36, 112], [36, 42]], true, 0.6)} />
      <Ink i={5} weight="thin" d={pen.scribble(58, 58, 130)} />
      <Ink i={8} weight="thin" d={pen.scribble(58, 80, 146)} />
      <Ink i={11} weight="thin" d={pen.scribble(58, 102, 78)} />
    </>}</Boil>
    <g className="sk-caret"><Boil seed={32} rough={0.5}>{pen => <Ink still tone="rust" d={pen.line([146, 95], [146, 109])} />}</Boil></g>
    <g className="sk-question" style={{ transformOrigin: "254px 96px" }}>
      <Boil seed={33}>{pen => <>
        <Ink tone="rust" weight="bold" i={13} d={pen.curve([[238, 64], [247, 45], [266, 46], [271, 64], [256, 80], [253, 99]], false, 0.4)} />
        <Ink tone="rust" weight="bold" i={17} d={pen.line([253, 115], [253.4, 116])} />
      </>}</Boil>
    </g>
    <Boil seed={34} rough={0.7}>{pen => <>
      <Ink tone="soft" weight="thin" i={18} d={pen.line([228, 136], [222, 146])} />
      <Ink tone="soft" weight="thin" i={19} d={pen.line([252, 140], [252, 152])} />
      <Ink tone="soft" weight="thin" i={20} d={pen.line([276, 136], [282, 146])} />
    </>}</Boil>
  </svg>;
}

const ROWS = [44, 82, 120, 158];

/** A returned list read row by row, with a lens over its sources. */
export function InspectSketch() {
  return <svg className="sk sk-scene" viewBox="0 0 300 200" aria-hidden="true" focusable="false">
    <g className="sk-rows">
      <path className="sk-fill is-mark" d={new Pen(41).poly([[32, 27], [268, 26], [269, 61], [31, 62]], true)} />
    </g>
    <Boil seed={42}>{pen => <>
      <Ink i={0} d={pen.poly([[26, 18], [274, 16], [276, 184], [24, 182]], true)} />
      {ROWS.slice(1).map((y, index) => <Ink key={y} still tone="soft" weight="thin" d={pen.line([34, y - 19], [266, y - 19])} i={index} />)}
      {ROWS.map((y, index) => <g key={y}>
        <Ink weight="thin" i={3 + index * 4} d={digit(pen, index + 1, 38, y - 5, 1.1)} />
        <Ink weight="thin" i={4 + index * 4} d={pen.poly([[58, y - 9], [76, y - 9], [76, y + 9], [58, y + 9]], true)} />
        <Ink i={5 + index * 4} d={pen.scribble(88, y - 1, [72, 56, 64, 48][index], 5.5)} />
        <Ink tone="soft" weight="thin" i={6 + index * 4} d={`${pen.scribble(172, y - 2, 34, 3.6)}${pen.line([172, y + 5], [204, y + 5])}`} />
        {index !== 1 && <Ink tone="soft" weight="thin" i={6.5 + index * 4} d={`${pen.scribble(214, y - 2, 30, 3.6)}${pen.line([214, y + 5], [242, y + 5])}`} />}
      </g>)}
    </>}</Boil>
    <g className="sk-rows">
      <Boil seed={43}>{pen => <>
        <Ink tone="rust" weight="bold" i={20} d={pen.loop(246, 42, 15)} />
        <Ink tone="rust" weight="bold" i={22} d={pen.line([257, 53], [270, 67])} />
        <Ink tone="rust" weight="thin" i={23} d={pen.curve([[238, 38], [241, 34], [246, 32]])} />
      </>}</Boil>
    </g>
  </svg>;
}

/** A page with one line rewritten, and the arrow that says: check again. */
export function ImproveSketch() {
  const turn = (degrees: number, radius = 30): Pt => [232 + Math.cos(degrees * Math.PI / 180) * radius, 128 + Math.sin(degrees * Math.PI / 180) * radius];
  // Most of a circle, ending in an arrowhead that points along it.
  const arc = Array.from({ length: 9 }, (_, index) => turn(-50 + index * 36)), tip = turn(238);
  return <svg className="sk sk-scene" viewBox="0 0 300 200" aria-hidden="true" focusable="false">
    <Boil seed={51}>{pen => <>
      <Ink i={0} d={pen.poly([[40, 22], [140, 22], [166, 48], [166, 180], [40, 180]], true)} />
      <Ink i={3} weight="thin" d={pen.poly([[140, 22], [140, 48], [166, 48]])} />
      <Ink i={4} weight="thin" d={pen.scribble(54, 60, 76)} />
      <Ink i={6} weight="thin" d={pen.scribble(54, 80, 96)} />
      <Ink i={8} weight="thin" tone="soft" d={pen.scribble(54, 100, 92)} />
      <Ink i={10} tone="rust" d={pen.line([50, 100.5], [150, 99.5])} />
      <Ink i={12} weight="thin" d={pen.scribble(54, 142, 96)} />
      <Ink i={14} weight="thin" d={pen.scribble(54, 162, 58)} />
    </>}</Boil>
    <g className="sk-rewrite"><Boil seed={52}>{pen => <path pathLength={1} className="sk-ink is-rust" d={pen.scribble(54, 120, 92, 5.5)} />}</Boil></g>
    <g className="sk-pencil">
      <g className="sk-pencil-hand">
        <Boil seed={53} rough={0.6}>{pen => <>
          <Ink still d={pen.poly([[151.7, 110.7], [146, 122], [157.3, 116.3]])} />
          <Ink still d={pen.poly([[157.3, 116.3], [198.3, 75.3], [192.7, 69.7], [151.7, 110.7]], true)} />
          <Ink still weight="thin" d={pen.line([191.2, 82.4], [185.6, 76.8])} />
          <Ink still weight="thin" d={pen.line([154.5, 113.5], [189, 79])} />
        </>}</Boil>
      </g>
    </g>
    <g className="sk-cycle" style={{ transformOrigin: "232px 128px" }}>
      <Boil seed={54}>{pen => <>
        <Ink i={16} d={pen.curve(arc, false, 0.5)} />
        <Ink i={19} d={pen.poly([turn(218, 22), tip, turn(214, 39)])} />
      </>}</Boil>
    </g>
    <Boil seed={55}>{pen => <Ink tone="rust" i={20} d={pen.loop(232, 128, 6)} />}</Boil>
  </svg>;
}

/** A dashed hand-drawn arrow from one storyboard frame to the next. */
export function StoryArrow() {
  const pen = new Pen(61);
  return <svg className="sk sk-story-arrow" viewBox="0 0 64 40" aria-hidden="true" focusable="false">
    <path className="sk-ink is-soft is-dashed" d={pen.curve([[4, 26], [20, 15], [38, 23], [54, 16]])} />
    <path className="sk-ink is-soft" d={pen.poly([[46, 10], [56, 15.5], [48, 24]])} />
  </svg>;
}

/* ── Smaller drawings ──────────────────────────────────────────────────────────────────────── */

const HORIZON: Pt[] = [[-4, 118], [60, 104], [120, 112], [190, 92], [250, 104], [310, 96], [364, 106]];

/** The closing band: the sun coming up behind a line of dunes. */
export function SunriseSketch() {
  return <svg className="sk sk-sunrise" viewBox="0 0 360 150" aria-hidden="true" focusable="false">
    <defs><clipPath id="sk-above-horizon"><path d={`${new Pen(71, 0, 0).curve(HORIZON)}L364 -40L-4 -40Z`} /></clipPath></defs>
    <g clipPath="url(#sk-above-horizon)">
      <g className="sk-rise">
        <Boil seed={72}>{pen => <>
          <path className="sk-fill is-sun" d={pen.loop(180, 96, 34, 34, true)} />
          <Ink tone="deep" weight="thin" i={0} d={pen.loop(180, 96, 36.5)} />
        </>}</Boil>
        <Boil seed={73} rough={0.8}>{pen => Array.from({ length: 9 }, (_, index) => {
          const angle = (200 + index * 17.5) * Math.PI / 180, far = index % 2 ? 56 : 62;
          return <Ink key={index} tone="sun" i={8 + index} d={pen.line([180 + Math.cos(angle) * 46, 96 + Math.sin(angle) * 46], [180 + Math.cos(angle) * far, 96 + Math.sin(angle) * far])} />;
        })}</Boil>
      </g>
    </g>
    <Boil seed={71}>{pen => <>
      <Ink i={0} d={pen.curve(HORIZON, false, 0)} />
      <Ink tone="soft" weight="thin" i={4} d={pen.curve([[-4, 138], [80, 128], [170, 136], [260, 122], [364, 132]])} />
      <Ink weight="thin" i={10} d={pen.curve([[64, 52], [69, 46], [74, 51], [79, 46], [84, 52]])} />
      <Ink weight="thin" i={11} d={pen.curve([[92, 38], [95.5, 34], [99, 37.5], [102.5, 34], [106, 38]])} />
    </>}</Boil>
  </svg>;
}

/** Fine print under a lens, beside "The finer details." */
export function FinePrintSketch() {
  return <svg className="sk sk-fineprint" viewBox="0 0 220 170" aria-hidden="true" focusable="false">
    <defs><clipPath id="sk-lens"><circle cx="142" cy="96" r="30" /></clipPath></defs>
    <Boil seed={81}>{pen => <>
      <Ink i={0} d={pen.poly([[18, 14], [150, 12], [152, 158], [16, 156]], true)} />
      {[36, 52, 68, 84, 100, 116, 132].map((y, index) => <Ink key={y} weight="thin" tone="soft" i={2 + index} d={pen.scribble(30, y, [104, 96, 108, 60, 54, 62, 90][index], 3.4)} />)}
    </>}</Boil>
    <circle className="sk-fill is-paper" cx="142" cy="96" r="30" />
    <g clipPath="url(#sk-lens)">
      <Boil seed={82}>{pen => <>
        <Ink tone="ink" i={12} d={pen.scribble(98, 80, 96, 6)} />
        <Ink tone="rust" i={14} d={pen.scribble(104, 97, 96, 6)} />
        <Ink tone="ink" i={16} d={pen.scribble(96, 114, 96, 6)} />
      </>}</Boil>
    </g>
    <Boil seed={83}>{pen => <>
      <Ink tone="ink" weight="bold" i={10} d={pen.loop(142, 96, 31)} />
      <Ink tone="ink" weight="bold" i={13} d={pen.line([165, 118], [198, 152])} />
      <Ink tone="soft" weight="thin" i={15} d={pen.curve([[124, 84], [129, 76], [138, 72]])} />
    </>}</Boil>
  </svg>;
}

/** A quick double stroke under a few words. Stretches to the words' width. */
export function InkUnderline() {
  const pen = new Pen(91, 0, 0.8);
  return <svg className="sk-underline" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path pathLength={1} className="sk-ink is-rust sk-draw" style={{ "--i": 6 } as CSSProperties}
      d={join(pen.curve([[4, 8], [70, 4.5], [150, 8.5], [226, 5], [296, 7]]), pen.curve([[292, 11.5], [210, 10], [120, 13], [44, 11]]))} />
  </svg>;
}

/* ── Ink glyphs: the few marks the landing uses in place of icons ──────────────────────────── */

type GlyphProps = { size?: number; className?: string };
function Glyph({ size = 16, className, children }: GlyphProps & { children: ReactNode }) {
  return <svg className={className ? `sk-glyph ${className}` : "sk-glyph"} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">{children}</svg>;
}
const stroke = (d: string, key?: number) => <path key={key} className="sk-ink" d={d} />;

/** Up and to the right: "go there". */
export function InkArrow(props: GlyphProps) {
  const pen = new Pen(101, 0, 0.5);
  return <Glyph {...props} className={`sk-arrow ${props.className ?? ""}`.trim()}>{stroke(pen.line([3.6, 12.4], [12, 4]))}{stroke(pen.poly([[5.6, 3.9], [12.3, 3.7], [12.1, 10.4]]))}</Glyph>;
}
/** Straight on: "next". */
export function InkArrowRight(props: GlyphProps) {
  const pen = new Pen(102, 0, 0.5);
  return <Glyph {...props} className={`sk-arrow is-right ${props.className ?? ""}`.trim()}>{stroke(pen.line([2.5, 8], [13, 8]))}{stroke(pen.poly([[8.6, 3.6], [13.3, 8], [8.8, 12.4]]))}</Glyph>;
}
/** A plus that turns into a cross when its answer is open. */
export function InkPlus(props: GlyphProps) {
  const pen = new Pen(103, 0, 0.5);
  return <Glyph {...props} className={`sk-plus ${props.className ?? ""}`.trim()}>{stroke(pen.line([8, 2.6], [8, 13.4]))}{stroke(pen.line([2.6, 8], [13.4, 8]))}</Glyph>;
}
/** A speaker, sounding or crossed out. */
export function InkSpeaker({ on, ...props }: GlyphProps & { on: boolean }) {
  const pen = new Pen(104, 0, 0.45);
  return <Glyph {...props}>
    {stroke(pen.poly([[2.4, 6.2], [5.4, 6.2], [8.8, 3.2], [8.8, 12.8], [5.4, 9.8], [2.4, 9.8]], true))}
    {on ? <>{stroke(pen.curve([[10.8, 5.8], [12.2, 8], [10.8, 10.2]]))}{stroke(pen.curve([[12.6, 3.6], [14.9, 8], [12.6, 12.4]]))}</>
      : <>{stroke(pen.line([11.4, 6], [14.8, 10]))}{stroke(pen.line([14.8, 6], [11.4, 10]))}</>}
  </Glyph>;
}

/** Folio's mark, drawn in two passes of the pen around a dot. */
export function InkMark({ size = 30 }: { size?: number }) {
  const pen = new Pen(111, 0, 0.7);
  return <svg className="sk-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path className="sk-ink sk-draw" pathLength={1} style={{ "--i": 0 } as CSSProperties} d={pen.loop(16, 16, 13)} />
    <path className="sk-ink sk-draw" pathLength={1} style={{ "--i": 4 } as CSSProperties} d={pen.loop(16, 16, 7.6)} />
    <path className="sk-fill is-ink" d={pen.loop(16, 16, 2.7, 2.7, true)} />
  </svg>;
}
