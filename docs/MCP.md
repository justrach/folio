# Folio MCP and sandbox SEO

Folio serves authenticated Streamable HTTP at `/api/mcp` in its existing Next.js/Cloudflare Worker. It uses the official MCP SDK Web Standards transport, with a new stateless server per request. No separate service or Durable Object is required. `/docs/api` has client setup examples and key management.

## Connect a coding client

The **Connect your agent** panel (on `/agents#connect` and every organization page) does this step by step: pick a client, approve its access on a consent card (`src/components/connect-consent.tsx`), add Folio to the client in one step where the client allows it, watch a status box turn green when the key makes its first call, then paste a starter prompt. Approving creates the key (shown once, masked on screen). The step to do next is highlighted (`onboardingProgress`). Setups for clients that can't read `FOLIO_API_KEY` show a `<your Folio key>` placeholder; once a key is created on the page, their copy buttons fill it in (`withKey`), while the screen keeps the placeholder or a masked key. Its snippets, permission guide and troubleshooting come from `src/lib/agent-onboarding.ts`; a unit test keeps the permission guide in step with each tool's scope here.

Setups shown there, each checked on 11 November 2026 against production with a temporary read key (since deleted):

| Client | Setup | Check | Result |
| --- | --- | --- | --- |
| Claude Code | `claude mcp add --transport http --scope user folio https://usefolio.site/api/mcp --header "Authorization: Bearer $FOLIO_API_KEY"` | `claude mcp list` | `✔ Connected` |
| Claude Code, shared | the `.mcp.json` below, committed; each person sets `FOLIO_API_KEY` | `claude mcp list` | Pending approval, then `✔ Connected` |
| Codex | `codex mcp add folio --url https://usefolio.site/api/mcp --bearer-token-env-var FOLIO_API_KEY` | `codex mcp list` | Writes exactly the `config.toml` below |
| Cursor | `.cursor/mcp.json` with `"Authorization": "Bearer ${env:FOLIO_API_KEY}"` | `cursor-agent mcp list-tools folio` | All 19 read tools |
| Claude Desktop | `npx -y mcp-remote https://usefolio.site/api/mcp --header "Authorization:${FOLIO_AUTH}"`, with `FOLIO_AUTH` in the server's `env` | run through Claude Code's stdio loader | `✔ Connected` |
| VS Code | `.vscode/mcp.json` with a `promptString` input for the key | not run here | follows VS Code's documented format |
| Manus | Connectors → Create → custom MCP server by URL: name `folio`, URL `https://usefolio.site/api/mcp`, Bearer token = the key | ask a Manus task to list the folio tools and call `folio_organizations` | not run here: no Manus account; follows Manus's documentation |

Manus runs in the cloud, so its URL is always a public `https://` address: when the panel is open on `localhost` or plain `http`, it shows `https://usefolio.site` instead (`reachableOrigin`). If Manus's servers send an `Origin` header, the MCP route's origin check will refuse it with 403 `Untrusted MCP origin`; that has not been observed, because the setup has not been run.

### Approving access

The consent card shows who is asking ("Connect Cursor to Folio"), the signed-in account (with **Switch account**), and two choices:

- **Permissions**: *Read only* or *Read & record changes*. Paid actions (start evaluations, paid search lookups) are folded away and say they charge.
- **Organizations**: *All* (every organization the person is in, now and later) or *Select* (only the ones picked). The person's own websites are always readable. The choice is stored on the key as `organization_ids_json` (migration `0030`; NULL means all, which every older key keeps). `folio_organizations`, `folio_find` and `folio_website_gaps` apply it. A shared website outside the chosen organizations answers `not_found`, so a limited key can't tell what the others share. `POST /api/agent-keys` takes the same choice as an optional `organizations` array of IDs, each checked against the person's memberships.

### One-step install

After approval, step 3 offers the quickest way each client supports (`installAction` in `src/lib/agent-onboarding.ts`). Manual setup stays under **Or set it up by hand**.

