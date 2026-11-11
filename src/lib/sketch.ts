/**
 * A pen for Folio's hand-drawn illustrations. Every shape is placed by hand as a few points;
 * the pen joins them the way a hand would: lines bow slightly, corners miss by a hair, circles
 * overshoot where they close.
 *
 * Deterministic: the same seed draws the same picture on the server and in the browser, so the
 * SVG can be server-rendered. `frame` redraws the same picture with a different tremor, which is
 * what animators call a boil: three frames shown in turn make a still drawing look alive.
 */
export type Pt = readonly [number, number];

const n = (value: number) => String(Math.round(value * 10) / 10);

/** mulberry32: small, fast and good enough for jitter. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export class Pen {
  private readonly hand: () => number;
  private readonly tremor: () => number;

  /** `rough` scales every wobble; 0 draws exact geometry. */
  constructor(seed: number, frame = 0, private readonly rough = 1) {
    this.hand = random(seed * 7919 + 13);
    this.tremor = random(seed * 104729 + frame * 15485863 + 1);
  }

  /** One offset. `hand` is the same on every frame; `boil` changes from frame to frame. */
  private off(hand: number, boil = 0.4) {
    return ((this.hand() * 2 - 1) * hand + (this.tremor() * 2 - 1) * boil) * this.rough;
  }
  private near([x, y]: Pt, hand = 0.7): [number, number] {
    return [x + this.off(hand), y + this.off(hand)];
  }
  private edge([ax, ay]: Pt, [bx, by]: Pt) {
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy) || 1;
    const bow = Math.min(3.2, length * 0.028), a = this.off(bow), b = this.off(bow);
    const nx = -dy / length, ny = dx / length;
    return `C${n(ax + dx * 0.33 + nx * a)} ${n(ay + dy * 0.33 + ny * a)} ${n(ax + dx * 0.67 + nx * b)} ${n(ay + dy * 0.67 + ny * b)} ${n(bx)} ${n(by)}`;
  }

  /** A straight stroke, drawn the way a hand draws one: nearly. */
  line(from: Pt, to: Pt): string {
    const a = this.near(from), b = this.near(to);
    return `M${n(a[0])} ${n(a[1])}${this.edge(a, b)}`;
  }

  /** Straight strokes through each corner. */
  poly(points: readonly Pt[], closed = false): string {
    const corners = points.map(point => this.near(point));
    let d = `M${n(corners[0][0])} ${n(corners[0][1])}`;
    for (let index = 1; index < corners.length; index++) d += this.edge(corners[index - 1], corners[index]);
    if (closed) d += `${this.edge(corners[corners.length - 1], corners[0])}Z`;
    return d;
  }

  /** One smooth stroke through every point (Catmull-Rom). */
  curve(points: readonly Pt[], closed = false, hand = 0.9): string {
    const p = points.map(point => this.near(point, hand)), last = p.length - 1;
    const at = (index: number) => closed ? p[(index + p.length) % p.length] : p[Math.max(0, Math.min(last, index))];
    let d = `M${n(p[0][0])} ${n(p[0][1])}`;
    for (let index = 0; index < (closed ? p.length : last); index++) {
      const before = at(index - 1), from = at(index), to = at(index + 1), after = at(index + 2);
      d += `C${n(from[0] + (to[0] - before[0]) / 6)} ${n(from[1] + (to[1] - before[1]) / 6)} ${n(to[0] - (after[0] - from[0]) / 6)} ${n(to[1] - (after[1] - from[1]) / 6)} ${n(to[0])} ${n(to[1])}`;
    }
    return closed ? `${d}Z` : d;
  }

  /** A circle or oval in one go. It overshoots where it started unless `closed`, as a quick hand does. */
  loop(cx: number, cy: number, rx: number, ry = rx, closed = false): string {
    const steps = 10, start = this.hand() * Math.PI * 2, sweep = Math.PI * 2 * (closed ? 1 : 1.07);
    const count = closed ? steps : steps + 1, points: Pt[] = [];
    for (let index = 0; index < count; index++) {
      const angle = start + sweep * index / steps, wobble = Math.max(0.5, Math.min(rx, ry) * 0.045);
      points.push([cx + Math.cos(angle) * (rx + this.off(wobble, 0.3)), cy + Math.sin(angle) * (ry + this.off(wobble, 0.3))]);
    }
    return this.curve(points, closed, 0);
  }

  /** A line of handwriting too small to read: joined humps broken into words. */
  scribble(x: number, y: number, width: number, height = 5): string {
    let d = "", cursor = x;
    const end = x + width;
    while (cursor < end - height) {
      const word = Math.min(end - cursor, height * (2.6 + this.hand() * 4.2)), points: Pt[] = [];
      for (let at = 0, up = true; at <= word; at += height * (0.55 + this.hand() * 0.35), up = !up)
        points.push([cursor + at, y + (up ? -1 : 1) * height * (0.25 + this.hand() * 0.25)]);
      if (points.length > 1) d += this.curve(points, false, 0.3);
      cursor += word + height * 1.1;
    }
    return d;
  }

  /** Grains: `count` dots scattered over a box, as one path of zero-length strokes (round caps make them dots). */
  sprinkle(x: number, y: number, width: number, height: number, count: number): string {
    let d = "";
    for (let index = 0; index < count; index++) d += `M${n(x + this.hand() * width)} ${n(y + this.hand() * height)}h.01`;
    return d;
  }

  /** Parallel shading strokes across a box; clip them to the shape they shade. `slant` leans each stroke sideways. */
  hatch(x: number, y: number, width: number, height: number, gap: number, slant = 0): string[] {
    const strokes: string[] = [], lean = height * slant;
    for (let at = x - Math.max(0, lean); at < x + width - Math.min(0, lean); at += gap * (0.8 + this.hand() * 0.4))
      strokes.push(this.line([at, y], [at + lean, y + height]));
    return strokes;
  }
}

export const BOIL_FRAMES = [0, 1, 2] as const;
