# Lean proofs

`proofs/` is a Lean 4 project holding formal models of Folio's rules: two modules, and the build and CI wiring to add more. One is a hand-written model only; the other shares its numbers with the TypeScript through a JSON file checked on both sides.

## What exists

| File | Content |
| --- | --- |
| `proofs/lean-toolchain` | Pins `leanprover/lean4:v4.35.0`. |
| `proofs/lakefile.toml` | The `folio` package and its `Folio` library. No dependencies. |
| `proofs/Folio.lean` | Library root. Imports every proven module. |
| `proofs/Folio/Navigation.lean` | Model and proofs for "navigation never spends". |
| `proofs/Folio/ReadPlan.lean` | Model and proofs for "parallel reads stay inside the connection budget". |
| `src/data/read-plan.json` | The read plan's numbers, imported by the TypeScript and checked against the Lean constants. |

`Folio/Navigation.lean` models an evaluation workspace that receives two kinds of event: `navigate`, carrying the same four optional fields as `EvaluationIntent` in `src/lib/evaluation-navigation.ts`, and `launch`, the explicit owner start. It proves:

- `paidRuns_eq_launches`: after any sequence of events, the paid-run count equals the starting count plus the number of `launch` events.
- `navigation_never_spends`: a sequence made only of `navigate` events, whatever query context they carry, leaves the paid-run count unchanged.

## Read plan

The website report (`loadWebsiteGaps`, behind `/websites`, `/orgs` and `folio_website_gaps`) was the slowest request on those pages. It ran its six reads one after another, and read saved question runs one round trip per run (up to 100), because each in-flight query can hold one of the database's few connections. It now runs up to `readLimit` reads at once (`withLimit` in `src/lib/sequential.ts`) and reads runs `savedRuns.batch` at a time (`batches`, `getKeywordBenchmarkRuns`). `Folio/ReadPlan.lean` is the argument that this stays inside the budget the sequential version was protecting:

- `inFlight_le_limit`: a scheduler that starts a read only while fewer than `limit` are in flight never has more than `limit` in flight, in any order of starts and returns.
- `reads_conserved`: waiting, in-flight and finished reads always add up to the reads asked for, so none is lost or run twice.
- `readLimit_fits_pool` and `reports_fit_budget`: one report's reads fit one request's pool (`requestPoolMax`), and up to `connectionBudget / readLimit` (7) reports built at the same moment hold at most `connectionBudget` (22) connections.
- `batches_flatten` and `batches_bounded`: batching reads every run exactly once, in order, in batches no larger than asked.
- `full_report_round_trips`: a full report's 100 saved runs take 5 round trips, where one per run took 100.

What ties this model to the code:

1. **The numbers are shared.** `src/data/read-plan.json` is imported by `website-gaps.ts`, `visibility-service.ts` and `db.ts`. `ReadPlan.lean` embeds the same file with `include_str` and `#guard`s each value against its Lean constant, so a fresh `lake build` fails when they differ. Lake does not track the JSON as an input and skips an unchanged `.lean` file, so `tests/read-plan.test.ts` repeats the comparison in `bun run test`.
2. **The scheduling rule is tested, not proved, in TypeScript.** `tests/read-plan.test.ts` runs `withLimit` and `batches` and checks the peak in-flight count, result order, the stop after a failure, and the batch sizes. The Lean scheduler is still a hand transcription of `withLimit`; nothing derives one from the other.

What it does not establish: latency. The proofs bound connections and round trips; how many milliseconds that saves depends on the database and is measured, not proved. The budget theorem also counts only website reports, not other requests in flight at the same time, and seven simultaneous reports now fill the budget where the sequential version allowed twenty-two. In production Hyperdrive queues beyond its pool instead of failing.

## What this does and does not establish

This section is about `Navigation.lean`. The proofs are about the model. The model was transcribed by hand from the rule in `AGENTS.md` ("a query parameter carries context, never spending authority"). Nothing reads, generates, or checks the TypeScript, so the proofs do not show that the application obeys the rule. A code change that starts a paid run from a query parameter would leave `lake build` green.

Browser and D1 tests remain the evidence for application behavior. Binding a model to the code needs a shared artifact that both sides are checked against, for example a JSON transition table that a Lean module proves properties of and a unit test compares with the TypeScript. That step is not implemented.

## Running

Install [elan](https://github.com/leanprover/elan); it reads `proofs/lean-toolchain` and fetches the pinned toolchain.

```sh
bun run proofs:check   # lake --dir proofs build --wfail
```

`--wfail` turns warnings into failures. Lean reports `sorry` as a warning, so an unfinished proof fails the check. It does not reject a declared `axiom`; review new ones with `#print axioms <theorem>`.

The `proofs` job in `.github/workflows/ci.yml` runs the same build through `leanprover/lean-action`, separately from the `validate` job.

## Adding a model

1. Create `proofs/Folio/<Name>.lean` inside `namespace Folio`.
2. Add `import Folio.<Name>` to `proofs/Folio.lean`. A module that is not imported there is not built or checked.
3. Name the TypeScript source the model mirrors in a doc comment, and state here what ties the two together, or that nothing does.
4. Run `bun run proofs:check`.

A model with numbers or tables in it should follow `ReadPlan.lean`: keep them in a JSON file under `src/data/`, import it from the TypeScript, and `#guard` it from Lean.

Candidates: the evaluation run lifecycle and its legal transitions, the login-return route allowlist, and the reconciliation job's rule that it retrieves existing sessions and never creates paid tasks. [Workflow state machines](STATE-MACHINES.md) lists the reviewed workflow families a model would start from.
