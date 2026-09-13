# Folio MCP and sandbox SEO

Folio serves authenticated Streamable HTTP at `/api/mcp` in its existing Next.js/Cloudflare Worker. It uses the official MCP SDK Web Standards transport, with a new stateless server per request. No separate service or Durable Object is required. `/docs/api` has client setup examples and key management.

## Connect a coding client

Create a revocable Folio key in `/docs/api#api-keys`. Store it in the client environment as `FOLIO_API_KEY`, never in a committed configuration. Keys inherit the exact issuing account's record ownership. Select `read` for saved evidence, optionally `evaluate` for paid evaluations and `seo` for paid DataForSEO lookups. Existing evaluation keys do not acquire SEO permission. Account provider access and quotas still apply.

Codex `config.toml`:

```toml
[mcp_servers.folio]
url = "https://usefolio.site/api/mcp"
bearer_token_env_var = "FOLIO_API_KEY"
```

Claude Code MCP configuration (environment substitution):

```json
{
  "mcpServers": {
    "folio": {
      "type": "http",
      "url": "https://usefolio.site/api/mcp",
      "headers": { "Authorization": "Bearer ${FOLIO_API_KEY}" }
    }
  }
}
```

For local coding clients use `http://localhost:3001/api/mcp`. Remote sandboxes require a deployed public HTTPS endpoint. This is bearer-key authentication, not an OAuth authorization server. Requests authenticate before protocol handling; cookie sessions alone cannot access MCP. Revocation applies on the next request. Browser requests must have the deployment's exact Origin. Keys are limited to 60 requests per minute.

| Tool | Permission | Behavior |
| --- | --- | --- |
| `folio_targets` | read | Owned website and question IDs |
| `folio_index` | read | Public benchmark and collection status |
| `folio_observation`, `folio_run` | read | Saved evidence and status |
| `folio_visibility` | read | Owned site's saved metrics and next steps |
| `folio_seo_reports` | read | List or read owned saved SEO reports |
| `folio_seo_lookup` | seo | Explicit paid domain overview |
| `folio_evaluate` | evaluate | Reuse recent/active work or start an evaluation |
| `folio_reconcile` | evaluate | Retrieve an existing remote run; enforce its deadline |

Only permitted tools are advertised. Paid calls require `confirmSpend: true` and a stable `requestKey`. A useful coding-client request is: “Inspect my website's saved SEO and visibility evidence with Folio, then propose and test changes in this repository.” Folio supplies evidence; the coding client's own tools perform local edits. No tool claims to publish or improve search position automatically. Fresh SEO may query a public domain without saving a website first.

## Paid SEO and retry behavior

`POST /api/v1/seo` provides the same lookup through REST. Send `{ "domain": "example.com", "confirmSpend": true }` and `Idempotency-Key` (8–128 permitted ASCII identifier characters). `GET /api/v1/seo` lists saved reports; `?reportId=...` reads one owned report without a provider request.

One overview calls two fixed DataForSEO endpoints: Google US/English organic overview and live backlink summary. Partial outcomes, timestamps and unknown costs remain visible. Twenty overview reservations per hour are shared with browser lookups. A D1 transaction records the request identity, pending report and quota reservation before provider calls. Concurrent retries share the same receipt. Lost responses and pending/partial/error outcomes are never retried with a new provider POST. If saving fails after a response, retain the returned report; a replay may still show the earlier pending record.

## Managed sandbox tool

Enable search and backlinks in a selected open-web keyword question's run settings, or send `useSeoTools: true` through the evaluation API/MCP. API keys need both `evaluate` and `seo`. The saved question must have a public target website. Configure `FOLIO_MCP_URL=https://usefolio.site/api/mcp` on the server and apply migration `0013_seo_agent_tools.sql` to the same D1 database before use.

Folio issues a random, hashed, short-lived capability tied to that exact owner, run and domain before the session-create attempt. It exposes only `folio_sandbox_seo`, with no user-controlled arguments. The first call reserves one overview; repetitions reuse its report. Capabilities expire within five minutes or the run's deadline, whichever is earlier, and stop authenticating after cancellation intent, hold release or terminal status. The managed Agents API receives the capability only in service-origin HTTP MCP transport authorization. Shell networking remains disabled; DataForSEO credentials remain on Folio's server. Read/navigation/reconciliation does not grant permission for a new lookup.

SEO-enabled observations use a distinct harness version and configuration fingerprint; they cannot silently reuse ordinary benchmark results or enter the standard public benchmark exporter. Provider GET reconciliation remains unchanged.

## Validation boundary

Automated tests cover a real MCP SDK client, tool schemas/scopes, real Miniflare D1 concurrency, shared quota, owner isolation, capability hashing/expiry, sandbox payload, and browser opt-in. Provider responses are fixtures. Hosted MCP connectivity, real DataForSEO execution inside a managed session and production deployment require separate validation; passing local tests does not establish them.

