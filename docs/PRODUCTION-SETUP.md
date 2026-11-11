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

**Add by email, and Manus in Connect your agent** (`7191a27`) followed: frontend
`aa8704e3-035f-4d06-9363-32abac261709`, backend `29c1fd0f-3eaf-4158-b988-e8294f953829` (`--keep-vars`). Before
deploying, migration `0029_organization_email_invites.sql` was applied to production Postgres (`public`, one new table
of 6 columns, `CREATE … IF NOT EXISTS`). Production D1, the stale fallback, was left as it is. No secret change. The
email flows (add, re-add, an unverified account claims nothing, a verified sign-in joins, an agent's
`folio_organizations` read joins, cancel, delete) ran against production Postgres inside one transaction that was
rolled back, with fake `example.test` accounts; afterwards the table held 0 rows. The Manus setup was not run: there is
no Manus account. Validation: typecheck, 436 unit tests, the 10 D1 integration tests for these areas (one
index-asks test failed once on timing and passed when rerun alone), 18 browser checks (one desktop page load timed out
on the local dev server and passed on rerun), the production build and both smoke tests. After deployment, `/orgs`,
`/agents` and `/login` returned 200. Without a session, `GET /api/organizations` and the `add_by_email` action
returned 401, and the served `/orgs` bundle contains the email form and the Manus client.

**Smoother join-and-connect flow** (`f91a172`) followed: frontend `efbe371a-c7b5-4b4e-b65b-329d60cc861d`, backend
`8c1f5611-ce98-4237-a884-ded2e60c957d` (`--keep-vars`). Frontend only in effect: no migration, no secret change, no
API change. Owners get **Email the invite** (`mailto:`) and **Copy message** for each waiting person; `/login?next=/orgs`
explains that only a Google or GitHub sign-in with the added address joins by itself; new members get a welcome card;
**Connect your agent** highlights the next step and fills the new key into copies for clients that can't read
`FOLIO_API_KEY`. Validation: typecheck, 439 unit tests (one run, started right after the dev server was stopped, had a
single failure that did not recur in six further runs), the 10 D1 integration tests, 22 browser checks on desktop and
mobile (one first page load timed out locally and passed on rerun), the production build and both smoke tests. After
deployment `/orgs`, `/agents` and `/login?next=/orgs` returned 200, `GET /api/organizations` returned 401 without a
session, and the served bundle contains the invite actions, the welcome card, the login hint and the key-filling copy.

**Find anything** (`d629bec`) followed: frontend `06bd0d65-401f-412b-a682-8d1e030d10dc`, backend
`4d3b8c87-bdc7-46db-bde0-019c99649ba6` (`--keep-vars`). No migration or secret change. One new read-only endpoint,
`GET /api/workspace-search` (names, IDs and dates of the signed-in person's websites, saved reports and organizations,
one query at a time). Before deploying, its queries ran against production Postgres for the owner in a read-only
session in 50 ms: 3 websites, 5 saved SEO reports, 2 Search Console snapshots and the Manus organization.
Validation: typecheck, 443 unit tests, the 11 D1 integration tests for these areas (three failed in one run with
`connect ETIMEDOUT 127.0.0.1` while another session's local `workerd` held thousands of loopback connections, and all
passed on rerun), 30 browser checks on desktop and mobile, the production build and both smoke tests. The first
`git push` failed with an SSH access error after the deploy had started and succeeded on retry. After deployment,
`/settings`, `/orgs`, `/search-data` and the `?org=`/`?report=` forms returned 200, `/api/workspace-search` returned
401 without a session, and the served bundle contains the new search box.

**Folio as an MCP App** (`cdf19ad`) followed: frontend `95b7919a-150a-424b-865e-e04d780ae7a2`, backend
`05827bd9-692e-4f2e-805d-5c9672a348ff` (`--keep-vars`). No migration or secret change. MCP server `1.8.0` adds
`folio_find` and the `ui://folio/workspace.html` resource; `folio_find` and `folio_website_gaps` carry `_meta.ui`. New
dev dependency `@modelcontextprotocol/ext-apps` 1.7.5 (tests only; nothing in the Workers imports it).

Before deploying, Folio's MCP handler ran against production Postgres for the owner in a read-only session, with no
key created. Validation: typecheck, 444 unit tests, the 15 D1 integration tests for these areas, 18 browser checks
including the page under the official `AppBridge` on desktop and mobile, the production build and both smoke tests.
Transient failures, all of which passed on rerun:
- Several D1 tests and one page load hit `connect ETIMEDOUT 127.0.0.1` while another session's local `workerd` held
  thousands of loopback sockets.
