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

`/overview` defaults to **My website results**. Signed-out visitors see a sign-in prompt; signed-in owners choose an existing saved website. The overview loads saved application records with GET requests only. It does not reconcile provider sessions, start a search, or import an SEO report.

**Search observations** uses the latest completed answer for each question targeting that exact website. Open-web and reviewed-documentation observations occupy separate tabs. A newer pending, failed, cancelled, or needs-attention attempt stays visible without replacing its earlier completed answer. Each question links to its answer and, when different, its latest attempt.

The sidebar's **Switch website** control opens the authenticated account's saved websites from `/api/sites`, including sites without audits. Choosing a website reads its own audit history and opens its latest saved SEO audit; a site without an audit opens Search & backlinks with the target prepared. The picker includes loading, retry, signed-out, and empty states, plus **Add a website** to open the audit form. Opening or selecting never starts an audit, paid SEO lookup, or evaluation. The menu reloads on opening, supports keyboard dismissal, and clears its private state when the account changes.

The appearance rate uses only completed answers with a known target-identity result; unknown identities are reported and excluded from the denominator. Distinct cited pages counts source URLs across the loaded answers, including other websites. Question coverage, unfinished attempts, and read failures appear beside the metrics. The overview loads up to 20 suites and 100 recent attempts; these bounds and comparable same-question history are under **Details and history**. No trend is inferred from unrelated questions.

**Website reports** separately links exact-URL technical audits, saved hostname-matching SEO reports, Search Console snapshots, and recent private website evaluations. Missing data is shown as missing. Changing accounts clears the owner-bound data and aborts its pending reads; changing websites resets the selected reports.

The **Demo report** remains an explicit alternative. Its sample percentages, sparklines, citations and company ranks do not enter the real overview.

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

The login return hint accepts only local `/evaluations`, `/agents`, `/benchmarks`, `/search-console`, `/overview`, or `/docs/api` destinations and rebuilds their validated context. Invalid destinations fall back to `/websites`. Reference answers and credentials are not carried through login URLs; a user signs in before entering private reference facts. Browser profiles have separate sessions, so signing in through Chrome does not also sign in the in-app browser.

## Choose search questions or page evidence

Plain `/evaluations` opens **Search questions**, using the same private workspace available at `/benchmarks`. **Page evidence** opens captured-page verification. Legacy `run`, `target`, `seoReport`, and `baseline` website links retain their page view; explicit `view=search` selects keyword context. Only one workspace reads a run ID at a time. Login preserves the validated mode and selected owned-record hints.

The question editor saves 1–10 questions against an existing owned website, with a suite name, language and locale. Starter packs cover work, shopping, services, learning and coding harnesses. Questions can be edited before saving. Saving a suite stores drafts only; each later baseline or fresh observation remains an explicit start with the same active-run safeguards.

## Open a saved report or prepare a new run

A selected evaluation opens directly into its report. Authentication loading shows no launch/demo form. A signed-out `?run=` link presents **Sign in to open this private report** and preserves its validated return context; browser back to a saved run clears the previous preparation notice. The compact **Notebook** keeps saved runs available without placing the launch form above the result. **New evaluation** opens a blank form; **Evaluate current website** prepares that form for the selected target and clears its old reference answers and SEO selection. Back/forward navigation and refresh preserve the selected saved run through validated URL context.

The form keeps optional reference answers, saved SEO evidence, and the suite explanation in disclosures. The comparison area is also collapsed until selected; **Compare this run** opens it with the current run as the baseline. Preparing inputs or opening these controls does not start work.

## Check readiness before starting

The evaluation form displays the checks that matter for a live start:

- A signed-in account.
- The managed Agents API configured on the server.
- That exact account approved for provider spending.
- The target hostname enabled by the operator.
- No queued, running, or needs-attention run occupying the account's active slot.
- Remaining live attempts in the rolling 24-hour allowance.

The allowance comes from the private server response. Failed attempts and deleted reports still count toward it. The default is one live attempt per rolling 24 hours; it is a run limit, not a dollar budget. An explicitly approved account can have no daily limit through the server-only account exception; other accounts retain the default. The single active-run reservation still applies. An active-run notice links to the saved session so it can be inspected before another start.

