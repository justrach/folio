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
