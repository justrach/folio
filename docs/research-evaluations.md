# Evaluation products and Folio positioning

Research date: 13 September 2026. Scope: two website-readiness products. Sources are the products’ own public pages. Product descriptions below are published claims or directly observed page content, not independently validated vendor performance. No competitor accounts were created or paid tests run.

## Finding

Website diagnostics, repair recommendations, public rankings, and agent usability testing already exist in this category. Folio should lead with the clarity of its current audit-to-review workflow and the evidence it exposes. A future website-reader benchmark is a useful direction, but neither that idea nor combining visibility and usability is a supportable uniqueness claim.

## What the references actually offer

| Reference | What was observed | Implication for Folio |
| --- | --- | --- |
| [AgentReady methodology](https://www.agentready.me/methodology) | A versioned website diagnostic with distinct missing-evidence states and implementation contracts for fixes. | Transparent scoring and repair handoffs are established expectations, not exclusive Folio features. |
| [Agent Checker](https://agentchecker.ai/) | A static quick check and a separately advertised browser-agent task audit. | Keep static readiness and observed task success visibly separate. |

### AgentReady: explicit applicability and repair verification

Its methodology describes 34 stable checks and five result states: pass, partial, fail, not applicable, and unobservable. Unobservable results affect a separate coverage measure. A Fix Pack carries evidence, stable finding identifiers, candidate implementation targets, and acceptance assertions; verification checks the deployed public condition again. The methodology explicitly limits what those observations prove and says no public benchmark dataset currently exists. Its editorial journey index is separate from a verified benchmark. [Methodology](https://www.agentready.me/methodology).

The homepage offers public URL scans, optional repository inspection, and downloadable or copyable instructions for coding agents. Those capabilities overlap the repair-handoff direction; Folio must compete through execution quality and fit for its audience. [Product page](https://www.agentready.me/).

### Agent Checker: static diagnostics and browser tasks as different products

Its product page describes a free static check of 20 protocol surfaces and a paid audit in which a browser agent attempts more than 20 tasks, with replay and report deliverables. These are vendor claims; the audited behavior and safety boundaries were not independently exercised. [Product page](https://agentchecker.ai/).

Its public readiness index lists a 1,000-site snapshot dated September 4, 2026, with categories, individual reports, and a stated public-page methodology. This establishes that public website-readiness comparisons already exist. The index describes a standards-based snapshot; it should not be presented as proof that every listed site underwent the paid browser-task audit. [State of Agent Readiness](https://agentchecker.ai/state-of-agent-readiness).

## Folio: supported today versus proposed

Verified against the current workspace:

- `src/lib/evaluation.ts` implements `readiness-v1`: ten deterministic checks totaling 100 points, with source evidence and explicit limitations. It inspects one captured HTML page without executing JavaScript or crawling its links. Optional protocol-file observations earn no score.
- Repair generation currently drafts missing title, description, and canonical markup. `PatchStudio` in `src/components/dashboard.tsx` lets the user review, select, and download suggestions. A download does not edit the source website or prove the repair works after deployment.
- The public-facing leaderboard currently uses clearly labeled demonstration data. The published-scan API has a separate rubric-filtered query; that is not an already populated independent AI benchmark.
- `src/lib/agents.ts` analyzes supplied evidence using the managed Agents API when configured. Independent website-reader trials, provider collectors, repeated experiments, and validated public AI rankings still require orchestration.
- The current live scanner is restricted by a configured host allowlist; the initial UI identifies example.com as supported. Do not promise unrestricted scans of any website until that capability is available.

## Two safe positioning claims for the landing page

**1. “Understand every point of your website-readiness score.”**

Supporting copy: “Inspect the source observations and fixed checks behind your page’s score, so your team can see what needs attention.” Link to the rubric. Avoid implying the score measures Google position, AI recommendations, traffic, or conversion.

**2. “Turn a page audit into a repair you can review.”**

Supporting copy: “Review suggested title, description, and canonical changes, then download the ones you want to implement.” This accurately describes the current repair workflow. Avoid promising automatic deployment, comprehensive fixes, or proven ranking improvements.

These are descriptions of Folio’s value, not claims that competitors lack those capabilities. The editorial visual identity can support the product experience without being presented as a technical moat.

## A credible direction for the proposed website benchmark

Use a separate, explicitly named reader evaluation: can an agent correctly explain a website’s offering and support its answer with captured evidence? Freeze the buyer-question set, establish owner-confirmed reference answers, record agent/model versions and tool access, repeat trials, and publish coverage and uncertainty. Keep correctness and evidence grounding separate from latency and cost. The scoring should measure the defined task, not reward a website for merely exposing optional files.

The future public entry should connect each score to the actual capture date, run conditions, evidence, and reviewed repair experiment. Cohort-specific comparisons and a correction route can make competition constructive. Until those measurements exist, calls to action should invite an audit or benchmark participation; they should not assert that a company is losing customers, ranking below competitors, or being ignored by AI.
