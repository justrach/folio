import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { planGlyph } from "../src/components/icon-plan";
import * as icons from "../src/components/icons";
import { parsePath } from "../src/lib/sketch";

const all = Object.entries(icons) as [string, icons.FolioIcon][];
type Shape = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
/** The drawn shapes of an icon, with fragments and frame groups flattened. Icons use no hooks, so calling one returns its element. */
function shapes(node: ReactNode): Shape[] {
  if (Array.isArray(node)) return node.flatMap(shapes);
  if (!isValidElement(node)) return [];
  const element = node as Shape;
  return typeof element.type === "string" && element.type !== "g" ? [element] : shapes(element.props.children);
}
/** The whole drawn tree as text (the unit tests run under the react-server condition, without react-dom/server). */
const markup = (node: ReactNode) => JSON.stringify(node, (key, value) => key.startsWith("_") ? undefined : value);
/**
 * How far outside the 24-unit grid a traced stroke may reach. The pen moves each planned point by
 * at most its hand and boil wobble (0.5 + 0.34 units), bows straight runs by at most 1.1 units at
 * their control points, and runs a closed outline on by at most 1 unit; every glyph is planned at
 * least 2 units in from the edge, so in practice nothing leaves the grid. One unit is the allowance.
 */
const PEN_MARGIN = 1;
/** The absolute extent of a path: its start, end and control points (a curve never leaves the hull of its control points). */
function extent(d: string) {
  const points = parsePath(d).flatMap(path => [path.start, ...path.segments.flatMap(segment => [segment.to, ...(segment.c1 ? [segment.c1] : []), ...(segment.c2 ? [segment.c2] : [])])]);
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}
const numbers = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);

test("every Folio icon is drawn on the shared 24-unit grid and is decorative unless labelled", () => {
  assert.ok(all.length >= 100);
  for (const [name, Icon] of all) {
    const svg = Icon({ size: 16 }) as Shape;
    assert.equal(svg.type, "svg", name);
    assert.deepEqual([svg.props.viewBox, svg.props.width, svg.props.height, svg.props.fill, svg.props.stroke, svg.props.strokeWidth, svg.props.strokeLinecap, svg.props.strokeLinejoin, svg.props["aria-hidden"]],
      ["0 0 24 24", 16, 16, "none", "currentColor", 1.75, "round", "round", true], name);
    assert.equal(Icon.displayName, name);
    const drawn = shapes(svg.props.children);
    // Every glyph is a set of pen strokes: paths only, stroked, never filled.
    assert.ok(drawn.length >= 1 && drawn.every(shape => shape.type === "path"), name);
    for (const shape of drawn) {
      assert.equal(shape.props.fill, undefined, `${name} is stroked, not filled`);
      const d = String(shape.props.d);
      assert.match(d, /^[mM][\d.\s,a-zA-Z-]+$/, name);
      // A hand misses by a little, never by much: the traced stroke stays on the grid, give or take PEN_MARGIN.
      const box = extent(d);
      assert.ok(box.left >= -PEN_MARGIN && box.top >= -PEN_MARGIN && box.right <= 24 + PEN_MARGIN && box.bottom <= 24 + PEN_MARGIN, `${name} reaches ${JSON.stringify(box)}`);
    }
  }
  const labelled = icons.Check({ "aria-label": "Done", role: "img", className: "tick", strokeWidth: 3 }) as Shape;
  assert.deepEqual([labelled.props["aria-hidden"], labelled.props.className, labelled.props.strokeWidth, labelled.props["aria-label"]], [undefined, "folio-icon tick", 3, "Done"]);
  // Other SVG attributes still pass through.
  const passed = icons.Search({ size: 13, style: { color: "red" }, "data-x": "1" } as icons.IconProps) as Shape;
  assert.deepEqual([passed.props.width, (passed.props.style as { color: string }).color, passed.props["data-x"]], [13, "red", "1"]);
});

test("icons are traced by hand, once, and the same on every render", () => {
  // Not the clean geometry: the check mark's planned corners (5,12.5) (9.5,17) (19,7.5) are each a little off.
  const check = String(shapes((icons.Check({}) as Shape).props.children)[0].props.d);
  assert.notEqual(check, "m5 12.5 4.5 4.5L19 7.5");
  assert.match(check, /^M/);
  const [x, y] = numbers(check);
  assert.ok(Math.abs(x - 5) < 1.2 && Math.abs(y - 12.5) < 1.2 && (x !== 5 || y !== 12.5), check);
  // A circle is no longer a <circle>, and a dot is still a dot (a zero-length stroke).
  const info = shapes((icons.Info({}) as Shape).props.children).map(shape => String(shape.props.d));
  assert.ok(info.some(d => /h\.01$/.test(d)), "Info keeps its dot");
  // Deterministic: two renders are byte-identical, so server and browser agree.
  for (const [name, Icon] of all) {
    assert.equal(markup(Icon({ size: 16 })), markup(Icon({ size: 16 })), name);
    assert.equal(markup(Icon({ boil: true })), markup(Icon({ boil: true })), name);
  }
  // The element tree is built when the module loads, not on each render.
  assert.equal((icons.Globe({}) as Shape).props.children, (icons.Globe({ size: 40 }) as Shape).props.children);
});

