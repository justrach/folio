# Public Folio setup

Preparation status checked on 13 September 2026. The intended public application is `https://usefolio.site`; public support/privacy contact is `support@usefolio.site`. Resource creation, application deployment, Google configuration, and end-to-end verification are separate steps.

## Verified resources

| Resource | Current state |
| --- | --- |
| Cloudflare zone `usefolio.site` | Active in the authenticated Wrangler account; nameservers `dora.ns.cloudflare.com` and `jake.ns.cloudflare.com`. |
| D1 database `folio-visibility` | Created in APAC; ID `1ac63021-5da1-45c8-839e-5ba35898bea5`; verified with Wrangler. |
| Production configuration | [`wrangler.production.jsonc`](../wrangler.production.jsonc), with the real account/database IDs and intended custom domain. |
| Application Worker `folio-visibility` | Not deployed at this preparation checkpoint. |
| Custom domain / Worker routes | No existing `usefolio.site` Worker domain or zone route was found before deployment. Public DNS returned no apex A/AAAA record. |
| Remote migrations | `0001` through `0008` were listed as pending; no application migrations applied at this checkpoint. Apply the final reviewed migration set once integration is ready. |
| Google production project | Created separately as `Folio production` / `folio-production-508504`; OAuth setup is not yet complete. |
| Google development project | Existing `folio-508503` remains the local/testing project. |

The Wrangler OAuth session has the required Worker/D1 capabilities for the inspected operations. A direct DNS-record API read returned permission denied; the zone is active, but a complete DNS-record inventory was not established through that token. Google domain ownership verification is separate and remains unverified here. The existing Crawlingsphere database was not reused or modified.

## Production commands

Always select the production configuration explicitly. Default `wrangler.jsonc`, `.dev.vars`, and `.wrangler/state` remain local. Do not deploy the default configuration's emulator database ID or copy local users, Google tokens, reports, or provider allowlists to production.

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
