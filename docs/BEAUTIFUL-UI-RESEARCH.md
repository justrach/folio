# Beautiful UI references for Folio agents

Observed on 2026-09-13 in the user-requested Chrome browser. This is design research from rendered demos and actual interactions, not an imported component library. No component source was copied.

## Observed components and Folio mapping

| Beautiful UI component | Observed behavior | Independent Folio application |
| --- | --- | --- |
| [Task Rows](https://www.beautifului.dev/#task-rows) | Capsule/list switch; status icon, task title, count and status label; expanding a completed row reveals substeps and their counts. | Persistent agent-run rows: queued/running/completed/failed/canceled, domain, progress, elapsed time. Expand into evaluator stages and real recorded checks. |
| [Tool Chips](https://www.beautifului.dev/#tool-chips) | A grouped call count expands to tool rows; individual rows disclose output; changed files appear as compact chips with additions/deletions. The write-call demo disclosed its returned code excerpt when clicked. | Compact DataForSEO, fetch, OpenAI, and evaluator badges. Expand each call to sanitized input, status, duration, cost when known, and the actual result. Never label a queued tool call completed. |
| [Context Cards](https://www.beautifului.dev/#context-cards) | Retrieved chunks show a title, character count, excerpt, and source/type badge. | Evidence cards tied to a specific check: observed value, expected condition, source URL, timestamp and response hash. Open the evidence, not merely an untraceable score. |
| [Recommendation Card](https://www.beautifului.dev/#recommendation-card) | Compact suggested action with confidence indicator; Alternatives expands options labelled Needs review or No signal; primary Accept action stays visible. | Recommendation summaries with evidence strength, expected effect, and a concrete next action. Keep measured evaluation results distinct from model suggestions. |
| [Approval Card](https://www.beautifului.dev/#approval-card) | Question card with choices, freeform answer, dismiss, previous/next question, question count, Skip, and initially disabled Continue. | A review card for explicit publishing or site changes: show the exact proposed change and destination. Routine read-only audits proceed without an approval interruption. |
| [Streaming Text](https://www.beautifului.dev/#streaming-text) | Streamed answer, inline citation badge, expandable source count, and follow-up actions. | Stream the user-facing run summary and link supporting artifacts; use follow-ups such as inspect failed checks or compare against the previous run. |
| [Insight Cards](https://www.beautifului.dev/#insight-cards) | Paged insight copy above a compact two-series trend chart and a follow-up action. | Report score changes and regressions with dated comparisons and evidence links. Label illustrative data and avoid implying unsupported score forecasts. |
| [Agent Screen](https://www.beautifului.dev/#agent-screen) | Open enlarges a screen preview into a modal containing Teach a task and Collapse. Working/Loading variants are offered. | Optional future browser audit replay when a genuine captured browser artifact exists. Do not present an invented screen as a live agent session. |
| [Loading State](https://www.beautifului.dev/#loading-state) | Pixel-style animated loader accompanied by elapsed time and several visual variants. | Small running indicator with elapsed time; avoid invented percent-complete values where the backend cannot measure progress. |

## Recommended run surface

Use a durable run header with provider, run ID, website, start time, status and privacy. Keep a task list visible while work is in progress, followed by expandable tool-return rows. A completed run should end in a result artifact with check counts and an evidence link. A failed or disconnected run should retain its partial evidence and provide a clearly named retry action.

The public leaderboard should read only deliberately published evaluation summaries. Prompts, credentials, internal endpoints, raw provider payloads, private evidence, and account identifiers belong to the authenticated workspace. A sanitized activity summary is enough for the UI; do not expose hidden model reasoning or secrets as a trace.

For Folio's existing annual-report theme, preserve cream backgrounds, forest green status colors, restrained rules, serif report headings and monospaced evidence metadata. Borrow the density and disclosure behavior of these demos rather than their lavender accent or complete visual styling.

## Interaction tests worth adding

- A background run remains findable after route changes; returning to it restores its latest persisted status.
- Each task/tool disclosure is keyboard reachable, announces expansion, and reveals the corresponding recorded return.
- Completed, failed and canceled runs have distinct text labels and useful next actions.
- Evidence opens a specific check and source; a rerun produces a new run identity instead of silently overwriting history.
- The public response excludes private fields even if the authenticated user can inspect them elsewhere.
- Reduced-motion preference removes continuous decorative movement without hiding activity status.

These are recommendations for implementation, not claims that all listed behaviors already exist in Folio.
