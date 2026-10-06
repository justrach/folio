# Codegraff gateway fleet research and website experiments

This opt-in local experiment uses a **Codegraff gateway fleet sandbox** (`provider: "fleet"`, on Condensation infrastructure), rather than creating an OpenAI Agents session. It can export a private Markdown report from a confirmed answer, or a clearly incomplete source packet if the run did not finish. It does not switch Folio's existing website evaluations, keyword API, UI, storage, or publication pipeline to another provider.

## What runs where

1. The local command reserves a unique experiment directory and request ID before provider work.
2. Search mode calls Codegraff's `/v1/search` once and retains bounded search evidence. Explicit `--website` mode instead captures up to six public same-site HTML pages and their deterministic checks, without a search request.
3. The Codegraff gateway creates a finite 15-minute ephemeral fleet sandbox using the same `CODEGRAFF_API_KEY` as search. The host writes the evidence and research prompt into that sandbox without putting its API key in guest shell commands. Sandbox API authentication is separate from Graff's guest model authentication; see below.
4. A detached `graff` invocation reads that evidence and produces an answer. Status polling does not launch another model turn. Full bounded output is retained separately from the parsed answer; failed, incomplete, or invalid output is not labelled a completed observation.
5. The runner requests deletion and checks for a terminal sandbox state. A failed status request is not proof of cleanup. Unknown costs stay unknown.

This is **host-side search followed by sandboxed Codegraff analysis**, not evidence that the agent autonomously selected and called a search tool. The prompt restricts research to the supplied evidence, but that is an instruction, not a network-isolation guarantee. Returned citations are checked against the supplied URLs, not independently captured or fact-checked. This is not a consumer ChatGPT visibility measurement or a Folio verification score.

## Run explicitly

Use the repository's Bun 1.4.1 and Node 22.13+ environment. Configure `CODEGRAFF_API_KEY` (`cg_sk_`) in the process environment or the existing ignored `.dev.vars`. `CONDENSATION_API_KEY` is no longer required for this command; it remains for the separate historical direct-fleet trial scripts. Existing process values take precedence; the command does not modify configuration. Do not paste credentials into command arguments.

```sh
bun run experiment:search --help

bun run experiment:search run \
  --id terminal-tools-01 \
  --query "Which coding harnesses support terminal workflows?" \
  --confirm-spend

bun run experiment:search inspect --id terminal-tools-01
bun run experiment:search report --id terminal-tools-01
```

## Captured website evaluation

```sh
bun run experiment:search run \
  --id website-codegraff-01 \
  --website https://codegraff.com/ \
  --confirm-spend

bun run experiment:search report --id website-codegraff-01
```

`--website` selects **host website capture → frozen evidence → sandbox analysis**, not the existing Luna/Jev crawl or a production provider switch. Optional `--query` focuses that website evaluation. It spends sandbox/model credits, but does not perform the paid host search. Only public HTTPS URLs without credentials, query parameters or custom ports are accepted. The host uses public-address-pinned fetching, sends no cookies or provider authorization to the website, executes no page scripts and submits no forms.

Capture starts with the submitted page and follows extracted links on its exact HTTPS origin. Up to six distinct page attempts count, including failures. Auth/API, query-bearing and download links are excluded. Each HTML response is limited to 5 MB and ten seconds; saved text retains at most 6,000 characters per page. Known access challenges are not treated as the requested page. Host-selected traversal prioritizes product/pricing/about/FAQ/documentation links, but coverage remains limited and is not autonomous agent browsing. Captures include timestamps, text/HTML hashes, byte counts, truncation markers and failed attempts. Persistence is required before creating a sandbox.

The existing HTML parser supplies ten deterministic checks for each successful capture. Their observations are saved separately from model advice; no new overall score is computed or passed to the model. The answer must use structured prioritized findings tied to exact saved page quotes or saved check IDs. Missing references, invented quotes/checks/URLs, mismatched output and unsupported score fields fail validation. Quote occurrence checks do **not** establish semantic support, truth or recommendation quality. A model can still misinterpret real evidence.

