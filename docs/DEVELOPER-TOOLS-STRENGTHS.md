# What the directory's websites do well

A qualitative read of the 36 products in [`src/data/developer-tools.json`](../src/data/developer-tools.json), based on their own public pages. This is **not** a score, a benchmark, or a usability test: it records what each site visibly does to explain itself, and which of those moves are worth borrowing. Nothing here changes the `readiness-v1` observations in [the directory evaluation](DEVELOPER-TOOLS-EVALUATION.md).

For how much each site actually publishes — sitemap inventory joined to the pages that earn rankings — see [site inventory](SITE-INVENTORY-ANALYSIS.md).

**Method.** 72 public URLs (homepage + docs entry page per product) were read with the Parallel Extract API on 6 November 2026, using the objective *"core promise, the specific capability it claims others lack, and any concrete proof it offers."* Excerpts are model-selected from the live pages, so a missing item means "not visible in this excerpt", not "not on the site". Pages change; re-run [`scripts/parallel-strengths.py`](../scripts/parallel-strengths.py) and [`scripts/parallel-strengths-pitch.py`](../scripts/parallel-strengths-pitch.py) to refresh.

## Patterns worth copying

### 1. Documentation that is addressed to an agent, not just a human
The strongest docs pages now lead with machine entry points before prose.

- **WorkOS** puts the index first: `llms.txt`, a docs-scoped `llms.txt`, and a `llms-full.txt` for the entire corpus.
- **Cloudflare, Resend, Firecrawl, Tavily, Exa, Box, Sentry, Pinecone** all expose an `llms.txt` index; Sentry states that *"All documentation pages are available as clean Markdown"*.
- **Firecrawl** ships a *"Build with AI: onboarding guide for AI agents and coding assistants"* plus a keyless free tier so an agent can try before a human signs up.
- **Better Auth** advertises the same idea in four words on its homepage: `CLI Prompt MCP Skills`.

The lesson is not "publish `llms.txt`"; it is that the docs index doubles as the product's API surface for agents, and saying so explicitly is now a credibility signal.

### 2. One sentence that names the boundary
Every memorable homepage here can be reduced to a single claim about where the product sits.

| Product | Claim |
| --- | --- |
| E2B | *"Every agent gets a machine"* — *"You bring the model, prompts, and agent logic. E2B runs the machine underneath."* |
| Browserbase | *"Give your agents access to the whole web."* |
| Railway | *"Ship software peacefully."* |
| Sentry | *"Code breaks, fix it faster."* |
| Modal | *"Container infrastructure that won't box you in."* |
| Temporal | *"The world's best AI runs on Temporal."* |

These work because they exclude: each one implies what the product is *not* (not a model, not a framework, not an orchestration layer). Folio's own positioning is weaker here — the landing page explains a workflow before it makes one exclusionary claim.

### 3. Proof placed next to the claim
The credible pages never let a claim stand alone.

- **Chroma** prints measured latency (`p50 20 ms`, `p90 27 ms`, `p99 57 ms`) and write throughput on the homepage.
- **Tavily** links a published benchmark with a methodology page (company-research queries, factual correctness, financial accuracy).
- **Firecrawl** publishes a named benchmark (DevDex, Recall@10 / MRR@10) that compares it against Parallel and Exa — including competitors.
- **Pinecone** and **edX** carry scale numbers (10,000 customers / 1M developers; 100M learners / 250+ partners).
- **Clerk** uses customer quotes with handles, not anonymous logos.
- **Duolingo** links efficacy research next to *"free. fun. effective."*

A benchmark that names competitors is the strongest version: it is falsifiable, which is what makes it read as evidence rather than marketing.

### 4. Time-to-first-value inside the fold
- **Sentry** puts a working Go snippet on the homepage.
- **PostHog**: `npx -y @posthog/wizard@latest`, plus *"No credit card required"* and *"Setup wizard installs PostHog for you"*.
- **Better Auth**: `npx auth init` beside the framework claim.
- **Stripe** leads with integration paths rather than features.

The pattern: the first action is copy-pasteable and produces something visible, so the evaluation cost is minutes rather than a sales call.

### 5. Local and self-hosted parity as a selling point
- **Cloudflare** names `workerd`, its open runtime, for *"first-class local development"*.
- **E2B** offers *"one API … in our cloud or your AWS, GCP, or Azure account"*.
- **Chroma** is Apache 2.0; **Temporal** links *"Run Locally"* next to *"Try Free"*.
- **Qdrant** publishes migration guidance as a first-class destination.

For infrastructure products, "you can leave" is treated as a trust feature rather than a risk.

### 6. Pricing and limits stated in the pitch
- **Cloudflare**: *"pay only for CPU time"*, with the idle-time distinction spelled out.
- **Clerk**: *"Free for your first 50,000 monthly retained users"*.
- **PostHog**: *"97% of users pay us $0"*.
- **Coursera / edX** surface a single annual price or discount code in the hero.

Numbers that a buyer can check against their own usage do more work than a pricing page link.

### 7. Migration, support, and services treated as product
- **Railway** advertises **migration credits**; **Box** sells migration services; **Qdrant** and **Stripe** publish dedicated migration/professional-services paths.
- **WorkOS** frames itself as *"authentication and enterprise-readiness features as APIs"* — SSO, SCIM, audit logs, FGA — i.e. the compliance checklist as the product.

