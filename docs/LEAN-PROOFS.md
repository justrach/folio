# Lean proofs

`proofs/` is a Lean 4 project holding formal models of Folio's rules. It is a scaffold: one module, one invariant, and the build and CI wiring to add more.

## What exists

| File | Content |
| --- | --- |
| `proofs/lean-toolchain` | Pins `leanprover/lean4:v4.35.0`. |
| `proofs/lakefile.toml` | The `folio` package and its `Folio` library. No dependencies. |
| `proofs/Folio.lean` | Library root. Imports every proven module. |
| `proofs/Folio/Navigation.lean` | Model and proofs for "navigation never spends". |

`Folio/Navigation.lean` models an evaluation workspace that receives two kinds of event: `navigate`, carrying the same four optional fields as `EvaluationIntent` in `src/lib/evaluation-navigation.ts`, and `launch`, the explicit owner start. It proves:

- `paidRuns_eq_launches`: after any sequence of events, the paid-run count equals the starting count plus the number of `launch` events.
- `navigation_never_spends`: a sequence made only of `navigate` events, whatever query context they carry, leaves the paid-run count unchanged.

## What this does and does not establish

The proofs are about the model. The model was transcribed by hand from the rule in `AGENTS.md` ("a query parameter carries context, never spending authority"). Nothing reads, generates, or checks the TypeScript, so the proofs do not show that the application obeys the rule. A code change that starts a paid run from a query parameter would leave `lake build` green.

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

Candidates: the evaluation run lifecycle and its legal transitions, the login-return route allowlist, and the reconciliation job's rule that it retrieves existing sessions and never creates paid tasks. [Workflow state machines](STATE-MACHINES.md) lists the reviewed workflow families a model would start from.
