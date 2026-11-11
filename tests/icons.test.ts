import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import * as icons from "../src/components/icons";

const all = Object.entries(icons) as [string, icons.FolioIcon][];
type Shape = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
/** The drawn shapes of an icon, with fragments flattened. Icons use no hooks, so calling one returns its element. */
function shapes(node: ReactNode): Shape[] {
  if (Array.isArray(node)) return node.flatMap(shapes);
  if (!isValidElement(node)) return [];
  const element = node as Shape;
  return typeof element.type === "string" ? [element] : shapes(element.props.children);
}

test("every Folio icon is drawn on the shared 24-unit grid and is decorative unless labelled", () => {
  assert.ok(all.length >= 100);
  for (const [name, Icon] of all) {
    const svg = Icon({ size: 16 }) as Shape;
    assert.equal(svg.type, "svg", name);
    assert.deepEqual([svg.props.viewBox, svg.props.width, svg.props.height, svg.props.fill, svg.props.stroke, svg.props.strokeWidth, svg.props.strokeLinecap, svg.props.strokeLinejoin, svg.props["aria-hidden"]],
      ["0 0 24 24", 16, 16, "none", "currentColor", 1.75, "round", "round", true], name);
    assert.equal(Icon.displayName, name);
    const drawn = shapes(svg.props.children);
    assert.ok(drawn.length >= 1 && drawn.every(shape => ["path", "circle", "rect"].includes(String(shape.type))), name);
    for (const shape of drawn) {
      assert.equal(shape.props.fill, undefined, `${name} is stroked, not filled`);
      // Every coordinate that is written out stays inside the grid.
      for (const key of ["cx", "cy", "x", "y"]) if (shape.props[key] !== undefined) assert.ok(Number(shape.props[key]) >= 0 && Number(shape.props[key]) <= 24, `${name} ${key}`);
      if (shape.type === "path") assert.match(String(shape.props.d), /^[mM][\d.\s,a-zA-Z-]+$/, name);
    }
  }
  const labelled = icons.Check({ "aria-label": "Done", role: "img", className: "tick", strokeWidth: 3 }) as Shape;
  assert.deepEqual([labelled.props["aria-hidden"], labelled.props.className, labelled.props.strokeWidth, labelled.props["aria-label"]], [undefined, "folio-icon tick", 3, "Done"]);
});

test("no icon library is installed or imported", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string>; devDependencies?: Record<string, string> };
  const libraries = /^(lucide|@heroicons|@phosphor-icons|@tabler\/icons|react-icons|@radix-ui\/react-icons|feather-icons)/;
  assert.deepEqual(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => libraries.test(name)), []);
  const source = new URL("../src/", import.meta.url);
  for (const file of readdirSync(source, { recursive: true, encoding: "utf8" }).filter(name => /\.tsx?$/.test(name)))
    assert.doesNotMatch(readFileSync(new URL(file, source), "utf8"), /from ["'](lucide-react|@heroicons\/|@phosphor-icons\/|@tabler\/icons|react-icons|@radix-ui\/react-icons)/, file);
});
