# Enterprise onboarding and pricing

Status: **proposal**. Nothing here charges, provisions, or entitles anyone yet — there is no payment provider, invoice history, or credit ledger. It exists so a pilot customer (for example Manus) can see what the offer would be, what it costs us, and what we would need before taking money. It extends [the monetization proposal](MONETIZATION.md) with an enterprise tier rather than replacing it.

## What the customer is buying

Not "rankings". The paid thing is a **monthly evidence loop for one company against a fixed competitor set**:

1. **Onboarding brief** (one-time, inside the first month): sitemap inventory, keyword sample, page-type mix, an add-list tied to observations, and a peer comparison.
2. **Monthly delta**: what changed in inventory, in ranked pages, in the competitor set — with the same method every month, stored so month two can be compared to month one.
3. **Question-set visibility**: whether AI answers surface the customer for an agreed list of questions (managed runs), and which sources those answers cite.
4. **Evidence access**: the same records through the MCP API (`read` scope), so their own agents can query what we measured.

The customer is also **contributing**: their public sitemap inventory, public page content and domain-level ranking sample become part of the index we monitor. That is a licence to include **public** observations, opt-in and revocable — never their private evaluations.

## The offer is for agents first, people second

Folio's customer is increasingly an **org's agent fleet**, not a person clicking around: their agents call MCP to read the index, pull evidence, and re-check a competitor set without a human in the loop. That changes what a seat means. Seats are for the humans who configure tracking, review deltas and sign off — they should be few and priced accordingly. Agents get organization-scoped keys with their own scopes, rate limits and audit trail, and the plan is priced on tracked domains plus an agent request allowance.

## Proposed tiers

Prices in USD per month, before tax. Allowances use the existing credit definition: **1 credit = $0.01 of reconciled provider spend** ([MONETIZATION.md](MONETIZATION.md)).

| | **Index Partner** | **Index Partner Plus** | **Index Partner Enterprise** |
| --- | ---: | ---: | ---: |
| Base price | **$1,000 / mo** | **$2,500 / mo** | **$6,000 / mo** |
| Tracked domains | 1 | 3 | 10 |
| Refresh | monthly | weekly | weekly + on demand |
| Competitors tracked | 5 | 10 | 25 |
| **Agent requests / mo** | 100,000 | 500,000 | 2,000,000 |
| **Included operator seats** | 2 | 5 | 10 |
| **Additional seat** | **$250 / mo** | **$300 / mo** | **$350 / mo** |
| Included provider credits | 10,000 ($100) | 30,000 ($300) | 75,000 ($750) |
| AI-visibility questions | 25 | 50 | 100 |
| Agent keys per org | 10 | 50 | unlimited |
| MCP scopes | `read` | `read` + `seo` | `read` + `seo` + `evaluate` |
| SSO / SCIM | — | — | included |
| Audit export | — | monthly | continuous |
| Index contribution | opt-in, attributed | opt-in, attributed | opt-in, attributed, named partner page |
| Support | email, next business day | shared channel | named contact, 1-business-day SLA |

Overage: agent requests **$0.50 per 1,000** above the allowance; provider credits **$0.015 per credit** (the existing $15 per 1,000 pack). Overage is invoiced monthly, never auto-charged from a stored card.

A three-month pilot at Index Partner is the intended entry point: **$3,000 for the quarter** including two operator seats, with a written review at the end and no auto-renewal. Extra seats during the pilot are $250/month.

**Why seats are priced high.** A seat is not a login; it is a person who can change tracked domains, read private evidence and export it. Every seat multiplies support load and the blast radius of a mistake, while agents — the actual consumers of this product — are metered by requests and keys. Pricing seats at $250–350 also keeps the plan honest: it stops a 40-person org buying one $1,000 licence and sharing a login, which is what an underpriced seat invites.

## Organization model (required, not implemented)

Nothing below exists yet. Authentication is currently individual-owner only, and MCP keys inherit the issuing account, which cannot express an org's agents safely.

