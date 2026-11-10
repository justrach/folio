/-!
# Navigation never spends

A model of the rule in `AGENTS.md`: navigation may select or prefill a target,
saved report, or run, but "a query parameter carries context, never spending
authority". Only an explicit owner launch creates a paid run.

This is a model of the rule, transcribed by hand. Nothing here inspects the
TypeScript; see `docs/LEAN-PROOFS.md` for what that does and does not establish.
-/

namespace Folio

/-- Context a URL may carry. Mirrors `EvaluationIntent` in
`src/lib/evaluation-navigation.ts`. -/
structure Intent where
  targetUrl : Option String := none
  seoReportId : Option String := none
  runId : Option String := none
  baselineId : Option String := none

/-- What can happen to an evaluation workspace. -/
inductive Event where
  /-- A link, direct entry, refresh, or back/forward step carrying query context. -/
  | navigate (intent : Intent)
  /-- The owner presses the explicit start control. -/
  | launch

structure Workspace where
  prefill : Intent := {}
  paidRuns : Nat := 0

def step (w : Workspace) : Event → Workspace
  | .navigate intent => { w with prefill := intent }
  | .launch => { w with paidRuns := w.paidRuns + 1 }

def run (w : Workspace) (events : List Event) : Workspace :=
  events.foldl step w

/-- How many explicit launches a trace contains. -/
def launches : List Event → Nat
  | [] => 0
  | .launch :: rest => launches rest + 1
  | .navigate _ :: rest => launches rest

/-- Every paid run is accounted for by exactly one explicit launch. -/
theorem paidRuns_eq_launches (w : Workspace) (events : List Event) :
    (run w events).paidRuns = w.paidRuns + launches events := by
  induction events generalizing w with
  | nil => rfl
  | cons event rest ih =>
    cases event with
    | navigate intent =>
      show (run (step w (.navigate intent)) rest).paidRuns = _
      rw [ih]
      rfl
    | launch =>
      show (run (step w .launch) rest).paidRuns = _
      rw [ih]
      simp only [step, launches]
      omega

/-- A trace made only of navigation, whatever its query context, starts no paid run. -/
theorem navigation_never_spends (w : Workspace) (intents : List Intent) :
    (run w (intents.map .navigate)).paidRuns = w.paidRuns := by
  have none : launches (intents.map .navigate) = 0 := by
    induction intents with
    | nil => rfl
    | cons _ _ ih => simpa [launches] using ih
  rw [paidRuns_eq_launches, none]
  rfl

end Folio
