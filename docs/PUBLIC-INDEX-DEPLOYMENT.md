# Public Folio index routing

The `folio-public-index` Worker owns `usefolio.site/leaderboard*` and `usefolio.site/api/question-index*`. Its default `/leaderboard` GET/HEAD requests now reach the main `folio-visibility` application through the `FOLIO_APP` service binding. Direct service invocation bypasses public route matching and avoids a recursive URL fetch. Model/query parameters and response headers are preserved.

Earlier company-mention cohorts remain on `/leaderboard?view=questions`; existing `cohort` and `q` deep links also select that legacy view. Its forms retain the explicit view parameter. `/api/question-index` continues reading only allowlisted published snapshots, and non-GET/HEAD requests remain rejected. No private answers, account data or provider tokens are sent through the public projection. The main application links to the earlier cohorts from the model landscape.

Deploy the application with `wrangler.production.jsonc` after its OpenNext build, then deploy the routing/legacy worker with `wrangler.public-index.jsonc`. Both configurations and the legacy worker's source dependencies are maintained in this integration checkout. Deploying an older standalone-index configuration without the service binding would restore the old default route.

Six worker tests cover public projections, query ranks, legacy omission, corrupt data, method restrictions and the service-routing boundary. The standalone worker dry run and the main application build are separate checks. No provider requests are made by this routing layer.
