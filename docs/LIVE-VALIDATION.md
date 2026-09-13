# Live Agents API validation

On 13 September 2026, one real `gpt-6-astra` evaluation completed through Folio's local Better Auth/D1 application. It used OpenAI's managed Agents API directly, with `environment.type: "none"`, and captured the public `https://example.com/` page. This is a connection and evidence-workflow smoke test, not a product benchmark or production deployment.

## Observed workflow

- Authenticated session-list and configured-model checks returned HTTP 200.
- A dedicated local test account was approved with the default one-live-run-per-day limit.
- Folio persisted its reservation and creation-attempt marker before one session-create request containing the initial task.
- The returned session ID was saved, and the completed root turn and saved final-answer item were retrieved through the application reconciler.
- The final JSON passed schema validation. All three returned quotations matched exact substrings of the captured HTML.
- The private evidence export passed `npm run eval:verify -- <bundle.json>` without network access: source hashes and every saved check outcome reproduced.

## Evaluation result

| Outcome | Observations |
| --- | --- |
| Four checks passed | Source integrity, structured output, exact citations, and finding evidence links. |
| One check failed | The deterministic readability check found 19 visible words, below its 200-word full-pass threshold. |
| Three checks unmeasured | Product-name accuracy, pricing accuracy, and extracted-fact evidence coverage. No reference answers or non-null product/pricing facts were supplied. |

The displayed verification percentage was 80% of five measured checks. It is not a website rank. The short example page's readability failure is a retained observation, not a failure of API execution. The provider usage fields consumed by the application were unavailable, so no token-total or dollar-cost claim is made.

## Startup correction and regression coverage

The official [session guide](https://developers.openai.com/api/docs/guides/agents-api/sessions) requires initial input when the environment type is `none`. Folio's earlier deferred-input startup was corrected before the live creation request. Initial input is now included in the single creation POST; there is no second initial message submission.

Regression coverage checks reservation-before-request ordering, exactly one creation request, withheld reference answers, frozen selected SEO evidence, definite rejection versus ambiguous creation, preservation of received session IDs during storage failures, and no automatic task retries. All 114 unit tests, 10 relevant desktop/mobile GUI tests, and TypeScript passed after the correction.

## Privacy and scope

The key remains in ignored local server configuration with mode 0600. Local account credentials, raw responses, session identifiers, and the downloaded evidence bundle are excluded from Git. Only this non-sensitive validation summary is committed.

This single live run did not exercise saved-SEO tool continuation or cancellation; those retain fixture-backed regression coverage. No additional DataForSEO lookup was made. Closed-browser production scheduling, hosted CI, and subscriptions still depend on the remaining deployment and billing work in [TODO](../TODO.md).
