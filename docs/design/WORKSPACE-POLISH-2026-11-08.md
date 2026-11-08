# Workspace presentation polish — 8 November 2026

Follow-up to the passing CI checkpoint `9b11b02`.

- Matched navigation, buttons and shared dropdowns to rounded 16px controls; retained existing spring press feedback and reduced-motion behavior.
- Gave public summary cards and the question browser consistent 16px corners.
- Changed Index view controls to a segmented surface with an explicit selected state, wrapping on phones.
- Placed the private overview's model selector beside its scope explanation on desktop; stacked them on mobile. Reduced summary-value emphasis so the chart cards lead.
- Made press compression more tactile with a vertical squash and spring return. Repeated private summary values and public activity/model charts are collapsed by default; their data remains reachable through keyboard-accessible disclosures.
- Grouped recommended steps and saved report types into cards, with clearer answer-link boundaries.

Existing Bencho components, theme artwork, metric calculations, evidence caveats, record ownership and explicit provider actions are preserved. No new image generation or provider request was needed.

## Verification

All nine local CI stages pass for `abe52c5da379e0dff41b8b5ff8c0b41f78918235` (Next.js 16.4.5, Node 22.21.1, Bun 1.4.1). Commands match `.github/workflows/ci.yml`. They ran in the same local Linux ARM64 Ubuntu 24.04 Playwright container described in `LOCAL-CI-2026-11-08.md`; frozen dependencies and browser packages were pre-provisioned because guest package mirrors are unreachable.

| Stage | Result | Seconds |
| --- | --- | --- |
| Frozen-lockfile install | Pass | 0.1 |
| Setup / migrations | Pass | 10.6 |
| Typecheck | Pass | 3.6 |
| 320 unit tests | Pass | 6.2 |
| 37 D1 integration tests | Pass | 38.9 |
| Playwright browser/dependency installation | Pass | 0.3 |
| 367 browser cases passed; 1 passed on retry; 2 existing skips | Pass | 590.2 |
| Cloudflare production build | Pass | 25.3 |
| Scheduler dry build | Pass | 10.5 |

The desktop model-history test had one `net::ERR_ABORTED` during direct navigation after browser-history traversal, then passed the same assertions on its allowed retry. Its trace is retained. Three additional desktop repetitions with retries disabled all passed afterward. The corresponding mobile case passed on its first attempt. No assertion or retry policy was relaxed.

All eight light/dark route-audit cases pass: 192 route visits and 96 checks at 320px, including dropdown bounds, focus restoration, absence of visible native selects, runtime errors and unintended writes. New checks exercise the closed-by-default disclosures with keyboard input and verify vertical press compression plus reduced-motion behavior. Providers remain mocked, D1 tests use isolated fixture persistence, and no live provider validation or deployment is claimed.

Visually reviewed populated overview, chart-card and desktop/mobile Index screenshots. Images remain in ignored `.local/ui-polish-review/`; CI logs and the initial retry trace remain in `.local/ci-results/ui-abe52c5`. The earlier 52-case focused presentation run is superseded by this full result.

The native Mac preview was restarted with Node 22. Its initially empty local database was privately backed up, then all 25 existing migrations were applied. Native loopback connections remain intermittent on this Mac; the Linux CI and illustrative dashboard screenshots are separate from that preview limitation. No local credentials or state were committed.
