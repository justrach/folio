# Luna website crawl and Jev review

The optional website crawl is a separate workflow from open-web recommendation questions and single-page technical checks. It runs through the managed Agents API, not the Agents SDK or Responses API.

## Customer flow

On `/evaluations?view=page`, enter a website, select **Crawl up to 10 pages with Luna, then review with Jev**, and start. This explicit action authorizes one Luna session and one Jev review of the captured pages. Access remains limited to the configured OpenAI and TypeSafe account allowlists. Reading saved reports, navigation and refresh never initiate inference.

Luna receives the target URL and two service-connected MCP tools. It chooses useful pages through `crawl_read_page`, then calls `crawl_review_pages`. Code parses the returned JSON; Jev supplies semantic coverage judgments, not text parsing or factual certification.

The report displays saved page excerpts and whether each explicitly covers product purpose, intended audience and pricing. These judgments are advisory. Missing information in an excerpt does not establish absence across the website. No readiness score, recommendation rank or conversion measurement is produced.

## Collection boundaries

- Luna (`gpt-5.6-luna`) is pinned for crawling. Ordinary page evaluations are also pinned to Luna; legacy `OPENAI_AGENTS_MODEL` values are ignored. Open-web questions default to Luna and may use another supported model only by explicit selection. No automatic Astra upgrade occurs.
- The hosted environment has shell network access disabled and no web-search tool. The agent controls traversal through the fetch tool; the tool performs HTTPS GETs with public-address protection, no browser cookies, no page-script execution, and no form submissions.
- Exact HTTPS origin only, including redirect validation. Initial page plus links actually extracted from fetched pages; ten distinct URL attempts total. Failed attempts count. Repeated URLs retrieve saved state and never fetch again.
- Each response is bounded to 150 KB and ten seconds. Text excerpts retain at most 6,000 characters per page. Links are capped at 80 and 12,000 aggregate URL characters per page. HTML extraction is not a rendered browser or a complete HTML accessibility parser.
- The capability expires after ten minutes and is scoped to the owned run. Cancellation, terminal status and deletion revoke tool admission. This expiry stops new tool calls; it does not prove the remote model stopped. Owners must cancel and reconcile unfinished sessions.
- Jev receives the stored excerpts, not agent-authored copies. Its one D1 reservation closes collection, waits for pending fetches, and prevents duplicate inference. A failed/unknown review remains recorded and is never retried automatically.

## Storage and accounting

Migration `0020` adds hashed crawl grants, page reservations, and the single Jev review. Runs reuse evaluation quotas, one-create-attempt semantics and the existing owner/revision guards. Final JSON must list exactly the successfully saved page IDs; a completed Jev review is required for successful workflow completion. Partial pages remain inspectable after failure.

Luna usage remains in the evaluation cost ledger. Jev usage appears as `crawl-semantic-review`, with unknown USD until a supported rate is configured. Unknown usage is not zero. Deletion erases page excerpts and Jev results while retaining quota/usage accounting; remote provider records and prior downloads are unchanged.

`FOLIO_MCP_URL` must be the public HTTPS `/api/mcp` address; crawl derives `/api/crawl-mcp`. Credentials stay in Worker secrets. The agent sees only a temporary scoped bearer capability. Server MCP discovery performs no page fetch or Jev call.

## Validation

Unit and actual Miniflare D1 fixtures cover URL scope, output bounds, exact ownership, atomic ten-page admission, duplicate requests, one Jev review, final IDs, cancellation, deletion races and cost retention. Browser fixtures exercise explicit launch, keyboard selection, mobile layout and saved reopening without paid calls. Live Luna → crawl MCP → Jev execution has not yet been validated; fixture success does not establish provider compatibility or website coverage.

Local validation on 18 September 2026: 286 unit tests, 35 actual Miniflare D1 cases, 14 desktop/mobile GUI checks, and TypeScript passed. A parallel read-only code review identified and prompted fixes for capture/deletion races, aggregate link bounds, and legacy model overrides. No paid provider run was launched for these checks.
