# Advisory semantic citation reviews

Completed live **page-evidence evaluations** have an explicit **Run paid semantic review** action. It sends the saved single-page capture and cited product-name/pricing claims to TypeSafe. Independent owner reference answers, account identifiers, saved SEO reports and provider session IDs are excluded. Exact source hashes and quote occurrence must pass first. Question-search results are not eligible: source links alone are insufficient to validate a claim against a captured page.

`jev-latest` returns supports / contradicts / insufficient judgments, distributions, and model confidence. Folio displays these privately as advisory judgments. They do not alter verification scores, publish evidence, or establish factual truth. Confidence is not measured accuracy. Calibrate against representative labeled examples before automatic acceptance.

## Configuration

Apply migration `0018_typesafe_reviews.sql`. Configure `TYPESAFE_API_KEY` as a server-only Worker secret and `TYPESAFE_ALLOWED_USER_IDS` as a comma-separated explicit account allowlist. Neither is public client configuration. This access is separate from OpenAI access.

## Spending and storage

GET `/api/evaluations/:id/semantic-review` only reads owned saved state and availability. An authenticated same-origin JSON POST with `confirmPaidReview: true` and the current `revision` explicitly authorizes the review. The server reserves one attempt per evaluation before calling the provider, limits each owner to five reservations per rolling day, and blocks simultaneous pending reviews. Duplicate submissions return the saved reservation, never another inference call. Demo runs cannot spend.

A 30-second request timeout or invalid response preserves a needs-attention reservation and unknown usage/cost. No automatic retries occur. A Worker interruption can leave a pending reservation; operator investigation is required before changing that state. Do not delete reservations to reset quotas or retry ambiguous inference.

D1 stores resolved model, usage, latency and advisory results. `/api/costs` includes these under **Semantic reviews**. Dollar cost remains unknown because no verified price or invoice is recorded. Evidence deletion clears the private judgments, including when deletion races an in-flight response; quota and usage remain. Remote TypeSafe retention is not controlled by this deletion. Review results are separate from the original evaluation export.

## Validation

One pre-integration live request confirmed TypeSafe authentication and typed responses: three synthetic citation classifications matched their expected classes, and two wording/relevance judgments ran against a saved answer. This did not establish factual correctness or calibrate acceptance thresholds. Credentials, actual provider outputs and private trial details remain in ignored local artifacts.

Integration tests use provider fixtures: exact source checks, response parsing, no automatic retries, real D1 concurrent reservations, ownership, stale revisions, allowance, unknown costs, deletion races, and desktop/mobile explicit-start and reopen behavior. Fixture success is separate from hosted end-to-end validation.

Release validation on 18 September 2026: 280 unit tests, 31 real D1 tests, two focused desktop/mobile browser cases, TypeScript, and the OpenNext production build passed. Migration 0018 was applied to the production D1 database and the feature deployed. The new UI checks use provider fixtures and do not by themselves establish hosted provider validation.

## TypeSafe inside the agent run

New open-web question runs can opt into **Let this agent check claims with TypeSafe before answering**. The launch authorizes up to three additional paid checks. This supports Luna 6, Sol 6 and Astra 6 through their existing managed Agents API harness. `useTypesafeTools: true` on the authenticated benchmark launch API enables it; existing sessions and simple navigation do not gain tool authority.

Folio configures the service-connected MCP tool `typesafe_check_claim` at `/api/typesafe-mcp`. Its only credential is a random, hashed, run-specific grant with expiry no later than the saved run deadline. The TypeSafe provider key stays in the Worker. The tool is unavailable after cancellation, hold release, archival or a terminal run. Three calls per grant and fifteen calls per owner per rolling day are reserved atomically in D1 before TypeSafe inference. The same request key reuses a saved outcome; changed input with that key is rejected. Unknown/failed requests are never automatically retried. MCP discovery and GET do not call TypeSafe.

The agent supplies a claim, literal quote and source excerpt (bounded to 400 / 400 / 2,200 characters within the endpoint's 4-KiB JSON limit). Exact quote occurrence is checked in code. TypeSafe judges support using only that excerpt; it does not retrieve or authenticate the source. Excerpt provenance is explicitly **agent-supplied**, and its judgment cannot certify a source or override benchmark checks. The agent is instructed to revise or qualify unsupported claims before its final answer. Tool availability does not prove the agent actually called it; inspect recorded provider tool activity and D1 usage.

`-typesafe-v1` is appended to harness provenance and changes the environment fingerprint. Assisted observations must not be treated as equivalent to unassisted ones. Costs appear separately as **Agent TypeSafe checks**, with token counts and unknown dollars. D1 keeps judgment distributions and metering, while original submitted excerpts remain in the private provider tool-call history. No broad erasure or public publication is implied.

Configuration reuses `TYPESAFE_API_KEY`, `TYPESAFE_ALLOWED_USER_IDS`, and the public `FOLIO_MCP_URL` origin; apply migration `0019_typesafe_agent_tool.sql`. This is the managed Agents API integration, not the Agents SDK or Responses API. The service-origin HTTP MCP configuration follows the [Agents API reference](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents).

Agent-tool validation on 18 September 2026: 281 unit tests, 32 real D1 tests, the focused MCP dispatch test, two desktop/mobile launch tests, TypeScript and the OpenNext build passed. Tests use provider fixtures; a live managed agent invoking TypeSafe remains a separate validation step. Migration 0019 and the tool endpoint were deployed, without automatically launching a paid evaluation.
