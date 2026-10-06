# Question-first website evidence index

Folio's useful unit is **customer question → observed website result → supporting captured pages**, not a generic website-quality score. The coverage layer is now connected to the existing Folio Index at `/leaderboard` and the selected-question report at `/overview?query=<public-query-id>`. It enriches the same returned website rows; it does not create another index or change the agent's recommendation order. This is local application integration, not a deployment or live Jev validation.

## Existing index integration

Each recommendation has an **Evidence coverage** disclosure. A published record is matched by exact public question ID, observation ID, returned position and original recommendation URL. Selecting another question, model or answer cannot reuse another record's coverage. Missing records show **Not evaluated**, not a failed website or fabricated classification. Recommendations without a returned website URL cannot be matched to captures.

Completed records show separate relevance/answer judgments, the evaluator's requested/resolved model, capture/evaluation dates, page URLs, text hashes, truncation and capture-attempt counts. A bounded 600-character source preview is explicitly **not a model-selected supporting quote**. Suggested next evidence steps follow the classification; no missing fact is invented and no automated patch is applied. Confidence/distributions remain advisory, not measured accuracy, and coverage does not explain the search agent's reason for returning a website.

The checked-in `src/data/public-question-coverage.json` is a strict public allowlist, initially empty. `RecordedRanking` renders it in the existing index; `GET /api/public/benchmarks` also includes it for the public question dashboard. Private plans, provider usage, raw HTML/full captures, owner/session identifiers and error bodies never enter this projection. Reading either surface performs no capture or provider inference.

Prepare coverage for an **actual published index observation**, not the draft-question bank:

```sh
bun run index:questions plan --id <new-id> --observation <public-observation-id> --position <returned-position> --receipt <saved-website-receipt.json>
bun run index:questions run --id <prepared-id> --confirm-spend
bun run index:questions preview --id <completed-id>
bun run index:questions publish --id <completed-id> --confirm-publish --review-sha256 <exact-preview-hash>
```

The question and observation IDs are visible under **About this observation**. The plan freezes the existing question's exact wording, language and locale plus the original public observation. One or two positions/receipts are allowed; captured website roots must match the returned host (only `www` normalization, never arbitrary subdomains). The provider sees the question and bounded source text, not the observation's rankings, returned reasons or IDs.

`preview` reads a completed saved result and prints the exact public projection and its review hash. It makes no provider call and writes no public data. Review this payload before `publish`; the latter requires explicit confirmation and that exact hash, updates only the local artifact, and preserves other rows. It does not commit, push or deploy. Changed frozen question wording or observation provenance cannot publish against unchanged IDs. There is no anonymous paid endpoint or automatic public import.

For a public snapshot containing newer explicitly shared observations, pass `--rankings <saved-public-search-rankings.json>` to `plan`. Such a result can be classified/previewed privately, but local publication requires that exact query and observation in the checked-in search index first; it cannot silently publish a new agent observation. App-owner paid review/storage/cost-dashboard controls and live validation are not supplied by this operator workflow.

## Earlier draft question bank

`bun run index:questions list` exports 38 curated, editorial question hypotheses:

- 15 primary questions from `website-search-queries.json`, retaining their existing IDs, exact wording, language, locale and named/discovery distinction.
- 20 existing product-task questions from `expanded-search-queries.json`, retaining their IDs and wording.
- Three existing coding-harness starter questions, assigned new stable IDs: `coding-harness-terminal-v1`, `coding-harness-multi-provider-v1`, and `coding-harness-verification-v1`.

These cover developer tools, software/work, shopping, services/travel and learning. They are a bounded starting set, not measured query demand and not the entire larger prepared question library. Examples of the intents are choosing a coding harness, comparing application deployment costs/limits, checking authentication requirements, understanding clothing returns, comparing Japan tours, and choosing a beginner Python course. Use the exported exact questions, not these shortened descriptions, for observations. Changed wording needs new versioned IDs.

Named questions and unbranded discovery remain distinguishable. A page answering a named-product question does not establish unprompted discovery. Editorial expected-site lists, reference answers and tracked-company metadata do not enter the model request.

## What Jev is asked

The prototype uses TypeSafe's [Choice interface](https://docs.typesafe.ai/primitives/choice) and the [atomic-question approach](https://docs.typesafe.ai/introduction). Each page/question pair produces **two independent typed questions** against one shared frozen state:

1. **Relevance:** `relevant`, `irrelevant`, or `uncertain`.
2. **Answer coverage:** `direct`, `partial`, or `not_established`.

For comparisons/discovery, coverage concerns this website's candidate-specific contribution, not whether its page compares every alternative. A documented negative answer can be direct evidence. Topic words or navigation links alone do not establish an answer. Each judgment is scoped to one saved page; no browsing or synthesis from other pages is authorized.

