# Background evaluation reconciliation

Folio includes a separate Cloudflare scheduled Worker that refreshes existing managed OpenAI sessions while the browser is closed. It is disabled by default and has not been deployed or tested against a live OpenAI account. OpenAI runs the agent; this Worker retrieves already-created session state and saves the independently verified result in Folio's private D1 records.

The scheduler has no HTTP handler, Workers.dev URL, or preview URL. Its scheduled handler invokes the app through the `FOLIO_APP` service binding. The app's `POST /api/internal/evaluations/reconcile` requires an exact shared server secret and an explicit enabled flag. The endpoint returns 404 for missing or invalid authorization and when disabled. It never accepts an account, target, run ID, batch size, or provider URL from the caller. Successful responses contain aggregate counts only.

## Execution boundaries

- Every five minutes, the enabled scheduler requests one batch of at most three active live runs. Demo and terminal runs are excluded.
- A D1 lease prevents overlapping scheduled invocations for ten minutes. The lease is acquired atomically; an invocation releases only its own token. A crashed invocation's lease expires.
- A separate attempt timestamp rotates runs across owners even when a provider repeatedly fails. Browser updates do not reset this ordering.
- The existing `reconcileEvaluationRun` function reads session, turns, and saved items. Pagination is capped at ten pages per collection; each provider request has a thirty-second timeout. The three selected runs execute concurrently.
- The job does not create sessions, submit or repeat input, execute application tools, approve spend, restart failed work, send messages, or publish evaluations. A `requires_action` tool request remains available for the owner to review and resume explicitly in the application.
- A completed provider turn and a valid final JSON contract are required before deterministic verification. Idle alone never becomes success. Optimistic D1 revisions protect against a browser and the scheduler updating the same run concurrently; a conflict is counted as a failed refresh and retried on a later scheduled pass.
- This is bounded polling, not a queue with guaranteed delivery or an exactly-once promise. Retries only repeat reads. There is no automated provider session deletion or retention job.

## Configure a real deployment

1. Replace the all-zero D1 placeholder in `wrangler.jsonc` with the real production database ID. Apply all migrations, including `0006_background_lease.sql`, to that database. The scheduler itself has no D1 or OpenAI binding.
2. Deploy the OpenNext app and ensure its Worker name matches `services[].service` in `wrangler.scheduler.jsonc` (`folio-visibility` by default). Run `bunx --no-install wrangler whoami` before an actual deployment.
3. Generate a random secret with at least 32 characters. Set the same value, via secret prompts, on both Workers:

   ```sh
   bunx --no-install wrangler secret put EVALUATION_RECONCILE_SECRET --config wrangler.jsonc
   bunx --no-install wrangler secret put EVALUATION_RECONCILE_SECRET --config wrangler.scheduler.jsonc
   ```

4. Set `EVALUATION_RECONCILE_ENABLED` to `"true"` in the app deployment and scheduler configuration. The app also needs its existing `OPENAI_API_KEY`; only accounts explicitly approved for paid work can create managed sessions. Enabling reconciliation grants no account permission to create a run.
5. Validate the scheduler bundle locally with `bun run scheduler:build`. Deploy with `bun run scheduler:deploy` when the app binding, migrations, secrets, and flags are configured. The local `.dev.vars.example` describes the disabled defaults. Never commit secrets or run bundles containing private website evidence.

To stop refreshes, disable the flag on either Worker; removing the scheduler's `triggers.crons` array also removes the schedule on its next deployment. Existing OpenAI work can continue independently until explicitly cancelled through Folio. Rotating the secret requires updating both Workers.

## Verification

`tests/eval-reconciliation-job.test.ts` uses real SQLite migration/lease SQL and mocked provider HTTP. It checks closed authentication, batch bounds, fairness after failures, lease overlap and crash recovery, private aggregate responses, and the real completed-session verification path with GET requests only. No live provider call or paid task is part of this test suite.

Cloudflare reference: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) and [HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/).