### 8. Consumer sites design the habit, not the transaction
- **Duolingo** structures the pitch as *bite-sized lessons → points → levels → real-world communication*, with the efficacy claim attached.
- **Intrepid** leads with *"Who you travel with changes everything"*; **G Adventures** sells private and solo travel configurations.
- **IKEA** and **Taskrabbit** put assembly/installation services beside the purchase, and Taskrabbit quantifies it (*"890,000+ Assembly service provided for IKEA"*).
- **Everlane** keeps a *"true cost"* transparency page reachable from the homepage.

## Per-product notes

| Product | What stands out on its public pages |
| --- | --- |
| Cloudflare Workers | Cold-start-free claim tied to architecture (V8 isolates, 330+ cities) and CPU-time billing; local dev via `workerd`. |
| Vercel | Positions as *"Agentic Infrastructure"*: API, CLI, MCP and Skills for coding agents; sandboxed VMs and a model gateway in one frame. |
| Render | New *Sandboxes* line ("a computer for every agent") sits beside core compute, so the new bet does not displace the old product. |
| Railway | Peaceful-shipping promise plus named customer stories and migration credits. |
| E2B | Cleanest boundary sentence in the set; microVM-per-session with bring-your-own-cloud. |
| Daytona | Puts concrete latency (90 ms environment creation) in the meta description and lists agent use cases (RL, computer use, visualisation). |
| Modal | Explicit audience ("teams that develop, train, and serve AI at scale"); guide/examples/reference split in docs. |
| Browserbase | One API key framing: browsers, search/fetch, agent identity, observability, SOC 2 — anti-bot stated as a first-class problem. |
| Better Auth | Framework-agnostic claim with CLI/MCP/skills in the hero; plugin ecosystem named. |
| Clerk | Boilerplate removal stated concretely (API keys, SCIM, prebuilt UI) plus named integrations and quotes. |
| WorkOS | Enterprise checklist as product; three separate LLM entry points (site index, docs index, full text). |
| Auth0 | Agent identity, token vault and MCP authorization framed for the *whole* customer lifecycle. |
| Chroma | Publishes latency and throughput tables on the homepage; open-source licence stated up front. |
| Qdrant | Metadata-filter depth shown with concrete filter names; migration guidance and startup programme surfaced. |
| Pinecone | Retrieval-as-one-place argument: embedding, reranking, dense/sparse/full-text in the same index. |
| Resend | Agent-directed "when to use this" section with exact endpoint and batch limits. |
| Firecrawl | Keyless trial for agents, agent-auth path, and a named public benchmark that includes competitors. |
| Exa | Site index for LLMs first, then product; "largest index of public web and private information" claim. |
| Tavily | Benchmark with methodology, production scale (300M+ monthly requests), copy-ready setup prompt. |
| Stripe | Integration paths before features; services and support plans sold explicitly. |
| Temporal | Customer names as proof of durability; "you have to see it to believe it" demos instead of prose. |
| Box | Data-residency regions and migration services alongside the AI narrative. |
| Sentry | Runnable snippet, "get started in minutes", and Markdown docs for every page. |
| PostHog | Zero-friction install (`npx` wizard), "97% pay $0", and an assistant that answers product questions. |
| Notion | Capture / find / automate triad with citations in the answer claim. |
| Slack | Integrations breadth as the platform argument; AI features listed as use cases, not model names. |
| Basecamp | Deliberate anti-complexity stance ("famously straightforward"), plus an agent-ready API/CLI/skills page. |
| IKEA | Service hub (support, returns, planning tools, assembly) treated as part of the product. |
| Allbirds | Shipping threshold and delay expectation stated before the catalogue. |
| Everlane | Material/ethics narrative with a reachable transparency page. |
| Taskrabbit | Quantified service proof with IKEA and long-form customer reviews. |
| Intrepid Travel | "Who you travel with" as the differentiator; sustainability framed as history since 1989. |
| G Adventures | Configuration-first selling (private, solo, family) instead of a single fixed tour list. |
| Coursera | Learning plans curated by experts; annual price and team discount in the hero. |
| Duolingo | Habit loop plus efficacy research; expands subjects while keeping the same promise. |
| edX | Scale and partner credibility (100M learners, Harvard/Stanford/Google) with a clear discount path. |

## What Folio should take from this

1. **One exclusionary sentence for the landing page.** Something closer to *"Saved evidence for AI answers, not another rank tracker."* The current page explains the workflow before it makes a claim.
2. **Publish an `llms.txt` and Markdown mirrors for the API docs.** Folio already documents limits and error envelopes in `docs/MCP.md`; a machine index is a small step from there and matches what every developer tool in this set now ships.
3. **Keep proof next to claims.** The public dashboard is the strongest asset in the product; the landing page should quote one real published observation rather than describe the mechanism.
4. **State the boundary in the first fold.** Folio's honest separation of measured vs illustrative states is a differentiator — it should be visible before the first scroll, not only in the disclosure footer.
5. **Make the first action copy-pasteable.** A single `curl` against `/api/public/benchmarks` on the landing page would mirror the install-snippet pattern without spending anything.

## Limits

- Excerpts are selected by an extraction objective, so absence here is not evidence of absence on the site.
- No page was evaluated for accessibility, performance, or conversion; those would need the technical scans and browser checks described in [the evaluation](DEVELOPER-TOOLS-EVALUATION.md).
- Quotes are the companies' own claims, reproduced for review. They are not independently verified by Folio.
- This review says nothing about pricing accuracy, security posture, or whether any product does what it claims.
