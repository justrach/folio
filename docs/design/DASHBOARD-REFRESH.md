# Dashboard and setup refinement

The revision continues from `a351884` and the approved landing work. It changes presentation and navigation; it does not collect additional observations or authorize provider spending.

## Working surfaces

- The shared dashboard shell uses compact DM Sans headings, a cream/green light palette, optional forest dark appearance, and an expandable icon rail. Appearance and navigation preferences are local non-account preferences. Public surfaces still do not consult identity or private APIs.
- `/overview` shows dataset totals, actual published-observation history, and an integrated question/evidence workbench. The charts use actual `observedAt` dates and published history counts, separately from latest-per-question totals. Audience, category, model, status and search narrow the chart input with the task list. Mobile collapses the observation overview so the question controls remain close to the top.
- `/leaderboard` leads with a searchable favicon list, appearance rate and average position. The redundant summary chart is optional; the full comparison table is a disclosure. Missing coverage is retained. The three Index views use native browser history via `indexView`, preserving other context through refresh/back/forward.
- Shared recorded-answer filters give the question picker enough width and use a shorter `All models` label. The full question is still displayed, and source evidence/order are unchanged.
- `/start` retains its seven stages, validation, draft/owner handling and launch boundaries. It gains calmer typography, a compact real-report preview with company favicons, a small generated artwork, and a Back action using the existing permitted-step navigation. Checking a page, authentication, saving and paid inference remain separate explicit actions.

## Research and component provenance

Graff was invoked with `--yolo --model 'grok 4.7'`. The repository-aware review reported native xAI search unavailable and reached its bounded model-call limit. A separate web-focused Graff run reported executing `web_search` and `open_page`, with these primary references:

- [Linear navigation](https://linear.app/enablement/guide/navigating-linear): grouped wayfinding and direct keyboard navigation.
- [Vercel dashboard navigation](https://vercel.com/changelog/dashboard-navigation-redesign-rollout): stable navigation and scope filtering.
- [Stripe Dashboard basics](https://docs.stripe.com/dashboard/basics): records and actions before peripheral tools.
- [Raycast v2](https://manual.raycast.com/new-in-v2): compact search and reduced chrome.
- [Efferd Dashboard 9](https://efferd.com/view/dashboard-9), explicitly supplied by the user: compact rail, balanced panels and denser operational hierarchy. Its live preview was visually inspected. No Efferd Pro source was copied.

Actual Bencho Label Input and Stacked Bars source is vendored alongside Card Swap under `src/components/bencho`, with the MIT license and adaptation details in `UPSTREAM.md`. Stacked Bars' generated demo data is removed. No sample visits, sales, forecasts or fake trends appear in Folio's observation charts.

## Generated artwork

`public/images/folio-workspace-horizon.webp` is a 900px-wide WebP generated with the built-in imagegen tool. It is decorative artwork used in private-workspace empty states and the setup preview, never a chart or measured outcome.

Final prompt:

```text
Use case: stylized-concept
Asset type: small horizontal welcome/empty-state artwork for Folio website evaluation dashboard
Primary request: a very sparse premium fine-art desert abstraction matching a minimalist cream/forest-green/burnt-orange editorial poster world. One low sculptural dark forest-green dune, a thin muted ochre sunlit ridge, and a very small orange sun above a broad empty ivory sky. Quiet sense of perspective and an open path. No characters.
Composition: horizontal panoramic 3:1, dune occupies only the bottom quarter, 75 percent negative space, simple enough to work at 320px wide. No text or UI; this image is decoration beside an empty-state message, never a chart.
Style: tactile matte paper, subtle sand grain, crisp organic silhouette, restrained cinematic light, minimal Bauhaus-influenced print.
Palette: cream #f7f4eb, forest green #203b30, one subdued burnt-orange accent.
Constraints: no typography, no logos, no badges, no metrics, no screenshots, no border, no clutter, no shiny 3D objects, no people, no gradients as interface decoration.
```

## Validation scope

The dashboard/Index/owner-bound overview fixtures passed 45 of 46 initial desktop/mobile cases. The mobile Index refresh case encountered a client exception during development changes and passed its isolated rerun. Setup fixtures passed 19 of 20 initial cases; restoring the named desktop step navigation fixed the desktop competitor revisit case, which passed its isolated rerun. Four additional desktop/mobile checks passed for appearance persistence, Index-view history, 320px filters and setup, and no automatic paid writes. Ten unit checks passed for public data boundaries and the new UTC/grouped observation aggregation. Initial Label Input accessible naming and old Index-control-position assumptions were corrected before these runs.

Manual rendered checks covered landing, Index, public overview and setup at 390px, with no horizontal overflow or page errors. Narrow fixture checks cover 320px; source chart data remains available without hover. Impeccable's final mechanical scan returned no findings. This is bounded browser/fixture verification, not accessibility certification, live provider validation or production deployment.

Final verification: ten shared landing/report/ranking browser checks also passed after the shared-filter changes. Across the completed scopes, 80 targeted desktop/mobile cases passed (including the two isolated reruns described above). Typecheck and the final Cloudflare build passed. As with the base revision, OpenNext requires `--dangerouslyUseUnsupportedNextVersion` for Next.js 15.5.25; the version was not upgraded. The preview was restarted on port 3002. No infrastructure deployment was performed.

## Shared route and question-picker follow-up

The cream/forest palette is now the global theme contract, including docs, pricing, privacy, login and workspace screens. An explicit stored appearance preference is restored on route changes; docs also exposes the same appearance control. Licensed Bencho CSS keeps its upstream fallback colors; application-owned CSS consumes semantic tokens from `theme.css`.

The recorded-answer question select is replaced with a full-width, wrapping trigger and a searchable native-dialog picker. The selected question is displayed once. Options retain complete text; large categories show a bounded first 100 until filtered. Escape explicitly closes the picker instead of only clearing a native search input, and closing restores trigger focus. Selection retains the existing query URL, refresh and back/forward behavior. Initial keyboard tests caught the native search Escape behavior; that was corrected before final validation.

The broad unit suite passed all 313 tests after consolidating palette literals into the theme contract. The picker regression checks verify full-text wrapping at 1280/640/320px, filtering, selection, refresh/history and explicit Escape/focus restoration. API-key fixtures now check that both existing paid-operation permission checkboxes default off. No key creation or provider task is part of visual validation.

Final follow-up browser verification passed all 16 targeted desktop/mobile cases across the ranking, shared-appearance and API-key scopes, including isolated reruns after correcting the test mock and awaiting dialog focus restoration. The mock now intercepts only root `/api/` requests, preserving the docs route JavaScript chunks; mobile login checks use the visible heading rather than the intentionally hidden desktop heading. Typecheck passed again.

## Subtle layout follow-up

Model/category filters no longer leave the category on its own row at tablet widths; narrow phones stack both controls. Index filters use 44px controls, and mobile search/select inputs use 16px text to avoid browser input zoom. Evidence disclosures and the question-dialog close control have larger touch targets. The first setup step starts higher and aligns its form with the report preview. API docs replace the clipped mobile navigation strip with an explicit “On this page” disclosure, closing it and restoring control focus after choosing an endpoint. Desktop navigation remains visible.

Validation for this follow-up: TypeScript and the theme-contract check passed, along with all 12 desktop/mobile cases in the dashboard-refresh, public-search-rankings and shared-appearance browser scopes. Manual rendered checks confirmed filter alignment and no horizontal overflow at 900/640/390/320px, plus the revised desktop setup and mobile docs layouts. Browser fixtures verify navigation without paid API writes; no provider validation or infrastructure deployment was performed.
