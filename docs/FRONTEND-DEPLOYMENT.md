# Frontend deployment

The UI checkout uses local D1, while the existing production `folio-visibility`
Worker selects PostgreSQL through Hyperdrive. Deploying the local default
`wrangler.jsonc` would overwrite that production runtime. Use the separate
`wrangler.frontend.jsonc` entry point for this UI release.

The backend's production configuration requests Singapore placement with
`placement.region = "aws:ap-southeast-1"`. This is a Cloudflare placement hint,
not a database migration or a data-residency guarantee. The existing database
is in Sydney; measure live request latency after placement changes. The frontend
remains at the edge, with backend HTTP calls using the service binding.

`folio-frontend-preview` serves the generated OpenNext UI on its Workers URL.
The `production` environment deploys `folio-frontend` in front of the existing
`usefolio.site` custom-domain application. It forwards `/api` and `/api/*`
requests unchanged through the `FOLIO_BACKEND` service binding, and does the same
for the internal pages `/admin`, `/folio-internal` and `/folio-internal/*`. Authentication,
cookies, record ownership, provider limits and database operations remain in
`folio-visibility`; the frontend receives no database binding or provider secrets.
No migration or production record copy is required for a presentation release.

The backend's PostgreSQL sockets are request-scoped through
`workers/backend.ts` and `src/lib/pg/request-scope.ts`. Hyperdrive owns upstream
connection pooling; no `pg.Pool` or socket is retained across Worker invocations.
Authentication and stores select the same explicit `DB_ENGINE`. Local development
still defaults to D1; an error never changes the selected database.

`GET /api/public/benchmarks` reads explicit public projections from the selected
database and merges the dated published catalog. Successful reads identify
`X-Folio-Public-Source: live-published-data`. Its frontend deadline is twelve
seconds; failures return 503 rather than silently substituting a bundled snapshot.
The dashboard retains its last successful data when a refresh fails and displays
an error. Private, authentication and paid endpoints are forwarded once without
fallback or retries. No browser navigation starts fresh agent collection.

The Index comparison and original-answer panels share one validated public GET.
Refresh updates both from the same response, including newly published shared
questions and model identities. Its default comparison includes every question with a published answer in the
current response, including expanded scenarios and explicit shared questions.
Questions without a published answer remain available through their original
question links and render an unmeasured state. The landing answer table also
uses this live public read. HTML catalog checks remain dated captured artifacts;
published page audits use their existing public API. Live retrieval does not mean
all underlying observations were freshly collected.

OpenNext is pinned to 1.20.16 for Next.js 16.4.5 runtime support. The prior 1.20.6
adapter built successfully but crashed in Workers loading `preview-props.json`.
CI now runs `frontend:smoke` against the actual built Worker, without database or
provider bindings, to catch initialization failures before deployment.

The existing public-index Worker retains `/api/question-index*`; the preview
also forwards that API through its public-index binding. Current
`/leaderboard` requests render the new UI. Explicit legacy `view=questions`,
`cohort`, and `q` links forward to `folio-public-index` using a separate service
binding, avoiding recursive public URL fetches.

Build after stopping a dev server in the same checkout:

```sh
bun run cf:build
bunx wrangler deploy --config wrangler.frontend.jsonc
# After preview verification and explicit production authorization:
bunx wrangler deploy --config wrangler.frontend.jsonc --env production
```

`staging.usefolio.site` is a third deployment of the same build, for reviewing UI before production:

```sh
bunx wrangler deploy --config wrangler.frontend.jsonc --env staging
```

It is its own Worker (`folio-frontend-staging`) on a custom domain, bound to the production backend and public
index, so public pages show real published data and nothing is copied. `FOLIO_NOINDEX=1` adds
`X-Robots-Tag: noindex, nofollow` to every response. Sign-in does not work there: the backend's auth origin is
`https://usefolio.site`. Deploying it does not touch the production routes.

The preview is interactive for public pages. Account OAuth callbacks retain the
production origin; use the final `https://usefolio.site` domain for real sign-in.
Opening pages, switching themes and reopening saved evidence must not start paid
provider work. Do not create a paid test run as a deployment smoke check.

Before switching production routes, save the current route IDs/patterns/Workers
and backend deployment version in an ignored private deployment folder. Verify
the production API projection, anonymous private boundaries, assets, theme picker
and route navigation. Rollback restores the recorded routes; the original backend,
landing and public-index Workers remain intact. The frontend deployment does not
deploy or enable the reconciliation scheduler.

The custom entry point follows [OpenNext's custom Worker pattern](https://opennext.js.org/cloudflare/howtos/custom-worker)
and [Cloudflare HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/).
