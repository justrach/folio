# Site inventory: what these companies actually publish

A sitemap-level inventory of the 36 products in [`src/data/developer-tools.json`](../src/data/developer-tools.json), joined to the pages that actually earn rankings. It answers a different question from [the strengths review](DEVELOPER-TOOLS-STRENGTHS.md): not "what do they say well", but **how much do they have, where, and does it rank**.

**Reproducible.** The inventory reads public `robots.txt` and sitemaps only (`scripts/site-profile.ts`); it never calls a paid provider. The ranking join reads cached responses from `scripts/ranking-report.ts`, which costs two DataForSEO tasks per domain.

## Coverage and limits

- **34 of 36** sites inventoried. `box.com` and `daytona.io` are unavailable: one blocks non-browser agents on child sitemaps, the other serves an HTML page at `/sitemap.xml`.
- **36 of 36** have a keyword sample. All 36 were collected.
- A sitemap is a claim, not an index. A listed URL may be thin, duplicated, canonicalised away or `noindex`; a missing URL may still rank.
- Section names and page types are path heuristics (`src/lib/page-types.ts`). They describe URL shape, not content quality.
- Some counts are a **locale slice**, not the whole site: when a sitemap index lists per-market files first and exceeds the 25-sitemap cap, only those markets are counted (`ikea.com` shows its Estonian set; several sites sit exactly at the 25,000-entry cap). Cross-site totals are indicative, not like-for-like.
- The ranking side is a **capped 50-row sample ordered by search volume**, so it favours head terms. Ratios below are sample rates, not site-wide ranking rates.

## Headline numbers

