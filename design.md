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

`UiSelect` in `src/components/ui/select.tsx` is the shared dropdown across public and private routes. It uses Radix Select with wrapping selected text/options, semantic Folio colors, grouped options, keyboard navigation and managed focus. Preserve existing controlled values and explicit change handlers. Do not add visible native selects; browser-owned popups cannot follow the product theme. Radix's hidden form field is distinct from the visible control.

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

The login screen uses `src/components/login.css`: a compact header, Google/email method choices, a progressively revealed email form and paired light/dark arch artwork. Keep the logo visible on mobile, inputs at 16px, pending actions named, and password visibility explicit. Preserve validated return destinations and configured-only OAuth actions. Workspace controls share press compression and spring return with reduced-motion support. See `docs/design/LOGIN-DARK-POLISH.md` for assets and prompts, and `docs/design/PAGE-STYLE-AUDIT.md` for route coverage.

## Validation

Check landing, index, pricing, workspace, evaluations, website crawl, costs, and settings on desktop and narrow widths; test light and dark appearance, keyboard and pointer actions, 200% browser zoom, focus, labels, and contrast. Compilation and fixture tests prove rendering contracts, not accessibility conformance. Record actual checks separately from outstanding manual review.

## Dashboard and setup surfaces

The dashboard and `/start` now extend the approved cream/forest-green landing identity. Dashboard tokens and compact operational layout are scoped in `src/components/dashboard-refresh.css`; onboarding uses scoped tokens in `onboarding.css`. Dashboard appearance and icon-rail expansion are explicit, persistent local preferences. Keep titles at 24–26px, preserve task labels, and show filters before exploratory charts.

The Index's searchable website list is primary; its chart and full comparison table are optional detail. Public overview uses actual Bencho Stacked Bars source with published observation counts and dates, plus actual Bencho Label Input source for searches. Never restore the upstream generated demo series. Keep latest-per-question totals distinct from published history counts. Mobile collapses analytics so questions and evidence remain accessible. See `docs/design/DASHBOARD-REFRESH.md` for research, asset prompt and validation.


## Checking with Impeccable

Impeccable is a design reviewer for agents and a CLI, installed as a dev
dependency (`impeccable`) plus a project skill in `.claude/skills/impeccable`.
Use the bun scripts, not `npx`:

```sh
bun run design:check    # regex + structure scan of src/components and src/app
bun run design:live     # full DOM scan of the running dev server (catches tiny text, contrast)
bun run design:install  # refresh the skill files; the platform binary is gitignored
```

The landing deliberately uses the warm paper palette, so `cream-palette` is
ignored in `.impeccable/config.json`; every other rule stays on.

The DOM scan needs a running `bun run dev`. Findings are ranked failures, not
style suggestions: a page with findings has text below the legibility floor or a
contrast problem. The type floor is 12px for functional text; `design:live`
should report zero before a UI change is considered done. Workspace pages use
the higher 13px floor described under Soft workspace chrome.

## Soft workspace chrome (November 2026)

Reserve the floating theme picker's 76px bottom clearance inside the workspace content canvas, or the standalone page's footer/content container. Do not add it to the document body: the body uses the marketing cream palette and would expose a mismatched strip below other surfaces. Keep the shell's normal 18px desktop and 8px mobile outer gutters.

Workspace content uses a column layout with a footer pushed to the bottom on short pages. Content sections retain their own natural height; empty states use content plus 32px vertical padding rather than a 430px stage. SEO check details initially show the first populated category in failure, warning, pass, optional order. Keep the source score and check counts unchanged; selecting a category is a local view change, never a new check.

The owner's support-dashboard reference refines the workspace chrome in `src/components/dashboard-soft.css`: a soft cool-grey shell, an inset off-white content canvas, white selected navigation and controls with shallow offset shadows, and rounded corners. Forest green remains the action accent. The dark workspace uses layered charcoal/green neutrals and pale green actions. These overrides are scoped to `.folio-workspace`; landing and authentication retain their established palette.