The private website report separates deterministic checks, unverified model advice and the frozen source packet. It does not establish sitewide absence, browser accessibility, rankings, traffic, security, conversions or consumer-chat visibility. Completed advice requires complete successful output, confirmed guest attachment and confirmed sandbox cleanup. Failed/uncertain executions can export only a clearly incomplete evidence packet after cleanup is confirmed. Existing search receipts and reservations retain their original method and behavior.

The default inference model is `glm-5.3-flash`; `--model` selects a different model identifier, subject to the provider account's actual access. The coding subagent used to implement this command is separate from the inference model selected for an experiment.

`run` sends the question and supplied evidence to Codegraff and incurs model and sandbox usage; search mode additionally incurs search usage. Choose a question that is appropriate to share with these services; do not include secrets or unrelated private project context. The runner does not upload this repository. `--confirm-spend` applies to this one explicit start, not background launches. `inspect` and `report` only read local output; neither loads provider credentials or makes provider requests. `report` requires confirmed sandbox cleanup and preserved search or website evidence. It includes a model answer only when execution and output completed; otherwise it writes an explicitly incomplete source packet and exits nonzero.

## Inspect and recover

Private artifacts are saved under the gitignored `.local/condensation-search/<id>/` directory, with owner-only permissions on newly created directories and files:

- `reservation.json`: local request ID, model, query, gateway-fleet provider, and reservation time. This local ID is not a documented gateway idempotency key.
- `receipt.json`: latest lifecycle state, frozen search or website evidence, full bounded raw output, parsed answer when valid, errors, and cleanup state. New receipts identify `codegraff-gateway-fleet` and preserve the gateway request header when available; older `condensation-own-fleet` receipts keep their original provider.
- `receipt.pending.json` may remain if an interrupted local write did not finish. Preserve it together with the other artifacts.
- `report.md`: a local, non-overwriting export with supplied sources, method limitations, and either a validated model answer or a no-answer notice. It is not a Folio saved evaluation or a public report.

`inspect` prints the saved receipt, including the raw output and parsed answer. The command returns a nonzero exit code unless the answer completed and cleanup was confirmed. An existing experiment ID is always refused by `run`, even if its receipt is missing or malformed. A new ID means a **new paid experiment**, not a resume. Do not remove or rename a directory just to bypass this check.

There is no automatic restart or recovery command. On uncertain creation or execution, keep the reservation and inspect the provider's inventory before any deliberate new attempt. Gateway create idempotency is not documented. The saved request ID is local correlation, not permission to resend a create. Inspect the owned gateway sandbox inventory before deciding how to recover; another POST may create a second paid lease. If the local process is killed, cleanup may not run; the lease is finite, but expiry and actual charges are not inferred as confirmed. On a bounded execution timeout, the runner attempts cleanup, so output not yet retrieved may be lost. Save the returned evidence before analysing or sharing it; sandbox files are ephemeral.

This script is local experimental infrastructure, not a durable background job suitable for a Cloudflare request handler. Integrating it into Folio's application requires persisted owner-scoped reservations, recovery/reconciliation, cost reporting, and explicit user starts. No production deployment is included.

## Provider contract and verification

