# Public Folio setup

Production deployed and checked in Chrome on 13 September 2026. The intended public application is `https://usefolio.site`; public support/privacy contact is `support@usefolio.site`. Resource creation, application deployment, Google configuration, and end-to-end verification are separate steps.

## Verified resources

| Resource | Current state |
| --- | --- |
| Cloudflare zone `usefolio.site` | Active in the authenticated Wrangler account; nameservers `dora.ns.cloudflare.com` and `jake.ns.cloudflare.com`. |
| D1 database `folio-visibility` | Created in APAC; ID `1ac63021-5da1-45c8-839e-5ba35898bea5`; verified with Wrangler. |
| Production configuration | [`wrangler.production.jsonc`](../wrangler.production.jsonc), with the real account/database IDs and intended custom domain. |
| Application Worker `folio-visibility` | Deployed to `https://usefolio.site`; initial version `ae30071f-c720-4dc2-822a-2bc0c58f41c0` from validated commit `9ca27b3`. |
| Custom domain / Worker routes | Apex custom domain attached; HTTPS homepage and saved public rankings verified in Chrome. |
| Remote migrations | `0001`–`0012` applied. Migration 0012 uses equivalent `WHEN` trigger syntax compatible with remote Wrangler parsing; three actual D1 hold-release regressions passed. |
| Google production project | Separate production Web client, hosted callback, homepage/privacy URLs, and requested test users configured. Google identity sign-in verified on the live domain. Audience remains Testing; broad public OAuth verification is not complete. |
| Google development project | Existing `folio-508503` remains the local/testing project. |

The Wrangler OAuth session has the required Worker/D1 capabilities for the inspected operations. A direct DNS-record API read returned permission denied; the zone is active, but a complete DNS-record inventory was not established through that token. Google domain ownership verification is separate and remains unverified here. The existing Crawlingsphere database was not reused or modified.

## Production commands

Always select the production configuration explicitly. Default `wrangler.jsonc`, `.dev.vars`, and `.wrangler/state` remain local. Do not deploy the default configuration's emulator database ID. An explicitly authorized initial copy of local accounts and saved records was performed for this launch. Future data transfers require deliberate reconciliation; do not overwrite either database by default.

After the complete migration set is reviewed, apply and verify remote migrations:

```sh
bunx wrangler d1 migrations apply folio-visibility --remote --config wrangler.production.jsonc
bunx wrangler d1 migrations list folio-visibility --remote --config wrangler.production.jsonc
```

Stop the local dev server before the production build because both write `.next`; restart it after the build if needed. Build and deploy are distinct:

```sh
bunx opennextjs-cloudflare build --config wrangler.production.jsonc
bunx opennextjs-cloudflare deploy --config wrangler.production.jsonc
```

