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

The workspace rail starts with **My workspace**, **My websites**, and **Questions**.
Questions opens the question-first evaluation hub; legacy keyword-evaluation links
still resolve and highlight the same destination. **More tools** reveals SEO,
Search Console, repairs, agents, the public index, API documentation, and plans
on request. Direct entry to an advanced workspace route opens that group so its
active destination is visible. The disclosure is temporary, scoped to the current
owner and route, and clears on account changes; it does not unlock paid work.
Settings and the account remain accessible while tools are closed.

Folio connects saved technical audits, private SEO reports, and managed website evaluations through prepared forms and owned records. Moving between pages does not start a paid lookup or model task. The owner reviews the inputs and chooses the action that creates work.

This guide describes the current UI. The [evaluation loop](EVALUATION-LOOP.md) explains execution and recovery; the [evaluation strategy](../EVALUATION-STRATEGY.md) defines what the checks establish.

The `/seo` checks panel shows a left-hand percentage breakdown of all checks (including optional checks), with status filters and an inspector on the right. No tests appear until a user selects Pass, Needs improvement, Fail, or Optional using a bar or filter. Rows then expand to show findings, short supporting notes, and points. Optional checks are labeled Not scored; these count-based percentages are not the weighted SEO score. On mobile the breakdown stacks above the inspector. Saved evidence and scoring remain unchanged.

## Start from the homepage

Both **Set up your business** actions open `/onboarding`, a real, blank four-step setup. Owners enter their website, business description, audience, optional capabilities/competitors, and 1–10 customer questions. The review step explicitly saves a private profile, saved website, and question suite; it does not fetch the site or start paid research. Owner-entered statements are not independently verified facts.

Anonymous drafts survive same-tab refresh for 24 hours. The explicit sign-in handoff transfers the reviewed draft once to the signed-in setup; saving still requires a separate click. Authenticated drafts are keyed to the owner, and in-page logout/owner changes clear the prior owner's draft. An uncertain save retains its request identity across refresh so retrying does not duplicate the saved suite. Saved profiles reopen through `/onboarding` and appear in the private workspace, with a link to the actual saved question suite. Saving edited questions creates a new immutable suite.

`/onboarding?example=1` preserves the illustrative Codegraff walkthrough. Its sample claims and report remain separate from authenticated profiles and measured outcomes. See [onboarding preview](ONBOARDING-PREVIEW.md).

## Start from your workspace

The private workspace puts one next action before compact saved business context. After a complete, successful empty default open-web history read, it displays the exact owned question matching the selected website with **Review this question**, or offers **Prepare your questions**. These links prepare the question view and never start a paid run. The empty open-web state makes no claim about other scopes; a disclosure opens reviewed-documentation observations. Explicit scope/model filters retain their controls and scoped history view. Without a saved website, one **Set up your business** action opens onboarding.

Empty metrics, recommendations, history, website-report cards, and successfully empty evaluation summaries stay out of the initial view. Saved reports, pending/failed attempts, partial-read warnings, loading states, and retryable failures remain visible. A failed or incomplete read never becomes a first-step state. Website comparison is an optional disclosure for established observations; model/scope selection and history pagination keep their existing behavior. All reads remain owner-bound GET requests.

`/overview` defaults to the public benchmark dashboard. **My website results** is the explicit `/overview?view=workspace` view. Signed-out visitors to that view see a sign-in prompt; signed-in owners choose an existing saved website. The overview loads saved application records with GET requests only. It does not reconcile provider sessions, start a search, or import an SEO report.

**Search observations** uses the latest completed answer for each question targeting that exact website. Open-web and reviewed-documentation observations occupy separate tabs. A newer pending, failed, cancelled, or needs-attention attempt stays visible without replacing its earlier completed answer. Each question links to its answer and, when different, its latest attempt.

The sidebar's **Switch website** control opens the authenticated account's saved websites from `/api/sites`, including sites without audits. Choosing a website reads its own audit history and opens its latest saved SEO audit; a site without an audit opens Search & backlinks with the target prepared. The picker includes loading, retry, signed-out, and empty states, plus **Add a website** to open the audit form. Opening or selecting never starts an audit, paid SEO lookup, or evaluation. The menu reloads on opening, supports keyboard dismissal, and clears its private state when the account changes.

