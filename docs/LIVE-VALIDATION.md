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

## Private website and research follow-up

A later owner-requested local trial linked an already saved Search Console property into its private website view, without another Google import. One explicit DataForSEO lookup completed both organic and backlink tasks and was saved privately. This validates provider retrieval and reopening for one domain; it does not establish broad data coverage or production deployment. Provider credentials, account identifiers, report contents, and costs remain in ignored local records.

The first homepage evaluation stopped before session creation because its complete HTML exceeded the previous 80,000-byte capture limit. The bounded limit is now 190,000 bytes, with the unchanged 200,000-character serialized provider input limit validated before the creation-attempt marker. Full source is retained; no truncation is represented as a complete capture. Regression cases cover byte boundaries and escaping expansion.

The first hosted keyword research session completed its root turn, live searches, sandbox JSON-validation marker, and final JSON. Its command exit code was explicitly null, which the initial verifier rejected. The corrected verifier records a missing reported exit code as unmeasured while still requiring completed command status, the exact validation marker, completed search, valid final JSON, and approved citations. Explicit nonzero or absent exit-code fields fail. The original failed application observation is retained; it is not rewritten into a successful result.

A new homepage run after the capture fix completed: six measured checks passed, none failed, and two product/pricing reference checks remained unmeasured because no independent reference answers were supplied. Its private evidence bundle reproduced all source hashes and verification outcomes through the offline verifier without network access. A new keyword baseline and linked fresh observation also completed with the corrected nullable-exit handling; their three returned product mentions matched, while citation sets differed. This is one repeated query in a restricted research corpus, not proof of market position or causality.

The owner explicitly authorized a server-only daily-count exemption for their verified account. Exact approved account IDs receive a null daily limit; other accounts retain normal limits. Active-run gates, durable attempts, explicit paid starts, and task deadlines remain in place. Current regression validation passed TypeScript, 154 unit tests, nine real D1 cases, and focused desktop/mobile checks for website linkage, private report updates, keyword activity, recovery, login return context, and exempt-account gating. Production deployment is not established by these local results.

## Open-web Astra search and recovery hold

Two additional private keyword observations completed through `gpt-6-astra` with OpenAI live web search, no domain allowlist, and an OpenAI-hosted sandbox whose outbound network was disabled. Each saved run includes a completed root turn, a completed final JSON answer, actual search items, and the sandbox validation marker. The target website was withheld from the model input. Their returned recommendation lists contained four entries each; the target was not listed or cited. These are query-specific API observations, not measurements of the consumer ChatGPT website. The first used `keyword-open-web-v1`; the second used `keyword-open-web-v2`, whose prompt accepts general user questions. These different queries/configurations are not presented as a before/after improvement.

A third creation attempt lost its receipt before a session ID was recorded. The complete current project session listing was checked twice and had no matching run metadata; the listing has no documented consistency guarantee, so that does not establish that no task or charge exists. The attempt remains `requires_action` with unknown outcome and cost. The owner explicitly chose to keep its blocking hold and finish only the UI/API work. No replacement or additional public-query collection was started.

The separate public ranking artifact therefore contains three reviewed query definitions and **zero collected observations**. Private search answers have not been copied into it. The ranked public interface and explicit collection/export CLI are implemented; actual public collection and populated-data visual validation remain deferred.

Local migration 0011 was applied after a private D1 backup. The external Agent API passed scoped-key/freshness/idempotency checks using isolated actual D1 bindings, along with browser fixtures and public-schema/unauthenticated HTTP checks. These tests created no real agent key and started no provider inference. Local API validation and private live search do not establish production deployment or external-user onboarding.

## UI/API completion checks

The real overview was inspected in the signed-in local account: two of three open-web questions had saved completed answers, twelve distinct source URLs appeared across them, and the unresolved third attempt stayed visible. Existing private SEO, Search Console and website-evidence reports remained reachable without repeating their provider work. The original website-report link still opens Page evidence; search-question selection opens the saved ranked answer.

Exact Bun 1.4.1 type checking, 205 unit tests and 14 isolated D1 cases passed. A broad browser run passed 190 cases, with two intentional skips and six failures. Four failures concerned the new view controls' layout/login expectations; one exposed a failed-start notice race, which was fixed. The sixth trace recorded a Next.js development manifest error and full reload during login. All six affected cases passed focused reruns; six additional question-editor cases passed on desktop/mobile. Retained failure traces distinguish the original failures from their reruns. These were fixture checks, with no new live model request, API key, or provider import.
