# Monetization proposal

Status: product proposal, 13 September 2026. The application does not charge customers, create subscriptions, sell credits, or enforce the plans below. Prices are hypotheses to validate with pilot customers and measured operating costs. A pricing screen must retain this distinction and offer exploration or sign-in rather than a simulated checkout.

## What customers would pay for

Charge for a private, repeatable improvement workflow: saved evaluations, the evidence behind a result, comparison after a change, and control over evaluation spend. Keep the public methodology and published index available for discovery. A company should be able to understand its result before buying anything.

Folio's emphasis is inspectable website tasks alongside technical readiness and SEO context. It is not defensible to claim that combining SEO and AEO, keeping evidence, or publishing a leaderboard is unique. Current competitors already overlap in these areas; see [AEO research](research-aeo.md), [SEO research](research-seo.md), and [evaluation research](research-evaluations.md). The business hypothesis is that a focused evidence-to-improvement workflow earns repeat usage. There is no customer evidence yet proving that hypothesis.

## Suggested pilot plans

All prices are proposed USD per month, before any applicable taxes. Seats, site limits, allowances, and retention entitlements in this table are not implemented plan limits.

| Plan | Proposed price | Proposed allowance | Intended value |
| --- | ---: | --- | --- |
| Free | $0 | Sample evaluations and the published technical index; no included paid provider allowance | Explore the methodology and inspect the product before connecting data |
| Builder | $49 | 1 seat, 3 sites, 1,000 provider-cost credits per month | Private manual evaluations, saved evidence, and reviewed repairs |
| Team | $199 | 5 seats, 10 sites, 4,000 provider-cost credits per month | The Builder workflow with a future shared workspace and reporting controls |

Define **one provider-cost credit as $0.01 of reconciled provider spend**, not one task, prompt, page, or completed evaluation. The suggested included budgets are therefore $10 for Builder and $40 for Team. Actual evaluation counts depend on the selected model, input size, tools, and repeat count. Do not promise a fixed number of runs before measuring these costs.

A possible extra pack is 1,000 credits for $15, purchased deliberately. Do not enable automatic top-ups by default. At full use, that pack leaves $5 before payment fees, infrastructure, support, and refunds; this is arithmetic, not a margin forecast. The subscriptions' corresponding amounts before those costs are $39 and $159. Shared provider minimums, if any apply to the operator's account, must also be allocated when estimating margin.

Scheduled evaluations, team invitations and roles, email reports, CI regression checks, retention tiers, and agency reporting are roadmap items. They should appear as planned features until their server implementation and tests exist. Current authentication represents individual owners; it is not a team billing model.

## Why spend budgets matter

A managed Agents API task may contain several model calls and delegated work. Input, output, cached input, reasoning, tools, and any environment costs contribute to its cost. Usage can be unavailable or revised; it is not an invoice. Folio must never turn missing usage into a $0 charge or calculate billing by adding both session totals and the same turns again. [OpenAI Agents API usage](https://developers.openai.com/api/docs/guides/agents-api/observability)

DataForSEO endpoints have their own charging units. Labs pricing depends on endpoint and requested result quantity; Backlinks pricing includes a request charge and retrieved rows. A generic cost per website would hide this difference. Use the provider's task cost in the actual response, retain the task ID, and reconcile ambiguous timeouts before offering another billable attempt. [DataForSEO Labs](https://dataforseo.com/apis/dataforseo-labs-api/competitor-research), [Backlinks pricing](https://dataforseo.com/pricing/backlinks/backlinks)

The implemented controls are narrower: explicitly approved account IDs for paid providers, bounded requests, rate limits, and no automatic DataForSEO retry. These reduce accidental usage; they do not implement a dollar-denominated prepaid wallet or guarantee a maximum invoice. Provider access and a configured credential are separate states.

## Before accepting money

1. Measure completed, failed, and cancelled evaluation costs across realistic page sizes and repeated trials. Include capture, persistence, polling, tool calls, support time, and shared provider commitments.
2. Add an immutable usage ledger keyed by run and provider task, currency precision, idempotency, pending reservations, adjustments, and a customer-visible reconciliation history.
3. Reserve a conservative maximum budget before starting a run. Stop admitting additional work when a budget is exhausted; cancellation cannot undo charges already incurred. Leave unknown costs pending rather than issuing a false final balance.
4. Add a real payment provider, verified webhook processing, server-side entitlements, invoice history, cancellation, refund handling, and tests for duplicate/out-of-order events.
5. Validate the proposed prices through pilot retention and willingness to pay. Revise the allowance if measured usage would make the plan unsustainable.

No payment provider is configured or required to explore the current application.

## Protect benchmark trust

Payment must not change scoring weights, erase failed trials, buy a better rank, or purchase an unlabelled placement. A paid rerun uses the same eligibility and publication rules as any other run. Keep the full attempt set and display the capture window; selecting a customer's best trial is not a fair benchmark.

Private evaluations remain private regardless of plan. Public publication is a separate deliberate action with a preview of exactly what will be disclosed. A badge should link to the relevant versioned result and expire or become stale with it; a billing subscription must not confer a “verified” label. Domain ownership verification and public agent-performance publication remain prerequisites for that future badge product.

The durable acquisition loop is: public method or published technical result → inspect evidence → run a private evaluation → review a change → repeat the same test. Rank movement can create interest, but fabricated company rankings, invented urgency, and guaranteed AI recommendations would undermine the product's evidence claim.

## Cost visibility implemented

Private D1 usage snapshots and the cost summary are documented in [cost tracking](COST-TRACKING.md). Token estimates and provider-reported SEO costs remain separate; no billing or credit balance is implied.