The appearance rate uses only completed answers with a known target-identity result; unknown identities are reported and excluded from the denominator. Distinct cited pages counts source URLs across the loaded answers, including other websites. When an account has two or more saved websites, an explicit **Compare websites** action opens a read-only side-by-side table backed by `GET /api/benchmarks/comparison` (same per-website summaries: latest completed answer per question, same scope and model, unknown identities excluded). The endpoint is owner-scoped, GET-only, and performs no provider call, reconciliation, or spending. Opening it issues one saved-record GET and starts, reconciles, or cancels nothing. No trend is inferred from unrelated questions.

**Website reports** separately links exact-URL technical audits, saved hostname-matching SEO reports, Search Console snapshots, and recent private website evaluations. Missing data is shown as missing. Changing accounts clears the owner-bound data and aborts its pending reads; changing websites resets the selected reports.

The selected website’s **View results** link opens its combined workspace overview. **Audit website** prefills that exact website but starts no scan until submission. Evidence-linked next steps appear below completed answers; the [visibility API](VISIBILITY-API.md) provides read-key access to the same metrics and suggestion rules.

The **Demo report** remains an explicit alternative. Its sample percentages, sparklines, citations and company ranks do not enter the real overview.

## Private website query and competitor research

`/websites` has a capture-free **Save website** form. It uses the existing owned-site API and selects the saved URL without starting an audit, search, evaluation, or paid provider session. **Open website research** is the primary next action and jumps to the same-page research panel; technical checks remain secondary. **Search questions** opens the canonical `/evaluations?view=search&website=<owned-site-id>` workspace. The research panel is keyed separately from the site's SEO summary so switching sites unmounts the previous research state.

**Generate suggested queries (paid)** explicitly starts one managed OpenAI run that opens the target's public pages and proposes up to five customer questions with intent, product fit, and sources. These are hypotheses, not measured demand. The owner reviews/edits a suggestion before separately clicking **Research competitors (paid)**. That second action freezes the reviewed query, searches it, and opens target/competitor pages for up to three source-backed candidate briefs in returned recommendation order. Completing discovery does not start competitor research.

A four-step guide tracks saved website, discovery, query review and brief state from owned records—not elapsed time. Completed history offers **Review saved queries** or **Open latest saved brief**, without another paid start. The query picker shows one editable suggestion and one competitor-start button; switching suggestions or refreshing saved history preserves drafts for the same discovery. The panel shows the fixed model (Luna, OpenAI live web search) and the launch summary reminds the owner that only that query will run. Selected competitor briefs and unfinished competitor receipts appear before new-run forms; unresolved attempts have a direct reopen action.

The panel shows saved sources, target-evidence gaps, advisory suggestions, model/date, token usage, and unknown charges. Native `?site=` / `?research=` selections support direct entry, refresh, and back/forward. Switching website/account aborts private reads and clears drafts. History, saved brief reopening, and private JSON downloads spend nothing; provider progress retrieval is a separate explicit action. Uncertain starts retain the original request key/query/model, and unresolved history blocks replacement paid starts.

Agents can reopen validated structured briefs through the existing authenticated `folio_run` read. Research stays private and outside search-observation metrics and public publication. Provider-credit authorization is implemented, not checkout/customer billing. See [website research](WEBSITE-RESEARCH.md) for the API, page-open evidence requirements, quotas, and validation limits.

## Carry a website or SEO report into a form

| Starting point | Action | Result |
| --- | --- | --- |
| Selected technical audit | **Evaluate this website** | Opens `/evaluations` with its target prepared |
| A saved site in `/websites` | **Evaluate** | Opens the target's evaluation form |
| Selected technical audit | **Search & backlinks** | Opens `/search-data` with the domain prepared; no lookup is submitted |
| A persisted SEO result | **Use in evaluation** | Opens the target's evaluation form with that saved-report selection requested |
| A recent private evaluation | **Report** or **Agent returns** | Reads the selected owned run |

A saved SEO handoff is resolved against the signed-in account's completed reports and the exact target hostname. An unavailable, mismatched, or other-account report is not attached; the UI explains that the page capture can be used alone. Reopening saved SEO history or selecting its report does not make another DataForSEO request.

Opening an owned SEO report also prepares that report's verified matching domain in the lookup form. The next paid lookup still requires an explicit submission. If a selected Search Console report fails to load, its history button retries the saved-record GET without adding an identical browser-history entry or importing new data.

