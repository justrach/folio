# Folio's Codegraff agent

Keyword observations run on Folio's own agent, not OpenAI's managed Agents API. The agent is
[Graff](https://github.com/justrach/codegraff), driven by `@codegraff/sdk`, running in a Codegraff
**standard** (non-fleet) sandbox. Its only discovery tool is the gateway's
[`POST /v1/search`](https://codegraff.com/docs/search).

Code: `src/lib/codegraff-agent.ts` (generic sandbox agent), `src/lib/codegraff-keyword-agent.ts`
(keyword contract), provider choice in `keywordProvider()` in `src/lib/keyword-benchmark-service.ts`.

## Provider choice

| Run | Provider |
| --- | --- |
| Open-web or reviewed-domains keyword run, model `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol` or `gpt-6.1-sol` | Codegraff, when `CODEGRAFF_API_KEY` is set |
| Run with Folio SEO or TypeSafe MCP tools, model `gpt-6.1-terra`, or `KEYWORD_AGENT_PROVIDER=openai` | OpenAI managed Agents (needs `OPENAI_API_KEY`) |
| Website evaluations (`src/lib/agents.ts`) | OpenAI, unchanged |

Owner approval (`OPENAI_ALLOWED_USER_IDS`), the daily and active-run limits and the 180-second
deadline apply to both providers. Runs record `environmentType: "codegraff_sandbox"` and harness
`keyword-open-web-codegraff-v1` / `keyword-research-codegraff-v1`, so they are never compared with
OpenAI runs as if they were the same method.

## Lifecycle

1. **Start** (after the durable create-attempt reservation): one `POST /v1/sandboxes` with
   `provider: "daytona"`. The Worker uploads a task file, a fixed runner script and the key, then
   launches the runner detached. Any failure after creation destroys the VM before returning.
   A lost create response is ambiguous: the run needs attention and is never retried.
2. **In the VM**: the runner installs `@codegraff/sdk@0.5.1`, deletes the key file, serves
   `/v1/search` to Graff as a loopback MCP tool (key kept in process memory, at most 5 searches,
   each recorded with its query, result URLs and cost), and runs Graff with `--no-local-tools`
   (no shell or file tools; `webfetch` remains). If the answer cites URLs the run never retrieved,
   Graff gets one repair turn. Progress goes to a bounded `state.json`.
3. **Reconcile** (owner refresh, read-only): downloads `state.json`. A completed answer must pass
   `parseKeywordBenchmarkAnswer`, include at least one completed search, and cite only URLs returned by
   a search or fetched in that run. Searches become `web_search_call` items in the collection evidence;
   the validation item is `folio_host_validation` (Folio's server checked it, not a sandbox command).
   Once the terminal state is saved, the sandbox is destroyed.
4. **Cancel / deadline**: destroying the VM stops the agent and its billing. A later reconcile that
   finds the sandbox gone records `cancelled` (after a cancel) or `failed` (otherwise).

Usage records model tokens and cost plus search cost. Sandbox seconds (a fraction of a cent per run)
are billed by Codegraff separately and are not included.

## Key handling

Standard sandboxes cannot receive the fleet-only scoped inference credential, so the server key is
copied into each VM for its lifetime (about two minutes). Graff has no shell or file tools and
never sees the key in its prompt or config, but anything in the VM could read it while it runs.
**Use a dedicated, budget-capped Codegraff key in production.**

## Live validation

On 11 November 2026, local runs against the real gateway (no database) completed in about 70 s
for roughly $0.03 each (model about $0.003–0.006, five searches at $0.005), with answers that pass
Folio's keyword contract. No production run has been recorded yet.
