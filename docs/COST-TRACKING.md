# Private provider cost history

`/pricing` includes an authenticated, owner-scoped cost summary. `GET /api/costs` reads D1 only, uses private/no-store responses, and never starts, reconciles or retries a provider task. This is operating-cost visibility, not a customer invoice, prepaid wallet, subscription or spending cap.

Migration `0015_provider_cost_observations.sql` backfills existing keyword runs, live website evaluations and saved SEO lookups. Source inserts and meaningful usage/status updates append cumulative snapshots to `provider_cost_observations` in the same D1 transaction. Snapshots contain identifiers, usage and cost metadata only, never captures, answers or credentials. The `provider_cost_latest` view selects one latest snapshot per owner/source/record so repeated polls are not summed. Changing a source record's revision without changing usage/status creates no extra snapshot. Demo evaluations are excluded. Source-evidence deletion retains accounting; deleting the owner cascades their history. Records already deleted before this migration cannot be reconstructed.

Money is stored as integer USD microdollars. Token estimates snapshot a versioned standard short-context rate from `provider_cost_rates`, dated 18 September 2026. Historical usage is repriced at this rate; the estimate is not an assertion about the original invoice. Cached-input tokens are retained when valid provider detail exists; otherwise the estimate assumes uncached input. Root-turn usage takes precedence over session usage in the existing single-root keyword workflow, never adding both. Search/tool/container charges, cache writes, long-context adjustments, regional uplifts and unsuccessful operations without usage remain outside the token estimate. Unsupported models or missing input/output counts remain unknown.

DataForSEO response-reported costs are stored separately. Partial known amounts retain an incomplete flag; absent cost remains NULL, including an all-unknown report whose convenience sum is zero. These figures are provider-reported, not invoice-confirmed. The summary does not add reported SEO costs and partial token estimates into a falsely complete total. Failed and unresolved attempts remain visible. Latest snapshots can be less complete than earlier ones; the historical snapshots remain available for investigation.

The current page aggregates all saved time by workflow/model and shows at most 50 recent attempts. Operators can query the latest view directly in D1 for account-wide totals using the same source/model grouping; there is no unauthenticated or cross-owner browser endpoint. A sum of estimates is an estimate subtotal, never a complete provider bill.

Rates source: https://developers.openai.com/api/docs/pricing. Sol pricing is promotional at least through 21 November 2026. To revise rates, apply a reviewed migration with a new version; do not rewrite old cost observations. Full invoice reconciliation, search/sandbox metering, billing entitlements, atomic credit reservations and payment webhooks are follow-up work before charging customers.

## Question expansion

The shared library combines the frozen 3,500-question corpus with 350 additional decision questions in `public-additional-questions.json`. All new progress entries are explicitly not-started. No observations, ranks or provider answers are fabricated. The fixed legacy category-batch authorization continues to use its original corpus and hashes. The public API, MCP index and publication matching use the expanded catalog. Website-context drafting now offers ten editable questions within existing suite/body limits. Saving questions makes no provider call.

## Archiving unresolved attempts

An owner can archive an unresolved keyword attempt older than 24 hours. If a provider session is known, cancellation must already have been requested. Archiving removes only its local active-capacity hold; it preserves provider IDs, status, quota accounting and cost observations. It does not assert remote cancellation or zero cost. The original case remains blocked while unresolved; different cases retain the normal one-active-run limit. Late provider status and usage can still be retrieved. The authenticated archive endpoint requires exact owner, origin and saved revision.

Provider usage can arrive after a terminal answer. Explicit progress refresh retrieves that same session and appends late metering through an owner/revision guard, without changing its terminal result or starting inference. Missing late usage never replaces known counts.

TypeSafe page-evidence reviews are included in the owner cost summary through `provider_cost_latest`. Their one-per-evaluation reservation and final token counts live in `typesafe_reviews`; monetary values remain NULL without a verified price. Deleting evaluation evidence erases the review text but retains its usage and quota accounting. See [semantic reviews](TYPESAFE-REVIEWS.md).

Agent-invoked TypeSafe checks use a separate `agent-semantic-tool` source from post-run semantic reviews. Each call reservation counts once, including unknown outcomes. Repeated MCP requests with the same key do not add charges. Monetary totals stay unknown; runtime limits cap calls, not a guaranteed dollar amount.

Website crawl Jev usage is recorded separately as `crawl-semantic-review`; Luna stays under website evaluations. See [crawl accounting](WEBSITE-CRAWL.md).
