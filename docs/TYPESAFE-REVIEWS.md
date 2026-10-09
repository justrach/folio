# Advisory semantic citation reviews

Semantic judgments now use OpenAI's **Decisions API** (`POST /v1/decisions`, public beta, `gpt-6-luna` only). It replaced TypeSafe/Jev on 9 October 2026 for every use below: evaluation citation reviews, the in-run claim-check tool, Luna crawl reviews and the question-coverage CLI. Module, route and table names that still contain `typesafe` are historical identifiers, not the provider.

Completed live **page-evidence evaluations** have an explicit **Run paid semantic review** action. It sends the saved single-page capture and cited product-name/pricing claims to the Decisions API. Independent owner reference answers, account identifiers, saved SEO reports and provider session IDs are excluded. Exact source hashes and quote occurrence must pass first. Question-search results are not eligible: source links alone are insufficient to validate a claim against a captured page.

Each claim is one Decisions `choice` question (supports / contradicts / insufficient) over the frozen source text. The answer's choice, per-option probabilities and confidence are converted into the existing strict result; refusals, duplicate or missing answers fail closed. Folio displays these privately as advisory judgments. They do not alter verification scores, publish evidence, or establish factual truth. Confidence is not measured accuracy. Calibrate against representative labeled examples before automatic acceptance.

The separate local [question-to-page coverage CLI](QUESTION-COVERAGE.md) uses the same transport for relevance and answer-coverage judgments. It is not this authenticated citation-review action, does not use its application quotas or cost dashboard, and does not change benchmark scores or public rankings.

## Configuration

Apply migration `0018_typesafe_reviews.sql`. The server-only `OPENAI_API_KEY` is the provider credential. `DECISIONS_ALLOWED_USER_IDS` is a comma-separated explicit account allowlist for these semantic-review spends; it is deliberately separate from `OPENAI_ALLOWED_USER_IDS`, so approval for managed agent runs does not silently authorize review spending. Neither is public client configuration. `TYPESAFE_API_KEY` and `TYPESAFE_ALLOWED_USER_IDS` are no longer read.

## Spending and storage

GET `/api/evaluations/:id/semantic-review` only reads owned saved state and availability. An authenticated same-origin JSON POST with `confirmPaidReview: true` and the current `revision` explicitly authorizes the review. The server reserves one attempt per evaluation before calling the provider, limits each owner to five reservations per rolling day, and blocks simultaneous pending reviews. Duplicate submissions return the saved reservation, never another inference call. Demo runs cannot spend.

Decisions pricing is input tokens only. A 60-second request timeout or invalid response preserves a needs-attention reservation and unknown usage/cost. No automatic retries occur, and provider error bodies are never echoed. A Worker interruption can leave a pending reservation; operator investigation is required before changing that state. Do not delete reservations to reset quotas or retry ambiguous inference.

D1 stores resolved model, usage, latency and advisory results. `/api/costs` includes these under **Semantic reviews**. Dollar cost remains unknown because no verified invoice is recorded. Evidence deletion clears the private judgments, including when deletion races an in-flight response; quota and usage remain. Remote provider retention is not controlled by this deletion. Review results are separate from the original evaluation export.

## Claim checks inside the agent run

New open-web question runs can opt into **Let this agent check claims with the OpenAI Decisions API before answering**. The launch authorizes up to three additional paid checks. This supports Luna 6, Sol 6 and Astra 6 through their existing managed Agents API harness. `useTypesafeTools: true` on the authenticated benchmark launch API enables it; existing sessions and simple navigation do not gain tool authority.

Folio configures the service-connected MCP tool `typesafe_check_claim` at `/api/typesafe-mcp` (historical names). Its only credential is a random, hashed, run-specific grant with expiry no later than the saved run deadline. The provider key stays in the Worker. The tool is unavailable after cancellation, hold release, archival or a terminal run. Three calls per grant and fifteen calls per owner per rolling day are reserved atomically in D1 before inference. The same request key reuses a saved outcome; changed input with that key is rejected. Unknown/failed requests are never automatically retried. MCP discovery and GET do not call the provider.

The agent supplies a claim, literal quote and source excerpt (bounded to 400 / 400 / 2,200 characters within the endpoint's 4-KiB JSON limit). Exact quote occurrence is checked in code. The Decisions API judges support using only that excerpt; it does not retrieve or authenticate the source. Excerpt provenance is explicitly **agent-supplied**, and its judgment cannot certify a source or override benchmark checks. Tool availability does not prove the agent actually called it; inspect recorded provider tool activity and D1 usage.

`-typesafe-v1` is still appended to harness provenance and changes the environment fingerprint. Assisted observations must not be treated as equivalent to unassisted ones. Costs appear separately as **Agent claim checks**, with token counts and unknown dollars. Apply migration `0019_typesafe_agent_tool.sql` and configure the public `FOLIO_MCP_URL` origin. This is the managed Agents API integration, not the Agents SDK or Responses API.

## Validation

- **9 October 2026 (Decisions):** unit, real-D1 and focused browser fixtures cover the Decisions request mapping, one POST with no retry, credential refusal, fail-closed refusals/duplicates/missing answers, and the renamed configuration. One live private question-coverage call (36 judgments) completed; see [question coverage](QUESTION-COVERAGE.md). The authenticated citation review, the in-run tool and crawl reviews have not yet been exercised live against Decisions.
- **Historical (TypeSafe era, 18 September 2026):** a pre-integration live TypeSafe request, release fixtures and deployments of migrations 0018/0019. These results describe the retired provider and do not validate the Decisions integration.