| Client | One step | Holds the key? | How it was checked |
| --- | --- | --- | --- |
| Cursor | **Add to Cursor**: `cursor://anysphere.cursor-deeplink/mcp/install?name=folio&config=<base64 JSON>` | Yes, so it waits for the key and opens from a button (never shown as a link) | Cursor's documented format; read back from Cursor 3.27's handler (`atob` then `JSON.parse`); not clicked in Cursor |
| VS Code | **Add to VS Code**: `vscode:mcp/install?<JSON>` with a `promptString` input; VS Code asks for the key and stores it | No | VS Code 1.138's handler parses `name`, `type`, `url`, `headers` and `inputs`; not clicked in VS Code |
| Claude Desktop | **Download for Claude Desktop**: `/api/agent-setup/claude-desktop` serves `folio.mcpb`, an extension (manifest 0.3) whose only setting is the key (`sensitive`, so Claude masks it) | No, it is the same file for everyone | `mcpb validate` passes; its stdio bridge ran against production (initialize, the 167 KB tool list, `folio_organizations`, prompts; an unknown key gets a readable error); not installed in Claude Desktop yet |
| Claude Code | One command to paste: `claude mcp remove --scope user folio`, then `claude mcp add … --header "Authorization: Bearer <key>"` | Yes, masked on screen | Run twice in a throwaway home with the real CLI: replaces cleanly |
| Codex | One command to paste: exports `FOLIO_API_KEY`, appends it to the shell profile, then `codex mcp add folio --url … --bearer-token-env-var FOLIO_API_KEY` | Yes, masked on screen | Run twice in a throwaway home with the real CLI |

Claude Code and Codex have no install links, so a single command is their one step. The Claude Desktop bridge (`BRIDGE_SCRIPT` in `src/lib/claude-desktop-extension.ts`) needs nothing installed: Claude Desktop runs it with its own Node.js. It sends `initialize` first and then the rest side by side, carrying the session and protocol version. A connection that fails before anything is sent is tried once more; it never logs the key.

Claude.ai and ChatGPT web connectors need OAuth sign-in, which Folio does not offer yet. It is the next step: the same consent card behind an OAuth authorize page.

Manual setup: create a revocable Folio key in `/docs/api#api-keys`. Store it in the client environment as `FOLIO_API_KEY`, never in a committed configuration. Keys inherit the exact issuing account's record ownership. Select `read` for saved evidence, optionally `evaluate` for paid evaluations, `seo` for paid DataForSEO lookups and `changes` to record website changes (no charges). Existing evaluation keys do not acquire SEO permission. Account provider access and quotas still apply.

Codex `config.toml`:

```toml
[mcp_servers.folio]
url = "https://usefolio.site/api/mcp"
bearer_token_env_var = "FOLIO_API_KEY"
```

Claude Code MCP configuration (environment substitution):

```json
{
  "mcpServers": {
    "folio": {
      "type": "http",
      "url": "https://usefolio.site/api/mcp",
      "headers": { "Authorization": "Bearer ${FOLIO_API_KEY}" }
    }
  }
}
```

For local coding clients use `http://localhost:3001/api/mcp`. Remote sandboxes require a deployed public HTTPS endpoint. This is bearer-key authentication, not an OAuth authorization server. Requests authenticate before protocol handling; cookie sessions alone cannot access MCP. Revocation applies on the next request. Browser requests must have the deployment's exact Origin. Keys are limited to 60 requests per minute.

| Tool | Permission | Behavior |
| --- | --- | --- |
| `folio_targets` | read | Owned website and question IDs |
| `folio_find` | read | Find your websites, organizations and saved reports by name or domain, with the IDs other tools take; opens the Folio app in hosts that support MCP Apps |
| `folio_organizations` | read | Your organizations, teammates (names and roles), how many agents each has connected, and the websites shared with each |
| `folio_website_gaps` | read | One website you saved or that is shared with your organization: where it shows up on Google and in AI answers, what it is missing, and what has not been checked |
| `folio_index` | read | The complete published dataset in one response (about 5 MB); prefer the four tools below |
| `folio_index_overview`, `folio_index_search`, `folio_index_answer`, `folio_index_website` | read, or no key at `/api/index-mcp` | Compact, paged reads over published answers |
| `folio_index_pages` | read (key required) | Semantic search over the pages Folio has crawled, with a labelled word-match fallback |
| `folio_observation`, `folio_run` | read | Saved evidence and status |
| `folio_visibility` | read | Owned site's saved metrics and next steps |
| `folio_seo_reports` | read | List or read owned saved SEO reports |
| `folio_changes` | read | Recorded changes with the answers before and after |
| `folio_change_record`, `folio_change_update` | changes | Record a change and its baseline; report publication or withdraw |
| `folio_seo_lookup` | seo | Explicit paid domain overview |
| `folio_evaluate` | evaluate | Reuse recent/active work or start an evaluation |
| `folio_reconcile` | evaluate | Retrieve an existing remote run; enforce its deadline |

