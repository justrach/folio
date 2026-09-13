# Frontend evaluation workflow

## Workspace presentation

The application shell uses `src/app/workspace-theme.css` for the warm plaster,
charcoal, and muted foliage palette inspired by the owner's reference photo.
The photo itself is not included in the application. The shared navigation,
controls, and overview use this theme; route-specific forms retain their existing
behavior. Overview metrics share a divided strip that becomes two columns on
smaller screens. Sample labels remain visible alongside the report controls.

DM Sans is self-hosted through `next/font/local` for site typography, including
headings, navigation, landing, pricing, and login. Regular and italic variable
fonts and their OFL license live in `src/app/fonts`. Source/code inspection keeps
monospace formatting. The workspace uses a quiet text navigation rail, omits
promotional sidebar artwork and redundant heading eyebrows, and keeps essential
evidence, account, and spending states visible.

Folio connects saved technical audits, private SEO reports, and managed website evaluations through prepared forms and owned records. Moving between pages does not start a paid lookup or model task. The owner reviews the inputs and chooses the action that creates work.

This guide describes the current UI. The [evaluation loop](EVALUATION-LOOP.md) explains execution and recovery; the [evaluation strategy](../EVALUATION-STRATEGY.md) defines what the checks establish.

## Start from your workspace

After signing in, `/overview` defaults to **My audit results**. It restores the account's selected saved audit when available in this browser, otherwise selects the latest returned audit. Without a saved audit it shows an empty state with **Run your first audit**. Failed reads show a retry action rather than substituting a sample result.

**Evaluations, at a glance** shows up to three recent private evaluation records, with their saved status, demo/live provenance, and passed/failed/unmeasured counts when a completed result exists. **Report** opens that run's evaluation; **Agent returns** opens the same run in `/agents`. **Prepare evaluation** uses the selected audit's target when available. This summary reads saved application state; it does not launch a task.

The **Demo report** remains a deliberate alternative. Real technical scores do not inherit sample sparklines, period changes, citations, or company ranks. AI visibility and consumer-answer citations remain unmeasured by the current website-evidence suite.

## Carry a website or SEO report into a form

| Starting point | Action | Result |
| --- | --- | --- |
| Selected technical audit | **Evaluate this website** | Opens `/evaluations` with its target prepared |
| A saved site in `/websites` | **Evaluate** | Opens the target's evaluation form |
| Selected technical audit | **Search & backlinks** | Opens `/search-data` with the domain prepared; no lookup is submitted |
| A persisted SEO result | **Use in evaluation** | Opens the target's evaluation form with that saved-report selection requested |
| A recent private evaluation | **Report** or **Agent returns** | Reads the selected owned run |

A saved SEO handoff is resolved against the signed-in account's completed reports and the exact target hostname. An unavailable, mismatched, or other-account report is not attached; the UI explains that the page capture can be used alone. Reopening saved SEO history or selecting its report does not make another DataForSEO request.

URL hints contain only context: `target`, `seoReport`, `run`, and `baseline`. `evaluation-navigation.ts` validates each value, ignores ambiguous duplicates, and builds a fixed evaluation pathname. IDs never establish ownership or permit spending. The server checks both again when an action is submitted.

The login return hint accepts only local `/evaluations` or `/agents` destinations and rebuilds their validated context. Invalid destinations fall back to `/websites`. Reference answers and credentials are not carried through login URLs; a user signs in before entering private reference facts.

## Check readiness before starting

The evaluation form displays the checks that matter for a live start:

- A signed-in account.
- The managed Agents API configured on the server.
- That exact account approved for provider spending.
- The target hostname enabled by the operator.
- No queued, running, or needs-attention run occupying the account's active slot.
- Remaining live attempts in the rolling 24-hour allowance.

The allowance comes from the private server response. Failed attempts and deleted reports still count toward it. The default is one live attempt per rolling 24 hours; it is a run limit, not a dollar budget. An active-run notice links to the saved session so it can be inspected before another start.

This is an operator-configured pilot. Server configuration holds the API key, approved account IDs, and exact reviewed hostnames. The default scan targets are `example.com` and `www.example.com`; the form shows the deployment's current enabled targets. Copying an account ID or opening a target link does not approve either one. See [Agents setup](AGENTS-INTEGRATION.md) and [DataForSEO setup](DATAFORSEO.md).

Preflight is explanatory UI, not the authorization boundary. The server independently enforces the owner, target, active-run reservation, and quota when the request arrives.

## Review private inputs and explicitly run

The target is required. **Optional reference answers** accepts a product name and pricing reference: unknown, a stated amount/currency/interval, or explicitly no price. Providing references requires the owner to confirm they reviewed those answers for the website. They remain private and are withheld from the model. An owner-supplied reference is not independent certification of its truth.