The deploy command creates or updates the production Worker and its configured custom domain. Cloudflare requires an active zone and a Worker; a Custom Domain creates the corresponding DNS record and certificate. The configuration deliberately addresses the apex hostname only. [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

Production authentication requires a fresh `BETTER_AUTH_SECRET` of at least 32 characters and production `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Supply them through Wrangler's secret input or a private ignored bulk-secret file; never use literal credentials in commands, tracked files, or logs. `BETTER_AUTH_URL=https://usefolio.site` is a non-secret variable already in the production configuration. Preserve the production auth secret across ordinary deployments because it protects sessions and encrypted OAuth tokens.

The production configuration redacts query strings and disables automatic invocation logs/traces because OAuth callback queries contain temporary codes and state. Application error logs remain enabled and must omit secrets and private provider responses. Cloudflare documents invocation logs as including request URLs. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

An initial public deployment can make the homepage and privacy policy available for Google's setup/review while Google credentials are still absent. That is not completed public sign-in. After credentials are installed, verify the exact hosted callback and actual account flow before marking OAuth ready. No scheduler or paid-provider configuration is needed for Google identity and Search Console.

## Google production configuration

Use the separate production project and a Web application OAuth client. Keep local origins and callbacks in the development project. [Google's production separation policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

| Setting | Production value |
| --- | --- |
| App name | Folio |
| Audience | External; publishing and verification status must be checked separately. |
| Homepage | `https://usefolio.site` |
| Privacy policy | `https://usefolio.site/privacy` |
| Public contact | `support@usefolio.site` |
| Authorized domain | `usefolio.site` |
| JavaScript origin | `https://usefolio.site` |
| Authorized redirect URI | `https://usefolio.site/api/auth/callback/google` |
| Identity scopes | `openid`, `email`, `profile` |
| Explicit incremental Search Console scope | `https://www.googleapis.com/auth/webmasters.readonly` |

Enable the Google Search Console API in this project. Configure the consent identity, declared scopes, and domain ownership evidence. Google's support-email selector can be restricted to eligible verified account/group addresses; do not substitute a private account address as the public contact without making the difference explicit.

External Testing is limited to listed test users; moving to production does not itself mean branding or sensitive-scope verification passed. Review the current classification of the requested Search Console scope and finish any required verification. See [Search Console setup and verification requirements](SEARCH-CONSOLE.md) for authoritative Google references and implemented data boundaries.

Before recording completion, verify HTTPS, the public privacy page, fresh Google sign-in, separate read-only consent, property retrieval, an owned report import/reopen, and disconnect/reconnect on the hosted application. Preserve private evidence outside Git. Local tests and local Google consent do not establish these production outcomes.

## Initial data transfer and live checks

The owner explicitly requested reusing local accounts, websites and saved results, without new sandbox work. A private local backup was taken first. Existing records were copied into the previously empty production database, retaining ownership IDs, completed evidence, quota history and unresolved holds. Table counts and foreign keys were checked, and the hold-insertion guard was restored and verified before deployment.

The SQL-file import hit a statement-size limit on large evidence rows; its failed attempts rolled back. The successful transfer used parameterized D1 queries through the authenticated Wrangler account, preserving the stored evidence. Private transfer files and backups remain ignored. Browser sessions, temporary verification/rate-limit entries and job leases were not copied. Old Google-client tokens were omitted because production uses a separate client; saved Search Console reports remain available and new Google imports require reconnecting there. Local credentials, callbacks and data were unchanged.

Production Google identity sign-in reopened the migrated owner account and its saved website, audit and SEO report in Chrome. Public rankings and HTTPS homepage were also verified. No sandbox or paid SEO lookup was started by deployment. The scheduler remains disabled. A successful deployment does not establish unrestricted external Google onboarding, new provider runs, or any unfinished MCP integration.

## 17 September public-index integration release

Deployed from isolated `codex/website-index-integration`, based on `bcbcbbc44b91e6565bda16af09af64cd0dc97e21`, with completed-report public comparisons and exact public-question reuse. Worker version: `a656a918-2a8e-4274-b690-3c376fcf1bf4`.

The production configuration was used with `--keep-vars`; existing D1, auth URL, secrets, self binding and disabled scheduler were preserved. Remote migration status reported no migrations pending. The separate landing and mention-index route Workers were retained. No paid provider work or database migration was performed.

Validation: TypeScript, all 258 unit tests, 44 affected desktop/mobile browser checks, and the final production OpenNext build passed. Earlier public-ranking UI tests timed out by repeating all 3,500 catalog queries in 45 seconds; browser coverage now checks every category boundary plus published/unmeasured states, while strict artifact tests still validate all stored records. A prior baseline also passed 14 public-dashboard browser checks.

Live API validation confirmed 3,500 questions, 286 published observations, 121 distinct recommended hosts and 1,142 distinct cited URLs. All 286 observations are Astra open-web results; this release creates no new observations or model diversity. Homepage/login/overview returned 200; anonymous private site/benchmark APIs returned 401. The independent mention index retained its three cohorts and ten query breakdowns. These are different evaluation scopes and are not pooled.

## 11 November Codegraff agent and index MCP release

Deployed from `feat/codegraff-agent-and-index-mcp` (`bd6116e`, based on `82754f5`): keyword runs on Folio's
own Codegraff agent, the AEO change loop, the published-index MCP endpoint and crawled-page search.
Backend `folio-visibility` version `e00d583f-5ff1-42ba-98d7-0c746ac9131e` (`--keep-vars`), frontend
`folio-frontend` version `459ad2c0-394b-4a28-9b50-3e96ae9e8009`. Rollback targets: backend
`fbbf63dc-9784-4979-9ed8-9db8cbacb649`, frontend `f4848c41-77be-49ab-82e7-6166bac9f4e0`.

`CODEGRAFF_API_KEY` was set on `folio-visibility` (the owner's existing key). The Postgres tables
`website_changes` and `agent_index_asks` already existed. The D1 rollback engine still lists migrations
0023–0027 as pending; they were not applied.

Validation: typecheck, 427 unit tests, the keyword/public/hold-release/agent-API D1 integrations, the
production OpenNext build and both built-Worker smoke tests. After deployment: homepage, `/leaderboard`,
`/login` and `/api/public/benchmarks` returned 200; anonymous `/api/benchmarks`, `/api/changes` and
`/api/index-asks` returned 401; `/api/index-mcp` answered initialize, `tools/list` and
`folio_index_overview` from live published data, returned 405 to GET and 403 to a foreign origin.
No keyword run was started as a deployment check.

Later the same day the readable-contrast frontend (`feat/readable-contrast`, `d107c6d`) was merged in
(`c81ef0b`) and both Workers redeployed from one build: frontend `ae3a7ac7-e371-4ba4-941e-aad457e7b1cf`,
backend `832e1ec7-1974-4d90-a10a-5cd2392f4a8f` (`--keep-vars`). Typecheck, 427 unit tests, the production
build and both smoke tests passed; production pages returned 200, private APIs 401, and the served
stylesheets include `--folio-raised`. This release was then fast-forwarded to `main`.

The production `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` secrets were being rejected (HTTP 401 on both
lookups of a website update); they were replaced with the working account credentials the same day.
`manus.im` was added as a saved website for the owner, and one lookup each was saved for
`usefolio.site` and `manus.im` ($0.072 in total). The website **Search and backlinks** panel was then
redesigned: a lookup that returned nothing shows one explanation and falls back to the last report
with numbers, a domain without ranking data reads "None found", and large counts are shortened.

Then **Where it shows up** (`c0cce9d`) was deployed: frontend `d425fc60-a8fb-4236-b8e2-65c4d46d51e1`, backend
`ffa78b7d-551c-40ae-a627-e387ce6d4dbd` (`--keep-vars`). It adds the per-website visibility and gaps report on
`/websites`, the owner route `GET /api/sites/{id}/visibility` and the keyed MCP tool `folio_website_gaps` (MCP 1.6.0).
It reads saved data only; no migration, secret or paid work. Typecheck, 431 unit tests, the real-D1 MCP test,
20 desktop/mobile browser checks, the production build and both smoke tests passed. After deployment pages
returned 200, the new route returned 401 without a session, the no-key MCP endpoint still listed only its four
index tools, and the served stylesheet includes the new panel.

**Organizations** (`7847b24` plus a layout fix, `0344823`) followed: frontend `1ba50951-3ec9-4ddd-b90f-5e4c54be85b5`,
backend `e61bf4c8-573e-4e0d-b14f-fac392e7ba57` (`--keep-vars`). Migration `0028_organizations.sql` was applied to the
production Postgres `public` schema through the `scripts/pg-schema.ts` translation (`CREATE TABLE IF NOT EXISTS`;
four empty tables, 21 columns); the D1 rollback engine does not have it, like `0023`–`0027`. Before that, the same
flows (create, invite, join, share, a teammate's gap read, roles, remove, leave) ran on production Postgres inside
one transaction that was rolled back. Validation: 431 unit tests, 10 D1 integration tests, desktop/mobile browser
checks for organizations, the team preview and the website panels, the production build and both smoke tests. After
deployment `/orgs` and `/orgs?view=preview` returned 200 and the organization APIs returned 401 without a session.
On the owner's request a **Manus** organization was created on the owner's account with `manus.im` shared; it has
no other members and no invite link yet.

**Connect your agent** (`23199b4`) followed: frontend `83756c23-b71e-4ebc-9042-b016cf95268e`, backend
`dfdd9986-2432-4d24-8f83-23a0b60feffc` (`--keep-vars`). No migration or secret change. The client setups were checked
against production with a temporary read key named "Setup check (temporary)", deleted afterwards along with its
recorded asks. The organization detail and website-gaps reads now run their queries one at a time; in parallel they
exhausted the 25-connection Postgres under concurrent local loads. Validation: typecheck, 435 unit tests, 9 D1
integration tests, the production build and both smoke tests; the browser checks for this panel passed earlier in
the day, and a later local rerun was cut short by the dev server's `workerd` connection leak (see TODO). After
deployment `/agents`, `/orgs`, `/websites` and `/docs/api` returned 200, `/api/agent-keys` returned 401 without a
session, and the served stylesheet includes the panel.

On the owner's request, `natalie@manus.ai` (an existing Google sign-in account) was added to the owner's **Manus**
organization as a member, through the app's own invite-and-join functions; the one-off invite was revoked
immediately, so the organization has no active invite link. She can read the shared `manus.im` report.

### Vector store

Page embeddings live in turbopuffer, not Postgres (see [embeddings](EMBEDDINGS.md)).
The index worker needs the key for search and ingestion; the app worker carries the
same secret for server-side vector work.

```sh
wrangler secret put TURBOPUFFER_API_KEY --config wrangler.jsonc              # folio-index-api
wrangler secret put TURBOPUFFER_API_KEY --config wrangler.production.jsonc   # folio-visibility
```

The MCP tool `folio_index_pages` embeds each question through the Codegraff gateway
(`gemini-embedding-2`) and queries turbopuffer itself, so the app worker needs the gateway
key as well as `TURBOPUFFER_API_KEY`. Without both it uses the index service when `INDEX_API_KEY`
is set, and otherwise a word match, and says which. Not yet set or verified on the deployed worker:

```sh
wrangler secret put CODEGRAFF_API_KEY --config wrangler.production.jsonc     # folio-visibility
```

The same secret switches keyword runs to Folio's own Codegraff agent ([Codegraff agent](CODEGRAFF-AGENT.md)).
That key is copied into each short-lived run sandbox, so use a dedicated key with a monthly budget.
To fall back to OpenAI without removing the key, set the plain variable `KEYWORD_AGENT_PROVIDER=openai`.