The active implementation builds on `src/lib/codegraff-sandbox.ts` and the [Codegraff sandbox guide](https://codegraff.com/docs/sandboxes). Host requests use `https://gateway.codegraff.com/v1/sandboxes` with `Authorization: Bearer <CODEGRAFF_API_KEY>`. Create explicitly sends `{ "provider": "fleet", "autoStopMinutes": 15, "codegraff": true }`; it never silently falls back to standard sandboxes. `codegraff: true` requires the new provider attachment feature described below, not an assumption that arbitrary direct-Condensation fields are forwarded. Direct options such as `leaseSeconds` and `requestId` are not used.

Fleet supports synchronous commands up to 60 seconds, not the gateway's standard-provider async exec API. Each short setup/status/output command requests 15 seconds; the one detached agent invocation retains its own 300-second limit and is only inspected thereafter. Exec responses must contain `exitCode` and combined output in `result`; incomplete/truncated responses are not accepted. Gateway fleet maps ready state to `started`, and terminal states to `destroyed` or `error`. Full model output is size-checked and fetched through `/download`, not encoded into capped stdout; the 128 KiB receipt limit still applies. The runner does not call the unsupported fleet meter or invent a gateway pricing endpoint. Costs remain unknown.

Cleanup requires a later GET reporting `destroyed` or `error`. Ended fleet records remain readable for billing. A 404 is not proof of cleanup, even after a successful DELETE; neither a failed status request nor a successful DELETE by itself proves cleanup.

### Guest model authentication

The host's `cg_sk_` key authenticates sandbox HTTP calls and never enters guest shell commands or files. The provider-side attachment feature installs a separate lease-bound, model-only credential in the guest. The runner requires a `codegraff` success object with `attached: true`, `scope: "inference"`, a future `expiresAt` equal to the sandbox lease expiry, `modelBaseUrl: "https://gateway.codegraff.com"`, and `command: "graff"`. It records the confirmed attachment without retaining any credential. Bare delegated `cg_lt_` credentials in output are redacted too.

An old gateway may ignore `codegraff: true` and return an ordinary sandbox. A missing, expired, mismatched, or broader-scope marker is refused before any guest exec; the known sandbox ID is preserved for cleanup. An attachment-failure error can also preserve `error.sandboxId`, never raw provider messages or credentials. New completed gateway reports require the recorded attachment confirmation; historical direct-Condensation reports keep their original contract.

**Provider validation versus Folio validation:** on September 29, 2026, the provider agent reported deploying the host, wallet, and gateway attachment changes under separate explicit authorization, with 33/33 live security checks. Those checks covered the guest credential, direct guest model calls, budget/revocation behavior, and `graff --help` startup—not a completed Graff research turn. The current public sandbox guide now documents the attachment option. Folio's local migration passed 44 focused fixture tests and `bun run typecheck`; this task did not start a paid Folio experiment. A supervised host-search → guest Graff answer → full-output download → report/cleanup pilot is still needed to validate this command end to end. Neither the local fixtures nor the provider's security pilot establishes that final outcome.

The historical `src/lib/condensation-fleet.ts` adapter and standalone direct-fleet trial scripts remain unchanged. CLI filenames and `.local/condensation-search/` are deliberately retained so existing IDs/reservations cannot be bypassed by the provider migration; old receipts still export under their original method label.

Focused offline checks:

```sh
node --conditions=react-server --import tsx --test \
  tests/codegraff-sandbox.test.ts \
  tests/condensation-fleet.test.ts \
  tests/sandbox-website-evidence.test.ts \
  tests/condensation-search-experiment.test.ts \
  tests/condensation-search-cli.test.ts \
  tests/condensation-report.test.ts
bun run typecheck
```

The website extension passed 61 focused fixture tests, the CLI help check, and `bun run typecheck` in Folio's own environment on September 30, 2026.

A separately authorized September 30, 2026 website pilot captured six public Codegraff pages, preserving their excerpts and sixty deterministic HTML checks. Create confirmed the secure guest attachment. The attempt then stopped during reserved execution with gateway HTTP 503 before any model output was retained; its execution remains **uncertain**. A later GET confirmed terminal sandbox cleanup. A private **incomplete source packet** was exported successfully (the command intentionally exits nonzero for an incomplete answer). Costs remain unknown. This validates real capture and cleanup, not a completed Graff website assessment or recommendation quality. The provider agent was asked to investigate without replaying the job; no replacement paid pilot was automatically started.

These tests use fixtures, not paid provider calls. Passing them establishes local gateway-fleet orchestration, historical receipt compatibility, and output handling, not live Codegraff/Condensation availability, guest model access, billing accuracy, or production readiness.

One explicitly started public-question pilot on September 27, 2026 saved eight hosted-search results, but its execution was recorded as `uncertain` before any model output was retained. Sandbox termination was confirmed; total cost remains unknown. Its private `report.md` is therefore an **incomplete source packet**, not a Condensation-generated answer or evidence that production reports work. Do not rerun that reservation or launch a replacement automatically.