- The load-sensitive `workerd` unit test failed once.
- The frontend smoke test failed once.
- A first build failed on a type error in a new test, which was fixed.

After deployment, a live check over HTTPS used a temporary read key named "MCP App check (temporary)". The key stayed
in memory and was deleted afterwards (1 key deleted, 0 recorded asks, none remaining). It found:
- server `folio` `1.8.0` with the resources capability;
- both tools pointing at the app;
- the page served as `text/html;profile=mcp-app` with `prefersBorder`;
- `folio_find` "manus" returning the Manus organization, `manus.im` and its saved report, with `https://usefolio.site`
  links.

The app has not been opened in Claude Desktop or VS Code.

**MCP App on the official package, and where every number comes from** (`95d0ae6`) followed: frontend
`5c506a3c-c16b-45a3-8a49-ede8da902fc7`, backend `96e5d448-6dba-4dd4-b8a2-c30942c4b5cf` (`--keep-vars`). No migration or
secret change.
- `@modelcontextprotocol/ext-apps` 1.7.5 is now a runtime dependency, used for `registerAppTool`, `registerAppResource`
  and, in the page, the `App` class. The page is built into `src/lib/folio-app.generated.ts` (328 KB).
- The backend upload grew from 4.16 MB to 4.35 MB gzipped.
- MCP server `1.9.0`: `folio_website_gaps` adds `sources` and `googleCheck`.
- Search Console imports now make a fifth request, for US-only totals. No Search Console import was run during this
  release, so no saved snapshot has US totals yet.

Before deploying, the report code ran against production Postgres in a read-only session for the owner's websites:
- `codegraff.com` compared Google's 149 clicks in 28 days (about 160 a month) with DataForSEO's estimate of under 1 a
  month.
- `manus.im` and `usefolio.site` showed "estimate only".

Validation: typecheck, 445 unit tests, the 17 D1 integration tests for these areas, browser checks, the production build
and both smoke tests.
- Browser checks: 60 of 62 passed against the local dev server. The two that failed (desktop and mobile) were the
  Search Console import test's check for unexpected requests, which saw `GET /api/analytics/config`. That request
  happens locally because `playwright.config.ts` opts out of analytics only under `CI`; with `CI=1` the spec passed.
- D1: two tests hit `connect ETIMEDOUT 127.0.0.1` while another session's local `workerd` held about 1,800 loopback
  sockets, and passed on rerun.

After deployment, a live check over HTTPS used a temporary read key named "MCP App check (temporary)":
- The first attempt hit a network connect timeout to usefolio.site; its key was still deleted. The second succeeded.
- Server `1.9.0`. Both app tools carry `_meta.ui` and the flat key.
- The served page is byte-identical to the build.
- `folio_website_gaps` for `codegraff.com` returned `compared` with ratio 1,028.
- Cleanup: 1 key and 1 recorded ask deleted, none remaining.

`/websites`, `/orgs` and `/search-console` returned 200, and the served bundle contains the new section.

**Consent card, organization-limited keys and one-step install** (`04af681`) followed on 11 November 2026: frontend
`0abd63dc-7596-43e8-a54e-132a154e7e16`, backend `f0a02421-e49d-4781-8a3a-e2c78499588b` (`--keep-vars`). No secret change.
- Migration `0030_agent_key_organizations.sql` was applied to production Postgres `public` before the deploy, in a
  transaction with `ADD COLUMN IF NOT EXISTS`. `agent_api_keys.organization_ids_json` is nullable `text`, and the one
  existing key kept NULL (all organizations).
- New route `/api/agent-setup/claude-desktop` serves `folio.mcpb`. It is the same file for everyone and holds no key.
- Backend upload: 4.41 MB gzipped.

Validation: typecheck, 452 unit tests, the 18 D1 integration tests for these areas (one `fetch failed` passed on
rerun), 10 of 10 Connect-your-agent browser checks (desktop and mobile), the production build and both smoke tests.
- The `.mcpb` manifest passed `npx @anthropic-ai/mcpb@2.1.2 validate`.
- Its bridge ran against production with a temporary read key, the way Claude Desktop runs it: initialize, the full
  167 KB tool list, `folio_organizations` and the prompt list. An unknown key got a readable error.
- The Claude Code and Codex one-paste commands each ran twice with the real CLIs in a throwaway home.
- Local timeouts earlier in this session came from this worktree's own dev server: its `workerd` bindings proxy held
  about 12,000 loopback connections (the leak already listed in TODO), not another session's.

After deployment, a live check over HTTPS used two temporary read keys named "Consent check (temporary)":
- The download returned 200 `folio.mcpb` (`manifest.json`, `server/index.js`), pointed at
  `https://usefolio.site/api/mcp`, with the key setting marked sensitive.
