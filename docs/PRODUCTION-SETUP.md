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

## 20 September current-main release

Deployed from local `main` at `bb89efb` after a fast-forward from `bcbcbbc`. Application Worker version: `af017bc8-7cc5-4cee-86fc-9089277546e2`. Public-index Worker version: `a7bdde00-a45b-415c-84bd-f7824f938eca`.

The production configuration was used with `--keep-vars`. Existing D1, `BETTER_AUTH_URL`, secrets, self binding, and `EVALUATION_RECONCILE_ENABLED=false` were preserved. The scheduler Worker was not deployed or enabled. A private ignored remote D1 export was taken before the release. Remote `d1_migrations` already listed `0001`–`0021`; no new migration was applied in this session. The default `wrangler.jsonc` emulator database ID was not used.

Hosted smoke checks (browser User-Agent; no sign-in and no paid provider call): `/`, `/privacy`, `/login`, `/overview`, `/leaderboard`, `/pricing`, and `/docs/api` returned 200. Anonymous `/api/sites`, `/api/evaluations`, `/api/benchmarks`, `/api/seo-reports`, and `/api/costs` returned 401. `/api/search-console` and `/api/agents/status` returned unauthenticated connection/status payloads only. `GET /api/public/benchmarks` returned 3,850 catalog queries, 291 published queries, 397 published observations, 125 recommended hosts, and 1,210 cited sources. `/overview` loaded the public dashboard. These checks do not complete Google two-account isolation, OAuth verification, hosted MCP, or scheduler validation.

## 27 September D1 to PlanetScale PostgreSQL cutover

Production now uses PlanetScale PostgreSQL 18 through separate cache-disabled Cloudflare Hyperdrive configurations in the main and public-index Workers. Ordinary local development still uses isolated D1. D1 remains intact as a frozen source for a reconciled rollback; its production Worker bindings were removed after the UI restoration. It is **not** receiving new application writes. The scoped origin credential was supplied by the owner and must be rotated after cutover because it appeared in chat. Cloudflare's generic PostgreSQL table lists 9–17 as known supported while its PlanetScale provider row says all versions; monitor PostgreSQL 18 and seek explicit compatibility confirmation despite passing live Hyperdrive read and transaction/row-lock smokes.

After confirming no running paid jobs, a temporary maintenance deployment blocked main-site writes and public-index requests. The final private D1 export and a second export under the pause were byte-identical. The empty PlanetScale target received the final snapshot only after a full-row dry-run; an independent post-commit check matched every stored field across 32 tables and 832 rows. Both Workers were switched to Hyperdrive, with the main app briefly served behind a read-only wrapper before writes reopened. The public-index Worker was then moved to a separate uncached Hyperdrive configuration using a PostgreSQL role that can select only published question snapshots: a live credential check denied private-table reads and snapshot updates, and the public route still returned all three snapshots. No paid provider run was launched for migration validation.

Type checking, 340 unit tests, 36 D1 integration tests, three importer tests, and the production OpenNext build passed before deployment. Hosted public pages, the benchmark API, and the public-index JSON/leaderboard returned 200; five anonymous private API routes returned 401; anonymous session retrieval returned 200. The public index served three imported snapshots. An isolated Worker acquired the PostgreSQL write-gate row lock and rolled back a no-op update through Hyperdrive. Live owner sign-in, owner-scoped reads/writes, and long-term behavior are **not yet validated**. Before any rollback, pause writes and reconcile post-cutover PostgreSQL changes against the frozen D1 snapshot; otherwise records could be lost. See [the migration runbook](POSTGRES-MIGRATION.md).

The first PostgreSQL release was built from local `main` at `bb89efb`, nine commits behind the Swiss-themed UI on `origin/main`; it unintentionally replaced the newer public UI. The source was intact. Local `main` was fast-forwarded to `a7033fe`, the PostgreSQL changes were reapplied, and main Worker version `04cdfcdd-564c-4d18-adeb-e22627608783` restored the UI without switching the database back to D1. The live collage landing and public overview rendered without browser console errors; public routes returned 200 and an anonymous private API returned 401. Authenticated owner workflows remain unverified. Before future production builds, confirm the local source includes the current UI and that `wrangler.production.jsonc` still selects Hyperdrive. The subsequent binding-only cleanup removed production D1 bindings from both Workers without deleting the D1 database, private exports, or local D1 development support; rollback now requires re-adding bindings after reconciling PostgreSQL writes.
