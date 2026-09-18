# Managed Agents API integration

Folio calls OpenAI's managed **Agents API** through `src/lib/agents.ts` and connects it to private, persisted website evaluations through `src/lib/agent-runs.ts`. It uses `/v1/agents/sessions` and `OpenAI-Beta: agents=v1`, rather than substituting the Agents SDK or Responses API. The API key is configured privately. Session/model access and one completed local live evaluation were verified on 13 September 2026, including offline reproduction of its exported checks. See [live validation](LIVE-VALIDATION.md) and the [official quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart).

## Server configuration and spending

Configure `OPENAI_API_KEY` in gitignored `.dev.vars` or `.env.local` for development, or as a Cloudflare Worker secret. Never use a `NEXT_PUBLIC_*` variable. Configure `OPENAI_ALLOWED_USER_IDS` with a comma-separated list of approved Better Auth user IDs. Email addresses, client flags, and arbitrary successful signups do not grant spending access. Ordinary website evaluations are pinned to `gpt-5.6-luna`; the legacy `OPENAI_AGENTS_MODEL` setting is ignored. Other supported models require an explicit open-web model selection.

`OPENAI_MAX_RUNS_PER_DAY` defaults to **1 managed run per approved user per rolling 24 hours**, with an application maximum of 20. The atomic D1 reservation precedes outbound work and counts failed or ambiguous attempts. An owner can have only one queued, running, or action-required evaluation at a time. This controls run count, not guaranteed dollar cost; configure provider project spending controls separately. No automatic retries submit billable tasks.

`SCAN_ALLOWED_HOSTS` is an exact reviewed hostname list, defaulting to `example.com` and `www.example.com`. Captures require HTTPS, forbid credentials/custom ports/IP literals, recheck every redirect, enforce a 190,000-byte response limit and a timeout, and never execute scripts. A fresh evaluation captures one HTML page. A replay reuses previous captures, independent expected facts, and the frozen suite after verifying their content hashes.

Status reports `disconnected` without a key and `configured` with one. Configuration does not prove provider access. Credentials, approved-user lists, prompts, and reasoning items are excluded from connection status and activity projections.

## Persisted execution flow

1. Authenticate and atomically reserve a private `evaluation_runs` row scoped to its owner.
2. Capture the website, store its exact UTF-8 text and SHA-256 identity, and freeze the suite version.
3. Persist the `session-create-attempt` event before contacting the session-creation endpoint. The `environment: {type: "none"}` contract requires initial input.
4. Make exactly one `POST /v1/agents/sessions` containing both the session configuration and initial input with captured evidence and frozen questions. Independent expected facts stay in Folio, withheld from the model.
5. Persist the returned session ID. Do not send a second initial `agent.session.input.message` event: the creation request already submitted the task, and OpenAI may have begun work before Folio receives or saves the ID.
6. OpenAI runs the task remotely when the user leaves. Folio retrieves saved state on reconciliation when the user returns. A local request handler does not keep running after it returns.
7. Retrieve the session, root turns, and saved items. Accept a **completed root turn** plus a saved `final_answer` item, validate the JSON schema, and apply Folio's deterministic verifier. Idle alone never establishes success. A completed turn whose final item is not yet visible remains recoverable.

The UI uses active-only read reconciliation, not an SSE stream. Reconciliation performs provider GET requests only: no creation, resubmission, application tool execution, or model continuation. Preparation checkpoints prevent another tab from racing creation; their 120-second lease allows recovery if the request dies. A stale reservation that never reached the creation-attempt marker becomes failed. If creation was attempted but no usable or persisted session ID is available, the run needs action and its task and cost are unknown: a lost response does not prove that no session or billable work exists. Preserve that uncertain state and inspect provider records before a deliberate new attempt; never automatically retry the creation POST. Retrying only a local database write is safe and does not submit another provider task. If a returned ID cannot be persisted, the response preserves it for operator recovery. A run with a saved session ID retrieves that session's actual state. See [run and continue sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [events and items](https://developers.openai.com/api/docs/guides/agents-api/sessions/events), and [manage sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions/manage).

## Application routes

Every evaluation route authenticates Better Auth sessions, scopes access to the owner, and returns `Cache-Control: private, no-store`.

