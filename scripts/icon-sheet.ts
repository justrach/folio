/**
 * Draws every icon in src/components/icons.tsx at 40px, 16px and 13px, on light and dark paper,
 * plus the three boil frames of each at 40px, for review.
 *
 *   node --import tsx scripts/icon-sheet.ts   # writes .local/icons.html (ignored by Git)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "../src/components/icons";
const entries = Object.entries(icons).filter(([, value]) => typeof value === "function") as [string, icons.FolioIcon][];
const draw = (Icon: icons.FolioIcon, size: number, boil = false) => renderToStaticMarkup(createElement(Icon, { size, boil }));
const cells = entries.map(([name, Icon]) => `<figure>${draw(Icon, 40)}${draw(Icon, 16)}${draw(Icon, 13)}<span class="frames">${[0, 1, 2].map(frame => `<span class="f${frame}">${draw(Icon, 40, true)}</span>`).join("")}</span><figcaption>${name}</figcaption></figure>`).join("");
const style = `body{margin:0;font:11px/1.3 system-ui}section{padding:24px;display:grid;grid-template-columns:repeat(10,1fr);gap:10px}
section.light{color:#1c2a22;background:#f6f3ea}section.light figure{background:#fff}
section.dark{color:#e8eee9;background:#131a16}section.dark figure{background:#1d2620}
figure{margin:0;padding:12px 4px 8px;border-radius:10px;display:grid;justify-items:center;gap:6px;grid-template-columns:auto auto auto;justify-content:center;align-items:end}
figcaption,.frames{grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;max-width:100%}.frames{display:flex;gap:2px;opacity:.75}.frames svg{width:24px;height:24px}
.folio-icon-frame{visibility:hidden}.f0 .is-0,.f1 .is-1,.f2 .is-2{visibility:visible}`;
mkdirSync(".local", { recursive: true });
writeFileSync(".local/icons.html", `<!doctype html><meta charset="utf-8"><style>${style}</style><section class="light">${cells}</section><section class="dark">${cells}</section>`);
console.log(`${entries.length} icons written to .local/icons.html`);
