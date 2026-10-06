# Keyword research observations

This separate suite records one OpenAI managed Agents API answer per keyword, with a saved baseline and a later fresh answer. Baselines are observations, not answer keys. The fresh request excludes prior answers and private reference facts. This measures restricted public-documentation research; it does not measure consumer ChatGPT visibility or vendor API correctness.

The initial authorized scope is six English queries covering authentication, hosting, vector search, crawling, observability, and SEO/evidence workflows. Each query gets one managed Agents session with `environment.type: "none"`. Domain filtering defines the available corpus and must be shown beside comparisons. No vendor credentials, sign-ins, transactions, package installation, or other model providers are supplied.

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
    "type": "none"
  },
  "input": "One bounded public-documentation research question",
  "stream": false
}
```

The actual request also sets instructions, a JSON-schema final answer, and recovery metadata. `environment.type: "none"` requires initial input and provides no hosted Linux workspace. Search filtering is configured on `web_search`, not a sandbox network. Folio validates the final JSON independently. An optional Condensation Fleet client exists for own-fleet boxes; Folio does not create a box for each start. [Create-session schema](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/methods/create)

## Reservations, costs, and recovery

Save the private D1 reservation and create-attempt timestamp before exactly one create-with-input POST. Save returned session/environment/request IDs immediately. Missing or malformed responses can hide a running, billable task; preserve the reservation and never retry creation automatically.

The checked create schema has no provider-enforced dollar, token, or tool-count cap. Six starts, disabled subagents, an eight-tool task target, low reasoning, and an application deadline reduce scope but do not guarantee spending. A three-minute deadline should request cancellation once and continue retrieving its outcome. Disconnecting or timing out a request does not stop work. Model and search charges are separate; token usage is best effort, and unknown cost stays null. [Create-session schema](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/methods/create), [Pricing overview](https://developers.openai.com/api/docs/guides/agents-api/overview)

Reconciliation only GETs saved sessions, turns, and items. A completed root turn and its completed assistant `final_answer` are required; idle alone is insufficient. This harness additionally requires a completed web-search item and Folio JSON validation. Hosted-shell `command_execution` items fail new runs. It validates bounded output and approved HTTPS citation hosts, while source truth and claim support remain unmeasured. [Sessions and outcomes](https://developers.openai.com/api/docs/guides/agents-api/sessions), [Recorded item types](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/subresources/items/methods/list)

Save answer, mentions, citations, limitations, evidence checks, model/harness/environment fingerprint, timestamps, and reported usage privately in D1. Do not store provider reasoning or keys. Compare answers only under matching conditions; changed recommendations are observations, not causal improvement scores. Session cleanup is separate from local retention: save required evidence before deleting remote sessions, and handle a bounded `409` retry during cleanup.

## Validation status

Provider schema and guides were checked on 13 September 2026. Fixture tests cover request isolation, single submission, ambiguous responses, terminal outcomes, Folio JSON/search evidence, citation bounds, and GET-only reconciliation. These tests do not establish live provider access or completed keyword trials. The separate homepage `readiness-v1` workerd batch remains a different measurement.
