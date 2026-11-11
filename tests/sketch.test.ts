import assert from "node:assert/strict";
import test from "node:test";
import { BOIL_FRAMES, Pen, parsePath } from "../src/lib/sketch";

const draw = (pen: Pen) => [
  pen.line([0, 0], [100, 0]), pen.poly([[0, 0], [40, 0], [40, 30]], true), pen.curve([[0, 0], [20, 10], [40, 0], [60, 10]]),
  pen.loop(50, 50, 20), pen.scribble(0, 10, 120), pen.sprinkle(0, 0, 50, 50, 8), ...pen.hatch(0, 0, 60, 40, 8, -0.5),
  pen.trace("M4 12h16m-6-6 6 6-6 6"), pen.trace("M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0Z"), pen.trace("M12 7.5h.01"),
];
const numbers = (d: string) => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);

test("the pen is deterministic, so the server and the browser draw the same picture", () => {
  assert.deepEqual(draw(new Pen(7)), draw(new Pen(7)));
  assert.notDeepEqual(draw(new Pen(7)), draw(new Pen(8)));
  for (const d of draw(new Pen(7))) assert.match(d, /^M-?[\d.]+ -?[\d.]+[\dA-Za-z .-]+$/);
});

test("boil frames redraw the same picture: same strokes and structure, each point within a couple of units", () => {
  const frames = BOIL_FRAMES.map(frame => draw(new Pen(7, frame)));
  for (const frame of frames.slice(1)) {
    assert.equal(frame.length, frames[0].length);
    frame.forEach((d, index) => {
      const here = numbers(d), first = numbers(frames[0][index]);
      assert.equal(d.replace(/-?\d+(?:\.\d+)?/g, "#"), frames[0][index].replace(/-?\d+(?:\.\d+)?/g, "#"), "same commands");
      here.forEach((value, at) => assert.ok(Math.abs(value - first[at]) <= 2.5, `stroke ${index} moved ${Math.abs(value - first[at])}`));
    });
  }
  assert.notDeepEqual(frames[1], frames[0]);
});

test("trace reads SVG path data and redraws it nearly, keeping dots as dots", () => {
  // Relative and absolute moves, lines, curves, smooth curves, arcs and close all parse to absolute points.
  const [arrow, head] = parsePath("M4 12h16m-6-6 6 6-6 6");
  assert.deepEqual([arrow.start, arrow.segments.map(segment => segment.to)], [[4, 12], [[20, 12]]]);
  assert.deepEqual([head.start, head.segments.map(segment => segment.to)], [[14, 6], [[20, 12], [14, 18]]]);
  const [ring] = parsePath("M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0Z");
  assert.ok(ring.closed && ring.segments.every(segment => segment.c1 && segment.c2));
  assert.deepEqual(ring.segments.at(-1)!.to.map(Math.round), [3, 12]);
  assert.deepEqual(parsePath("M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12")[0].segments.map(segment => segment.to), [[12, 5.5], [21.5, 12]]);
  // Rough 0 reproduces the geometry (straight runs as straight cubics), so the trace follows the plan.
  assert.equal(new Pen(5, 0, 0).trace("M4 12h15"), "M4 12C9 12 14 12 19 12");
  // A dot stays a dot; a closed outline runs past its start instead of closing with Z.
  assert.match(new Pen(5).trace("M12 7.5h.01"), /^M[\d.]+ [\d.]+h\.01$/);
  assert.doesNotMatch(new Pen(5).trace("M4 4h16v16H4Z"), /Z/);
  // Each point lands near where it was planned.
  const traced = new Pen(5).trace("M4 12h16").match(/-?\d*\.?\d+/g)!.map(Number);
  assert.ok(Math.abs(traced[0] - 4) <= 1 && Math.abs(traced[1] - 12) <= 1 && Math.abs(traced.at(-2)! - 20) <= 1 && Math.abs(traced.at(-1)! - 12) <= 1, String(traced));
});

test("rough 0 draws the exact geometry, and a loop overshoots unless it is closed", () => {
  assert.equal(new Pen(3, 0, 0).line([0, 0], [30, 0]), "M0 0C9.9 0 20.1 0 30 0");
  assert.match(new Pen(3).loop(10, 10, 5, 5, true), /Z$/);
  assert.doesNotMatch(new Pen(3).loop(10, 10, 5), /Z$/);
});
