# Onboarding preview

`/onboarding?example=1` is the explicit fixture-only, unauthenticated walkthrough of Folio's website-onboarding flow. Its Codegraff content lets visitors review an illustrative setup and report. It is excluded from indexing (`noindex`/`nofollow`).

The landing page's **Set up your business** actions open the real default `/onboarding` flow instead. That blank flow accepts owner-reviewed business details and customer questions, then explicitly saves a private business profile, website, and question suite after sign-in. It does not fetch a website, verify claims, measure visibility, or start paid research. Saved setup and question-suite handoffs are documented in [frontend workflow](FRONTEND-WORKFLOW.md#start-from-the-homepage). The boundaries below apply to the explicit example only.

## Boundaries

- **No programmatic network work.** The page makes no external or `/api` calls — nothing is fetched,
  collected, or submitted. Source URLs and an explicit completion link to the evaluation workspace are user-controlled navigation. The address only decides whether the bundled Codegraff sample applies.
- **No measurement.** Positions shown in the report preview are static fixture data, labelled
  "Illustrative AI-answer order, not Google rankings". Edited, custom, keyword, and named-comparison
  questions always show "No sample observation" — sample positions are never fuzzy-reused.
- **Local draft only.** Preview inputs resume after same-tab refresh using `sessionStorage` for up to
  24 hours. Nothing is saved to an account or synchronized across devices. The page explains this
  limit and offers “Clear local draft”; storage failures show a refresh warning. Bounded
  schema validation rejects malformed, expired, invalid-target, or empty advanced-step drafts. No
  authenticated records, provider results, credentials, or account identifiers enter this draft.
- **No paid or implied entitlement.** The report plan states plainly that no collection starts, no
  charge applies, and a production report allowance is not implemented.

## Flow

Four progress steps — Website, Understanding, Goals & competitors, Report plan — then a report
preview (not a fifth step).

1. **Website**: public address input normalized with the same `readEvaluationIntent` helper used by
   evaluation handoffs, plus an editable business name (default `Codegraff` for the sample site
   only). Non-sample sites get no supplied evidence: blank manual statements and no fixture content.
2. **Understanding**: three reviewable statements (description, audience, capabilities). Actions are
   "Looks right", "Edit" (seeds prior wording or the suggestion), and "Other options" (Remove,
   Not sure). A saved revision stays as the card text and survives later status changes; restoring
   the original requires the explicit "Use original suggestion" action inside the expandable
   "Original suggestion" details. Every statement must be decided before continuing; removed/unsure
   statements stay out of the asserted profile. Source details show a clearly-labelled mock excerpt
   and the source URL.
3. **Goals & competitors**: compact, whole-row-checkable topic rows become report questions. When
   the sample capabilities statement is accepted, three rule-based demo topics are offered
   (explicitly not AI-generated research); otherwise the user is told to add their own. Custom
   topics can be removed in place and use the fixed template
   `Which tools are suitable for <topic>?`. Question wording itself is edited on the plan step. Continue includes valid pending topic text
   even without clicking Add topic, and requires at least one selected nonblank question.
   Competitors default to *Track competitors* (open discovery); the explicit
   *Compare specific businesses* choice switches to named comparison only when names exist, and is
   labelled non-neutral.
4. **Report plan**: reviewed profile, topic-sourced editable/selectable questions, mode, and the
   "Preview first report" CTA with the demo-only notice.
5. **Report preview**: clicking "Preview first report" captures a single report packet
   (`buildOnboardingReport(buildOnboardingExport(...))` from `src/lib/onboarding-report.ts`) that is
   reused by the on-screen report, the brief panel, and the JSON download — it is regenerated on same-tab refresh or
   on an explicit re-preview and cleared by start-over/site changes. An overview card labels the
   report as an illustrative fixture with "No live capture or collection date", lists target site,
   business, mode, and three counts — selected questions, sample answers available, and questions
   without a sample answer. When at least one question has a fixture answer, a hatched bar chart
   (adapted from EvilCharts, MIT — `src/components/evilcharts/`, upstream
   https://github.com/legions-developer/evilcharts/blob/844344cb/charts/bar-charts/hatched-bar-chart.tsx)
   shows per-brand appearances across the available answers only, with the caption "Counts across
   available sample answers only; not market share or Google rankings" and an equivalent readable
   list for long names. When no question has a fixture answer an explicit empty state is shown and
   no chart renders. Below it the comparative table (Question | business | tracked competitors)
   shows sample positions only for exact unedited fixture questions in open mode on the sample
   site. Question rows carry a "Question NN" kicker with a "Sample answer" / "No sample answer"
   state, compact inline source disclosures, and pill position badges (accent-tinted for the target
   business, neutral for competitors). On narrow screens each question becomes a card with a
   labelled brand line per cell — including a "Your business" marker on the target — and positions
   stay readable without sideways scrolling. A sample-only advisory agent action, a
   "Review agent brief" in-page panel (nothing is sent or executed; includes mode, competitor
   names, and final question prompts), a "Download agent brief" JSON export flagged `mock: true`,
   `measured: false`, `persisted: false`, and a "Print report / Save PDF" button (calls
   `window.print`; print styles hide controls/navigation and keep the report, evidence, and
   disclaimers on paper) complete the preview. “Prepare website evaluation” opens `/evaluations`
   with only a validated target URL. It explains that the real workflow checks page evidence, does
   not run these competitor questions, and requires sign-in and an explicit paid start. Profiles
   and questions stay in the local preview/download; they are not saved to the evaluation workspace.

## Tests

```sh
node --conditions=react-server --import tsx --test tests/onboarding-mock.test.ts tests/onboarding-report.test.ts tests/onboarding-draft.test.ts
bunx playwright test tests/onboarding-mock-gui.spec.ts
```

Unit tests cover the fixture helpers in `src/lib/onboarding-mock.ts` (claim decisions, list limits,
topic reconciliation, sample observations, export shape), local draft validation (expiry, malformed
state, unsafe targets, pending inputs and edited questions), and the report aggregation in
`src/lib/onboarding-report.ts` (counts, per-brand appearances/positions, dedupe, non-mutation).
GUI tests run on desktop and mobile projects, drive the full flow including the JSON download,
same-tab refresh including pending topics and edited website names, target-only handoff,
dark/light contrast and keyboard focus, and print emulation, and abort-and-assert against any `/api` or
external-origin request.
