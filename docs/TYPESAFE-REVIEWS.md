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
