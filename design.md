# Folio interface system

## Direction

The September 2026 palette takes black type, a vivid orange accent, and cool near-white surfaces from a Swiss graphic-design reference. Folio now uses those colors in a minimal product UI: quiet rules, ordinary cards, and no offset shadows or ornamental circles. The landing has a sparse cream/forest-green surface override, a standalone generated dune poster and short DM Sans typography; the rest of the app retains the shared palette. The question, evidence, uncertainty, and next action come before decoration.

This is a Folio web choice, not an Apple native control specification. The project Apple HIG design notes inform readable hierarchy, explicit state, recoverable actions, visible focus, adaptive appearance, and enlarged-text reflow. The 44 CSS-pixel minimum control height is a Folio touch-friendly choice.

## Theme contract

[`src/app/theme.css`](src/app/theme.css) is the single editable palette and font contract. It defines light and dark semantic tokens for canvas, surface, ink, secondary and muted text, edges, accent, inverse panels, focus, danger, and success. It also owns `--folio-font-body`, `--folio-font-display`, and `--folio-font-mono`. Body and display use **DM Sans**, loaded once in `src/app/layout.tsx` through `next/font/google` with weights 400, 500, 700 and 800 plus italic, then exposed as `--font-dm-sans`; `theme.css` maps both roles to it with system fallbacks. `--folio-font-mono` uses **DM Mono** (400/500) from the same loader for index metadata and labels. The build self-hosts the files, so pages make no runtime request to Google. Keep new families out unless a role genuinely needs one.

Landing typography follows the Impeccable `typeset` pass: 16px body floor, 11px minimum for functional microcopy (edition strip, figure labels), `text-wrap: balance` on headings, `text-wrap: pretty` on prose, and tabular numerals for ranks and dates.

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
- The landing uses short DM Sans headings (500 weight, tracking no tighter than -.04em), one generated poster, and the actual MIT-licensed Bencho Card Swap source for the three workflow steps. Keep drag/press/keyboard interaction manual, preserve its license and upstream record, and retain reduced-motion support. Cuelume sounds remain opt-in.
- The landing poster is `public/images/folio-dune-hero.webp`, a decorative asset with its generation prompt in `docs/design/LANDING-ART.md`. It contains no evidence claims. Both primary CTAs lead to `/start`; real recommendations and HTML reports remain below the workflow, with HTML reports in a disclosure.
- Recommendation rows separate plain numeric positions from local company favicons. Source links and returned reasons retain their original content. Missing icons use a letter fallback; do not fetch arbitrary visitor-selected domains at runtime.
- Public pages share the same quiet canvas, opaque cards, restrained borders, and readable type. The Index places its website comparison directly in the page flow and keeps every view choice visible on narrow screens. Pricing puts the free preview and proposed billing state in plain language; the public dashboard presents retrieval errors as a recoverable panel.
- Internal pages use the same semantic palette and system type. The workspace navigation shows an icon, readable label, and a non-color-only current-page marker. Websites leads with website-specific actions and separates the selected site, saved reports, audit history, and Search Console connections. Evaluations keeps search questions and page evidence as explicit modes; a selected report moves above the preparation form, while its notebook remains available. These are Folio web adaptations informed by the HIG principles of hierarchy, familiarity, and clear feedback, not native Apple controls.
- The full-page workspace wait state uses a small dot-matrix animation adapted from [Transitions.dev's Matrix Dot Loader](https://transitions.dev/transitions/matrix-dot-loader/), found through the componentsearch MCP catalog. It uses semantic Folio colors, a persistent text status, and a static visible pattern when reduced motion is preferred. It represents route/auth hydration only; it does not imply that a scan, evaluation, or paid task has started.
- [`public/images/folio-og.jpg`](public/images/folio-og.jpg) is the generated 1200 × 630 social preview used by Open Graph and Twitter metadata. It says what Folio does without implying that a sample or proposed plan is a measured outcome.
- Retain third-party attribution and licenses when adapting vendored controls to theme tokens.

## Validation

Check landing, index, pricing, workspace, evaluations, website crawl, costs, and settings on desktop and narrow widths; test light and dark appearance, keyboard and pointer actions, 200% browser zoom, focus, labels, and contrast. Compilation and fixture tests prove rendering contracts, not accessibility conformance. Record actual checks separately from outstanding manual review.

## Dashboard and setup surfaces

The dashboard and `/start` now extend the approved cream/forest-green landing identity. Dashboard tokens and compact operational layout are scoped in `src/components/dashboard-refresh.css`; onboarding uses scoped tokens in `onboarding.css`. Dashboard appearance and icon-rail expansion are explicit, persistent local preferences. Keep titles at 24–26px, preserve task labels, and show filters before exploratory charts.

The Index's searchable website list is primary; its chart and full comparison table are optional detail. Public overview uses actual Bencho Stacked Bars source with published observation counts and dates, plus actual Bencho Label Input source for searches. Never restore the upstream generated demo series. Keep latest-per-question totals distinct from published history counts. Mobile collapses analytics so questions and evidence remain accessible. See `docs/design/DASHBOARD-REFRESH.md` for research, asset prompt and validation.
