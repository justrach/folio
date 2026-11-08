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
refuses to run when `BETTER_AUTH_URL` contains `usefolio.site`, and it never
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
- The guard throws if the configured `BETTER_AUTH_URL` is the deployed origin, so
  copying this file onto a deployed config fails loudly instead of opening the
  workspace.
- The dev account is a normal row in `"user"`. Delete it with
  `DELETE FROM "user" WHERE id = 'dev-local-user'`; saves, scans, runs and
  sessions follow the existing cascades.

## Turning it off

Remove the four `DEV_AUTH*` lines and reload. The app returns to Better Auth, and
`/api/*` answers `401` until a real sign-in.
