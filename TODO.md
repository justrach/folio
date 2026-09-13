# Folio TODO

Working checklist for completing the current website-evaluation pilot. Check items only after implementation and relevant verification. Provider credentials, deployment access, and external billing are dependencies, not completed features.

## Completed foundation

- [x] Annual-report-inspired landing page, dashboard, charts, and researched positioning.
- [x] Better Auth login and account-scoped D1 storage.
- [x] Technical website audits, reviewed repair downloads, and opt-in technical index.
- [x] Authenticated DataForSEO organic and backlink tools.
- [x] Managed OpenAI Agents API sessions, private evidence reports, reproducible demo, and background activity UI.
- [x] Proposed pricing and private plan-interest preferences.
- [x] Architecture, evaluation strategy, privacy boundaries, and competitor research documentation.
- [x] Push source to private `justrach/folio-01`, excluding credentials and private local data.

## Finish the pilot

- [x] Accept explicit owner-confirmed product/pricing reference answers for live evaluations; keep them out of model inputs and label their provenance.
- [x] Compare two private evaluation runs, showing per-check changes and whether captures/reference facts changed.
- [x] Provide an executable offline evidence-bundle verifier, with tampering tests and a documented command.
- [x] Save SEO lookups privately and reopen previous results without repeating paid provider calls.
- [x] Let the managed agent inspect an explicitly selected saved SEO report through a bounded application tool; do not give it unrestricted paid-provider access.
- [x] Add private evaluation-evidence deletion with lifecycle safeguards and preserved spending accounting.
- [x] Add an authenticated, bounded background reconciliation job and Cloudflare scheduling configuration; it may retrieve existing sessions but never create paid tasks automatically.
- [x] Add GUI and backend regression coverage for these workflows, then run type checking, unit tests, GUI tests, and the Cloudflare build.
- [x] Update README/architecture/evaluation docs and this checklist; push the completed changes to the private repository.

## Connected workflow and local runtime

- [x] Add repository-specific `AGENTS.md` guidance covering navigation, managed sessions, privacy, evidence semantics, tests, and existing authorization.
- [x] Default signed-in workspaces to saved audits and show recent private evaluations without requiring a technical audit first.
- [x] Carry exact website/report/run context through audit, SEO, evaluation, agent, comparison, and login flows without automatic paid starts.
- [x] Show account/target readiness, active-session blocking, and rolling run allowance beside the evaluation form.
- [x] Separate fresh website evaluation from paid frozen replay and make reports, exports, and comparisons directly reachable.
- [x] Use Bun for dependency installation and project/CI commands, with a pinned text lockfile and explicit supported Node tooling.
- [x] Make local D1 persistence explicit; add local migration status and private SQL backup commands.
- [x] Exercise actual Miniflare D1 bindings, Better Auth, repositories, concurrency, deletion accounting, restart persistence, and isolated stores.
- [x] Fix evidence deletion's D1 trigger-count mismatch using the conditional update's returned row.

## External launch dependencies

- [x] Configure a valid OpenAI Agents API key, approve a dedicated local test account, and verify one live managed run. Completed on 13 September 2026; credentials and private evidence remain outside Git. See [live validation](docs/LIVE-VALIDATION.md).
- [ ] Provision the production Cloudflare database, deployment secrets, and application hostname; validate the deployed scheduler. Local configuration currently uses a placeholder database ID.
- [ ] Resolve GitHub account billing/spending limits so hosted Actions can start. GitHub rejected the current workflow before any step ran.
- [ ] Choose/configure a payment processor before enabling actual subscriptions. Current pricing is a proposal and creates no charges.

## Subsequent product expansion

These are not claims about the current pilot: repeated independent cross-company trials and a public agent benchmark; consumer AI visibility collectors; verified domain ownership; team roles; automatic repair publishing; and paid recurring monitoring with enforced provider-cost credits. Each requires its own acceptance criteria before implementation or launch claims.

## Validation of this checklist

Completed locally: 108 unit tests passed; 45 desktop/mobile GUI tests passed (one intentional mobile authentication duplicate skipped); TypeScript passed; the OpenNext Cloudflare application build and scheduler dry-run build passed. Offline verification reproduced a downloaded fixture without network access. Real local Better Auth/D1 smoke checks passed. Paid provider responses were mocked for new tests; no additional DataForSEO or live OpenAI request was made.

Follow-up live validation: one actual managed OpenAI evaluation completed and its exported evidence reproduced offline. The required initial-input session creation was corrected, with 114 unit tests, 10 relevant desktop/mobile GUI tests, and TypeScript passing. See [live validation](docs/LIVE-VALIDATION.md) for the observed result and scope.

The implemented loop and manual improvement steps are documented in [EVALUATION-LOOP.md](docs/EVALUATION-LOOP.md). Offline verification now accepts saved SEO captures, with reproduction and tampering regression cases; all 116 unit tests passed and TypeScript checks passed.

Current workflow/runtime validation: Bun's frozen dependency installation, TypeScript, 124 unit tests, three real Miniflare D1 integration cases, the OpenNext Cloudflare build, and the scheduler dry run passed. The full browser suite found one same-page navigation failure (80 passed, one failed, one intentional mobile authentication skip). Query selection now uses native browser history; all 32 affected desktop/mobile checks passed afterward, including the failed case and a regression requiring no server-page request for same-page selection. No known test failures remain. Local migration status and a private SQL backup were verified, and the previously captured live evidence reproduced through the Bun command without network access. No additional OpenAI or DataForSEO work was started.

See [frontend workflow](docs/FRONTEND-WORKFLOW.md), [local D1 persistence](docs/LOCAL-D1.md), and [agent guidance](AGENTS.md) for operating the finished paths. Local tests do not establish hosted CI or production database readiness.

Production Cloudflare deployment, hosted CI account billing, and payment setup remain unchecked. Local live inference is not a claim that a deployed scheduler, hosted CI, or paid subscription has run.