Only permitted tools are advertised. Paid calls require `confirmSpend: true` and a stable `requestKey`. A useful coding-client request is: “Inspect my website's saved SEO and visibility evidence with Folio, then propose and test changes in this repository.” Folio supplies evidence; the coding client's own tools perform local edits. No tool claims to publish or improve search position automatically. Fresh SEO may query a public domain without saving a website first.

## What a website is missing

`folio_website_gaps` takes one `websiteId`: one of yours (from `folio_targets`) or one shared with an organization you belong to (from `folio_organizations`). It returns the same report shown on `/websites` and on the organization page under **Where it shows up**, also served to the signed-in reader at `GET /api/sites/{id}/visibility`. A shared website shows the saved reports of the member who shared it, and `website.access` says `organization`. It reads saved data only (`src/lib/website-gaps.ts`) and never calls a provider or charges. Each call is saved as one line of the caller's agent activity (`agent_index_asks`), which teammates see for shared websites.

- `summary`: one plain-English sentence per source.
- `search`: the latest saved DataForSEO lookup that returned data. A newer lookup that returned nothing does not hide it. Each count is `value`, `none` (the provider has no data for the domain, which is not a failure) or `missing`.
- `google`: the latest recorded US Google positions for the searches Folio tracks (`research.rankings_latest`), with position bands, which searches contain the brand name, and the brand's share of their estimated visits. `unavailable` on a database without the `research` schema.
- `aiAnswers`: where Folio's published answers name or cite it, the indexed questions that mention its brand or a phrase it ranks for (answered or not), and the owner's own saved questions for this website.
- `crawl`: pages Folio has read against the sitemap inventory, and its largest sections.
- `gaps`: rules applied to those numbers, each with `severity`, a `finding`, a `nextStep` and `evidence` links: no Google rankings, big searches just off page one, most visits coming from the brand name, few linking websites, many broken backlinks, published answers on its topics that leave it out, and the owner's answers that leave it out.
- `sources`: where each kind of number comes from, with its provider, date and kind: `google` (Google's own count), `estimate` (a third party's model), `third_party` (a third party's record or crawl) or `folio` (recorded by Folio). Search volumes, Google positions, visits and links all come from DataForSEO.
- `googleCheck`: the search-visits estimate beside Google's own clicks, from the owner's newest Search Console snapshot for the whole domain (a domain property, or a URL-prefix property at its root). It compares US clicks with the US-only estimate when the snapshot has them (imports from 11 November 2026), otherwise all-country clicks with a note. `ratio` is Google's monthly clicks divided by the estimate. Teammates reading a shared website get `owner_only`: Google's numbers stay the owner's. `caveat` cites Ahrefs's published measure of how far such estimates miss. See [Data sources](DATA-SOURCES.md).
- `notChecked`: unknowns kept apart from findings, such as indexed questions that were never answered, no saved lookup, or a small share of pages read. An agent should treat these as unmeasured, not as problems.

The `improve_aeo` prompt now starts with this tool.

## The Folio app (MCP Apps)

Hosts that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) (Claude Desktop, VS Code with GitHub Copilot, Goose and others) show Folio inside the conversation when an agent calls `folio_find` or `folio_website_gaps`. Both tools carry `_meta.ui.resourceUri: "ui://folio/workspace.html"`, along with the deprecated flat `ui/resourceUri` key that some hosts still read. The host reads that resource with `resources/read`. Hosts without MCP Apps get the same JSON as before.

How it is built:
- `@modelcontextprotocol/ext-apps` 1.7.5 is a runtime dependency. The server registers the two tools with its `registerAppTool` and the page with `registerAppResource` (`src/lib/folio-mcp.ts`).
- The page's source is `src/mcp-app/` (TypeScript, HTML and CSS). It runs on the package's `App` class, which handles the `ui/initialize` handshake, theme and style variables, and auto-resizing.
- `bun run app:build` (`scripts/build-folio-app.ts`) bundles it with the package's prebuilt `app-with-deps` entry into one self-contained `text/html;profile=mcp-app` page, written to `src/lib/folio-app.generated.ts` (about 330 KB). A unit test fails if that file is out of date with `src/mcp-app/`.
- Version 2 of the package needs the 2.x MCP SDK packages; Folio uses `@modelcontextprotocol/sdk` 1.30, so it stays on the 1.x line.