This is an operator-configured pilot. Server configuration holds the API key, approved account IDs, and exact reviewed hostnames. The default scan targets are `example.com` and `www.example.com`. Opening a target link does not approve it for a paid run. See [Agents setup](AGENTS-INTEGRATION.md) and [DataForSEO setup](DATAFORSEO.md).

Preflight is explanatory UI, not the authorization boundary. The server independently enforces the owner, target, active-run reservation, and quota when the request arrives.

## Review private inputs and explicitly run

The target is required. **Optional reference answers** accepts a product name and pricing reference: unknown, a stated amount/currency/interval, or explicitly no price. Providing references requires the owner to confirm they reviewed those answers for the website. They remain private and are withheld from the model. An owner-supplied reference is not independent certification of its truth.

**Saved SEO evidence** can attach one matching private report. It freezes that report with the run; its content is supplied only through the selected-report agent tool. Neither selection nor preflight triggers a new SEO lookup.

**Run evaluation** is the explicit paid start. It reserves a new private run, captures the current page, and creates one managed OpenAI session with the initial evidence. The returned run opens in its own report state. Failure or uncertainty remains visible; it is not replaced with a successful demo.

**Try reproducible demo** verifies a fictional local capture and canned output without contacting OpenAI. It remains labelled as a local demonstration.

## Follow the session and inspect its returns

`/agents` presents saved sessions with **Queued**, **Running**, **Needs attention**, **Completed**, **Failed**, or **Cancelled** status. Selecting a row reads that run's activity. **Refresh returns** reconciles existing provider state, **Cancel run** requests cancellation, and **Open evaluation** leads to the detailed report.

While the workspace is visible, queued/running sessions are reconciled approximately every ten seconds. OpenAI performs the task remotely; the browser does not execute the agent. Needs-attention runs require an explicit refresh or action in the UI. The activity dock links back to the relevant session. The separately configured scheduler can retrieve existing sessions; it does not create new evaluations or approve tool results.

If the managed agent requests the selected SEO snapshot, open its evaluation and use **Return saved SEO evidence**. This explicit action returns the frozen report once. It makes no new DataForSEO lookup, but can resume paid OpenAI inference. An ambiguous tool submission is not automatically resent.

An unfinished report opens on **Agent returns** and shows four milestones: evidence prepared, task accepted, answer returned, and checks completed. These marks require saved evidence; elapsed time does not advance them. The timer measures time since the saved request, not provider execution time, and stops at the recorded terminal outcome. Ambiguous creation and cancellation requests retain their unresolved state rather than implying that remote work never started or has stopped.

A completed report opens on **Verification checks**, led by passed, failed, and unmeasured counts. The measured-check percentage remains secondary and excludes unmeasured checks. Failed checks and unmeasured checks precede passed checks, with expected values, observations, and linked source evidence available in each disclosure.

The report also provides **Source evidence**, **Findings**, **Agent returns**, and **Methodology**. The model's prose appears as **Agent summary** in Findings, separate from the independently computed check outcomes. Evidence links open the corresponding frozen source. Activity displays recorded returns and available usage, not hidden reasoning or an invented progress trace. Completion requires a completed root turn, its final JSON, and independent verification; completed reports can retain failed or unmeasured checks. **Download evidence** remains a direct action; frozen replay and terminal evidence deletion sit under **More actions**.

## Verify, compare, or inspect the current website

| Action | Behavior and cost boundary |
| --- | --- |
| **Download evidence** | Exports the private saved capture, output, references, and verifier recipe; creates no model task |
| `bun run eval:verify <bundle.json>` | Recomputes the exported checks offline; makes no network or inference call |
| **Compare this run** | Selects a completed private run as the comparison baseline; choose another completed run of the same demo/live mode |
| **Replay frozen evidence** | Explicitly starts a new paid managed session using the original captures and references; does not recapture the website |
| **Evaluate current website** | Prepares a fresh form for the same target and clears reference answers and saved SEO selection; starts nothing until **Run evaluation** is pressed |

The comparison shows check-level outcomes, capture identities, reference changes, and measurement coverage. Changed source hashes alone are flagged; changed target, model, suite, reference/expected values, or coverage prevent a percentage delta. A difference does not prove an edit caused the change.

