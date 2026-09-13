# Website homepage evaluations

This batch applies Folio's own **`readiness-v1` HTML-page rubric** to the reviewed homepages in `src/data/developer-tools.json`. Folio captures each page, runs its evaluator, and records the resulting checks with their capture date. The directory links to official product or company references and displays these Folio observations. Audience metadata groups the examples; it does not change scoring. The retained script and schema names also support the original developer-tool batches. This evaluation does not test an API, judge product correctness, or measure how well an agent can use a product.

## Run locally

```sh
node --conditions=react-server --import tsx scripts/evaluate-developer-tools.ts
```

The batch captures every catalog homepage with at most three concurrent jobs. Each capture has an eight-second total timeout, a 5,000,000-byte limit, and at most three redirects. Redirects may use only that homepage's exact reviewed hostname or its `www` spelling. It fetches no docs, linked pages, optional files, scripts, API transactions, or model providers. The entire response must fit the limit; a truncated prefix is never scored. Failed captures remain unavailable with a null score. Known access-interstitial document titles, including `Client Challenge` and Cloudflare's `Just a moment...`, are also unavailable even when the server returns HTTP 200. A captcha widget inside an otherwise normal homepage does not alone disqualify it. Unknown interstitials remain a capture-review limitation.

The capture process sends no account cookies or credentials. It never reads `.dev.vars`, a private database, or provider configuration. The public scanner's restrictions are unchanged.

Each captured HTML string is passed as data into a real Miniflare/workerd sandbox that runs the bundled `evaluateHtml` function, with an eight-second evaluation deadline and the same 5,000,000-byte UTF-8 text ceiling. The sandbox has no database, secrets, or external network access. Page JavaScript is never executed. This is deterministic evaluation of captured HTML, not a browser-rendered audit. The explicit Node command avoids Bun's automatic `.env` loading; a Bun package task should wrap this same Node command.

To include Folio's local landing page in private validation, add `--include-local-folio`. This is a separate fixed request to `http://localhost:3001/`; it accepts no custom target and follows no redirects. Its result is labelled `local-preview` and remains in ignored private storage. It is excluded from the public artifact and customer directory. The rubric sees the actual HTTP URL, so the HTTPS check receives no points. That describes local development, not production hosting.

## Private captures and an explicit public summary

Full HTML, the relevant `X-Robots-Tag` header, detailed evaluator output, hashes, and a batch manifest are saved under ignored `.local/developer-tool-evaluations/<batchId>/` with private file permissions. Hashes identify decoded UTF-8 captured text, not network bytes or independently authenticated source content. The manifest records an evaluator-source hash so later code changes cannot silently count as a faithful replay.

By default, the run writes no source data file. To update the local website's populated index explicitly:

```sh
node --conditions=react-server --import tsx scripts/evaluate-developer-tools.ts --include-local-folio --write-public-summary
```

Only this flag writes `src/data/developer-tool-evaluations.json`. The summary includes public-homepage capture dates, final URLs, checks and scores, unavailable outcomes, and provenance. Local-preview outcomes stay private, even when collected in the same batch. The export also excludes full HTML, extracted evidence snippets, repair drafts, cookies, and response bodies. Writing this local file does not deploy the website.

## Reproduce a saved batch offline

```sh
node --conditions=react-server --import tsx scripts/evaluate-developer-tools.ts --verify-offline <batchId>
```

This verifies stored hashes and recomputes the saved checks with the same evaluator source in workerd. It makes no page or provider requests. A changed evaluator source, modified capture, or edited score fails verification. Unavailable outcomes are retained and checked for invented measurements; an unavailable result is not zero readiness.

The rubric uses ten bounded checks for metadata, headings, indexing directives, HTTPS, readable text, image alternatives, internal links, and JSON-LD. Its score is not Google rank, AI citations, API reliability, factual truth, or accessibility conformance. Anti-bot pages, server-rendering differences, intentional `noindex`, and parser limits can affect an observation. Ties and before/after differences do not establish product superiority or causal improvement.

To capture only Folio after a local change, use `--only-local-folio`. It creates a new private batch without contacting the public catalog sites. Combining it with `--write-public-summary` leaves the public artifact unchanged because there are no public-homepage outcomes to export. Full and local-only batch manifests remain available for separate offline verification.

## Validation