What the person can do in it:
- Search their Folio (`folio_find`).
- Open a website's **Where it shows up** report (`folio_website_gaps`) or an organization's shared websites (`folio_organizations`).
- Open a saved report or an evidence link in Folio. This goes through the host's `ui/open-link`.
- Press **Ask my agent to fix this** on a gap. This sends the agent a `ui/message` that names the gap and asks it to propose edits and wait for approval.

When the person opens a report inside the app, the app also sends `ui/update-model-context`, so the agent knows what they are looking at. The report includes **Where these numbers come from** (below).

Boundaries:
- The page has no network access of its own. It declares no CSP domains, so hosts apply their no-network default.
- Every read is a `tools/call` that the host makes with the person's own key, and it may call only those three read tools. A unit test checks this.
- It renders report text with `textContent` only; Folio's page code has no `innerHTML`, and neither does the bundle.
- The no-key endpoint (`/api/index-mcp`) has no app.

`folio_find` returns names, IDs, dates and a link back to Folio for each match. It reads only the caller's own records and their organizations, and it is not saved to agent activity.

Testing:
- `tests/folio-app.spec.ts` runs the page against the official host bridge (`AppBridge` from the same package), which validates every message against the spec's schemas.
- The page has not yet been run in Claude Desktop or VS Code themselves.
- Claude Desktop reaches Folio through `mcp-remote`, which passes `_meta` and resource reads through unchanged. Claude.ai's web connectors still need OAuth.

## Organizations

Anyone signed in can create an organization at `/orgs` or join one with an invite link (`src/lib/organizations.ts`, migration `0028_organizations.sql`). Owners create links (14 days, up to 25 uses, revocable; only a hash is stored, and the secret travels in the URL fragment and request bodies, never a logged path), remove members and promote or demote owners; an organization always keeps an owner, and the last member leaving deletes it. Any member can share a website they saved; it stays theirs, and members read its saved reports. A member who leaves or is removed takes their shared websites with them.

Each member connects their own agent with their own key. `folio_organizations` first joins any organization whose owner added the caller's email (only when Google or GitHub verified it, as on `/orgs`), then lists the caller's organizations, teammates' names and roles (not emails), how many agents each has connected, and the shared websites' `websiteId`s; `folio_website_gaps` then reads any of them. The organization page shows each member's active keys by name and last use, and the agent reads of shared websites; asks about other websites stay private. Other tools (`folio_visibility`, `folio_page_evidence`, paid tools) still act only on the caller's own records. There are no per-member credit budgets yet. A walkthrough for presenting this is in [Manus demo](MANUS-DEMO.md).

## Ask the published index

The published index is the public set of saved AI answers to buyer questions shown at `/leaderboard` and `/overview`. Four tools read it in small pages, so an agent does not have to load the full dataset:

- `folio_index_overview`: counts, last update, and every audience/category with its published-answer count.
- `folio_index_search`: `q` (words), `category`, `audience`, `domain`, `status` (`published` by default, or `all` to include questions with no answer yet), `limit` (1–25) and `cursor`. Each row has the question, its top five recommendations by returned position, and a `page` path that opens the same answer in Folio. Matching is by words over the question, its category and the names and hosts in its latest answer; a question must contain at least half of the search terms, and words found in the question itself rank first. It is not semantic search.
- `folio_index_answer`: one `queryId` with its full latest answer (ordered recommendations, reasons, citations, limitations) and the IDs of older observations. A question with no published answer returns `answer: null`, which is unmeasured, not empty.
- `folio_index_website`: one `domain` (a bare host or any URL). Reports where it is named or cited, its average and best returned position, the categories, the websites named beside it, and its homepage `readiness-v1` result when the catalog has one. A website matches when a recommendation or citation URL host equals the domain or is a subdomain of it; a mention with no URL is not matched by name. `not_in_published_answers` means it was not named in these saved answers, not that it was measured as absent elsewhere.

Two ways to connect:

| Endpoint | Key | Tools | What is saved |
| --- | --- | --- | --- |
| `/api/index-mcp` | none | the four index tools only; no prompts | Nothing about the request. A salted per-address counter limits it to 60 requests a minute and is cleared after an hour unused. |
| `/api/mcp` | Folio key with `read` | the index tools plus the workspace tools | The first page of each search, answer read and website lookup is saved to the key owner's account and shown under `/agents` as **What your agents asked**. |