- **206,073 URLs** across the 34 sites that answered; median **2,339** per site, range **80 – 25,000** (several sites cap at their sitemap's entry limit).
- Page-type mix: **other** 66,800, **blog** 42,590, **academy** 30,209, **docs** 18,814, **templates** 18,648, **product** 10,742.
- Freshness (self-reported `lastmod`): **61,689** updated within 30 days, 16,551 within 31–90, 29,007 within a year, 23,197 older, and **75,629 with no date at all**.
- **Locale inflation is real.** `slack.com` puts 17,872 of 22,460 URLs under `/intl`; `edx.org` 8,336 of 17,871 under `/es` and other language folders; `notion.com` 16,085 of 20,391 under locale-like paths. Raw sitemap counts overstate distinct content on multilingual sites.

## Inventory by site

| Domain | Pages | Largest section | Leading type | Ranked rows (sample) | Per 1,000 pages |
| --- | --- | --- | --- | --- | --- |
| coursera.org | 25,000 | /learn (15,773) | academy (15,774) | 48 | 1.9 |
| intrepidtravel.com | 24,817 | /be (2,489) | other (23,315) | 2 | 0.1 |
| slack.com | 22,460 | /intl (17,870) | blog (14,105) | 45 | 2.0 |
| notion.com | 20,391 | /templates (2,804) | templates (17,217) | 50 | 2.5 |
| edx.org | 17,871 | /es (8,336) | academy (13,405) | 50 | 2.8 |
| auth0.com | 13,975 | /docs (6,811) | docs (6,996) | 45 | 3.2 |
| posthog.com | 11,954 | /forum (6,724) | other (7,871) | 48 | 4.0 |
| everlane.com | 9,683 | /products (9,298) | product (9,298) | 38 | 3.9 |
| vercel.com | 9,347 | /docs (2,498) | docs (2,717) | 48 | 5.1 |
| taskrabbit.com | 8,761 | /locations (6,725) | other (6,849) | 49 | 5.6 |
| railway.com | 8,286 | /deploy (7,712) | other (7,719) | 46 | 5.6 |
| stripe.com | 7,289 | /resources (3,572) | blog (4,122) | 42 | 5.8 |
| ikea.com | 3,624 | /ee (3,624) | other (3,624) | 0 | 0.0 |
| clerk.com | 3,401 | /docs (2,691) | docs (2,689) | 45 | 13.2 |
| gadventures.com | 2,997 | /trips (2,125) | other (2,335) | 50 | 16.7 |
| sentry.io | 2,585 | /answers (668) | other (1,211) | 49 | 19.0 |
| workos.com | 2,462 | /blog (1,090) | blog (1,091) | 50 | 20.3 |
| allbirds.com | 2,216 | /collections (1,349) | other (1,816) | 50 | 22.6 |
| temporal.io | 1,137 | /blog (454) | blog (689) | 39 | 34.3 |
| resend.com | 1,057 | /docs (423) | docs (422) | 46 | 43.5 |
| cloudflare.com | 1,017 | /learning (525) | other (537) | 45 | 44.2 |
| render.com | 927 | /docs (220) | blog (282) | 46 | 49.6 |
| firecrawl.dev | 850 | /blog (360) | blog (360) | 50 | 58.8 |
| qdrant.tech | 798 | /documentation (360) | docs (359) | 49 | 61.4 |
| modal.com | 719 | /docs (344) | docs (339) | 47 | 65.4 |
| pinecone.io | 629 | /community (182) | utility (191) | 50 | 79.5 |
| exa.ai | 405 | /docs (168) | docs (164) | 4 | 9.9 |
| browserbase.com | 397 | /blog (166) | blog (166) | 50 | 125.9 |
| basecamp.com | 317 | /gettingreal (92) | other (271) | 36 | 113.6 |
| better-auth.com | 215 | /docs (195) | docs (194) | 50 | 232.6 |
| tavily.com | 188 | /blog (83) | blog (83) | 41 | 218.1 |
| e2b.dev | 115 | /resources (76) | blog (78) | 24 | 208.7 |
| duolingo.com | 103 | /course (40) | academy (42) | 25 | 242.7 |
| trychroma.com | 80 | /blog (13) | other (25) | 36 | 450.0 |
| box.com | unavailable | — | — | — | — |
| daytona.io | unavailable | — | — | — | — |

## Three shapes of content strategy

**Docs-led.** Auth0 (6,996 docs), Vercel (2,717), Clerk (2,689), then Resend, Qdrant, Modal, Exa and Better Auth. Documentation is the product's surface area, and the sitemap is mostly `/docs`.

**Editorial-led.** Slack (14,105 blog URLs, mostly locale mirrors), Render, Temporal, Firecrawl, WorkOS, Tavily, E2B. These publish to be found, not to explain the API.

**Catalogue-led.** Coursera and edX (academy pages), Notion (17,217 templates), Everlane (9,298 product pages), IKEA, Allbirds. The sitemap is inventory, not argument.

## Which sections actually earn rankings

Sections with at least 50 pages and at least five ranked rows in the sample, ordered by ranked rows per 1,000 pages:

| Domain | Section | Pages | Ranked rows | Per 1,000 pages |
| --- | --- | --- | --- | --- |
| taskrabbit.com | /services | 105 | 31 | 295.2 |
| pinecone.io | /learn | 158 | 40 | 253.2 |
| workos.com | /guide | 84 | 16 | 190.5 |
| better-auth.com | /docs | 195 | 37 | 189.7 |
| modal.com | /blog | 155 | 24 | 154.8 |
| everlane.com | /collections | 296 | 36 | 121.6 |
| render.com | /blog | 115 | 13 | 113.0 |
| posthog.com | /product-engineers | 54 | 6 | 111.1 |
| firecrawl.dev | /blog | 360 | 36 | 100.0 |
| resend.com | /handbook | 66 | 6 | 90.9 |
| clerk.com | /blog | 193 | 15 | 77.7 |
| tavily.com | /blog | 83 | 6 | 72.3 |
| modal.com | /gpu-glossary | 86 | 6 | 69.8 |
| render.com | /docs | 220 | 14 | 63.6 |

By whole site, the same measure separates sites that rank per page from sites that publish at scale:

| Domain | Pages | Ranked rows | Per 1,000 pages | |
| --- | --- | --- | --- | --- |
| trychroma.com | 80 | 36 | 450.0 | most efficient |
| duolingo.com | 103 | 25 | 242.7 | most efficient |
| better-auth.com | 215 | 50 | 232.6 | most efficient |
| tavily.com | 188 | 41 | 218.1 | most efficient |
| e2b.dev | 115 | 24 | 208.7 | most efficient |
| ikea.com | 3,624 | 0 | 0.0 | least efficient |
| intrepidtravel.com | 24,817 | 2 | 0.1 | least efficient |
| coursera.org | 25,000 | 48 | 1.9 | least efficient |
| slack.com | 22,460 | 45 | 2.0 | least efficient |
| notion.com | 20,391 | 50 | 2.5 | least efficient |

Read it with the denominators in view. `trychroma.com` (80 pages) and `duolingo.com` (103 pages) are small sites where a handful of head terms dominate. `intrepidtravel.com` (24,817 pages, 2 sampled rows) and `coursera.org` (25,000 pages, 48 rows) are catalogue sites whose sitemaps are mostly templated inventory — the sample says their long tail is not in the head-term index, not that nothing ranks.

## What the pages are about

A stratified sample of 30 URLs per site (drawn from the five largest sections) was read with Parallel Extract, 979 pages in total, asking what each page covers and which content type it is. Topic words below come from page titles and excerpts; they describe vocabulary, not quality.

| Domain | Pages read | Recurring topic words |
| --- | --- | --- |
| cloudflare.com | 30 | name(10) type(10) context(10) string(5) products(5) access(4) case(3) security(3) |
| vercel.com | 30 | docs(8) changelog(5) agents(5) blog(4) ai-gateway(4) connect(4) apps(4) application(3) |
| railway.com | 30 | deploy(10) agents(9) agent(8) claude(6) terminal(5) deployment(4) changelog(4) product(4) |
| modal.com | 30 | docs(9) gpu-glossary(8) model(7) device-software(6) examples(5) device-hardware(5) qwen(4) playground(3) |
| browserbase.com | 30 | browser(9) agents(5) blog(4) document(4) moved(4) agent(4) redirecting(3) stagehand(3) |
| clerk.com | 30 | authentication(6) docs(5) changelog(4) react(4) user(3) application(3) introducing(3) blog(3) |
| workos.com | 30 | changelog(6) docs(5) access(5) hiring(5) blog(4) developer(4) providers(3) scim(3) |
| auth0.com | 30 | identity(7) authentication(6) button(6) kontaktieren(6) features(5) architektur-playbooks(5) bereitstellen(5) platform(4) |
| trychroma.com | 30 | chroma(18) engineering(8) building(5) distributed(5) storage(4) anton(3) careers(3) research(3) |
| pinecone.io | 30 | blog(10) learn(7) building(5) vector(5) database(3) contact(3) serverless(2) build(2) |
| resend.com | 30 | email(7) product(5) data(3) docs(3) create(2) users(2) dashboard(2) curl(2) |
| qdrant.tech | 30 | documentation(8) cloud(7) vector(7) course(7) multi-vector(6) multi-vector-search(5) quickstart(3) tutorials-operations(3) |
| firecrawl.dev | 30 | blog(10) alternatives(7) category(5) data(5) introducing(4) agent(3) agents(3) tools(3) |
| exa.ai | 30 | blog(10) agent(8) docs(6) exa-agent-ultra(4) library(4) index(3) site(3) academic(3) |
| tavily.com | 30 | blog(9) agents(6) agent(6) certification(5) community(5) events(5) tavilyai(4) customers(4) |
| stripe.com | 30 | business(5) careers(5) manager(4) payments(3) atlas(3) access(3) customers(3) payment(2) |
| temporal.io | 30 | blog(15) community(12) changelog(12) resources(10) partners(7) workflow(5) categories(4) cloud(4) |
| sentry.io | 30 | cookbook(7) seer(4) product(4) agent(4) autofix(4) blog(4) customers(4) monitoring(4) |
| posthog.com | 30 | pricing(8) forum(7) posts(6) following(5) post(5) blog(5) docs(4) agents(4) |
| basecamp.com | 30 | chapter(10) gettingreal(7) getting(7) real(7) shapeup(5) shape(5) project(4) blog(4) |

What the sample shows, by strategy:

- **Docs-led sites publish recipes, not reference alone.** Vercel's sampled docs are integration guides and tool schemas (LiteLLM with AI Gateway, MCP toolbar tools, cron management); Clerk's are React/authentication how-tos; WorkOS mixes SCIM and directory-sync guidance with changelog entries. The pages that rank are task-shaped.
- **Cloudflare's `/learning` is an education surface.** The sample is glossary explainers (anycast and DDoS, what an LLM is) plus customer case studies — 26 of 50 sampled rankings land there, and the words in those pages are mechanism explanations, not product claims.
- **Stripe's `/resources/more` is a business-content library.** Sampled pages answer “how much does it cost to register a business name” and “five key benefits of payment gateways” — top-of-funnel guides rather than product documentation. Its sitemap also carries `/careers` listings, a reminder that inventory counts include pages no one is trying to rank.
- **Railway's `/deploy` is a template catalogue.** Sampled pages are one-click deployments (LocalAI, Dittofeed) with a changelog alongside. That explains 7,712 URLs with the weakest sampled rank efficiency: the pages exist to be copied, not read.
- **Catalogue sites read as inventory.** Coursera and edX samples are course pages with discount banners; Notion's are templates; Everlane's are product listings. High page counts, low sampled rank density.
- **Locale contamination is visible in the text too.** Auth0's sample returns German feature and contact strings, matching the earlier finding that a fifth of its URLs sit under locale paths.

## What remains

- `box.com` and `daytona.io` need a different access path for their sitemaps (browser-like user agent or a documented sitemap URL); they are reported as unavailable rather than estimated.
- The content sample covers 30 URLs per site, which is enough for vocabulary and content type, not for a full topic map. A bigger pass (all sampled sections, 200+ URLs per site) would cost about $7 and could be scheduled.

## Reproduce

```sh
# inventory only — free
node --conditions=react-server --import tsx scripts/site-profile.ts --directory

# ranking rows — two provider tasks per domain
set -a; . .dev.vars; set +a
node --conditions=react-server --import tsx scripts/ranking-report.ts --directory

# join without spending again (reads cached ranking JSON by default)
node --conditions=react-server --import tsx scripts/site-profile.ts vercel.com

# what the pages are about — Parallel Extract, $1 per 1,000 URLs
PARALLEL_API_KEY=... node --conditions=react-server --import tsx scripts/content-profile.ts --directory
```

Local run: 36 domains ranked for **$1.42** of provider cost and 979 pages content-sampled for about **$1.08**. Profiles and cached provider responses stay in ignored `.local/` storage; nothing here is published automatically, and none of it changes `readiness-v1` scores or the public dashboard.
