# Frontend deployment

The UI checkout uses local D1, while the existing production `folio-visibility`
Worker selects PostgreSQL through Hyperdrive. Deploying the local default
`wrangler.jsonc` would overwrite that production runtime. Use the separate
`wrangler.frontend.jsonc` entry point for this UI release.

`folio-frontend-preview` serves the generated OpenNext UI on its Workers URL.
The `production` environment deploys `folio-frontend` in front of the existing
`usefolio.site` custom-domain application. It forwards `/api` and `/api/*`
requests unchanged through the `FOLIO_BACKEND` service binding. Authentication,
cookies, record ownership, provider limits and database operations remain in
`folio-visibility`; the frontend receives no database binding or provider secrets.
No migration or production record copy is required for a presentation release.

The deployed backend intermittently hangs on public benchmark reads. Only
`GET /api/public/benchmarks` has a five-second bound and a fallback to the
repository's real published artifacts. The response and dashboard explicitly
label the snapshot; captured dates remain unchanged. A failed refresh preserves
the answer already being read, and an unavailable shared-question deep link does
not substitute another question. Private, authentication and paid endpoints are
forwarded once without fallback or retries. This does not repair or replace the
backend's database runtime.

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