```sh
claude mcp add --transport http folio-index https://usefolio.site/api/index-mcp
```

The no-key endpoint accepts `POST` only; `GET` and `DELETE` return `405`, so it holds no open streams or sessions. A browser request from another origin is refused.

The saved ask holds the tool, the agent's search text (up to 200 characters), the domain or question ID, a result count and a one-line summary. It holds no answer text. The newest 500 asks per owner are kept. Each result reports `recorded`, so an agent can tell whether its ask was saved; a failed save never fails the read. Results also report `source`: `live-published-data` normally, or `bundled-snapshot` when shared publications could not be read and only the artifacts shipped with the app were used.

### Crawled pages (key required)

The crawled index is the `research` schema in the application's Postgres database: page titles and excerpts, one profile per website, and its sitemap sections. Folio reads it directly and read-only. Only the semantic page search leaves the database: one embedding request and one vector query per search.

- `folio_index_pages`: `q` (a natural-language question or words), optional `domain`, `limit` (1–25). Returns pages with `url`, `title`, `domain`, `section`, an excerpt of at most 400 characters, `fetchedAt` and `score`.
  - **Semantic first.** The app does this itself (`src/lib/page-vectors.ts`): it embeds the question with `gemini-embedding-2` at 768 dimensions through the Codegraff gateway (`https://gateway.codegraff.com/v1/embeddings`), the model the page vectors were built with, then asks turbopuffer (`folio-pages`) for the nearest pages. `mode` is `semantic` and `score` is cosine similarity (higher is closer). Scores matched the index service's to three decimals for the same questions. This needs `CODEGRAFF_API_KEY` and `TURBOPUFFER_API_KEY` on the server. Each search is one embedding request (about ten tokens) and one vector query, so the search text leaves Folio for the Codegraff gateway and the Google embedding model behind it. The embedding took 0.5–1.2 seconds in 16 timed requests and the vector query 0.2–0.7 seconds in 40. A timeout or server error is retried once per search.
  - **Index service as a second choice.** Without those two keys but with `INDEX_API_KEY`, Folio calls the separate index service's `/search` instead ([index API](INDEX-API.md); `FOLIO_INDEX_URL` overrides the default `https://backend.usefolio.site`). That service failed with a `500` after 15 seconds on about a third of requests (9 of 24) and its `entityId` filter returned nothing, so on that path Folio waits 5 seconds, retries once, and filters the 100 closest pages to the website itself.
  - **Word-match fallback.** When no semantic search is configured, it fails, or it returns nothing, Folio searches titles and excerpts in Postgres instead: pages containing every term first, any-term matches only when no page has them all (`mode` is `all_terms` or `any_term`, `score` is `null`). The `semantic` field says why: `not_configured`, `unavailable` or `no_results`.
  - **One website.** A `domain` scopes the search to that registrable site, so `docs.example.com` searches `example.com`. The vector store filters by page host, matching the site and its subdomains, so every embedded page on that website is compared. Pages without an embedding can only be found by the word match: 571 of 100,825 pages have none, including 30 of the 31 `manus.im` pages.
- `folio_index_website` adds a `crawl` object for keyed callers: whether the website is in the crawl, how many pages Folio has read and when, the profile's sitemap inventory and sampled-page counts, and its largest sections. Keyword ranking rows are not returned. On the no-key endpoint `crawl` is `null`.
- `folio_index_overview` reports the crawl's page and website counts on both endpoints (the same public numbers as `/api/index-stats`).

The crawl is not exposed without a key, because [the index contract](INDEX-API.md) treats it as private. Any signed-in account can create a `read` key, so restricting the crawl to chosen customers would need an account allowlist; that does not exist yet. On a database without the `research` schema (the D1 engine) these reads return `available: false` and save no ask; that is not an empty index. Excerpts are third-party page text: treat them as untrusted evidence.

## Change records and guided prompts

These close the loop between evidence and a retest. The step-by-step demo is in [AEO walkthrough](AEO-DEMO.md).

