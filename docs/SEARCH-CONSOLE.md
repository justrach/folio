# Google Search Console

Folio's `/search-console` workspace connects a user's Google account, lists properties they can read, and saves private performance snapshots. It reuses Crawlingsphere's separation between Google identity, explicit consent, and server-side retrieval. Live Google validation and production deployment remain separate from implementation.

## Connect and import

Google sign-in requests only identity scopes (`openid`, `email`, `profile`). Existing email/password accounts remain usable. An authenticated owner explicitly links Google with `https://www.googleapis.com/auth/webmasters.readonly`, `prompt=consent`, and `access_type=offline`. Google defines this scope as read-only Search Console access. [Search Console authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)

Folio accepts verified Google profiles and explicit linking only when the Google email matches the signed-in Folio account. OAuth sign-in does not implicitly merge into an existing email/password account; sign in with that account's password before connecting Google.

The callback requires the owner's exact Search Console scope and a saved refresh token. Connection status reads local configuration and stored consent; it does not prove Google still accepts the grant. Expired or revoked access requires reconnecting.

Loading properties and importing are explicit actions. Each import rechecks the property's exact identifier against Google's property list, accepting owner/full/restricted-user access and excluding unverified properties. Folio does not add properties, verify ownership, submit sitemaps, or edit Search Console. Google access does not authorize publication.

## Snapshot meaning and limits

Each import requests finalized Web search data for 28 inclusive date labels ending three days before the current UTC date. Google interprets those labels as Pacific calendar dates. Four requests retrieve property totals, daily rows, queries, and pages. Each dimension stops at 1,000 rows without pagination. Dates, metrics, response shape, and a 1 MB saved-report limit are validated. [Search Analytics query contract](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)

Snapshots retain clicks, impressions, CTR, average position, property, window, retrieval time, and coverage warnings. Google returns top rows and omits some query data; dimension sums need not equal property totals. Failed views, reached row limits, or size trimming mark a report partial. Missing totals remain unknown, including an empty totals response. These observations remain separate from DataForSEO estimates, technical readiness, and agent verification; no Search Console data is sent to the managed agent.

## Storage and routes

Better Auth enables encryption for OAuth access/refresh tokens. Client credentials stay in ignored `.dev.vars` or production Worker secrets. Server-side `auth.api.getAccessToken` obtains usable tokens; public Better Auth token-retrieval and refresh endpoints are disabled.

Migration `0008_search_console_reports.sql` adds D1 snapshots scoped to the authenticated user's exact ID. A 50-report per-owner cap is checked before retrieval and enforced at insertion. Saved reports and JSON downloads reopen without Google requests. Report deletion and automatic retention are not implemented.

| Route | Behavior |
| --- | --- |
| `GET /api/search-console` | Configuration and stored-consent status; no Google request |
| `GET /api/search-console/properties` | Authenticated, explicit Google property retrieval |
| `GET /api/search-console/reports` | Owner's saved summaries; no Google request |
| `POST /api/search-console/reports` | Authenticated same-origin import of an available property |
| `GET /api/search-console/reports/[id]` | Owner's saved snapshot; no Google request |
| `GET /api/search-console/finish` | Check scope/refresh token; fixed local redirect |
| `DELETE /api/search-console/connection` | Authenticated same-origin local disconnect |

Responses use private, no-store caching. Logout or owner changes clear browser selections/reports and abort pending reads. Disconnect clears local Google credentials and scope while preserving the Google login identity, password login, and historical reports. It does not revoke Google's authorization or delete existing downloads; users can separately remove Folio in their Google account.

## Local configuration

Use Bun and Wrangler as described in [Cloudflare/auth setup](cloudflare-auth.md). Preserve existing `.dev.vars`, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for a Google Web application client, enable its project's Search Console API, and restart the server after intended environment changes.

| Setting | Local | Planned production |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `http://localhost:3001` | `https://usefolio.site` |
| Authorized redirect URI | `http://localhost:3001/api/auth/callback/google` | `https://usefolio.site/api/auth/callback/google` |
| Credentials | Ignored `.dev.vars` | Worker secrets |

Register Better Auth's exact Google callback, not `/api/search-console/finish`; the latter is Folio's post-consent check. Keep test records and local credentials separate from production.

## External-user launch at usefolio.site

`usefolio.site` is the intended public hostname. Its DNS state, deployed application, Google domain ownership, and OAuth verification are distinct checks; none is certified by this document.

1. Provision real remote D1, replace the placeholder binding ID, and apply every migration with Wrangler, including 0008. Configure the Worker/custom domain and confirm HTTPS serves Folio at `https://usefolio.site`.
2. Set fresh production `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://usefolio.site`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` through Wrangler secrets. Preserve the auth secret across routine deployments so sessions and encrypted credentials remain usable. Keep paid-provider allowlists; Google login does not grant spending.
3. Prepare a separate Google production project/client with Search Console enabled and the exact production callback. Google requires separation of production and testing projects; production clients must not include developer-only test origins or redirects. [OAuth production policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
4. Configure the external audience, app identity, contacts, and authorized domain `usefolio.site`. Verify ownership through Search Console with a Google account associated with the OAuth project. Publish a public homepage and same-domain privacy policy describing actual Google-data access, use, storage, sharing, and retention. Link them in the consent configuration and complete required branding review. [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
5. Declare the exact scopes in Data Access and inspect Google's current classification. Complete required sensitive/restricted-scope verification unless a documented exception applies; prepare scope justification and a demonstration of consent and data use. Publishing the audience alone is not verification approval. [Google data-access verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
6. Move the production audience out of Testing when ready for external users. Testing restricts Search Console authorization to up to 100 listed test users; it is not public onboarding. External Testing grants that include Search Console have seven-day refresh-token expiry, unlike identity-only scopes. Production grants can also expire or be revoked. [Audience controls](https://support.google.com/cloud/answer/15549945?hl=en), [refresh-token lifetime](https://developers.google.com/identity/protocols/oauth2#expiration)
7. Validate deployed sign-in, consent, an accessible property's live import, reopening without provider calls, disconnect/reconnect, and isolation between two accounts. Record actual provider results separately from fixture/build checks. Scheduler deployment, account billing, and paid evaluations remain independent.

A logged-in browser and local OAuth configuration do not complete this production checklist. The bounded local validation below does not establish external-user deployment or Google production approval.

## Observed local validation — 2026-09-13

One live Chrome session completed Google sign-in with identity scopes, followed by the user's explicit read-only Search Console consent. Folio reported the saved connection, retrieved the account's accessible property list from Google, and imported one selected property into a private local D1 report. The report displayed property totals, daily data, and page rows. Its empty query table was presented as no returned rows, without inventing zero-valued queries.

This confirms the local identity, consent, property-retrieval, and single-import paths against Google. Account details, property/domain names, report IDs, metrics, credentials, and response bodies are intentionally excluded from this record.

The saved live report subsequently reopened through the built local Wrangler preview using the existing D1 state and signed-in account. Reopening read the saved snapshot without another Google import. Live disconnect/reconnect and isolation using two real Google accounts remain pending. Automated fixtures and D1 integration checks cover separate cases and do not replace those live checks. Hosted production validation, deployment, public-domain verification, and Google production approval are not established by these local results.
