# Two-stage private website research

Folio can turn a saved website into a reusable customer-query and competitor-research brief. This is separate from the editorial question bank, Jev question/page coverage, public Folio Index, technical scores, and consumer ChatGPT visibility.

## Customer workflow

1. **Save a website.** Saving/selecting a site does not audit it, generate queries, start a provider session, or publish evidence.
2. **Generate suggested queries.** The owner selects a supported OpenAI model and explicitly authorizes one paid discovery run. It opens the website's public pages and suggests up to five customer queries, each with an intent, product-fit explanation, and consulted sources. These are editorial hypotheses, not measured keyword volume or traffic.
3. **Review one suggestion.** A query picker opens one focused editor. The owner can edit the wording, switch suggestions without losing drafts, and refresh saved history without clearing drafts for the same discovery. The launch summary names the selected model and scopes the next paid action to that exact query. Discovery completion does not automatically research competitors.
4. **Research one reviewed query.** A second explicit paid action freezes the edited text and links it to the completed discovery run for the same owned website. The managed agent searches that exact question, returns up to three leading websites in its own recommendation order, and opens relevant competitor and target pages.
5. **Reopen or export the saved brief.** The panel offers a direct resume action for completed history and a direct reopen action for unresolved attempts. Selected competitor briefs/receipts appear above new research forms. The brief shows consulted sources, candidate strengths, target evidence, suggested changes, model/date, limitations, and recorded usage. Reading saved work spends no provider credits. Agents can reuse it instead of repeating the research.

"Leading" describes this model's recommendation order for this query and recorded evidence. It is not Google rank, market-wide coverage, a consumer ChatGPT measurement, or proof that a page feature caused a recommendation. Suggestions remain advisory. Missing target evidence is not evidence that a feature is absent sitewide.

## Two explicit paid starts

Both stages use the managed OpenAI Agents API at `/v1/agents/sessions`, `OpenAI-Beta: agents=v1`, with live `web_search` and `environment.type: "none"`. They do not silently select Codegraff, Responses, the Agents SDK, DataForSEO, or TypeSafe when those integrations are configured. Models are the existing explicit managed OpenAI choices; model access and live outcome validation remain separate dependencies.

The existing account allowlist and rolling benchmark allowance apply to both stages together: normally six starts per day and one active run, with only the existing explicit account exemptions/parallel approvals. The requested eight search/page-open calls and three-minute task deadline are instructions, not provider-enforced dollar caps. Missing charges stay unknown. This implementation authorizes provider usage; it does **not** implement checkout, subscription collection, credit purchases, or a promised customer price.

Each request key binds one immutable owned case and at most one provider attempt. Creation-attempt state is stored before the single create-with-input POST. Duplicate keys reopen the same attempt, including failed and uncertain creation, without another provider POST. Changed stage, query, discovery source, or model under the same key is refused. Do not discard an unknown attempt to replay it. An intentional fresh investigation uses a new explicit action and request key.

One private research suite is reused per website, with at most 50 saved research cases and the existing 20-suite account allowance. Cases and runs use existing JSON storage; no new database migration is required. Query discovery and competitor research have separate versioned rubric/harness identities. Public ranking/visibility/history metrics exclude these research records before their limits, and the public publication boundary rejects them.

## Private API and agents

`GET /api/sites/<website-id>/research` returns only the authenticated owner's saved research history and current access state. An optional `cursor` reopens older records. It makes no provider requests.

`POST /api/sites/<website-id>/research` requires the configured application origin, an authenticated owner, and one explicit authorization:

```json
{
  "stage": "query-discovery",
  "requestKey": "one-stable-request-key",
  "confirmSpend": true,
  "model": "gpt-6-luna"
}
```

The second start additionally carries the completed owned discovery run and reviewed query:

```json
{
  "stage": "competitor-research",
  "discoveryRunId": "saved-owned-discovery-run",
  "query": "The exact customer question the owner reviewed",
  "requestKey": "a-separate-stable-request-key",
  "confirmSpend": true,
  "model": "gpt-6-luna"
}
```

Provider input includes only the public website, exact current task/query, language and locale. It withholds earlier answers, independent reference facts, account identity, discovery-run IDs and local request keys. Run/case metadata remains available for provider receipt correlation. Website URLs must have public HTTPS syntax without credentials, custom ports, or query strings; provider web tools, not the host application, access those pages.

Saved browser reads use `GET /api/benchmarks/runs/<run-id>`. The explicit retrieve action uses the existing reconcile route; it retrieves the saved provider session rather than creating a new one or supplying tool results. Deadline cancellation retains the existing cancellation reservation and unknown-cost behavior.

Agents with an authenticated `read`-scoped Folio key can use the existing `folio_run` tool with `kind: "keyword"` and the saved run ID. Its result includes structured `websiteResearch`, source citations and limitations, but excludes raw provider collection and private references. There is no new anonymous research endpoint or unscoped agent access. Saved reads do not require provider credentials or the paid allowlist.

## Evidence and validation boundaries

The output contract binds the exact target and reviewed query, citations, recommendation names/order, and source hosts. Competitor and target comparisons must reference their respective source lists. An observed difference needs target evidence; otherwise it must be marked `target_not_established`. An inaccessible/uninspected candidate has no invented strengths. Completed research additionally requires recorded completed `web_search` page-open actions for its supporting URLs; search snippets or citation presence alone do not establish a visit.

This checks retained provenance, syntax and relationships—not literal quotation accuracy, source truth, semantic correctness, exhaustive site coverage, or the provider's actual billing. No independent page capture or Jev judgment is implied.

Local fixture and actual isolated D1 checks exercise separate authorizations, model selection, review lineage, edited-query freezing, duplicate/concurrent starts, unknown creation across restart, owner-scoped agent reopening, strict MCP output including cached-token usage, page-open requirements, public publication rejection and metric separation. Browser fixtures exercise the rendered workflow and mobile/navigation safety. These are not live provider validation or production deployment. Existing real private receipts and the earlier frozen Codegraff/Jev plan remain untouched.

### Local verification — September 30, 2026

- Project typecheck and `bun run cf:build`: passed.
- Focused schema/transport/store/service/MCP checks: passed, including a final 31-check run after the saved-output amendments.
- Existing D1 suite with file concurrency set to one: 37 passed. The parallel run hit local emulator socket errors (`EADDRNOTAVAIL`). These use actual isolated D1 with synthetic provider transport, not live OpenAI.
- `GUI_BASE_URL=http://127.0.0.1:3001 bun run test:gui tests/website-research-gui.spec.ts --project=desktop --project=mobile`: 16 passed against the project's built local Next.js server. API/provider behavior is fixture-controlled. The earlier dev-server run hit OpenNext emulator file-descriptor errors; the built-app run avoids that emulator and does not establish its health.
- PostgreSQL bridge unit checks passed; actual isolated PostgreSQL integration was not run because its required local server was unavailable. No production deployment, live paid provider research, or customer billing validation was performed.