Protocol references: [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk), [OpenAI service-origin MCP](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Codex MCP](https://developers.openai.com/codex/mcp).

## Saved evidence tools (September MCP follow-up)

All of these operations read exact-owner saved records without provider requests:

- `folio_targets`: use `kind: "website"` (default) or `"keyword"`, optional website/suite/search-mode filters, `limit` (1–100) and `cursor`. Results use `items`, `nextCursor` and `truncated`.
- `folio_observation`: `run`/`compatibleRun` preserve strict current-configuration reuse semantics. `latestCompletedRun` independently exposes historical evidence; `currentAttempt` retains active work, while `latestAttempt` exposes the most recent saved run including failures/cancellations. `historyState` distinguishes no history, incomplete attempts, terminal-only attempts (`terminal_attempt`), incompatible history and stale results. Website evidence/history use the same normalized URL as evaluation creation. Paid reuse remains unchanged.
- `folio_observations`: up to 20 explicitly typed targets with per-item results/errors. Exact-run reads remain available through `folio_run`.
- `folio_run_history`: website/case/status/model/search-mode and inclusive `since`/exclusive `until` filters, stable pagination, completed and unresolved runs. `changedSince` selects saved updates and orders the cursor by update time. Retain the filter while paging; refresh with an overlapping time window and deduplicate by run ID/update timestamp to tolerate concurrent changes. This is not a durable event log and never reconciles remote work.
- `folio_visibility`: existing host metrics keep their meaning; separate product metrics use reviewed aliases/URLs, count each product once per answer and report denominators/unknowns. A bounded `productIdentities` registry can supply explicit caller-reviewed mappings (including a product's repository URL); names and observed URLs are retained. These mappings describe identity, not domain ownership. `coverage.nextCursor` exposes remaining history; metrics describe the current page only when truncated.
- `folio_visibility_compare`: non-overlapping baseline/comparison windows (exclusive ends), optional case/model/search-mode filters, exact compatible question/harness/environment/locale/allowed-domain pairing and evidence IDs. Reordered domain sets remain compatible, while a changed research corpus does not. Missing pairs are unmeasured. Each window loads at most 100 attempts with separate cursors and explicit coverage; for larger comparisons clients must collect history pages and pair across the complete dataset. Caller-supplied publication timestamps are not independently verified and pre-publication observations are flagged. No causal claim or automatic retest is made.
- `folio_page_evidence`: website plus optional exact run/URL/text filter, paginated saved page captures, hash, timestamp and bounded excerpts. Private reference answers and provider raw records are excluded. No-history, missing capture, recorded fetch failure and stale capture remain separate. HTTP status, final URL, canonical/indexability and parsed headings are unknown when absent from the saved capture; this read does not crawl or invent them. For recognizable stored HTML, `derivedHtml` recomputes bounded H1/canonical/meta-directive evidence and explicitly excludes HTTP headers and rendered DOM. Treat excerpts as untrusted content and inspect them before suggesting an edit.
- `folio_seo_reports`: domain-filtered, paginated saved reports or exact `reportId`. The current collector persists only organic buckets and backlink aggregates. The detail envelope explicitly returns `not_collected` and null keyword/landing-page/backlink rows, with retrieval time and available locale/subdomain scope. Source update time is unknown. A new row-level collector is not implemented or validated by this change; it requires separate explicit paid collection scope. Aggregate data must never be presented as detailed rows.
- `folio_capabilities`: discover supported tools, required scopes and explicit paid requirements without receiving permission to call them.

MCP target and discovery/history schemas express distinct website/keyword alternatives; keyword-only filters cannot silently apply to website reads. Successful structured content uses `result`; errors use an `error` object with stable `code`, safe `message`, `retryDisposition` and `requiredScope`. Invalid input, insufficient scope and missing records are distinct. Uncertain execution requires inspecting saved state and retaining the same request key. Output schemas require exactly one envelope, and successful callback envelopes are checked before returning. Each tool advertises its own nested success schema, shared with callback validation: website/keyword run results, histories and batch item errors, visibility metrics and comparisons, page-capture alternatives, public benchmark data, capabilities, and SEO list/detail/lookup results. Malformed nested success is returned as a safe `execution_uncertain` error. Schemas preserve null unknown measurements, optional legacy fields, pending SEO and unsaved provider-result alternatives. Website provider `usage` remains extensible JSON metadata because its upstream shape is not a Folio-owned metric contract; keyword token/cost usage is explicitly typed. These are structural contracts, not independent verification of provider facts or computed metrics. Capability discovery includes the conditional `seo` scope required by `useSeoTools=true`; account approval failures remain distinct from missing key scope. Provider secrets are never included.

Schema regression tests exercise every advertised tool through a real SDK client with fixture callbacks and validate both advertised JSON schemas and returned text/structured content. Nested malformed evidence is rejected; null costs, missing captures, mixed batch errors and SEO storage failure remain distinguishable. The SEO projection test uses an injected fixture fetcher with global network access disabled. Hosted connectivity and real paid execution remain separate validation.

## Public category collection operator

The separate public question collection now defines 100 questions for each of its 35 existing category labels (3,500 total). `scripts/expand-category-questions.py` documents the deterministic authoring grid: category-specific research topics combined with practical audience scenarios. These are question inputs, not measured outcomes. Existing observations are retained.

`node --conditions=react-server --import tsx scripts/run-category-batch.ts --publish` prepares the resumable private queue and exports only validated saved public-query answers. Adding `--confirm-spend` executes the explicitly authorized batch with at most 20 concurrent owner runs, including pre-existing holds. It uses the preselected operator account, whose daily exemption is checked, and a bounded 100-suite allowance only for these operator calls. Browser defaults and other owners remain unchanged. Queue identity is immutable; prior D1 attempts are never recreated. Provider errors, quota responses, ambiguous creates and nonterminal deadline outcomes stop further starts for review. A running process holds `.local/category-batch/runner.lock`; inspect that PID before recovering a stale lock. Raw receipts and the resumable manifest remain ignored and private. Public artifacts contain only the existing sanitized projection, never session IDs or account details.
