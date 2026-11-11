import assert from "node:assert/strict";
import test from "node:test";
import { BOIL_FRAMES, Pen } from "../src/lib/sketch";

const draw = (pen: Pen) => [
  pen.line([0, 0], [100, 0]), pen.poly([[0, 0], [40, 0], [40, 30]], true), pen.curve([[0, 0], [20, 10], [40, 0], [60, 10]]),
  pen.loop(50, 50, 20), pen.scribble(0, 10, 120), pen.sprinkle(0, 0, 50, 50, 8), ...pen.hatch(0, 0, 60, 40, 8, -0.5),
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

test("rough 0 draws the exact geometry, and a loop overshoots unless it is closed", () => {
  assert.equal(new Pen(3, 0, 0).line([0, 0], [30, 0]), "M0 0C9.9 0 20.1 0 30 0");
  assert.match(new Pen(3).loop(10, 10, 5, 5, true), /Z$/);
  assert.doesNotMatch(new Pen(3).loop(10, 10, 5), /Z$/);
});
