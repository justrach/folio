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

  /**
   * Draws existing geometry (SVG path data) again by hand: every corner lands a little off,
   * straight runs bow, curves keep their shape but not their exact line, and a closed outline
   * runs a little past where it began instead of meeting itself. A zero-length stroke stays a
   * dot. The defaults suit a 24-unit icon grid.
   */
  trace(d: string, { hand = 0.5, boil = 0.34, bow = 0.05, maxBow = 1.1, overshoot = 1 }: TraceOptions = {}): string {
    const nudge = ([px, py]: Pt, amount = hand, tremor = boil): Pt => [px + this.off(amount, tremor), py + this.off(amount, tremor)];
    let out = "";
    for (const path of parsePath(d)) {
      const length = path.segments.reduce((sum, segment, index) => {
        const from = index ? path.segments[index - 1].to : path.start;
        return sum + Math.hypot(segment.to[0] - from[0], segment.to[1] - from[1]);
      }, 0);
      if (length < 0.05) {
        const [dx, dy] = nudge(path.start, hand * 0.5, boil * 0.6);
        out += `M${n(dx)} ${n(dy)}h.01`;
        continue;
      }
      // A small mark is drawn with a steadier hand than a long one.
      const steady = Math.min(1, 0.45 + length / 30);
      const first = nudge(path.start, hand * steady, boil * steady);
      let from = path.start, drawnFrom = first;
      out += `M${n(first[0])} ${n(first[1])}`;
      path.segments.forEach((segment, index) => {
        const last = index === path.segments.length - 1;
        // Every point is placed afresh, so a closed outline does not quite meet itself.
        const drawnTo = nudge(segment.to, hand * steady, boil * steady);
        const run = Math.hypot(segment.to[0] - from[0], segment.to[1] - from[1]);
        if (!segment.c1 || !segment.c2) {
          const lean = Math.min(maxBow, run * bow), a = this.off(lean, lean * 0.6), b = this.off(lean, lean * 0.6);
          const dx = drawnTo[0] - drawnFrom[0], dy = drawnTo[1] - drawnFrom[1], size = Math.hypot(dx, dy) || 1, nx = -dy / size, ny = dx / size;
          out += `C${n(drawnFrom[0] + dx / 3 + nx * a)} ${n(drawnFrom[1] + dy / 3 + ny * a)} ${n(drawnFrom[0] + dx * 2 / 3 + nx * b)} ${n(drawnFrom[1] + dy * 2 / 3 + ny * b)} ${n(drawnTo[0])} ${n(drawnTo[1])}`;
        } else {
          const wiggle = Math.min(maxBow, run * bow) * 0.8;
          const c1 = nudge([segment.c1[0] + drawnFrom[0] - from[0], segment.c1[1] + drawnFrom[1] - from[1]], wiggle, wiggle * 0.6);
          const c2 = nudge([segment.c2[0] + drawnTo[0] - segment.to[0], segment.c2[1] + drawnTo[1] - segment.to[1]], wiggle, wiggle * 0.6);
          out += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(drawnTo[0])} ${n(drawnTo[1])}`;
        }
        if (last && path.closed && overshoot > 0 && this.rough > 0) {
          // Run on along the first stroke's direction, as a hand closing a shape does.
          const head = path.segments[0], aim = head.c1 && Math.hypot(head.c1[0] - path.start[0], head.c1[1] - path.start[1]) > 0.01 ? head.c1 : head.to;
          const dx = aim[0] - path.start[0], dy = aim[1] - path.start[1], size = Math.hypot(dx, dy) || 1, reach = overshoot * steady * (0.6 + Math.abs(this.off(0.4, 0))) * this.rough;
          out += `L${n(first[0] + dx / size * reach)} ${n(first[1] + dy / size * reach)}`;
        }
        from = segment.to; drawnFrom = drawnTo;
      });
    }
    return out;
  }
}

export const BOIL_FRAMES = [0, 1, 2] as const;

/* ── Tracing existing geometry ─────────────────────────────────────────────────────────────── */

/** One piece of a traced outline: a straight run (no controls) or a cubic curve. */
type Segment = { to: Pt; c1?: Pt; c2?: Pt };
type Subpath = { start: Pt; segments: Segment[]; closed: boolean };
export type TraceOptions = {
  /** How far each corner or end lands from where it was meant to, in drawing units. Fixed for the drawing. */
  hand?: number;
  /** How far the same points shift from one boil frame to the next. */
  boil?: number;
  /** How much a straight run bows, as a share of its length, and the most it may bow. */
  bow?: number; maxBow?: number;
  /** How far a closed outline runs past where it started. */
  overshoot?: number;
};

const TOKENS = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;

/** Converts one SVG arc to cubic curves (the SVG spec's endpoint-to-centre conversion). */
function arcToCubics(from: Pt, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, to: Pt): Segment[] {
  const [x1, y1] = from, [x2, y2] = to;
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [{ to }];
  const phi = angle * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const numerator = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = factor * rx * yp / ry, cyp = -factor * ry * xp / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const turn = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = turn(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let delta = turn((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9)), step = delta / pieces;
  const k = 4 / 3 * Math.tan(step / 4), segments: Segment[] = [];
  const point = (t: number): Pt => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const tangent = (t: number): Pt => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  for (let index = 0; index < pieces; index++) {
    const a = theta + step * index, b = a + step, pa = point(a), pb = index === pieces - 1 ? to : point(b), ta = tangent(a), tb = tangent(b);
    segments.push({ c1: [pa[0] + k * ta[0], pa[1] + k * ta[1]], c2: [pb[0] - k * tb[0], pb[1] - k * tb[1]], to: pb });
  }
  return segments;
}

/** Reads SVG path data into absolute subpaths of straight runs and cubic curves. */
export function parsePath(d: string): Subpath[] {
  const tokens: (string | number)[] = [...d.matchAll(TOKENS)].map(match => match[1] !== undefined ? match[1] : Number(match[2]));
  const paths: Subpath[] = [];
  let at = 0, command = "", current: Subpath | null = null, x = 0, y = 0, lastControl: Pt | null = null, lastQuad: Pt | null = null;
  const number = () => tokens[at++] as number;
  const start = (point: Pt) => { current = { start: point, segments: [], closed: false }; paths.push(current); };
  const add = (segment: Segment) => { if (!current) start([x, y]); current!.segments.push(segment); x = segment.to[0]; y = segment.to[1]; };
  while (at < tokens.length) {
    if (typeof tokens[at] === "string") command = tokens[at++] as string;
    else if (!command) throw new Error(`path data must start with a command: ${d}`);
    const relative = command === command.toLowerCase(), ox = relative ? x : 0, oy = relative ? y : 0;
    const upper = command.toUpperCase();
    let control: Pt | null = null, quad: Pt | null = null;
    switch (upper) {
      case "M": x = ox + number(); y = oy + number(); start([x, y]); command = relative ? "l" : "L"; break;
      case "L": add({ to: [ox + number(), oy + number()] }); break;
      case "H": add({ to: [ox + number(), y] }); break;
      case "V": add({ to: [x, oy + number()] }); break;
      case "C": { const c1: Pt = [ox + number(), oy + number()], c2: Pt = [ox + number(), oy + number()]; add({ c1, c2, to: [ox + number(), oy + number()] }); control = c2; break; }
      case "S": { const c1: Pt = lastControl ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y], c2: Pt = [ox + number(), oy + number()]; add({ c1, c2, to: [ox + number(), oy + number()] }); control = c2; break; }
      case "Q": case "T": {
        const q: Pt = upper === "Q" ? [ox + number(), oy + number()] : lastQuad ? [2 * x - lastQuad[0], 2 * y - lastQuad[1]] : [x, y];
        const to: Pt = [ox + number(), oy + number()];
        add({ c1: [x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y)], c2: [to[0] + 2 / 3 * (q[0] - to[0]), to[1] + 2 / 3 * (q[1] - to[1])], to }); quad = q; break;
      }
      case "A": {
        const rx = number(), ry = number(), angle = number(), large = number() !== 0, sweep = number() !== 0, to: Pt = [ox + number(), oy + number()];
        for (const segment of arcToCubics([x, y], rx, ry, angle, large, sweep, to)) add(segment);
        break;
      }
      case "Z": if (current) { const path: Subpath = current; if (x !== path.start[0] || y !== path.start[1]) add({ to: path.start }); path.closed = true; x = path.start[0]; y = path.start[1]; current = null; } break;
      default: throw new Error(`unsupported path command ${command}`);
    }
    lastControl = control; lastQuad = quad;
  }
  return paths;
}
