/**
 * Draws every icon in src/components/icons.tsx at 40px and 16px for review.
 *
 *   node --import tsx scripts/icon-sheet.ts   # writes .local/icons.html (ignored by Git)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "../src/components/icons";
const entries = Object.entries(icons).filter(([, value]) => typeof value === "function") as [string, icons.FolioIcon][];
const cells = entries.map(([name, Icon]) => `<figure>${renderToStaticMarkup(createElement(Icon, { size: 40 }))}${renderToStaticMarkup(createElement(Icon, { size: 16 }))}<figcaption>${name}</figcaption></figure>`).join("");
mkdirSync(".local", { recursive: true });
writeFileSync(".local/icons.html", `<!doctype html><meta charset="utf-8"><style>body{margin:24px;font:11px/1.3 system-ui;color:#1c2a22;background:#f6f3ea;display:grid;grid-template-columns:repeat(12,1fr);gap:10px}figure{margin:0;padding:12px 4px 8px;background:#fff;border-radius:10px;display:grid;justify-items:center;gap:6px;grid-template-columns:auto auto;justify-content:center;align-items:end}figcaption{grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;max-width:100%}</style>${cells}`);
console.log(`${entries.length} icons written to .local/icons.html`);
