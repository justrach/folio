# Folio interface system

## Direction

The September 2026 palette takes black type, a vivid orange accent, and cool near-white surfaces from a Swiss graphic-design reference. Folio now uses those colors in a minimal product UI: quiet rules, ordinary cards, and no offset shadows or ornamental circles. A generated orange/red editorial collage sits behind the landing hero, with a pale wash under the copy so the product explanation remains legible. The question, evidence, uncertainty, and next action come before decoration.

This is a Folio web choice, not an Apple native control specification. The project Apple HIG design notes inform readable hierarchy, explicit state, recoverable actions, visible focus, adaptive appearance, and enlarged-text reflow. The 44 CSS-pixel minimum control height is a Folio touch-friendly choice.

## Theme contract

[`src/app/theme.css`](src/app/theme.css) is the single editable palette and font contract. It defines light and dark semantic tokens for canvas, surface, ink, secondary and muted text, edges, accent, inverse panels, focus, danger, and success. It also owns `--folio-font-body`, `--folio-font-display`, and `--folio-font-mono`. Body and display currently use the same system sans-serif stack for familiar, predictable rendering. Change those aliases to switch families across the site; only add a loader in `src/app/layout.tsx` if a future font actually needs one.

Every application CSS file consumes these tokens. Legacy aliases (`--paper`, `--panel`, `--ink`, `--green`, `--deep`, `--muted`, `--line`, `--lime`, `--sans`, `--serif`) bridge older components. New styles should use the `--folio-*` roles directly. Use a separate status label or icon as well as color; error, success, measured, sample, and unknown states must stay explicit in copy. Evidence panels use opaque surfaces. Accent orange marks the primary action, current selection, and a small number of visual anchors.

## Reusable components

[`src/components/ui/primitives.tsx`](src/components/ui/primitives.tsx) exports `UiButton`, `UiSurface`, `UiField`, and `UiBadge`. The primitives accept ordinary HTML attributes and add semantic style classes from `theme.css`. `UiButton` supports a native button or `asChild` for a link. Use a link for navigation and a button for an action. `UiSurface` provides a consistent panel while allowing `section`, `article`, `aside`, or `div` semantics. `UiField` wraps its input in a real label; `UiBadge` conveys an accompanying state in text. The landing page, pricing, and public index exercise the primitives. Existing `.button` and `.panel` classes share the same tokens while older screens migrate gradually.

## Component rules

- Use the display family and tight tracking for short hero and page headings; use the body family for paragraphs, labels, controls, and tables. Reflow text rather than fixing a card to a screenshot width.
- Use the accent for one clear primary action per decision area. Secondary controls are outlined, quiet controls are text-first, and disabled state keeps its label visible.
- Chart and dashboard colors come from CSS variables, including SVG paint. Historical model and website data keep their original identity and provenance; theme colors do not rewrite stored measurements.
- The website comparison uses a compact Recharts overview and a ranked horizontal-bar layout adapted from [EvilCharts' horizontal Recharts example](https://github.com/legions-developer/evilcharts/blob/main/src/registry/examples/recharts/ex-horizontal-layout-bar-chart.tsx). The overview starts within the first desktop and mobile viewport; direct names, values, and a separate average-position column below replace crowded scatterplot leader lines. The top twelve remain a summary; the full table preserves every website and the selection detail.
- A single recorded answer uses a compact numbered recommendation list instead of plotting each returned position on an axis. The number, name, domain, source links, and expandable returned reason stay together; list order is the agent's returned order for that question, not a search-engine rank or scored comparison.
- Prefer a neutral rule or spacing for grouping. Keep focus outlines visible on the actual surface. Respect reduced motion and keyboard activation.
- The landing hero backdrop lives at [`public/images/folio-hero-collage.webp`](public/images/folio-hero-collage.webp). It is decorative CSS only; no information depends on the image. Keep the copy side pale enough for legible text in light and dark appearance, and let the report preview use an opaque surface.
- Retain third-party attribution and licenses when adapting vendored controls to theme tokens.

## Validation

Check landing, index, pricing, workspace, evaluations, website crawl, costs, and settings on desktop and narrow widths; test light and dark appearance, keyboard and pointer actions, 200% browser zoom, focus, labels, and contrast. Compilation and fixture tests prove rendering contracts, not accessibility conformance. Record actual checks separately from outstanding manual review.
