# Folio

A considered view of website discovery: source-backed page audits, managed website evaluations, reviewed repairs, and a public technical index. Built with Next.js, OpenNext for Cloudflare, Better Auth, D1, and real components from Rare UI.

Progress and remaining launch dependencies: [TODO.md](TODO.md).

## Run locally

Use Bun 1.4.1 for dependencies and package scripts. Keep Node.js 22.13 or later installed: the Node scripts, Wrangler CLI, and `node:sqlite` tests still use it; Miniflare runs the local Workers bindings.

```sh
bun install
bun run setup
bun run dev --port 3001
```

Open [the landing page](http://localhost:3001/) or [the dashboard](http://localhost:3001/overview). Setup preserves existing credentials and generates a fresh authentication secret only for a new environment. No Cloudflare account is needed for the local D1 emulator.

Local records persist in `.wrangler/state/v3` across restarts. Use `bun run db:status:local`, `bun run db:migrate:local`, and `bun run db:backup:local` to inspect migrations, apply them, or create a private local export. See [local D1 and runtime tests](docs/LOCAL-D1.md) for the shared persistence path, isolated Miniflare tests, and the D1/Postgres decision.

## What works

- Researched landing page, responsive dashboard, and interactive charts with sample provenance.
- Better Auth email/password sign-up, login, persisted sessions, and logout.
- Real bounded page audits, deterministic `readiness-v1` scores, evidence details, account-scoped saved history, and repeat scans. Initially allows `example.com`; extra hosts need operator review and `SCAN_ALLOWED_HOSTS` configuration.
- Review and download proposed title, description, and canonical changes as a ZIP. Downloads do not publish to the source website.
- Public technical scores from explicitly published audits, with rubric details, latest run timestamps, filtering, and revocable publication. Account-added sites are not verified domain ownership.
- DataForSEO organic domain overview and backlinks summary, as independent authenticated server-side tools. Missing data, partial errors, modeled traffic, and provider cost remain visible. Requests run only when explicitly initiated by an approved account.
- A managed OpenAI Agents API evaluation runner: account-approved starts, saved session IDs, remote execution, status reconciliation, cancellation, returned evidence, and private JSON exports. One live evaluation completed through the local application and its exported checks reproduced offline on 13 September 2026; see [live validation](docs/LIVE-VALIDATION.md).
- A reproducible browser demo that independently checks source hashes, expected product and pricing facts, citation references and literal quotes, answer structure, and HTML readability.
- Owner-confirmed product/pricing reference answers withheld from the model, side-by-side private run comparisons, and offline evidence-bundle verification.
- Saved private SEO reports that reopen without additional provider calls; an explicitly selected snapshot can be returned to the managed agent through its read-only `read_saved_seo_report` function.
- Terminal-run evidence deletion that preserves usage accounting, and an optional authenticated Cloudflare scheduler for retrieving existing session status.
- Proposed paid plans and an account-private plan-interest preference. No checkout or charge is created.

## Product routes

| Route          | Purpose                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| `/`            | Product story and evidence-based positioning                                           |
| `/overview`    | Signed-in audit results and recent private evaluations; optional sample report         |
| `/websites`    | Saved audit history and publication controls                                           |
| `/visibility`  | Sample buyer prompts and AI discovery view                                             |
| `/seo`         | Actual or sample technical page-check details                                          |
| `/search-data` | Explicit SEO lookup, saved reports, and prepared evaluation handoff                    |
| `/patches`     | Review, approve, and download repair suggestions                                       |
| `/leaderboard` | Sample benchmark and separate published technical scores                               |
| `/evaluations` | Versioned website suite, expected/observed checks, source evidence and private exports |
| `/agents`      | Managed sessions, status, returned items and background activity                       |
| `/pricing`     | Proposed plans, metered usage model and private plan-interest preference               |
| `/settings`    | Account and integration information                                                    |
| `/login`       | Better Auth sign-up and login                                                          |

Follow the [frontend workflow](docs/FRONTEND-WORKFLOW.md) to move from a saved audit or SEO report into evaluation preflight, inspect agent returns, export evidence, and compare or prepare a fresh run. Navigation prepares context; paid work starts only through the corresponding explicit action.

## Data and credentials

Store local secrets only in ignored `.dev.vars`; production credentials use Cloudflare Worker secrets. Nothing uses `NEXT_PUBLIC_` provider credentials. Paid DataForSEO access requires exact session user IDs in `DATAFORSEO_ALLOWED_USER_IDS`; an unverified email or new signup cannot grant access. The UI shows the account ID that the operator can approve. Managed OpenAI runs similarly require `OPENAI_ALLOWED_USER_IDS`, with a default rolling limit of one live attempt per account per day. These local commands approve an existing account without reusing provider credentials for login:

```sh
bun run seo:approve <account-id>
bun run agents:approve <account-id>
```

Restart the development server after changing `.dev.vars`. The run-count gate is not a monetary cap; configure provider-project spend controls separately.

See [DataForSEO integration](docs/DATAFORSEO.md), [Cloudflare and authentication](docs/cloudflare-auth.md), and [Agents API integration](docs/AGENTS-INTEGRATION.md). The DataForSEO adapter follows the bounded transport, response-envelope, and tool-boundary patterns reviewed in [OpenSEO](https://github.com/every-app/open-seo); Folio does not import that application.

## Evidence and scope

AI visibility trends, sample company profiles, citations, and the sample index are illustrative fixtures. They are never stored as measured results or mixed into the published-audit endpoint. A technical readiness score does not establish Google position, live model citations, or task success. DataForSEO uses a separate provider index; its traffic is estimated, and its authority rank is not Folio's readiness score.

The managed Agents API is used by `POST /api/evaluations`: Folio reserves a private run in D1, captures approved website HTML, and persists a creation-attempt marker before making one `POST /v1/agents/sessions` request containing the initial task and captured evidence. The `none` environment requires initial input. Folio saves the returned session ID; it does not send a second initial-input event. A lost or unreadable creation response may mean a billable task started without a recoverable ID, so Folio preserves the uncertainty and never automatically retries creation. The browser polls saved sessions while visible; OpenAI runs the task remotely. Folio requires a completed turn and valid returned JSON before running its deterministic verifier. It does not treat an idle session as a successful result. No SDK or Responses API is substituted for the requested managed runtime.

Live product/price correctness remains unmeasured when no reference answer is supplied. Owners can explicitly confirm reference answers before starting a run; Folio does not independently certify those references as truth. References stay out of model inputs, and replays retain their original references and captures. Exact quotes prove text occurrence, not semantic correctness.

A selected saved SEO report is frozen with the run and exposed through one read-only managed function. The agent cannot fetch another report or start a paid DataForSEO lookup. Returning the selected evidence requires an explicit owner action and may resume OpenAI inference; one durable tool reservation prevents duplicate submissions.

Multi-provider AI monitoring, independent repeated reader trials, scheduled creation of new audits, webhooks/queues, automatic source deployment, payment processing, team seats, and a populated public AI-task leaderboard remain future work. The optional scheduler retrieves existing remote sessions in bounded batches; it never creates tasks or supplies pending tool results. It is disabled until its production service binding and shared secret are configured. See [background jobs](docs/BACKGROUND-JOBS.md).

Competitive research found substantial existing overlap. Folio is positioned around its focused, inspectable workflow, not exclusive features: [AEO platforms](docs/research-aeo.md), [SEO suites](docs/research-seo.md), and [evaluation products](docs/research-evaluations.md). The landing page links the primary sources.

## Architecture, evaluations, and business model

- [FRONTEND-WORKFLOW.md](docs/FRONTEND-WORKFLOW.md): account-aware overview, target/report handoffs, launch preflight, private inputs, agent returns, and replay versus fresh evaluation controls.
- [EVALUATION-LOOP.md](docs/EVALUATION-LOOP.md): one run from capture through managed execution, independent verification, private review, and explicit retesting; includes a flow diagram and current improvement-loop gaps.
- [ARCHITECTURE.md](ARCHITECTURE.md): Next.js/OpenNext, Cloudflare D1, Better Auth, managed session lifecycle, data flow and private/public/provider boundaries.
- [LOCAL-D1.md](docs/LOCAL-D1.md): persistent local bindings, migration/status/backup commands, isolated D1 integration tests, and database growth decisions.
- [EVALUATION-STRATEGY.md](EVALUATION-STRATEGY.md): frozen inputs, independent expected facts, eight verification checks, reproducibility, and requirements for a fair future benchmark.
- [MONETIZATION.md](docs/MONETIZATION.md): proposed Free, $49 Builder and $199 Team plans, usage credits, cost assumptions, and billing work still required. Payment never changes a score or rank.

## Verify and compare evidence

Download a private evaluation bundle and verify it locally without network access:

```sh
bun run eval:verify /path/to/folio-evaluation.json
```

The command checks source hashes and recomputes saved outcomes. It cannot authenticate a provider or prove a source is true. The Evaluations page also compares completed runs while separating demo/live results and flagging changed captures, references, and denominators. See [verification guide](docs/VERIFY-EVIDENCE.md).

Deleting saved evaluation evidence removes its captures, answers, reference facts and tool records from Folio. Minimal usage-accounting tombstones remain. It does not delete OpenAI sessions, provider backups, existing downloads, or the separate saved SEO report.

## Validation

```sh
bun run typecheck
bun run test
bun run test:d1
bun run test:gui
bun run cf:build
bun run scheduler:build
```

GUI tests use a running server at `http://localhost:3001` (override with `GUI_BASE_URL`). Install the test browser once with `bunx --no-install playwright install chromium`. They cover desktop/mobile navigation and overflow, dialog keyboard interaction, filter/search/drilldown behavior, downloads, real Better Auth flows, tenant-data clearing, reproducible evaluation exports, managed run navigation, and plan preference controls. External provider/evaluation responses are mocked in GUI tests so the suite cannot spend DataForSEO or OpenAI credits. Scanner/provider unit tests cover trust boundaries, exact provider payloads, meaningful score changes, and partial/error cases.

`test:d1` applies migrations and tests ownership, reservations, revisions, deletion accounting, restart persistence, and store isolation through a real local Miniflare D1 binding. Its temporary fixture store is separate from development data and requires no provider credentials.

The Cloudflare production database ID is intentionally a local placeholder until a real database is provisioned. No production deployment is claimed. Avoid running a Next production build and the development server against `.next` simultaneously; stop/restart the dev server around the build.

## Design references and attribution

The annual-report reference informed the cream/green/chartreuse palette, editorial typography, printed-chart details, and Folio brand. Layout studies used Mobbin [Framer Analytics](https://mobbin.com/screens/27a96864-839c-45f8-b1f4-479672827122) and [Mixpanel](https://mobbin.com/screens/10d76bb3-6f65-4805-ad42-30ee24ec78e2). `AnimatedCounter` and `NotificationBell` are vendored from [Rare UI](https://github.com/swamimalode07/rare-ui), with source revision and MIT attribution retained in [LICENSES/rare-ui.txt](LICENSES/rare-ui.txt).

Agent interaction studies used actual [Beautiful UI](https://www.beautifului.dev/) demos in Chrome: task rows, tool chips, context cards, and inspectable returns. The [research notes](docs/BEAUTIFUL-UI-RESEARCH.md) distinguish observed interactions from Folio implementation choices; no Beautiful UI source code is vendored.
