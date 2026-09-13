# Local D1 persistence and runtime tests

Folio keeps its local accounts, audits, SEO reports, and evaluation records across development-server restarts. OpenNext already uses Cloudflare's Workers SDK: its development integration calls Wrangler's `getPlatformProxy`, which provides local bindings backed by Miniflare and `workerd`. The application accesses the `DB` binding through `getDb()`; it does not replace D1 with a separate application SQLite connection.

This setup uses installed Wrangler `4.131.1` and pins the direct test dependency to Miniflare `5.20260911.0-alpha`, matching Wrangler's existing dependency. The version pin matters because programmatic Miniflare options can change. Bun is the package manager and task runner; Node.js 22.13 or later remains required for the explicit Node scripts, Wrangler CLI, and `node:sqlite` tests. The local binding executes through Miniflare/`workerd`. Passing local tests is not evidence of a deployed database or identical production behavior. [Cloudflare platform proxy API](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy)

## One stable development database

Run these commands from the repository root:

```sh
bun install
bun run setup
bun run dev --port 3001
```

Setup preserves existing credentials and applies pending migrations. In `next.config.ts`, only the development-server phase initializes the platform proxy, with:

```ts
persist: { path: resolve(process.cwd(), ".wrangler/state/v3") },
remoteBindings: false,
```

Migration and status commands resolve the repository root from `scripts/local-db.mjs` and pass Wrangler `--local --persist-to <root>/.wrangler/state`. Wrangler adds `/v3`; `getPlatformProxy.persist.path` does not. These two settings therefore reach the same existing store. Do not add another `/v3` to the CLI argument or point one side at a fresh directory. [Cloudflare persistence options](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy)

Wrangler's D1 export command does not accept `--persist-to` in the installed version. The backup action instead runs `d1 export DB --local` with the explicit repository configuration and repository working directory, reaching the same default `.wrangler/state/v3` store. Preserve that working directory when maintaining the wrapper.

The explicit configuration preserves the previous default data location. Restarting the server does not reset accounts or run history. Deleting `.wrangler/state`, switching checkouts without that state, or changing the binding's database identity can result in a different or empty database. Local state is ignored by Git and does not follow a clone to another machine.

`remoteBindings: false` keeps the development platform bindings local. It does not block the application's explicitly authorized OpenAI or DataForSEO HTTP calls; those retain their own server-side spending gates. The all-zero database ID in `wrangler.jsonc` remains a local placeholder. Local development needs no Cloudflare account, and these commands do not provision a remote database. [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)

## Inspect, migrate, and back up

| Command | What it does |
| --- | --- |
| `bun run db:status:local` | Lists pending local migration files; it does not print application rows |
| `bun run db:migrate:local` | Applies pending migrations to the shared local `DB` store |
| `bun run db:backup:local` | Exports the local database to a new private SQL file |

All three commands use the fixed local configuration and shared store, with the export distinction above. There is no remote flag or destructive reset action in the wrapper. A migration can change data according to its SQL, so inspect new migration files and make a local backup before an intentional schema change when existing records matter. Do not clear the database to hide a failing migration or test.

Backups are written under `.local/backups/<timestamp-and-unique-suffix>/folio-d1.sql`. Each export gets its own directory with mode `0700`; the successful SQL export is set to `0600`. The command prints its path, not its SQL contents. Both `.local/` and Wrangler state remain excluded from Git.

The SQL file contains private account and evidence data. It is a local copy on the same machine, not encrypted archival storage, a production backup policy, or an automatic restore service. Keep it out of commits, issue attachments, screenshots, and logs. A restore command is intentionally not bundled: any recovery should first target an isolated store and verify the intended data before replacing a working database.

## Test the actual D1 binding without using development data

```sh
bun run test:d1
```

`tests/d1-runtime.integration.ts` starts Miniflare directly with an isolated temporary `resourcePersistencePath`, obtains its actual D1 binding, and applies the repository's migrations. It exercises Folio's persistence behavior against that binding instead of a hand-written database mock.

The suite covers Better Auth sessions through the actual Drizzle adapter, owner isolation, saved SEO reports, foreign keys and batch rollback, revision-based updates, active-run and rolling quota reservations, and deletion that retains quota accounting. It also checks persistence after disposing and restarting Miniflare on the same directory, and isolation from a second persistence directory. It creates fixture records and cleans up its runtimes and temporary storage. It does not load `.dev.vars`, inspect the development database, or call OpenAI or DataForSEO.

This suite caught a D1-specific deletion regression: `meta.changes` includes the trigger that removes associated tool records, so a successful deletion could report more than one change and incorrectly return a conflict. The deletion now uses `UPDATE … RETURNING id` to verify its exact owner/revision match. The integration case verifies both the erased tool records and the retained quota tombstone.

Run this suite for changes to migrations, D1 stores, reservation SQL, ownership predicates, or emulator configuration. Keep `bun run test` for focused unit and contract tests, and `bun run test:gui` for browser flows. No validation count is implied here; record the actual command result when it runs. Cloudflare documents Miniflare's D1 binding as a programmatic local testing option. [D1 programmatic testing](https://developers.cloudflare.com/d1/best-practices/local-development/#test-programmatically)

## D1 now; reconsider Postgres when requirements justify it

Keep D1 for this pilot. Authentication, saved reports, owner predicates, compare-and-swap updates, and quota reservations already use it. Persistent local data does not require a database migration. There is no measured production workload demonstrating that these queries exceed D1's capacity.

Track database size, serialized evidence-row size, query duration, concurrent writes, and overload errors as real usage grows. Cloudflare currently documents a maximum database size of 500 MB on Free or 10 GB on Workers Paid, a 2 MB row/string/blob limit, and single-threaded query processing per database. Those are concrete constraints to measure against, not a forecast of how many Folio customers it can serve. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

Revisit Postgres when measured workload or a specific feature calls for it: sustained write contention after query/index improvements, a data model that cannot fit the chosen database-size strategy, a required SQL extension, or transaction semantics that Folio cannot implement cleanly with its current D1 operations. Define that requirement and benchmark the alternatives before moving authentication and all stores. A Postgres migration would need schema/data migration, a runtime connection approach, and fresh ownership, quota, and recovery tests.

Large HTML captures and evidence bundles are a separate storage question. A future design could put those objects in R2 while keeping ownership, hashes, lifecycle state, and indexes in D1. That is a proposed optimization; Folio currently stores its evaluation evidence in D1 JSON and has no R2 evidence implementation.

## Production remains separate

Provisioning a real D1 database, replacing the placeholder ID, applying remote migrations, configuring Worker secrets, deployment, and validating production recovery remain deployment work. A persistent Miniflare directory and a private SQL export do not perform any of those steps. See [architecture](../ARCHITECTURE.md), [Cloudflare/auth setup](cloudflare-auth.md), and [current launch work](../TODO.md).
