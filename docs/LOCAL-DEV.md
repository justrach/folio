# Local development with pseudo auth

A local app that shows the real product against a real database, without a
provider login. It exists so a person and an agent can use the same workspace:
run an evaluation, read the saved evidence, open `/agents`, and see the numbers
move.

## What it is

| Piece | Value |
| --- | --- |
| App | `http://localhost:3000` (`bun run dev`) |
| Database | the PlanetScale Postgres mirror (`DB_ENGINE=postgres`) |
| Identity | one fixed local account, `dev@folio.local` |
| Password | `folio-local-dev` (only if you use the `/login` form) |
| Login | not required — every request is already that account |

Pseudo auth is `src/lib/dev-auth.ts`. It is off unless `DEV_AUTH=1` is set, it
runs only when `BETTER_AUTH_URL` is a loopback origin (`localhost`, `127.0.0.1` or
`[::1]`, any port) and throws for any other value or none, and it never
creates the account — `bun run dev:seed` does, so owner scoping and foreign keys
still behave like production. No token, cookie, or OAuth round trip is involved.

## Setup

`.dev.vars` (already prepared in this repository):

```sh
DB_ENGINE=postgres
PLANETSCALE_APP_URL="postgres://…"   # the mirror
DEV_AUTH=1
DEV_AUTH_USER_ID=dev-local-user
DEV_AUTH_EMAIL=dev@folio.local
DEV_AUTH_NAME="Local dev user"
```

The account is a real Better Auth credential account, so `/login` works with
`dev@folio.local` / `folio-local-dev` as well. You normally don't need it: with
`DEV_AUTH=1` the session is supplied for you, and the password exists so the
login form can be exercised.

Then:

```sh
bun install
bun run dev:seed      # creates the dev account, one site + scan, one demo evaluation
bun run dev           # http://localhost:3000
```

`scripts/dev.mjs` loads `.dev.vars` before starting `next dev`, because Next only
reads `.env*` files. Without it the app starts signed out and with no database
URL — that is the one setup mistake worth knowing about.

## What you see

- `/websites` — "Sable Analytics · local demo", the seeded scan.
- `/leaderboard` — the same site, published, so the public read path has data.
- `/agents` — the seeded demo evaluation under the grouped run list.
- `/evaluations` — the same run, its checks and evidence.
- `/benchmarks` — the question packs, including `agent-interface-v1`.

Starting an evaluation or benchmark from here spends real provider credits, so
the UI still asks before it spends. Pseudo auth changes who you are, not whether
a paid action is confirmed.

## For an agent

Any HTTP client that reaches `http://localhost:3000` is already authenticated as
the dev account — no key needed:

```sh
curl -s http://localhost:3000/api/sites
curl -s http://localhost:3000/api/evaluations
curl -s -X POST http://localhost:3000/api/plans -H 'content-type: application/json' -d '{"plan":"plus","note":"local probe"}'
```

The MCP endpoint (`/api/mcp`) is reachable the same way, so an agent can list
saved sites, read a report, or start an explicit run against the local app.

## Safety

- `DEV_AUTH` lives only in `.dev.vars`, which Wrangler never uploads. Worker
  secrets are set separately (`wrangler secret put`).
- The guard throws unless the configured `BETTER_AUTH_URL` is a loopback origin,
  so copying this file onto a deployed config fails loudly instead of opening the
  workspace.
- The dev account is a normal row in `"user"`. Delete it with
  `DELETE FROM "user" WHERE id = 'dev-local-user'`; saves, scans, runs and
  sessions follow the existing cascades.

## Turning it off

Remove the four `DEV_AUTH*` lines and reload. The app returns to Better Auth, and
`/api/*` answers `401` until a real sign-in.

## Checking the customer workflow with captured pages

Use the real app launched through `scripts/dev.mjs` for integration walkthroughs. A fixture proxy that substitutes `/api/sites`, scans, suites, or connection status is a separate sandbox and cannot establish that the connected workflow works. Keep seeded Sable records labelled as examples; capture a user-selected public website before claiming results for that website.

Onboarding uses the shared `getSession()` boundary, just like sites and evaluations. With `DEV_AUTH` off this still uses Better Auth; with it on, setup saves to the same dedicated local owner as the rest of the workspace. The mirror must include the existing onboarding migrations `0023_onboarding.sql`, `0024_onboarding_customer_groups.sql`, and `0025_tracked_competitor_domain.sql`. Missing tables/columns are an environment migration problem, not an empty account. Apply reviewed additive migrations to the intended mirror schema without resetting existing records.

Check the complete handoff: `/api/sites` and `/api/scans` agree on the saved score; publication settings accept the real sites response; **Choose questions** opens a suite whose case targets match that owned website. Navigation must perform reads only. Configuration of an API key does not approve the local account to spend credits: `OPENAI_ALLOWED_USER_IDS`, target access, daily allowances, and active-run guards still apply. Obtain explicit operator approval before adding a local account to that list; never use an unmetered exception to make a walkthrough pass.
