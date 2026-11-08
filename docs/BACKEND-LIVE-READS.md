# Live database reads and Worker connection lifetime

Production selects the already migrated PostgreSQL store using `DB_ENGINE=postgres`
and its existing Hyperdrive binding. Local development defaults to D1. Both
application stores and Better Auth follow the selected engine; failures do not
switch to another store. No migration or record copy is required by this fix.

The prior deployed backend kept a module-level `pg.Pool`. Workers cannot reuse
request-owned sockets across invocations. `workers/backend.ts` now wraps each
fetch in `withDatabaseRequest`; its AsyncLocalStorage map shares a pool only
within that request and closes it on success or failure. Concurrent invocations
have separate maps. Hyperdrive handles upstream pooling. `maxUses: 1` also
releases sockets for local Next routes outside the Worker wrapper. Connections
and queries have bounded timeouts. Failed operations, including writes, are
never automatically retried. Adapter batches use one connection and an explicit
transaction, preserving atomic store operations.

The runtime PG compatibility adapter and Better Auth PG schema match those used
by the existing production branch. This release brings that runtime into the
main checkout with the connection-lifetime correction; it does not run a new
PostgreSQL cutover or enable the reconciliation scheduler.

The dashboard, Index and source-answer tables read `/api/public/benchmarks`.
That API reads only explicit public projections and merges the dated published
catalog; it does not read private owner records or initiate research. Successful
responses carry `X-Folio-Public-Source: live-published-data`. The frontend no longer
substitutes a saved snapshot after a read failure. A bounded failure returns 503
and a retry message, while an already loaded result remains readable.

Live retrieval is distinct from fresh collection. Catalog HTML checks still show
their capture dates. Published technical audits and private workspace sections
retain their dedicated APIs and ownership checks. Opening or refreshing any of
these pages does not authorize a new provider run.

## Regression coverage

`tests/pg-request-scope.test.ts` checks concurrent request isolation and cleanup
without retries. `tests/pg-request.integration.ts` exercises a disposable local
PostgreSQL instance: sequential/concurrent public-store reads, real Better Auth
sign-up/sign-in/session reads, and atomic adapter-batch rollback. It accepts only
an explicitly provided loopback fixture on port 54679, never a production URL.
Run it with `node --conditions=react-server --import tsx --test tests/pg-request.integration.ts`
and `FOLIO_PG_TEST_URL` pointing at a fresh disposable fixture. Do not load provider
credentials or reuse development records for this test.

Browser regressions verify that refreshing live published data updates both the
Index comparison and its exact source answer, without API writes. CI dry-builds
and starts both actual Worker entry points after the OpenNext build.

Connection-lifetime reference: [Cloudflare Hyperdrive connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/).
