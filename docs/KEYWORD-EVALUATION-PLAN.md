# Keyword research observations

This separate suite records one OpenAI managed Agents API answer per keyword, with a saved baseline and a later fresh answer. Baselines are observations, not answer keys. The fresh request excludes prior answers and private reference facts. This measures restricted public-documentation research; it does not measure consumer ChatGPT visibility or vendor API correctness.

The initial authorized scope is six English queries covering authentication, hosting, vector search, crawling, observability, and SEO/evidence workflows. Each query gets one fresh hosted sandbox. Domain filtering defines the available corpus and must be shown beside comparisons. No vendor credentials, sign-ins, transactions, MCP connections, package installation, or other model providers are supplied.

## Supported provider contract

Use `POST https://api.openai.com/v1/agents/sessions` with `OpenAI-Beta: agents=v1`, initial `input`, and the configured `gpt-6-astra` model. The application key remains outside the sandbox; its required permissions are `api.agents.read`, `api.agents.write`, and `api.responses.write`. This uses the same managed service as Folio's existing evaluator, with a separate research harness. [Official quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)

```json
{
  "agent": {
    "model": "gpt-6-astra",
    "reasoning": { "effort": "low" },
    "multi_agent": { "enabled": false },
    "tools": [{ "type": "web_search", "mode": "live", "context_size": "low", "allowed_domains": ["clerk.com", "auth0.com"] }]
  },
  "environment": {
    "type": "openai_hosted",
    "network": { "access": "restricted", "allowed_domains": ["clerk.com", "auth0.com"] }
  },
  "input": "One bounded public-documentation research question",
  "stream": false
}
```

The actual request also sets instructions, a JSON-schema final answer, and recovery metadata. Hosted environments provide Linux, Python, Node, and command-line tools at `/workspace`. Restricted networking accepts 1–100 exact hosts; redirected hosts and subdomains need separate entries. Search filtering is configured separately from sandbox networking. No additional computer tool is assumed. [Hosted sandbox configuration](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted), [Create-session schema](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/methods/create)

## Reservations, costs, and recovery

Save the private D1 reservation and create-attempt timestamp before exactly one create-with-input POST. Save returned session/environment/request IDs immediately. Missing or malformed responses can hide a running, billable task; preserve the reservation and never retry creation automatically.

The checked create schema has no provider-enforced dollar, token, or tool-count cap. Six starts, disabled subagents, an eight-tool task target, low reasoning, and an application deadline reduce scope but do not guarantee spending. A three-minute deadline should request cancellation once and continue retrieving its outcome. Disconnecting or timing out a request does not stop work. Model, search, and hosted sandbox charges are separate; token usage is best effort, and unknown cost stays null. [Create-session schema](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/methods/create), [Pricing overview](https://developers.openai.com/api/docs/guides/agents-api/overview)

Reconciliation only GETs saved sessions, turns, and items. A completed root turn and its completed assistant `final_answer` are required; idle alone is insufficient. This harness additionally requires a completed web-search item and a successful sandbox command printing the requested JSON-validation marker. It validates bounded output and approved HTTPS citation hosts, while source truth and claim support remain unmeasured. [Sessions and outcomes](https://developers.openai.com/api/docs/guides/agents-api/sessions), [Recorded item types](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/subresources/items/methods/list)

Save answer, mentions, citations, limitations, evidence checks, model/harness/network fingerprint, timestamps, and reported usage privately in D1. Do not store provider reasoning or keys. Compare answers only under matching conditions; changed recommendations are observations, not causal improvement scores. Session cleanup is separate from local retention: save required evidence before deleting remote sessions, and handle a bounded `409` retry during cleanup. [Sandbox lifecycle](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted)

## Validation status

Provider schema and guides were checked on 13 September 2026. Fixture tests cover request isolation, single submission, ambiguous responses, terminal outcomes, sandbox/search evidence, citation bounds, and GET-only reconciliation. These tests do not establish live provider access or completed keyword trials. The separate homepage `readiness-v1` workerd batch remains a different measurement.
