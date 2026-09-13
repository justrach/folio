# GitHub identity

Folio supports optional GitHub sign-in and explicit linking to an existing Folio account. This connects a login identity. It does not import repositories, inspect code, create installations, publish commits or start evaluations.

## Configuration

Create a GitHub **OAuth App** for the intended Folio environment and configure its callback exactly:

| Environment | Authorization callback |
| --- | --- |
| Current local development | `http://localhost:3001/api/auth/callback/github` |
| Intended production hostname | `https://usefolio.site/api/auth/callback/github` |

Use separate OAuth Apps for local development and production. The production callback is a configuration target; this implementation does not establish production deployment or completed live OAuth validation. Better Auth documents the provider setup and callback pattern in its [GitHub guide](https://better-auth.com/docs/authentication/github).

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in ignored local `.dev.vars` or production Worker secrets. Both nonempty values are required before the provider is enabled. Keep `BETTER_AUTH_URL` aligned with that environment and preserve the existing `BETTER_AUTH_SECRET`; changing the secret can affect sessions and encrypted provider tokens. Restart the local server after changing its environment. The tracked `.dev.vars.example` contains empty GitHub placeholders only.

The application explicitly requests `read:user` and `user:email`. GitHub documents these as profile and email access in its [OAuth scope reference](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps). No repository, organization or workflow scopes are requested. A server hook rejects additional GitHub scopes supplied to sign-in or linking requests, while leaving the existing explicit Google Search Console consent path available.

## Sign-in and linking

For sign-in, the client uses `authClient.signIn.social({ provider: "github", callbackURL })`. An already signed-in owner links through `authClient.linkSocial({ provider: "github", callbackURL: "/settings" })`. Links and return paths must use the application's existing local-route validation. Opening settings or reading connection status does not initiate either OAuth operation.

The installed Better Auth 1.7.4 GitHub provider reads `/user` and `/user/emails`. If the public profile email is absent, it selects the primary email, then checks the selected address's verification flag. Folio rejects unverified GitHub identities during account creation, linking and returning sign-in. It does not invent an email address or treat another address's verification as proof for the selected address.

Google verification remains enabled. Account linking stays explicit, accepts only the same email as the signed-in Folio account, and never silently merges a same-email OAuth sign-in into an existing account. Existing users should sign in with their current method and link GitHub from settings. These behaviors use Better Auth's [account-linking controls](https://better-auth.com/docs/concepts/users-accounts).

## Connection status and credentials

`GET /api/github` returns exactly three booleans on success:

```json
{ "configured": true, "signedIn": true, "connected": false }
```

- `configured`: both server credentials are available and the provider is registered.
- `signedIn`: Better Auth validated the requesting session.
- `connected`: a GitHub identity is stored for that exact session owner.

The response is `private, no-store` and varies by cookie. It contains no account ID, email, GitHub handle, token, scope list or provider response. The endpoint reads local state only; `connected` does not mean GitHub was contacted, an existing token is still valid, or repository permission exists. A stored identity may remain connected even if the operator removes the OAuth configuration. Configuration or database errors return a generic 503 message.

OAuth tokens remain encrypted through the shared Better Auth account configuration. The browser-facing `/api/auth/get-access-token` and `/api/auth/refresh-token` paths stay disabled. The existing Google identity, email/password login and Search Console token handling are preserved. No new database migration is required: linked identities use the existing owner-scoped `account` table.

## Validation

Focused tests cover optional configuration, combined Google/GitHub verification, same-email explicit-link configuration, authorization scopes and callback/state, the installed provider's selected-email behavior, rejection of repository-scope escalation, disabled token-returning HTTP endpoints, and exact-owner connection lookup. Browser fixtures additionally exercise explicit sign-in/link actions, safe evaluation return paths, disabled configuration, and clearing connected state across logout and a different account. Provider responses in these tests are synthetic.

Live GitHub sign-in, consent, linking, returning sign-in and behavior after revocation still require configured OAuth credentials and actual user interaction. Passing these fixtures does not complete those live checks. GitHub sign-in also does not grant evaluation spending access; the existing approved-account and quota controls continue to apply.
