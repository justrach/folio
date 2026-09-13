# Folio: customer-specific website evaluation suites

Date: **13 September 2026**. This is a proposed product specification and discovery plan, not implemented functionality, verified customer demand, or a market-size estimate. Folio should serve website owners across customer types; developer tools are one segment.

## Product direction

Use one product promise: **check whether an agent can answer the questions your customers bring to your website, then inspect the evidence and improve the page**. Let an owner choose a website type and customer goal to select appropriate tasks. Shared evidence rules should remain consistent; task content and reference fields should differ by segment.

The current `website-evidence-v1` checks product-name/pricing extraction, exact source citations, and captured-source readability. Broader questions below require new versioned schemas, fixtures, verification rules, and validation. An owner-provided reference establishes the intended answer, not independently certified truth. A quote's presence is distinct from its support for an answer.

## Recommended suite matrix

These example questions are proposed test cases, not claims about observed customer behavior. Reference records should come from an authorized owner, be dated/versioned, and stay outside model inputs when used as answer keys.

| Website/customer type | Buyer and question | Reference source | Bounded, verifiable outcome |
| --- | --- | --- | --- |
| **SaaS / subscription business** | Growth/product marketing: “Which plan includes SSO, and what would five seats cost monthly?” | Current approved plan catalogue, feature entitlements, minimum seats, tax and billing rules | Extract exact plan/feature membership and currency/interval; compute five-seat price under declared assumptions. Mark custom or unavailable pricing explicitly. |
| **Ecommerce** | Store owner or merchandising team: “Does this item fit my device, and can I return it after opening?” | Variant/specification catalogue and versioned returns policy, including market and exclusions | Match SKU/compatibility and return-window conditions. Require evidence for exceptions; abstain when the supplied product information cannot establish compatibility. |
| **Local services** | Owner or operations lead: “Do you serve this postcode, offer this service, and accept requests on Saturday?” | Approved service catalogue, postcode coverage, hours/holiday rules, enquiry destinations | Resolve the supplied location/service/hour scenario and identify the correct contact path. A visible opening time must not become an appointment-availability claim. |
| **Developer tools** | Developer relations/product team: “Which authentication method and endpoint create a sandbox resource?” | Versioned API specification, approved quickstart and sandbox contract | Match method/path/auth fields and required parameters. Later sandbox trials can verify an expected response and cleanup; copied example code alone is not successful execution. |
| **Hospitality** | Property or guest-experience team: “Can two adults, one child and a dog use this room, and what are the cancellation terms?” | Room occupancy, pet and cancellation policy records for the specified rate/market | Verify declared occupancy and policy conditions. Keep current inventory and bookable price unmeasured until a live authorized source is tested. |
| **Education / training** | Admissions or course-content team: “Am I eligible, what does this course cost, and when is the application deadline?” | Approved course catalogue, intake dates, fees and eligibility rules | Compare structured prerequisites, intake/date and fee fields. Do not infer admission eligibility when discretionary assessment is required. |

Every suite also needs negative cases: absent price, conflicting pages, expired policy, unsupported claim, missing qualification, and an answer that correctly says the evidence is insufficient. Separate question correctness, completeness, citation occurrence, and task completion; do not hide them in one percentage.

## Three delivery tiers

| Tier | What is evaluated | MVP boundary and evidence |
| --- | --- | --- |
| **1. Captured pages** | Can the model extract or resolve a bounded question from supplied evidence? | Freeze authorized public pages and withheld reference answers. Verify typed fields, declared arithmetic, accepted alternatives, citations and abstention. No browsing or transaction claim. Best first expansion from the existing pilot. |
| **2. Find the answer** | Can an agent discover the relevant page and resolve the question? | New bounded read-only retrieval/browser harness, starting URL, navigation budget and allowed domains. Record visited pages, failures and final source. Distinguish “could not find” from “found but misread.” Exclude cart/submission actions. |
| **3. Complete a task** | Can an agent perform an approved workflow? | New sandbox/test environment, explicit action limits and verifiable terminal state: saved test enquiry, sandbox API resource, or test checkout. Require isolated identities, reset/cleanup and repeat trials. Real purchases, bookings and customer messages are outside routine evaluation. |

These are separate experiments. Success on supplied HTML does not establish discovery ability, rendered-browser usability, real inventory accuracy, or transaction success. A saved observation must retain its tier, task version, locale, model, capture time and tool conditions.

## Priorities and discovery experiments

**Start with a common suite foundation and two contrasting pilots: SaaS and local services.** This is an implementation-effort hypothesis: plan/feature questions extend existing typed facts, while service/location questions test whether the design generalizes beyond software. Add ecommerce next if merchant recruitment and reliable catalogue/policy references are available. Keep developer tools as a selectable suite; hospitality and education can follow the same capability model when owners can supply unambiguous policy records. Reorder based on recruited users, not assumed market demand.

1. Recruit a small exploratory cohort in each initial segment. Ask owners for recent real customer questions, approved answers and the page intended to answer them. Record recruitment bias; this is discovery, not representative demand research.
2. Have owners and an independent reviewer label a small challenge set before model runs. Compare disagreements, particularly policy exceptions and abstention. Revise ambiguous tasks before interpreting scores.
3. Show each owner a report with one correct answer, one failure and one unmeasured result. Observe whether they can identify a concrete page change without an explanation from the product team.
4. Ask the owner to implement one chosen edit, then run the same versioned task against a fresh capture. Report the observed difference and repeat-run variation; do not claim the edit caused commercial improvement.
5. Test willingness to pay using the actual report and explicit delivery scope. Compare one-off evaluation, agency review and recurring monitoring preferences without implying those paid packages exist.

## Competitor-informed design constraints

Braintrust already documents baseline comparisons, repeated trials and case-level differences; these mechanics are an expected foundation, not Folio's exclusive advantage. [Experiment comparison](https://www.braintrust.dev/docs/evaluate/compare-experiments), accessed 13 September 2026.

Inspect's dataset/solver/scorer separation supports reusable infrastructure underneath different task families. It does not make the task definitions or references valid automatically. [Inspect overview](https://inspect.aisi.org.uk/), accessed 13 September 2026.

Folio's proposed distinction is packaging that rigor around each website owner's customer questions and repair decisions. That remains a positioning hypothesis until these discovery experiments establish usefulness.