- **Tables**: `organization`, `member` (role: `owner` / `admin` / `analyst` / `agent`), `organization_domain`, `organization_api_key` (hash only, with scope, label, creator, last used, revocation), `audit_event`.
- **Ownership**: sites, evaluations, page captures, SEO reports and provider cost observations gain `organization_id`; the creating user stays recorded for accountability.
- **Keys**: issued to the **organization**, labelled per agent, scope-limited, individually revocable, with per-key rate limits and an audit trail of tool calls. A key must never widen a member's rights, and an `agent` role must not be able to spend without an explicit entitlement.
- **Seats and entitlements**: seat count per org, invitation flow, role checks on every mutation, and plan entitlements enforced server-side (tracked domains, competitors, questions, request allowance).
- **Billing unit**: the organization is the invoice subject; usage is attributed to it, not to whichever member happened to run the job.

Until this exists, an "enterprise" sale means one individual's account with a manual agreement — which is exactly the shape the $1,000 price is meant to replace.

## Cost basis (measured, not modelled)

From the actual runs in this repository:

| Item | Measured cost | Notes |
| --- | ---: | --- |
| Keyword rows per domain refresh | **$0.0438** | DataForSEO Labs ranked keywords $0.018 + backlinks $0.0258 |
| Page content per 30 pages | **$0.03** | Parallel Extract, $1 per 1,000 URLs |
| Sitemap inventory | $0 | public `robots.txt` + sitemaps |
| Managed evaluation | **cents per run** | Luna rates: $0.10 in / $0.50 out per 1M tokens; a typical site run is well under $0.10 |
| Onboarding brief (1 domain + 5 peers) | **under $0.50** | one keyword sample per domain plus ~200 extracted pages |

A full year of monthly refresh for one domain is roughly **$1**. The price is therefore buying the method, the comparison over time, and the reporting — not the data cost. Saying otherwise would misrepresent the margin.

## What the price must not buy

Carried forward from [MONETIZATION.md](MONETIZATION.md), and non-negotiable:

- **No ranking.** Payment never changes scoring weights, eligibility, or position in the public index. Contribution is a licence, not a placement.
- **No hiding failures.** Paid runs keep the same publication rules; a paid rerun is not a better trial.
- **No private leakage.** A customer's private evaluations stay private regardless of tier. Public inclusion requires an explicit preview of exactly what would be disclosed.
- **No "verified" badge from billing.** Domain ownership verification is a separate, technical state.

## Contribution terms to put in the contract

A short, explicit grant is what makes the index grow without eroding trust:

1. The customer grants Folio a licence to include **public-page observations** for their domain: sitemap inventory counts, page-type mix, and their own domain-level keyword sample.
2. Inclusion is **opt-in, previewed, and revocable**; withdrawal removes the records from the public projection on the next publish.
3. **Excluded**: private evaluations, page captures under authentication, anything behind a login, customer names beyond the domain, and any non-public metric.
4. Attribution is by domain and, for Enterprise, a named partner page. It is not a ranking boost and not an endorsement.
5. Public observations keep their method version and retrieval date, so a contributed number is reproducible by anyone.

## What is not included (and should not be promised)

- Guaranteed AI recommendations or search positions; causal claims from any change.
- Google indexation checks (we do not query Google).
- Traffic, conversion, or revenue attribution.
- Team roles beyond seats, SSO, and invoicing (not implemented).
- Any automatic top-up or overspend: credits are reserved, exhausted budgets stop admissions, and unknown costs stay unknown.

## Before invoicing the first customer

Inherited from the monetization checklist, still open:

1. A real payment provider with webhook processing, entitlements, invoices, cancellation and refunds.
2. An immutable usage ledger keyed by run and provider task, with pending reservations and customer-visible reconciliation.
3. Server-side plan entitlements (the table above is not enforced anywhere yet).
4. Measured retention: does the monthly delta report get opened and acted on? If not, $1,000 is a guess, not a price.

Until 1–3 exist, the correct customer-facing artefact is a **quote and a pilot agreement**, not a checkout.