- An unlimited key's `folio_organizations` listed Manus (1 shared website). A key limited to `[]` listed no
  organizations, and its note said so.
- Cleanup: 2 keys deleted, none remaining.

`/agents` returned 200, and the served chunk contains the consent card. Add to Cursor, Add to VS Code and the Claude
Desktop install have not been run in the real apps.

**OAuth for MCP clients** (`aeec64a`) followed on 11 November 2026: frontend `cdd1dc85-e86c-457a-9ec4-fc6817d6992a`,
backend `0b1828f5-efd6-4872-aaae-16ab6edf409a` (`--keep-vars`). No secret change.
- Migration `0031_mcp_oauth.sql` was applied to production Postgres `public` before the deploy, in one transaction with
  `IF NOT EXISTS`: `oauth_clients` (8 columns), `oauth_codes` (13), `oauth_tokens` (8), the `oauth_tokens_key` index,
  and the nullable `agent_api_keys.oauth_client_id`.
- New routes: `/.well-known/oauth-protected-resource[/api/mcp]` and `/.well-known/oauth-authorization-server`
  (the frontend Worker forwards `/.well-known/oauth-*` to the backend), `/api/oauth/register`, `/api/oauth/token`,
  `/api/oauth/revoke`, `/api/oauth/authorize`, and the consent page `/oauth/authorize`.
- `folio.mcpb` is now byte-identical across builds. JSZip had stamped its `server/` folder entry with the build time.
- Backend upload: 4.44 MB gzipped.

Validation: typecheck, 456 unit tests, the D1 integration tests for these areas including the new OAuth flow tests,
6 of 6 consent-page and 10 of 10 Connect-your-agent browser checks, the production build and both smoke tests.
- Five D1 tests first failed with `connect ETIMEDOUT 127.0.0.1` (and one Miniflare decode assert) while another
  worktree's dev-server proxy held about 10,200 loopback sockets. All passed on rerun.
- Before deploying, the official MCP SDK client ran the whole flow against the local preview, with the consent page
  in a real browser.

After deployment, a live check used the official MCP SDK client over HTTPS against `https://usefolio.site`:
- Both discovery documents returned 200 at their root and path forms, naming `https://usefolio.site/api/mcp` and
  the issuer `https://usefolio.site` with `S256` PKCE and client ID metadata documents.
- `/api/mcp` without a token returned 401 with the `resource_metadata` pointer. `/oauth/authorize` returned 200.
- The SDK registered itself and asked for consent. The approval was recorded with `approveAuthorization` for the
  owner, because the script has no browser session on the live site. The SDK then exchanged the code over HTTPS
  (Bearer, 3600 s, `read`, with a refresh token).
- MCP server `1.9.0` listed 20 tools, and `folio_organizations` returned Manus.
- Refresh rotated the token, and reusing the old refresh token returned `invalid_grant`. The new access token got 200
  on `/api/mcp` and 401 on `/api/v1/sites`.
- After revocation, `/api/mcp` returned 401 with `error="invalid_token"`.
- Cleanup: 1 key, 1 code and 1 client deleted; no tokens remained.

claude.ai, ChatGPT and Claude Code have not connected through it yet.

**Account menu and Getting started** (`b6a87a5`) followed on 11 November 2026: frontend
`643c42f1-5e4a-4f17-9ab4-6936de5a344d`, backend `6a0a1dc3-5750-4d96-88e2-0d472f66633e` (`--keep-vars`). No migration
and no secret change; the new route `/api/getting-started` reads existing tables.
- The backend deploy failed nine times over about 15 minutes, while Cloudflare reported Workers as degraded: eight with
  API error 10021 ("binding ANALYTICS_DB of type d1 failed to generate"), then one API timeout. Both D1 databases
  existed on the account throughout. The same bundle deployed unchanged on the next try. Until then the frontend
  was live and `/api/getting-started` returned an HTML error page.
- Validation: typecheck, 457 unit tests, 17 D1 integration tests, the production build and both smoke tests; browser
  checks of the menu and checklist (3 of 3 on desktop and mobile) and of Connect your agent and the consent page
  (8 of 8 each), with reruns after local loopback timeouts.

After deployment: `/api/getting-started` without a session returned 401 `unauthorized` as JSON. `/websites`,
`/agents` and `/oauth/authorize` returned 200, and the served chunk `1su45g4qwxmef.js` contains both the account menu
and the checklist. Some requests from this machine timed out and succeeded on retry. Read against production, the
owner's checklist shows 3 of 5: website, Search Console and team done; agent and agent question not yet.

