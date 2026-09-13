# Cloudflare and authentication

The app uses Next.js App Router, the OpenNext Cloudflare adapter, Cloudflare D1, Drizzle, and Better Auth. Email/password accounts and sessions are persisted in D1. The application reads its D1 binding inside each request; it does not keep database bindings in module-level state.

## Local development

1. Install dependencies with `bun install`.
2. Copy `.dev.vars.example` to `.dev.vars` and replace `BETTER_AUTH_SECRET` with a fresh, random value of at least 32 characters. To generate one, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Set `BETTER_AUTH_URL` to the exact local origin, including the port. The running development instance uses `http://localhost:3001` because port 3000 was occupied.
4. Run `bun run db:migrate:local`.
5. Run `bun run dev --port 3001`.

OpenNext initializes Wrangler's local D1 emulator during `next dev`. Local persistence lives under `.wrangler/state`; a Cloudflare account is unnecessary for local development. The all-zero database ID in `wrangler.jsonc` is explicitly a local placeholder.

Use `authClient.signUp.email({ name, email, password })`, `authClient.signIn.email({ email, password })`, `authClient.signOut()`, and `authClient.useSession()` in client components. Passwords must contain 10–128 characters. Server routes use `await getSession(request.headers)` and verify `session.user.id` before accessing tenant data.

## Deploying to your Cloudflare account

These steps require an actual account and domain and have not been performed for this project.

1. Authenticate Wrangler and create a D1 database: `bunx --no-install wrangler d1 create folio-visibility`.
2. Replace the placeholder `database_id` in `wrangler.jsonc` with the ID returned by Cloudflare.
3. Apply the schema remotely: `bunx --no-install wrangler d1 migrations apply DB --remote`.
4. Set a fresh production secret using `bunx --no-install wrangler secret put BETTER_AUTH_SECRET`.
5. Set the canonical HTTPS application origin using `bunx --no-install wrangler secret put BETTER_AUTH_URL`. The origin must match the actual Workers or custom-domain URL; do not use the local development origin.
6. Set `SCAN_ALLOWED_HOSTS` to a comma-separated list of approved public domains using `bunx --no-install wrangler secret put SCAN_ALLOWED_HOSTS`. Include expected redirect hosts. The scanner allows exact hostnames and refuses wildcards, private addresses, and redirects outside this list. This is a bounded MVP fetch policy; approving arbitrary self-service domains needs a dedicated outbound-fetch service with DNS/IP validation.
7. When available, set the agent provider credential using `bunx --no-install wrangler secret put OPENAI_API_KEY`. It is a server secret and must never use a `NEXT_PUBLIC_` variable.
8. Validate the Workers build using `bun run cf:build`. Use `bun run preview` to check the application in the local Workers runtime.
9. Publish using `bun run deploy` once the domain and bindings are configured.

`.dev.vars` is for local development only. Wrangler secrets are separate production configuration; local secrets must not be committed or reused in production. The worker has `nodejs_compat` enabled, uses `.open-next/worker.js`, and serves built assets from `.open-next/assets`. Routes with private data run dynamically; an R2 incremental cache can be added if ISR is needed later.

## Current scope

- Email/password sign-up, sign-in, sign-out, server-validated sessions, and database-backed rate limiting are implemented.
- Email verification, password-reset delivery, and social OAuth need real provider configuration and are not presented as active features.
- Site rows and scans are private by default. Public benchmark publication is an explicit separate action.
- Local smoke verification covered account creation, a valid session cookie, session revocation, and a subsequent password sign-in against the local D1 emulator.

## References

- [OpenNext Cloudflare setup](https://opennext.js.org/cloudflare/get-started)
- [Cloudflare bindings and local development](https://opennext.js.org/cloudflare/bindings)
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth database schema](https://better-auth.com/docs/concepts/database)
- [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit)