URL hints contain only context: `target`, `seoReport`, `run`, and `baseline`. `evaluation-navigation.ts` validates each value, ignores ambiguous duplicates, and builds a fixed evaluation pathname. IDs never establish ownership or permit spending. The server checks both again when an action is submitted.

The login return hint accepts only local `/evaluations`, `/agents`, `/benchmarks`, `/search-console`, `/overview`, or `/docs/api` destinations and rebuilds their validated context. Invalid destinations fall back to `/websites`. Reference answers and credentials are not carried through login URLs; a user signs in before entering private reference facts. Browser profiles have separate sessions, so signing in through Chrome does not also sign in the in-app browser.

## Choose search questions or page evidence

Plain `/evaluations` opens **Search questions**, using the same private workspace available at `/benchmarks`. **Page evidence** opens captured-page verification. Legacy `run`, `target`, `seoReport`, and `baseline` website links retain their page view; explicit `view=search` selects keyword context. Only one workspace reads a run ID at a time. Login preserves the validated mode and selected owned-record hints.

A first open-web question with successfully loaded, empty case history opens a focused guide on `/evaluations`. **Review your question** shows the exact saved question and website. **Continue to run review** opens **Review this paid run**, showing the model, language/location, remaining allowance, access state, and unknown final cost. Advancing, going back, selecting a different question, refreshing, or opening options starts no work. **Start paid run** is the final explicit spending action and requires the existing server access/allowance safeguards. Optional paid tools default off inside **Advanced run options**; model or tool changes reset the guide to question review. Question, site, suite and owner changes also require reviewing the prepared run again.

A submitted baseline keeps the same one-attempt runtime and private receipt. The guide disables duplicate submission while a start is pending. An unconfirmed start remains blocked for replacement in the current view, refreshes saved history once, and retains any supplied private recovery snapshot; it does not automatically retry creation. A saved queued/running observation opens its progress controls. A completed observation leads with the returned answer, target presence, ordered recommendations, citations and unknown cost; provider/method/publication/comparison controls sit inside **Run details**. The answer and source presence remain observations, not verified truth, Google ranking, or consumer-chat visibility. Existing attempts, failed history reads, saved reports, and the legacy `/benchmarks` workspace retain their existing recovery and advanced controls. **Advanced workspace controls** exposes suite editing and saved question/history controls when the guide is active.

The search-question workspace includes **Your question map** for the selected owned suite. Its count describes saved questions with nonempty completed answers matching their current frozen inputs; it does not score the website or infer results for unrun questions. Matching compares question text, target, language, locale, rubric, search scope and saved research context. The run's revision counter is independent of the editable question revision. Changed inputs retain an **Inputs changed · no matching answer** marker instead of counting an earlier answer as current. A newer pending or failed attempt stays visible beside an existing matching answer. Until saved history is confirmed, the map shows unavailable counts and **History not confirmed** rather than treating missing data as zero.

**Where your website appears** is a separate per-question matrix in **My workspace**. It displays two independent observations from the latest completed answer matching each question's current frozen inputs: **Recommended** and **Cited as source**. A known matching website host is **Yes**, even when another returned identity is missing. **Not found** means no matching host was present in that recorded output. **Unknown** preserves missing or invalid target/recommendation/source identities. Empty recommendation or citation arrays are inspected as returned; a recommendation does not require a citation, and a citation does not establish a recommendation.

The matrix shows the selected receipt's model, start date and exact saved-answer link. A newer pending/failed attempt does not replace an earlier matching completed answer. Changed question inputs suppress the old answer's appearance cells. A missing, invalid or stale latest detail stays **Unavailable** and never substitutes an older answer. Pending detail reads show neutral **Loading** cells; incomplete saved history shows a compact unavailable message. When no current question has a completed receipt, a short no-answers message replaces the empty matrix; questions can still be reviewed in the map below. Mixed suites keep explicit **Unmeasured** rows for questions without a matching completion.

The selected website, scope, suite and optional model filter determine which owned records are eligible. Switching any selection clears stale details, and late responses from another owner are ignored. Full saved-answer GETs only retrieve application records; the matrix does not reconcile remote work or start inference. Each measured row describes one recorded API answer, not Google rank, traffic, market share, website quality or consumer-chat visibility.

