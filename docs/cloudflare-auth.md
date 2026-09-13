# Cloudflare and authentication

The app uses Next.js App Router, the OpenNext Cloudflare adapter, Cloudflare D1, Drizzle, and Better Auth. Email/password accounts, optional Google identities, and sessions are persisted in D1. The application reads its D1 binding inside each request; it does not keep database bindings in module-level state.

## Local development

1. Install dependencies with `bun install`.
2. Run `bun run setup` to prepare local configuration and D1 while preserving existing credentials. A new environment receives a fresh authentication secret; do not overwrite an existing `.dev.vars` or rotate its auth secret to make a test pass.
3. Set `BETTER_AUTH_URL` to the exact local origin, including the port. The running development instance uses `http://localhost:3001` because port 3000 was occupied.
4. Run `bun run db:migrate:local`.
5. Run `bun run dev --port 3001`.

OpenNext initializes Wrangler's local D1 emulator during `next dev`. Records persist in `.wrangler/state/v3`; migration/status commands use `--persist-to .wrangler/state` because Wrangler appends `/v3`. A Cloudflare account is unnecessary for local development. The all-zero database ID in `wrangler.jsonc` is explicitly a local placeholder.

Use `authClient.signUp.email({ name, email, password })`, `authClient.signIn.email({ email, password })`, `authClient.signOut()`, and `authClient.useSession()` in client components. Passwords must contain 10–128 characters. Server routes use `await getSession(request.headers)` and verify `session.user.id` before accessing tenant data.

For Google, put the Web application client's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in ignored `.dev.vars`, register `http://localhost:3001/api/auth/callback/google`, and restart the server. Google sign-in uses minimal identity scopes. Search Console requests its read-only scope through a separate explicit link flow; email/password users sign in first and link a matching verified Google email. See [Search Console configuration, token handling, and external-user requirements](SEARCH-CONSOLE.md).

## Deploying to your Cloudflare account

The intended public origin is `https://usefolio.site`. Production provisioning, domain/HTTPS checks, and deployed validation remain separate from local startup or Wrangler login. These instructions do not assert the domain's current DNS or Google verification state.

1. Authenticate Wrangler and create a D1 database: `bunx --no-install wrangler d1 create folio-visibility`.
2. Replace the placeholder `database_id` in `wrangler.jsonc` with the ID returned by Cloudflare.
3. Apply the schema remotely: `bunx --no-install wrangler d1 migrations apply DB --remote`.
4. Set a fresh production secret using `bunx --no-install wrangler secret put BETTER_AUTH_SECRET`.
5. Set `BETTER_AUTH_URL` to `https://usefolio.site` using `bunx --no-install wrangler secret put BETTER_AUTH_URL`, and configure that hostname for the application Worker. The secret must match the deployed HTTPS origin.
6. Set `SCAN_ALLOWED_HOSTS` to a comma-separated list of approved public domains using `bunx --no-install wrangler secret put SCAN_ALLOWED_HOSTS`. Include expected redirect hosts. The scanner allows exact hostnames and refuses wildcards, private addresses, and redirects outside this list. This is a bounded MVP fetch policy; approving arbitrary self-service domains needs a dedicated outbound-fetch service with DNS/IP validation.
7. When available, set the agent provider credential using `bunx --no-install wrangler secret put OPENAI_API_KEY`. It is a server secret and must never use a `NEXT_PUBLIC_` variable.
8. Validate the Workers build using `bun run cf:build`. Use `bun run preview` to check the application in the local Workers runtime.
9. Publish using `bun run deploy` once the domain and bindings are configured.

Google production setup also needs Worker secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, the Search Console API, and the exact callback `https://usefolio.site/api/auth/callback/google`. Keep local and production Google projects/clients separate. Complete the [external-user checklist](SEARCH-CONSOLE.md#external-user-launch-at-usefoliosite), including the public privacy policy, authorized-domain checks, audience settings, and applicable Google branding/data-access review. Publishing a Worker or switching Google out of Testing does not establish OAuth verification.

`.dev.vars` is for local development only. Wrangler secrets are separate production configuration; local secrets must not be committed or reused in production. The worker has `nodejs_compat` enabled, uses `.open-next/worker.js`, and serves built assets from `.open-next/assets`. Routes with private data run dynamically; an R2 incremental cache can be added if ISR is needed later.

## Current scope

- Email/password sign-up, sign-in, sign-out, server-validated sessions, and database-backed rate limiting are implemented.
- Optional Google sign-in and explicit read-only Search Console access are implemented when their server credentials are configured. Actual consent, property retrieval, and saved-report live validation remain separate checks.
- Email/password email verification and password-reset delivery still need implementation/provider setup.
- Site rows and scans are private by default. Public benchmark publication is an explicit separate action.
- Local smoke verification covered account creation, a valid session cookie, session revocation, and a subsequent password sign-in against the local D1 emulator.

## References

- [OpenNext Cloudflare setup](https://opennext.js.org/cloudflare/get-started)
- [Cloudflare bindings and local development](https://opennext.js.org/cloudflare/bindings)
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth database schema](https://better-auth.com/docs/concepts/database)
- [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit)