**Harness in Connect your agent** (`40709c5`) followed on 11 November 2026: frontend
`14ff8f62-190d-4219-b767-41fb5e914d2c`, backend `261f4ecb-9a53-4305-940f-03198b2a48cd` (`--keep-vars`). No migration,
no secret change and no server change: Harness uses the OAuth endpoints from the release above.
- Validation: typecheck, 458 unit tests, 52 D1 integration tests, the production build and both smoke tests. The
  Connect your agent browser spec, including the new Harness case, passed 6 of 6 on desktop and on mobile.
- Before deploying, the real graff ran against production in a throwaway home. `graff mcp add` reported
  `folio needs sign-in`. `graff mcp login` registered and sent the authorize request with PKCE and `resource`. A
  script recorded the approval for the owner as *Read only*, since there was no browser, and graff saved its tokens
  outside `mcp.json`. `graff mcp reconnect` then reported `ready`, `auth: oauth`, 20 tools. Cleanup: 1 key,
  2 tokens, 1 code and 1 client deleted.
- Earlier attempts from this machine failed with graff's `TlsInitializationFailed` while outbound connections were
  timing out. The run succeeded once the local dev server, which was holding thousands of loopback sockets, was
  stopped.

After deployment, `/agents`, `/oauth/authorize` and the authorization-server metadata returned 200. The served chunks
contain the Harness command (`graff mcp login folio`), the https note, "One command, no key in it" and
"Use a key instead". It has not been run from inside the Harness app yet.

**Website report read plan, /orgs layout and Folio's own icons** (`04acc66`) followed on 12 November 2026: frontend
`57d01953-30b6-4038-86fe-1c55355e6b4c`, backend `585a0830-a517-4dfc-b4d0-1c50e39972d6` (`--keep-vars`). No migration
and no secret change. Rollback targets: frontend `14ff8f62-190d-4219-b767-41fb5e914d2c`, backend
`261f4ecb-9a53-4305-940f-03198b2a48cd`.
- The backend now builds the website report with up to three reads in flight and reads saved question runs 20 per
  round trip ([Lean proofs](LEAN-PROOFS.md#read-plan)). The frontend carries the `/orgs` and visibility-panel layout
  and `src/components/icons.tsx` in place of `lucide-react`.
- Validation: typecheck, 463 unit tests, 17 D1 integration tests for the touched stores, `proofs:check`, the
  production build and both smoke tests. The organization and visibility browser specs passed on desktop and mobile.
  The full browser suite has 29 failing cases under CI settings on `04acc66` and the same 29 on its parent `39140e1`.
- After deployment `/`, `/orgs`, `/websites`, `/login`, `/leaderboard` and `/agents` returned 200, the site,
  organization and visibility APIs returned 401 without a session, and the public benchmarks read returned 200. The
  served HTML uses the `folio-icon` class and contains no `lucide` class.
- Not measured: the signed-in report on production. The 500 ms to 300 ms figure is from the local Postgres mirror.

**Hand-drawn landing, workspace and onboarding** (`fd0d8b5`, `c9ef20a`, `2eb2403`) followed on 12 November 2026: frontend
`dd8d27c7-73d2-45f5-9993-c458c0ba1f10`, backend `ad8d6d23-7a22-4dd1-a96b-11785ae940b1` (`--keep-vars`). No migration,
no secret change and no API change. Rollback targets: frontend `57d01953-30b6-4038-86fe-1c55355e6b4c`, backend
`585a0830-a517-4dfc-b4d0-1c50e39972d6`.
- The landing's artwork, the icon set, the workspace's empty states and loader, and the `/start` onboarding are drawn
  by the pen in `src/lib/sketch.ts`, with a motion layer that is off under reduced motion
  ([landing art](design/LANDING-ART.md), [onboarding art](design/ONBOARDING-ART.md)). The same build was reviewed on
  `staging.usefolio.site` first ([frontend deployment](FRONTEND-DEPLOYMENT.md)).
- Validation: typecheck, 472 unit tests, the production build and both smoke tests. The full browser suite, run with
  the analytics opt-out that CI applies, passed 524 cases and failed 15; all 15 are in the 29 that already failed on
  `04acc66` and its parent.
- After deployment `/`, `/start`, `/orgs`, `/websites`, `/login`, `/leaderboard`, `/agents` and `/pricing` returned
  200, the site, organization and onboarding APIs returned 401 without a session, and the public benchmarks read
  returned 200. In a browser, `/` showed the drawn poster and three storyboard frames and no dune image, `/start`
  showed the seven-step trail, `/orgs` showed its spot sketch, and no page raised an error or used a CSS filter.
- Not checked on production: the signed-in workspace and onboarding steps 3 to 8, which were checked locally and
  with mocked browser fixtures only. Safari and Firefox were not tested.

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

