# Postgres migration — working checklist

Not committed. Companion to [the migration plan](docs/POSTGRES-MIGRATION.md). Tick items only when the stated check passes.

## Decisions to make first

- [ ] **Cost snapshots: triggers or application code?** Four triggers in `0015` build `provider_cost_observations` rows with `iif`, `json_type`, `json_extract`, `unixepoch('now')`. Keeping them means hand-writing ~300 lines of plpgsql; moving them into a helper means one code path for both engines and testable accounting. Recommendation: move to code, keep DB triggers only for immutability and cascade deletes.
- [ ] **`provider_cost_latest` view.** Recreated in five migrations and depends on SQLite `rowid`. Needs either a Postgres-native rewrite (no `rowid`) or replacement by a query helper.
- [ ] **Local dev database**: Docker Postgres for `next dev`, or point dev at PlanetScale.
- [ ] **Hyperdrive**: create the Cloudflare Hyperdrive config for `folio/main`; the `pg` driver cannot open TCP from a Worker without it.

## Phase 1 — schema (done)

- [x] SQLite → Postgres DDL translation (31 tables, 13 triggers, 84 statements, 0 failures).
- [x] Column-for-column parity against D1 (`scripts/pg-parity.ts`: 31/31, 0 mismatches).
- [x] `json_valid` shim so `CHECK` constraints survive.
- [ ] Hand-port the 9 view statements, 4 cost triggers, 2 backfills (blocked on the decisions above).

## Phase 2 — stores

The 30 files that call `.prepare()`, ordered by how much SQLite-specific SQL they contain. Port order is deliberately bottom-up: cheapest first, hardest before auth.

| # | File | prepare | json_extract | json_each | other | Notes |
| ---: | --- | ---: | ---: | ---: | --- | --- |
| 1 | `lib/seo-store.ts` | 5 | 0 | 0 | `RETURNING` | **done**, `bun run test:pg` |
| 2 | `lib/seo-rate-limit.ts` | 1 | 0 | 0 | conditional upsert | exercised by the SEO detail route |
| 3 | `app/api/sites/route.ts` | 6 | 0 | 0 | — | no dialect risk |
| 4 | `app/api/scans/route.ts` | 6 | 0 | 0 | — | no dialect risk |
| 5 | `app/api/plans/route.ts` | 2 | 0 | 0 | — | no dialect risk |
| 6 | `app/api/leaderboard/route.ts` | 1 | 0 | 0 | — | public read |
| 7 | `lib/question-suites.ts` | 1 | 0 | 0 | — | |
| 8 | `lib/search-console-store.ts` | 4 | 0 | 0 | `RETURNING` | |
| 9 | `lib/typesafe-review-store.ts` | 4 | 0 | 0 | `RETURNING` | |
| 10 | `lib/typesafe-agent-tool.ts` | 6 | 0 | 0 | `RETURNING` | |
| 11 | `lib/keyword-research.ts` | 3 | 0 | 0 | `RETURNING` | |
| 12 | `lib/public-keyword-store.ts` | 4 | 0 | 0 | `RETURNING` | |
| 13 | `lib/provider-costs.ts` | 2 | 0 | 0 | — | reads the view — blocked on decision 2 |
| 14 | `lib/connected-websites.ts` | 2 | 0 | 0 | `RETURNING` | |
| 15 | `lib/sandbox-seo.ts` | 2 | 0 | 0 | `RETURNING` | |
| 16 | `lib/google-auth.ts` | 2 | 0 | 0 | — | token storage |
| 17 | `lib/github-auth.ts` | 1 | 0 | 0 | — | identity state |
| 18 | `lib/eval-deletion.ts` | 2 | 0 | 0 | `RETURNING` | deletion accounting |
| 19 | `lib/managed-seo-tool.ts` | 3 | 0 | 0 | `INSERT OR IGNORE`, `RETURNING` | adapter handles both |
| 20 | `lib/eval-reconciliation-job.ts` | 8 | 0 | 0 | 2-arg `MAX` | adapter handles it |
| 21 | `lib/keyword-benchmark-store.ts` | 22 | 2 | 0 | `RETURNING`, `batch` | largest reserve path |
| 22 | `lib/agent-api-key-store.ts` | 5 | 0 | 1 | `RETURNING` | |
| 23 | `lib/agent-observation-store.ts` | 4 | 0 | 1 | `RETURNING`, `batch` | |
| 24 | `lib/website-crawl.ts` | 11 | 1 | 2 | `RETURNING` | |
| 25 | `lib/visibility-service.ts` | 1 | 2 | 0 | — | |
| 26 | `lib/mcp-saved-evidence.ts` | 2 | 5 | 0 | — | MCP reads |
| 27 | `lib/folio-mcp.ts` | 0 | 0 | 0 | — | no SQL of its own |
| 28 | `lib/eval-store.ts` | 6 | 19 | 1 | `RETURNING` | **hardest read path** |
| 29 | `lib/agent-observation-service.ts` | 9 | 5 | 4 | `strftime` | **hardest**: json_each + date formatting |
| 30 | auth (`src/lib/auth.ts` adapter) | — | — | — | Better Auth | **last** |

Per store: port behind `DB_ENGINE`, run its unit tests on both engines, then its slice of the 37 integration cases.

## Phase 3 — verification

- [ ] Dual-run diff: replay representative reads against D1 and Postgres, diff results. Any mismatch is a compat bug.
- [ ] Concurrency: two-writer races on `rate_limit`, `agent_tool_calls`, `seo_agent_requests` must still admit exactly one.
- [ ] Timestamps: `int8` parsing, `bigint` columns, no `Invalid Date` anywhere.
- [ ] Cost parity: same usage rows in both engines (depends on decision 1).

## Phase 4 — cutover

- [ ] Flip writes store by store; freeze the D1 copy read-only as each flips.
- [ ] Auth last, in a maintenance window, with the D1 `session` table readable as fallback.
- [ ] Rollback rehearsed: one env flag reverts a single store.
- [ ] D1 exported, then removed from `wrangler.jsonc` after a retention period.

## Additional analysis to produce (unblocked by the above)

- [ ] **Per-store SQL feature matrix** — which stores use `json_each`, `strftime`, 2-arg `MAX`, `batch`, or `RETURNING`, and which of those the adapter handles vs needs manual SQL. Table above is the starting point; expand once the cost-snapshot decision is made.
- [ ] **Latency budget** — p50/p95 per route through Hyperdrive from an edge location vs D1, before any cutover decision.
- [ ] **Row-size audit** — largest `result_json` / `detail_json` / capture rows, to confirm the 2 MB D1 limit is not the only reason to move.
- [ ] **Auth risk note** — session invalidation plan, cookie domain, and what the maintenance window looks like.

## Definition of done

- [ ] `DB_ENGINE=postgres` passes the unit suite, the 37 integration cases and the persistence-touching browser specs.
- [ ] Dual-run diff empty for the representative read set.
- [ ] Auth verified in staging before cutover.
- [ ] D1 frozen and exported; configuration no longer references it.