Workspace contrast (11 November 2026): the owner found the first soft palette washed out. The workspace tokens in `theme.css` now target, on the white surface and by the WCAG formula, at least 15:1 for ink, 9:1 for secondary text, 7:1 for muted text and 3:1 for control borders (`--folio-edge-strong`); hairlines (`--folio-edge`) are decorative and lighter. Shell, canvas and surface are further apart in tone, and `--folio-control-shadow` includes a 1px ring so raised white controls keep an edge on white panels. Keep the soft shell and rounded chrome; do not lighten text or borders back toward grey, and do not dim text with `opacity`.

Dark workspace (11 November 2026): the owner asked for the same treatment in dark. The dark tokens target, on the surface, at least 13:1 for ink, 10:1 for secondary text, 9:1 for muted text and 4.5:1 for control borders; a near-white ink cannot reach the light theme's 15:1 on a dark panel without a harsh pure white. Tones run shell, canvas, surface, muted track, raised control, each lighter than the last. `--folio-raised` is the fill for raised controls (the selected tab or segment, secondary buttons, the current navigation item): it equals the surface in light and is lighter than the muted track in dark, so a selected tab no longer reads as a dark hole in its track and a button no longer disappears into its panel. New raised controls should use `--folio-raised`, not `--folio-surface`. Select triggers keep their border in dark: a control boundary is not a decorative frame. Panels still separate by tone, without borders.

Workspace type (11 November 2026): the owner asked for more readable text after the contrast change. Half of the visible characters on the main workspace pages were set at 12px. Every 13px font size in the workspace stylesheets became 14px and every 12px became 13px, so **13px is the workspace floor**: labels, metadata and chips are 13px; sentences, controls and table text are 14px. The few smaller labels on those pages (a 9px eyebrow, 11px notes, the 9px shortcut hint) moved to 12–13px. Do not add 12px text to a workspace stylesheet. The landing, login, onboarding, pricing, API reference and privacy pages keep their own scale, and the sample demo and operator analytics stylesheets were not changed. `ranked-search-table.css` is shared, so the recorded ranking embedded on the landing grew by the same 1px.

The workspace also sets `-webkit-font-smoothing: auto` in `dashboard-soft.css`, in both themes. The global `antialiased` thins strokes on macOS; the default keeps small text at its full weight. Dark was first left on `antialiased` for fear of bloom; a 2x capture of the same text showed fuller strokes without smearing, so it now matches light. This affects macOS rendering only.

Workspace consistency rules, also in `dashboard-soft.css`:

- **Page-level views use one segmented control.** Overview, the Index and Evaluations share a muted track with a raised white selected tab, 44px tall. Their own stylesheets keep only layout (wrapping, the Index's mobile grid). Do not add an underlined or outlined tab variant for a new page.
- **Two heading levels sit below the 26px page title.** A section title (22px, 20px on narrow screens, weight 500, display family) introduces a region or a selected record. A card title (16px, weight 500, body family) labels a panel or list. Add a new heading to one of the two selector lists rather than giving it its own size. DM Sans is loaded at 400, 500, 700 and 800, so a 600 or 650 weight renders as 700.
- **Containers share the panel surface**: 16px radius and an opaque background. Controls use a 12px radius; status labels are pills.
- **Disclosures are full-width rows**: a 14px weight-500 label on the left, a chevron on the right, 48px tall, separated by hairlines. Adjacent disclosures stack into one list, and an open row inside a panel sits on the canvas tone. Do not mix native triangle markers, boxed rows and unstyled summaries on one page. The overview applies this in `real-overview.css`.
- **Say what a panel is before offering tools.** A results panel opens with a title, one sentence in plain words, and a statement of what was found; filters, date ranges, exports and charts follow. Explanatory copy is 14px, labels and metadata 13px, and values 15px weight 500 with tabular figures. List only the states that apply: a row of zero counts is noise. Prefer "answer", "question" and "your site" to "observation", "case" and "target" in visible copy; keep "loaded" where a count describes paginated history.
- **Empty, unavailable and signed-out states use `WorkspaceState`** (`src/components/workspace-state.tsx`): the horizon art, a title, one or two sentences, and the next action. A failed read gets its own title and a **Try again** action; it must not render as an empty result.

Keep the actual overview's checked/found/next-action summary and **See all saved results** handoff. The raised treatment signals selected navigation and actionable controls, not every content section. Preserve both compact and expanded navigation, visible keyboard focus, 44px touch targets and reduced-motion support. At narrow widths the redundant heading action is available in navigation, while refresh becomes a labelled icon control next to the website picker.