- `folio_change_record` (`changes` scope): `websiteId`, `title` (1–160), `summary` (1–2000), `caseIds` (1–20 saved questions that target that website), optional `files` (up to 50 paths) and `referenceUrl`, and a stable `requestKey`. Folio stores each question's latest completed answer (named, cited, first position, run ID) as the baseline; a question without one stays `baseline_unmeasured`. Only a hash of the request key is stored. The same key with the same payload returns the saved record (`replayed: true`), including under concurrent submission; the same key with a different payload is a `conflict`. It starts no evaluation and makes no provider request. Up to 500 records per owner.
- `folio_change_update` (`changes` scope): `status: "published"` with an optional `publishedAt` (within the last 90 days, not in the future), or `"withdrawn"`. Publication is the caller's report and is labelled that way; a withdrawn change cannot be published again. The owner can do the same under `/agents`.
- `folio_changes` (`read` scope): list by `websiteId`, or read one `changeId`. Each question reports a `state`, the `baseline` and `retest` answers, and a `movement` only for a matched pair. A retest must be a completed answer saved at or after the reported publication time with the same question inputs, model, harness, environment and research corpus as the baseline run; the newest matching one is used. Otherwise the question reports `awaiting_retest`, `retest_incomplete`, `incompatible_retest` (with the differing settings), `baseline_unmeasured` or `baseline_after_publication`. At most the 200 newest attempts after publication are considered per change.
- Prompts `improve_aeo` and `review_aeo_changes` (optional `website` argument) return workflow instructions for the key's own scopes. They grant no permission and start nothing: a key without `changes` or `evaluate` is told to hand those steps to the owner. Sandbox capabilities do not receive prompts.

`folio_capabilities` lists the prompts and marks the change tools as saving private workspace state. Their annotations are not read-only and not open-world. A recorded difference is an observation of saved answers, never a causal or ranking claim.

## Paid SEO and retry behavior

`POST /api/v1/seo` provides the same lookup through REST. Send `{ "domain": "example.com", "confirmSpend": true }` and `Idempotency-Key` (8–128 permitted ASCII identifier characters). `GET /api/v1/seo` lists saved reports; `?reportId=...` reads one owned report without a provider request.

One overview calls two fixed DataForSEO endpoints: Google US/English organic overview and live backlink summary. Partial outcomes, timestamps and unknown costs remain visible. Twenty overview reservations per hour are shared with browser lookups. A D1 transaction records the request identity, pending report and quota reservation before provider calls. Concurrent retries share the same receipt. Lost responses and pending/partial/error outcomes are never retried with a new provider POST. If saving fails after a response, retain the returned report; a replay may still show the earlier pending record.

## Managed sandbox tool

Enable search and backlinks in a selected open-web keyword question's run settings, or send `useSeoTools: true` through the evaluation API/MCP. API keys need both `evaluate` and `seo`. The saved question must have a public target website. Configure `FOLIO_MCP_URL=https://usefolio.site/api/mcp` on the server and apply migration `0013_seo_agent_tools.sql` to the same D1 database before use.

Folio issues a random, hashed, short-lived capability tied to that exact owner, run and domain before the session-create attempt. Version-1 grants expose only `folio_sandbox_seo`, with no user-controlled arguments. New version-2 grants also expose `folio_keyword_research` with a seed argument and a three-request cap. The first call reserves one overview; repetitions reuse its report. Capabilities expire within five minutes or the run's deadline, whichever is earlier, and stop authenticating after cancellation intent, hold release or terminal status. The managed Agents API receives the capability only in service-origin HTTP MCP transport authorization. Shell networking remains disabled; DataForSEO credentials remain on Folio's server. Read/navigation/reconciliation does not grant permission for a new lookup.

SEO-enabled observations use a distinct harness version and configuration fingerprint; they cannot silently reuse ordinary benchmark results or enter the standard public benchmark exporter. Provider GET reconciliation remains unchanged.

## Validation boundary

Automated tests cover a real MCP SDK client, tool schemas/scopes, real Miniflare D1 concurrency, shared quota, owner isolation, capability hashing/expiry, sandbox payload, and browser opt-in. Provider responses are fixtures. Hosted MCP connectivity, real DataForSEO execution inside a managed session and production deployment require separate validation; passing local tests does not establish them.