**Your website, answer by answer** shows dated observations for one selected owned question. The two lanes keep **Recommended** and **Cited as source** separate. Columns show the latest ten completed receipts, ordered oldest to newest, with each model and UTC run-start date. Columns are equally spaced, not a continuous time scale; the bounded view states both the displayed count and total saved completions. On narrow screens the dated observations scroll horizontally while lane names remain visible. Every date and mark opens that exact owned run. Zero completed observations show a short preparation link; one observation explicitly needs another comparable answer before claiming change.

Only the latest two adjacent completed observations supply the change summary. Both full answers must be available, current inputs must match, and model, query, target, references, locale/language, rubric, harness, environment, search provider, allowed domains and saved research context must remain comparable. Earlier-input columns remain visible and labelled, but prevent a comparable-change claim. Missing or stale details remain gaps; the view never skips a missing latest answer to compare older receipts. Unknown identities stay unknown, and one unknown lane does not turn a separately known lane into a negative result. Pending, failed and needs-attention attempts remain status notes rather than downward data points. Observed changes do not establish that a website edit caused improvement.

The question selector stores its validated case alongside suite/site/scope/model context in the workspace URL. Refresh and native back/forward preserve the selection; invalid or other-suite case hints fall back to an owned question. Selecting or reopening history starts no model work. The selected question adds at most ten completed detail receipts to the overview's existing deduplicated, revision-guarded GET retrieval; switching case, suite, model, site or owner discards stale rendered details and aborts obsolete reads.

The same map is visible in **My workspace**, using the authenticated website, suites and saved history already loaded there. Only cases matching the selected website and search scope appear. When several owned suites match, **Question suite** selects one suite at a time; the URL retains that choice through refresh and native back/forward navigation. It never combines unrelated suites into one progress count. An unavailable, nonmatching or other-owner suite hint falls back to an owned matching selection.

**Saved-question progress** is a visible stacked bar with text category counts: **Answer recorded**, **Awaiting answer**, **Needs attention**, **Inputs changed**, and **Not run**. Each saved question occupies one category. A matching recorded answer takes priority in the chart when a later attempt is pending or needs attention, while the tile retains that later attempt's status. The bar describes saved research completion, not visibility, traffic, market share, ranking or website quality. Unconfirmed or incomplete history shows unavailable progress instead of a zero-filled bar. Empty selections do not fabricate progress.

Selecting a map tile carries the owned suite, exact question and matching website in the URL, with the latest matching saved attempt when one exists. Selection, native back/forward navigation and refresh retrieve existing data only; an unrun question opens review without spending. **Read all saved questions** expands the exact saved wording. Account changes clear the prior owner's map and ignore late history responses.

Completed guided reports lead with **What this answer means**. A matched recommendation, a target cited only as a source, a site not listed in the recommendations, and an unknown website match have distinct explanations. Unknown identity does not establish absence. Recommendation/source counts describe the saved output; no returned source links remain an explicit empty state. Each explanation stays bounded to this question and answer, with no inference about Google rank, website quality or consumer-chat visibility.

**What to do next** offers one review action: open a returned source when appropriate, or compare the owner's page with the question and recorded answer. These links open the chosen page and never start another model run. The full recorded answer, ordered recommendations and returned source links remain accessible below. **Prepare another observation** opens existing question/settings controls; a later run remains a separate explicit paid action. Download, provider details, matching limitations and other advanced controls remain inside **Run details**.

The completed guided report shares one content gutter across the header, status, explanation, answer, target presence, recommendations, sources, follow-up and details. Narrow layouts stack the evidence sections. Browser regression checks measure actual content positions and overflow at 320, 390 and 1440 pixels, including sections reached by scrolling; screenshot review supplements those checks.

The default onboarding and login surfaces also wrap long unbroken owner text and error messages. The setup's question list keeps visible numbering, and login navigation/account-switch targets remain at least 44 pixels high. The full-flow browser audit covers onboarding steps, sign-in errors, setup-save errors, saved business details, expanded paid options, pending milestones and expanded result controls at 320, 390, 768 and 1440 pixels. Pending progress must retain a readable copy column, not merely avoid horizontal overflow. These audits use fixture-controlled authentication, setup storage and run records; they do not start provider work or establish live integration results.

These presentation changes are checked with fixture-controlled desktop/mobile navigation, explicit starts, progress, answer and recovery scenarios. Such tests do not validate live provider results, actual charges, or production deployment.

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