| Route                                 | Behavior                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/evaluations`                | Private summaries, frozen suite, and non-secret connection/access status.                                                                                                |
| `POST /api/evaluations`               | `{mode: "managed" or "demo", domain?, brand?, rerunOf?}` creates a private run. Managed replay uses frozen evidence. Demo uses a labeled fixture without calling OpenAI. |
| `GET /api/evaluations/:id`            | Private detail, captures, observed activity, output, and verification.                                                                                                   |
| `POST /api/evaluations/:id/reconcile` | JSON `{}` refreshes the existing provider session, turns, and items without submitting work.                                                                             |
| `PATCH /api/evaluations/:id`          | `{action: "cancel"}` sends the documented `agent.session.input.cancel` event. A subsequently observed cancelled turn establishes terminal cancellation.                  |
| `GET /api/evaluations/:id/export`     | Private JSON bundle containing frozen source, output, independent facts, rubric, and verifier replay recipe.                                                             |

List/detail GET requests read stored state only. Provider retrieval is bounded to ten pages of 100 records per collection, with a 1 MB response cap and redirects disabled. Activity shows the latest 100 provider items and 1,500-character excerpts. Reasoning, user input, arbitrary tool arguments, and upstream error bodies are excluded. Full validated final output is stored separately. Usage shows observed token counts; unknown usage stays unknown and is not a calculated dollar charge.

## Tools, evidence, and output

Website-evidence runs use the managed harness to **review supplied website evidence**. It has no attached browser, sandbox, web search, MCP connections, or enabled subagent workflow. When an owner selects a saved SEO report at launch, the single `read_saved_seo_report` function is available. It extracts facts when present, returns source citations, explains supported findings, and labels missing evidence. It does not manufacture visibility observations from other providers.

DataForSEO lookups remain separately authenticated explicit paid actions. The managed function reads only the selected frozen saved report, with no arguments or new provider lookup. Its pending function action must match the saved session and sole active root turn. POST `/api/evaluations/:id/tools` requires owner approval, persists one tool reservation per run, returns the frozen content and hash, and never retries an ambiguous submission. Receiving a result may resume OpenAI inference. The [documented function mechanism](https://developers.openai.com/api/docs/guides/agents-api/tools/functions) uses `required_actions` and `agent.session.input.tool_result`; naming a tool in a UI does not execute it. Unexpected required actions currently stop at an explicit action-required state.

The final JSON contains `summary`, `facts`, `citations`, `findings`, `missingEvidence`, and `publicationReady: false`. Folio validates allowed fields before display or scoring. Its independent verifier checks capture integrity, exact quote membership, fact coverage, available owner-confirmed truth, and deterministic readability. Quote membership verifies occurrence, not truth or entailment. Without independent truth, correctness stays **unmeasured**. Verification percentage is not website rank, search position, or AI recommendation rate.

Website reports and private keyword runs remain private. The public search table reads a separately reviewed, sanitized artifact of completed open-web observations, not a browser run export or a technical-publication flag. Its positions are original recommendation order for an exact query, with timestamps and scope; sample views retain their illustrative labels. Broad product-quality comparisons still require comparable tasks, a defined cohort, repeated samples and uncertainty. See [evaluation strategy](../EVALUATION-STRATEGY.md).

## Keyword search and external agents

Keyword observations have a separate service and hosted environment. New `open-web` cases default to `gpt-5.6-luna` (other models require explicit selection) with OpenAI live `web_search` and no domain filter. The hosted sandbox has outbound network disabled and serves local JSON validation. Legacy `reviewed-domains` cases retain their restricted live-search/network corpus and saved model/harness identity; omitted mode is legacy. Neither uses another inference provider or measures a consumer chat website.

Completion requires a completed root turn, bounded final-answer JSON, a completed search item and the recorded sandbox-validation marker. Root search items and validation evidence remain in the private record. Returned citations are not independently verified source captures. Recommendation positions describe one answer; exact target-host matching and target citation presence remain separate. Mode/configuration changes suppress direct baseline/fresh changes. See [keyword operations and limits](KEYWORD-BENCHMARKS.md).

The public `/docs/api` reference includes owner-only Folio key management. `/api/v1` accepts these scoped, expiring bearer keys; it never exposes or accepts the underlying OpenAI credential as a Folio login. GET reads saved state. An evaluate-enabled `POST /observations/ensure` with an idempotency key may reserve one new task when no fresh matching completion or matching active task is available. The default age window is 24 hours. Reconcile/cancel operate on existing owned runs and never approve pending tool answers. See [Agent API](AGENT-API.md) for response projections and recovery.

`OPENAI_UNMETERED_USER_IDS` can exempt exact, already-approved owners from daily start caps. Nullable remaining-run fields mean no daily cap, not free provider usage. Active reservations, explicit starts, key request limits and keyword deadline handling remain enforced.

## Verification

`tests/agents.test.ts` uses native-fetch fixtures for the actual API paths, reservation and attempt-marker persistence before a single create-with-input request, spending gates, ambiguous-creation handling without retry, pagination, completed-turn validation, delayed final-item recovery, cancellation, frozen replay, ownership, and bounded activity. `tests/agents-transport.test.ts` covers redirect/body/identifier handling. Evaluator and D1 tests cover independent verification, tampering, concurrent capacity reservation, owner isolation, and optimistic updates. These tests never call a paid provider.

## Rare UI provenance

The counter and notification bell use Rare UI source vendored at revision `d146c35264c5905b995903d2d96cd6d188af114a`. The MIT license and attribution are in `LICENSES/rare-ui.txt`. Source: [Rare UI](https://github.com/swamimalode07/rare-ui).

Optional scheduled retrieval uses the same GET-only reconciler with a shared-secret endpoint, a D1 lease, and bounded batches. It never approves function results. See [background jobs](BACKGROUND-JOBS.md). Reference answers, comparisons, local evidence deletion, and the offline verifier are described in [evaluation strategy](../EVALUATION-STRATEGY.md).

## Authenticated MCP and sandbox SEO

Folio now includes `/api/mcp` for coding clients and `/api/v1/seo` for explicit, idempotent DataForSEO lookups. Keyword sandboxes can opt into up to three keyword-research tasks plus one selected-domain SEO overview with a short-lived capability; existing evaluation keys require a separate `seo` permission. See [MCP setup and behavior](MCP.md) for migration, configuration, client examples and validation limits.

The optional [Luna website crawl](WEBSITE-CRAWL.md) uses a hosted session with network-disabled shell and service-connected read-only fetch / Jev-review tools. Its report is separate from frozen-page verification.