Protocol references: [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk), [OpenAI service-origin MCP](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Codex MCP](https://developers.openai.com/codex/mcp).

## Saved evidence tools (September MCP follow-up)

All of these operations read exact-owner saved records without provider requests:

- `folio_targets`: use `kind: "website"` (default) or `"keyword"`, optional website/suite/search-mode filters, `limit` (1–100) and `cursor`. Results use `items`, `nextCursor` and `truncated`.
- `folio_observation`: `run`/`compatibleRun` preserve strict current-configuration reuse semantics. `latestCompletedRun` independently exposes historical evidence; `currentAttempt` retains active work, while `latestAttempt` exposes the most recent saved run including failures/cancellations. `historyState` distinguishes no history, incomplete attempts, terminal-only attempts (`terminal_attempt`), incompatible history and stale results. Website evidence/history use the same normalized URL as evaluation creation. Paid reuse remains unchanged.
- `folio_observations`: up to 20 explicitly typed targets with per-item results/errors. Exact-run reads remain available through `folio_run`.
- `folio_run_history`: website/case/status/model/search-mode and inclusive `since`/exclusive `until` filters, stable pagination, completed and unresolved runs. `changedSince` selects saved updates and orders the cursor by update time. Retain the filter while paging; refresh with an overlapping time window and deduplicate by run ID/update timestamp to tolerate concurrent changes. This is not a durable event log and never reconciles remote work.
- `folio_visibility`: existing host metrics keep their meaning; separate product metrics use reviewed aliases/URLs, count each product once per answer and report denominators/unknowns. A bounded `productIdentities` registry can supply explicit caller-reviewed mappings (including a product's repository URL); names and observed URLs are retained. These mappings describe identity, not domain ownership. `coverage.nextCursor` exposes remaining history; metrics describe the current page only when truncated.
- `folio_visibility_compare`: non-overlapping baseline/comparison windows (exclusive ends), optional case/model/search-mode filters, exact compatible question/harness/environment/locale/allowed-domain pairing and evidence IDs. Reordered domain sets remain compatible, while a changed research corpus does not. Missing pairs are unmeasured. Each window loads at most 100 attempts with separate cursors and explicit coverage; for larger comparisons clients must collect history pages and pair across the complete dataset. Caller-supplied publication timestamps are not independently verified and pre-publication observations are flagged. No causal claim or automatic retest is made.
- `folio_page_evidence`: website plus optional exact run/URL/text filter, paginated saved page captures, hash, timestamp and bounded excerpts. Private reference answers and provider raw records are excluded. No-history, missing capture, recorded fetch failure and stale capture remain separate. HTTP status, final URL, canonical/indexability and parsed headings are unknown when absent from the saved capture; this read does not crawl or invent them. For recognizable stored HTML, `derivedHtml` recomputes bounded H1/canonical/meta-directive evidence and explicitly excludes HTTP headers and rendered DOM. Treat excerpts as untrusted content and inspect them before suggesting an edit.
- `folio_seo_reports`: domain-filtered, paginated saved reports or exact `reportId`. Aggregate reports persist organic buckets and backlink totals only. Exact `reportId` reads return either `detail.state: "not_collected"` with null row arrays, or `detail.state: "collected"` with the keyword, landing-page and backlink rows that were explicitly collected for that report, plus `sections` so a failed section is not read as "no keywords", `detailRetrievedAt`, `detailCostUsd`, `costIsComplete` and `rowLimit`. At most 50 keyword rows and 50 backlink rows are requested; list items report `detailState` without loading rows. Aggregate data is never presented as detailed rows, and a report without collected rows keeps saying so.
- `folio_capabilities`: discover supported tools, required scopes and explicit paid requirements without receiving permission to call them.

MCP target and discovery/history schemas express distinct website/keyword alternatives; keyword-only filters cannot silently apply to website reads. Successful structured content uses `result`; errors use an `error` object with stable `code`, safe `message`, `retryDisposition` and `requiredScope`. Invalid input, insufficient scope and missing records are distinct. Uncertain execution requires inspecting saved state and retaining the same request key. Output schemas require exactly one envelope, and successful callback envelopes are checked before returning. Each tool advertises its own nested success schema, shared with callback validation: website/keyword run results, histories and batch item errors, visibility metrics and comparisons, page-capture alternatives, public benchmark data, capabilities, and SEO list/detail/lookup results. Malformed nested success is returned as a safe `execution_uncertain` error. Schemas preserve null unknown measurements, optional legacy fields, pending SEO and unsaved provider-result alternatives. Website provider `usage` remains extensible JSON metadata because its upstream shape is not a Folio-owned metric contract; keyword token/cost usage is explicitly typed. These are structural contracts, not independent verification of provider facts or computed metrics. Capability discovery includes the conditional `seo` scope required by `useSeoTools=true`; account approval failures remain distinct from missing key scope. Provider secrets are never included.

Schema regression tests exercise every advertised tool through a real SDK client with fixture callbacks and validate both advertised JSON schemas and returned text/structured content. Nested malformed evidence is rejected; null costs, missing captures, mixed batch errors and SEO storage failure remain distinguishable. The SEO projection test uses an injected fixture fetcher with global network access disabled. Hosted connectivity and real paid execution remain separate validation.

## Public category collection operator

The separate public question collection now defines 100 questions for each of its 35 existing category labels (3,500 total). `scripts/expand-category-questions.py` documents the deterministic authoring grid: category-specific research topics combined with practical audience scenarios. These are question inputs, not measured outcomes. Existing observations are retained.

Provider writes now run one at a time, with at least 1.5 seconds after a response before the next write. Research sessions and GET polling remain parallel. Deadline reconciliation retrieves existing results before deciding whether an overdue session still needs cancellation. The operator-only `scripts/category-batch-recovery.ts` helper can attach a uniquely matched missing receipt using GETs: it checks run/case metadata, model, harness and network configuration against the frozen owner record, rechecks the live session, and uses the saved revision when updating D1. It does not retry creation, release holds, or treat an idle session as completed. These local fixes do not establish the cause or resolution of upstream 409/500 errors.

Receipt discovery runs at startup and at five-minute checkpoints after any provider cooldown. A checkpoint pauses new starts and drains current jobs under the existing exclusive runner lock before touching the saved queue. Discovery is bounded to 40 pages of 100 sessions and 90 seconds; incomplete pagination cannot establish a unique match and attaches nothing. The earlier 30-second budget was insufficient for an observed 49-second, 217-session listing. Already known receipts are reconciled with GETs only. Actual terminal evidence may free capacity; merely recovering a session ID does not. After the checkpoint the scheduler recomputes all owner usage against the same 20-slot ceiling. Exhausted capacity triggers one final safe checkpoint before stopping if capacity remains unavailable. An upstream circuit-breaker stop is not reset by recovery.

GET-only diagnosis of five held sessions found exact matching receipts with provider state `idle`, no required actions, zero turns and zero items. These are unresolved initial submissions, not outstanding owner/tool requests or completed results. Reconciliation preserves that distinction and does not send a deadline cancellation when no turn exists. The provider must resolve the original submission or establish its outcome; sending another message to an idle session starts new work, as described in the [session guide](https://developers.openai.com/api/docs/guides/agents-api/sessions), and is not an automatic recovery path. Unknown costs and capacity holds remain intact.

`node --conditions=react-server --import tsx scripts/run-category-batch.ts --publish` prepares the resumable private queue and exports only validated saved public-query answers. Adding `--confirm-spend` executes the explicitly authorized batch with at most 20 concurrent owner runs, including pre-existing holds. It uses the preselected operator account, whose daily exemption is checked, and a bounded 100-suite allowance only for these operator calls. Browser defaults and other owners remain unchanged. Queue identity is immutable; prior D1 attempts are never recreated. The adaptive scheduler starts at five workers and adds three after healthy receipts and 30-second intervals, up to the available portion of the 20-slot ceiling. Creates are staggered by at least 1.5 seconds. HTTP 409/429/5xx or ambiguous creation reduces concurrency and applies a cooldown before different unstarted questions; it never retries the affected question. Three upstream failures in five minutes, access denial, invalid provider requests, exhausted retained capacity or persistence uncertainty stop new work for review. Unresolved outcomes retain their active capacity. Upstream error bodies are bounded to64KiB and retained only in ignored private diagnostics. Use --max-new=N for a bounded subset of still-unstarted questions, --workers=N to lower the ceiling, and SIGUSR2/SIGTERM/SIGINT to drain confirmed/in-flight tasks gracefully without starting replacements. A running process holds `.local/category-batch/runner.lock`; inspect that PID before recovering a stale lock. Raw receipts and the resumable manifest remain ignored and private. Public artifacts contain only the existing sanitized projection, never session IDs or account details.

## Keyword research

`folio_keyword_research` supports website planning with DataForSEO related terms and volume estimates. General clients supply `domain`, `seed`, `requestKey`, and `confirmSpend:true` with SEO scope; managed Luna tasks receive a versioned selected-website capability. See [keyword research](KEYWORD-RESEARCH.md).