`tests/developer-tools-evaluation.test.ts` uses fixture pages and a real isolated workerd runtime. It covers exact-host redirect restrictions, local-target isolation, complete capture at the 5 MB boundary, declared and streamed byte overflows, stream cancellation, three-job concurrency, unavailable outcomes, HTTP 200 access-interstitial rejection, script nonexecution, local HTTP scoring, and offline tamper detection. Public-export checks retain homepage observations unchanged, exclude local previews, preserve private manifests, and prevent local-only batches from replacing the public baseline. A capture containing more than 3 MB before its metadata is evaluated and reproduced in workerd to exercise the former sandbox ceiling. These fixture checks do not establish that a live batch succeeded.

The first actual batch, `2026-09-13T04-08-12-116Z-4d385c44`, captured 24 reviewed public homepages on 13 September 2026. Sixteen produced measured reports; seven exceeded the capture size limit and one redirected outside the reviewed host. The separately attempted Folio local preview was unavailable because the local server could not be reached. All 25 saved outcomes reproduced offline.

The subsequent batch `2026-09-13T04-37-24-567Z-a1e9f02e`, captured on 13 September 2026 at 04:37 UTC, fetched all 24 official homepages again and ran the same evaluator: 16 measured, seven unavailable because of the capture size limit, and one unavailable because it redirected outside its reviewed hostname. The separately labelled local Folio preview measured 85/100. All 25 outcomes reproduced offline against the recorded evaluator source. Full captures remain in ignored local storage; the checked-in summary contains Folio's own dates, hashes, checks, and results. This batch made no model calls or API transactions and does not establish agent-task completion.

The five original focused fixture tests and TypeScript passed after that implementation. Its observed failures were retained.

### Complete-capture correction

Follow-up diagnosis on 13 September 2026 found all seven size failures were reachable, complete HTML responses above the initial 750,000-byte cap. The observed bodies were Stripe 754,312 bytes, Qdrant 782,479 bytes, Better Auth 904,831 bytes, Clerk 1,192,607 bytes, Firecrawl 1,206,020 bytes, PostHog 1,585,410 bytes, and Daytona 1,807,067 bytes. These are observed payload sizes from that diagnostic capture, not fixed product properties.

The reviewed batch limit is now 5 MB to accommodate complete modern pages and embedded assets while preserving bounded memory, concurrency, and time. The sandbox's former independent 3 MB ceiling now follows the same limit. The public scan endpoint retains its original 750,000-byte default; neither its host configuration nor its security checks changed.

The eighth failure was an actual HTTP 301 from `workers.cloudflare.com` to [Cloudflare's official Workers product page](https://www.cloudflare.com/products/workers/). The reviewed catalog now targets that canonical product URL directly. Arbitrary cross-host redirects remain rejected before the destination is contacted. This is a correction to the catalog target, not a relaxed redirect rule.

### Current expanded batch

Batch `2026-09-13T04-44-48-052Z-429a6072` captured the current directory on 13 September 2026 at 04:44 UTC. All **36 public homepages** produced actual `readiness-v1` reports: the original 24 developer tools, three software/work sites, three shops/brands, three services/travel sites, and three learning sites. This includes all eight previously unavailable original entries. The independently labelled local Folio preview measured 85/100. All **37 outcomes reproduced offline** from their frozen captures, headers, and unchanged evaluator source. No model calls or API transactions were made. The public artifact now contains only the 36 public-homepage observations; the local preview and complete 37-outcome manifest remain private internal validation evidence.

The largest accepted HTML body in this batch was edX at 2,527,043 bytes. Captured document titles and content-availability findings were reviewed for obvious access interstitials. Duolingo returned its legitimate 11,291-byte application shell with no static body words; its 58/100 describes the fetched HTML, not the browser-rendered experience or the quality of its learning product.

During expansion, a provisional Khan Academy capture returned HTTP 200 with the title `Client Challenge` and an instruction to enable JavaScript. That response was identified as an access interstitial rather than a homepage and its provisional score was rejected. The harness now rejects those known challenge titles before evaluation. The reviewed learning examples use edX instead; the provisional batch remains private for diagnosis and is not the current directory. Catalog selection is an editorial convenience sample, not a representative or exhaustive comparison; capture availability influenced the sample.

All seven focused fixture tests passed after the capture and challenge corrections. No known challenge document is included in the accepted batch; the title-based detector does not guarantee detection of every possible future interstitial. Full response HTML remains in ignored private storage, and the public summary includes only the recorded measurements and bounded provenance.

Optional repository commands can expose this Node command through `bun run` for capture and offline verification. Keep the `--write-public-summary` flag explicit so a routine validation command cannot replace published observations.