Frozen replay preserves the input evidence, not every execution setting: the current configured model and evaluator instructions apply. A fresh run requires reviewing references and choosing any SEO snapshot again. See [offline verification](VERIFY-EVIDENCE.md) for the bundle contract.

## Inspect search observations

`/benchmarks` leads with the selected query, target, saved status and **Did your site appear?**. A compact suite/history notebook keeps earlier observations reachable; question controls and new-suite setup sit below the selected report in disclosures. Website handoffs automatically select a suite only when every saved case target matches that owned website exactly; otherwise the owner chooses a suite. Saving a suite creates questions without inference. **Run baseline** and **Run fresh observation** are explicit starts; **Prepare another observation** only opens settings.

The result separates **Target in recommendations** from **Target cited as a source**. Host matching removes `www` and a trailing dot, does not infer aliases/subdomains, and leaves missing identities unknown. Tool rows retain their returned order and expand to show reasons and linked sources. Returned excerpts have not been independently verified against captured source text. Baseline/fresh summaries remain readable when inputs differ, but citation/mention changes are suppressed unless the shared comparison accepts the inputs and execution settings.

New open-web cases use Astra and OpenAI live web search. Legacy cases stay labelled **Reviewed documentation**; they searched only reviewed domains. The diagram describes the saved search setup, not another provider or the consumer ChatGPT website. Claude, Gemini and Perplexity coverage remains unmeasured. Active progress shows saved request/session/answer evidence and retrieves existing work while visible; cancellation acknowledgement and unknown cost stay explicit.

`/leaderboard` displays a separate public search artifact by exact query, date and original recommendation position. Uncollected queries have no invented rows. The directory, HTML readiness checks and sample views retain their distinct labels; technical publication does not publish private search runs.

## Connect an external agent

`/docs/api` is public documentation with an owner-only key manager. Creating a key starts no model work. Read access is the default; evaluate permission requires an explicit choice and still observes the owner's server limits. A new key is shown once, can expire or be revoked, and is cleared from the view on owner change. Login returns safely to `/docs/api`.

The API's default freshness window is 24 hours. GET reports saved results or missing data; an explicit `POST /api/v1/observations/ensure` with a stable idempotency key may start one new evaluation. Reopening documentation, copying an example, managing keys, and saved-run GETs do not start work. See the [API guide](AGENT-API.md) for matching, retries, existing-run reconciliation and private projections.

## Owner boundaries and current limits

Private rows are rendered only for the current owner. Account changes abort pending reads, discard owner-bound reports and reference drafts, and ignore late responses from the previous owner. A bookmarked run or report must still be readable through the current session. Query hints do not bypass that boundary.

Technical readiness, SEO provider estimates, keyword search observations, and agent evidence verification remain separate measurements. This workflow does not establish consumer-search rank, live consumer-AI recommendation frequency, or an independently ranked company benchmark. Agent reports are private; the technical publication toggle does not disclose them.

Website changes are still applied by a person. Technical repair approvals produce downloadable suggestions; there is no persisted change record linking approval, implementation, and retest yet. **Evaluate current website** and the comparison controls make the next manual step accessible, but do not automatically publish a fix or schedule fresh monitoring.

## Implementation and validation pointers

- [Dashboard and audit handoffs](../src/components/dashboard.tsx), [private overview summary](../src/components/workspace-evaluation-summary.tsx), and [SEO handoff](../src/components/seo-data-panel.tsx).
- [Context parsing](../src/lib/evaluation-navigation.ts), [evaluation form/report](../src/components/evaluations-panel.tsx), and [comparison](../src/components/evaluation-comparison.tsx).
- [Session state and polling](../src/components/evaluation-workspace.tsx), [agent activity](../src/components/agent-runs-panel.tsx), and [server launch route](../src/app/api/evaluations/route.ts).

Regression tests should cover direct links, back/forward navigation, owned report selection, blocked preflight states, cleared fresh-run inputs, cross-owner transitions, and the absence of paid creation/lookup/tool submissions during navigation. Routine GUI checks mock providers; this document makes no additional live-provider or deployment claim.