**Saved SEO evidence** can attach one matching private report. It freezes that report with the run; its content is supplied only through the selected-report agent tool. Neither selection nor preflight triggers a new SEO lookup.

**Run with Agents API** is the explicit paid start. It reserves a new private run, captures the current page, and creates one managed OpenAI session with the initial evidence. The returned run opens in its own report state. Failure or uncertainty remains visible; it is not replaced with a successful demo.

**Try reproducible demo** verifies a fictional local capture and canned output without contacting OpenAI. It remains labelled as a local demonstration.

## Follow the session and inspect its returns

`/agents` presents saved sessions with **Queued**, **Running**, **Needs attention**, **Completed**, **Failed**, or **Cancelled** status. Selecting a row reads that run's activity. **Refresh returns** reconciles existing provider state, **Cancel run** requests cancellation, and **Open evaluation** leads to the detailed report.

While the workspace is visible, queued/running sessions are reconciled approximately every ten seconds. OpenAI performs the task remotely; the browser does not execute the agent. Needs-attention runs require an explicit refresh or action in the UI. The activity dock links back to the relevant session. The separately configured scheduler can retrieve existing sessions; it does not create new evaluations or approve tool results.

If the managed agent requests the selected SEO snapshot, open its evaluation and use **Return saved SEO evidence**. This explicit action returns the frozen report once. It makes no new DataForSEO lookup, but can resume paid OpenAI inference. An ambiguous tool submission is not automatically resent.

The report separates **Verification checks**, **Source evidence**, **Agent returns**, and **Methodology**. Check details show expected and observed values; evidence links open the corresponding frozen source. Activity displays recorded returns and available usage, not hidden reasoning or an invented progress trace. Completion requires a completed root turn, its final JSON, and independent verification; completed reports can retain failed or unmeasured checks.

## Verify, compare, or inspect the current website

| Action | Behavior and cost boundary |
| --- | --- |
| **Download evidence** | Exports the private saved capture, output, references, and verifier recipe; creates no model task |
| `bun run eval:verify <bundle.json>` | Recomputes the exported checks offline; makes no network or inference call |
| **Compare this run** | Selects a completed private run as the comparison baseline; choose another completed run of the same demo/live mode |
| **Replay frozen evidence** | Explicitly starts a new paid managed session using the original captures and references; does not recapture the website |
| **Evaluate current website** | Prepares a fresh form for the same target and clears reference answers and saved SEO selection; starts nothing until **Run with Agents API** is pressed |

The comparison shows check-level outcomes, capture identities, reference changes, and measurement coverage. Changed source hashes alone are flagged; changed target, model, suite, reference/expected values, or coverage prevent a percentage delta. A difference does not prove an edit caused the change.

Frozen replay preserves the input evidence, not every execution setting: the current configured model and evaluator instructions apply. A fresh run requires reviewing references and choosing any SEO snapshot again. See [offline verification](VERIFY-EVIDENCE.md) for the bundle contract.

## Owner boundaries and current limits

Private rows are rendered only for the current owner. Account changes abort pending reads, discard owner-bound reports and reference drafts, and ignore late responses from the previous owner. A bookmarked run or report must still be readable through the current session. Query hints do not bypass that boundary.

Technical readiness, SEO provider estimates, and agent evidence verification remain separate measurements. This workflow does not establish consumer-search rank, live consumer-AI recommendation frequency, or an independently ranked company benchmark. Agent reports are private; the technical publication toggle does not disclose them.

Website changes are still applied by a person. Technical repair approvals produce downloadable suggestions; there is no persisted change record linking approval, implementation, and retest yet. **Evaluate current website** and the comparison controls make the next manual step accessible, but do not automatically publish a fix or schedule fresh monitoring.

## Implementation and validation pointers

- [Dashboard and audit handoffs](../src/components/dashboard.tsx), [private overview summary](../src/components/workspace-evaluation-summary.tsx), and [SEO handoff](../src/components/seo-data-panel.tsx).
- [Context parsing](../src/lib/evaluation-navigation.ts), [evaluation form/report](../src/components/evaluations-panel.tsx), and [comparison](../src/components/evaluation-comparison.tsx).
- [Session state and polling](../src/components/evaluation-workspace.tsx), [agent activity](../src/components/agent-runs-panel.tsx), and [server launch route](../src/app/api/evaluations/route.ts).

Regression tests should cover direct links, back/forward navigation, owned report selection, blocked preflight states, cleared fresh-run inputs, cross-owner transitions, and the absence of paid creation/lookup/tool submissions during navigation. Routine GUI checks mock providers; this document makes no additional live-provider or deployment claim.
