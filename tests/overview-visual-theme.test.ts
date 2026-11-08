import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const theme = readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/overview-visual-cards.css", import.meta.url), "utf8");
const block = (selector: string) => { const start = theme.indexOf(selector); return theme.slice(start, theme.indexOf("}", start)); };
const tokens = (text: string) => Object.fromEntries([...text.matchAll(/(--folio-[a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]));
const light = tokens(block(":root")), dark = { ...light, ...tokens(block('html[data-folio-theme="dark"]')) };
const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("chart cards use only theme tokens that exist in light and dark themes", () => {
  const used = [...new Set([...css.matchAll(/var\((--folio-[a-z-]+)/g)].map(match => match[1]))].filter(name => !name.startsWith("--folio-radius"));
  assert.ok(used.length > 5);
  for (const name of used) {
    assert.ok(light[name], `${name} missing in light theme`);
    assert.ok(tokens(block('html[data-folio-theme="dark"]'))[name], `${name} missing in dark theme`);
  }
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i);
});

test("chart text and chips meet WCAG AA contrast in both themes", () => {
  for (const [name, palette] of [["light", light], ["dark", dark]] as const) {
    const pairs: [string, string, string][] = [
      ["warning chip", "--folio-warning", "--folio-warning-soft"],
      ["good chip", "--folio-accent", "--folio-accent-soft"],
      ["neutral chip", "--folio-text-secondary", "--folio-surface-muted"],
      ["muted text", "--folio-text-muted", "--folio-surface"],
      ["secondary text", "--folio-text-secondary", "--folio-surface"],
    ];
    for (const [label, fg, bg] of pairs) assert.ok(contrast(palette[fg], palette[bg]) >= 4.5, `${name} ${label} ${contrast(palette[fg], palette[bg]).toFixed(2)}`);
  }
});