Website/question rows conservatively use the strongest relevant page. Positive coverage paired with uncertain/irrelevant relevance produces `review_required`, not automatic acceptance. This is not a multi-page reasoning engine. Results retain the distributions, confidence, requested/resolved model, token usage, and exact page IDs, URLs, capture dates, truncation flags and text hashes. Sources are stored once in the request; this does not establish the provider's billing or latency.

**All classifications remain advisory.** Confidence is not measured accuracy, exact text hashes do not authenticate the source, and coverage does not prove factual correctness, product suitability, citation selection or agent recommendation frequency. Missing facts mean missing from these bounded excerpts, not absent from the entire website. No benchmark or HTML score is modified and no keep/change repair is applied. Explicitly published advisory coverage appears alongside a previously published search ranking; it never creates or reorders that ranking.

## Local workflow and boundaries

```sh
bun run index:questions --help
bun run index:questions list
bun run index:questions plan --id <new-id> --receipt <saved-website-receipt.json>
bun run index:questions report --id <existing-id>
```

`plan` reads only the receipt's validated `website` packet. It neither fetches the website nor calls a provider. It freezes the selected questions and request, writes private `plan.json` / `plan.md`, and refuses an existing ID. `report` reopens saved state without inference. The defaults are the three coding-harness questions; repeat `--question <bank-id>` to choose other existing questions and `--receipt <path>` to compare two distinct website origins.

Bounds: 1–2 websites, 1–5 distinct questions, at most six captured pages per website, a 100,000-byte UTF-8 request, a 100,000-byte response, a 30-second provider timeout, and 2-MB input files. Larger combinations can exceed the request bound and fail before inference. No automatic splitting/cascade occurs. Input and artifact paths stay within the working directory; symlink escapes are refused. Private artifacts use restrictive permissions under ignored `.local/question-coverage/`.

Only this explicit command can spend:

```sh
bun run index:questions run --id <prepared-id> --confirm-spend
```

It requires a nonempty server-side `TYPESAFE_API_KEY` from the process environment or existing `.dev.vars`. Configuration is never overwritten, credentials are not logged or copied into state, and the exact outgoing body is checked against the credential value before dispatch. A frozen-plan/hash mismatch prevents dispatch.

An exclusive immutable `reservation.json` is written before the single provider attempt. Any existing reservation blocks another call, including completed and unknown attempts. Completion and latency/model/usage go into separate `outcome.json`, with validated `result.json` / `report.md`. Timeout, invalid response or interrupted persistence leaves pending/needs-attention accounting; never delete it to retry. Dollar cost remains unknown. This operator CLI has no application-owner quota/auth or cost-dashboard integration. Index-linked results have the separate explicit local publication workflow above; the original draft plans remain private. No production deployment is implied.

## Observed validation — September 30, 2026

- **Implementation/fixtures:** 18 focused coverage, CLI and existing citation-transport tests passed. The project `bun run typecheck` passed. Fixtures cover source/hash integrity, strict distributions, relevance/coverage conflicts, unknown-cost failures, explicit-spend gates, immutable reservations, path confinement, successful saved-result reopening, resolved-model aliases and no automatic retries. Fixture success is not live Jev validation or accuracy calibration.
- **Existing-index integration/fixtures:** 48 focused public contract, index-plan/projection, CLI, dashboard and citation-transport tests passed. Four Playwright cases passed across desktop (1440×1000) and mobile (Pixel 5) at `http://127.0.0.1:3001`, covering exact question/model history and refresh, unmeasured rows, advisory classifications, gaps, source provenance, unchanged recommendation order, no horizontal overflow, and no private/provider requests. Browser fixtures are synthetic and screenshots stay outside Git. The local emulator still logged file-descriptor errors, and the loopback dev origin emitted a warning; the earlier localhost run had startup/hydration/HMR failures. The final rendered fixture checks do not validate live database bindings or providers.
- **Real frozen input:** a private Codegraff-site plan uses the six pages captured in the earlier website attempt, three coding questions, 18 page/question pairs and 36 typed judgments. Its request is 53,136 bytes. The original receipt/reservation were checked unchanged; no new capture, sandbox creation or TypeSafe reservation occurred. Every matrix cell is **not evaluated**, not a fabricated score.
- **Live dependency:** no local TypeSafe credential is configured, so no live Jev classification, provider latency, price or citation-readiness claim is established. Validate representative independently labeled examples before considering thresholds or automatic advice.
- **Separate sandbox dependency:** the additional paid website-sandbox pilot remains conditional on a confirmed deployed provider fix. Provider-reported timeout fixes are locally tested but not deployed; this prototype does not resume that pilot.