test("a boiling icon holds three tracings of the same glyph and keeps its size", () => {
  for (const [name, Icon] of all) {
    const still = Icon({ size: 17 }) as Shape, boiling = Icon({ size: 17, boil: true }) as Shape;
    assert.deepEqual([boiling.props.width, boiling.props.height, boiling.props.viewBox], [17, 17, "0 0 24 24"], name);
    assert.match(String(boiling.props.className), /^folio-icon is-boil$/, name);
    const frames = (boiling.props.children as Shape[]);
    assert.equal(frames.length, 3, name);
    assert.deepEqual(frames.map(frame => [frame.type, frame.props.className]), [0, 1, 2].map(index => ["g", `folio-icon-frame is-${index}`]), name);
    const strokes = frames.map(frame => shapes(frame.props.children).map(shape => String(shape.props.d)));
    // Frame 0 is the still icon; the other frames are the same strokes with a different tremor.
    assert.deepEqual(strokes[0], shapes(still.props.children).map(shape => String(shape.props.d)), name);
    for (const d of strokes.flat()) {
      const box = extent(d);
      assert.ok(box.left >= -PEN_MARGIN && box.top >= -PEN_MARGIN && box.right <= 24 + PEN_MARGIN && box.bottom <= 24 + PEN_MARGIN, `${name} boil frame reaches ${JSON.stringify(box)}`);
    }
    for (const frame of strokes.slice(1)) {
      assert.equal(frame.length, strokes[0].length, name);
      frame.forEach((d, index) => {
        assert.equal(d.replace(/-?\d*\.?\d+/g, "#"), strokes[0][index].replace(/-?\d*\.?\d+/g, "#"), `${name} same commands`);
        const here = numbers(d), first = numbers(strokes[0][index]);
        here.forEach((value, at) => assert.ok(Math.abs(value - first[at]) <= 1.6, `${name} moved ${Math.abs(value - first[at])}`));
      });
    }
  }
});

test("an icon may only be drawn from shapes the pen can trace", () => {
  const shapes = createElement(Fragment, null, createElement("path", { d: "M4 12h16" }), createElement("circle", { cx: 12, cy: 12, r: 9 }), createElement("rect", { x: 3, y: 3, width: 18, height: 18, rx: 2.5 }));
  assert.equal(planGlyph(shapes).length, 3);
  // A line, polyline or ellipse would otherwise vanish from the icon without a trace; it fails loudly instead.
  for (const type of ["line", "polyline", "ellipse", "g"]) assert.throws(() => planGlyph(createElement(type, {})), /cannot trace/, type);
  assert.throws(() => planGlyph(createElement(Fragment, null, createElement("path", { d: "M4 12h16" }), createElement("line", { x1: 0, y1: 0, x2: 4, y2: 4 }))), /cannot trace <line>/);
  assert.throws(() => planGlyph("text"), /only hold shapes/);
});

test("no icon library is installed or imported", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string>; devDependencies?: Record<string, string> };
  const libraries = /^(lucide|@heroicons|@phosphor-icons|@tabler\/icons|react-icons|@radix-ui\/react-icons|feather-icons)/;
  assert.deepEqual(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => libraries.test(name)), []);
  const source = new URL("../src/", import.meta.url);
  for (const file of readdirSync(source, { recursive: true, encoding: "utf8" }).filter(name => /\.tsx?$/.test(name)))
    assert.doesNotMatch(readFileSync(new URL(file, source), "utf8"), /from ["'](lucide-react|@heroicons\/|@phosphor-icons\/|@tabler\/icons|react-icons|@radix-ui\/react-icons)/, file);
});

test("icons are drawn without SVG filters", () => {
  const source = new URL("../src/", import.meta.url);
  for (const file of readdirSync(source, { recursive: true, encoding: "utf8" }).filter(name => /\.(css|tsx)$/.test(name)))
    assert.doesNotMatch(readFileSync(new URL(file, source), "utf8"), /folio-rough|feDisplacementMap/, file);
});
