import Lean.Data.Json

/-!
# Read plan: parallel reads stay inside the connection budget

The website report (`loadWebsiteGaps` in `src/lib/website-gaps.ts`) used to run its reads one
at a time, and read saved question runs one round trip per run, because every in-flight query
can hold one of the database's few connections. That made it the slowest request on `/websites`
and `/orgs`. It now runs independent reads a few at a time (`withLimit` in
`src/lib/sequential.ts`) and reads runs in batches (`batches`, same file).

This module is the argument that doing so is safe:

- the numbers below are the ones in `src/data/read-plan.json`, checked when this file is built;
- a scheduler that starts a read only while fewer than `limit` are in flight never has more
  than `limit` in flight, and never loses or repeats a read;
- so one report holds at most `readLimit` connections, which fits one request's pool, and
  `connectionBudget / readLimit` simultaneous reports fit the whole budget;
- batching reads every run exactly once, in order, in batches no larger than asked.

The scheduler here is a model of `withLimit`, transcribed by hand. `tests/read-plan.test.ts`
runs the TypeScript against the same rule and the same JSON; see `docs/LEAN-PROOFS.md`.
-/

namespace Folio.ReadPlan

/-! ## The numbers, bound to `src/data/read-plan.json` -/

/-- Connections the production Postgres leaves for the application. -/
def connectionBudget : Nat := 22
/-- The most connections one request's pool can open (`getPgPool` in `src/lib/db.ts`). -/
def requestPoolMax : Nat := 5
/-- How many of a report's reads may be in flight at once. -/
def readLimit : Nat := 3
/-- Saved runs read per round trip. -/
def runBatch : Nat := 20
/-- The most saved runs one report loads. -/
def runLimit : Nat := 100

private def planJson : String := include_str "../../src/data/read-plan.json"

private def planNat (path : List String) : Option Nat := do
  let mut json ← (Lean.Json.parse planJson).toOption
  for key in path do
    json ← (json.getObjVal? key).toOption
  json.getNat?.toOption

-- A changed JSON value without the matching change here fails the build.
#guard planNat ["connectionBudget"] == some connectionBudget
#guard planNat ["requestPoolMax"] == some requestPoolMax
#guard planNat ["readLimit"] == some readLimit
#guard planNat ["savedRuns", "batch"] == some runBatch
#guard planNat ["savedRuns", "limit"] == some runLimit

/-! ## The scheduler -/

/-- Reads not started yet, reads holding a connection, and reads finished. -/
structure Pool where
  waiting : Nat
  inFlight : Nat
  done : Nat

inductive Step where
  /-- A worker asks to start the next read. -/
  | start
  /-- A read returns and releases its connection. -/
  | finish

/-- `withLimit`'s rule: a read starts only while fewer than `limit` are in flight. -/
def step (limit : Nat) (p : Pool) : Step → Pool
  | .start =>
    if p.inFlight < limit ∧ 0 < p.waiting then
      { waiting := p.waiting - 1, inFlight := p.inFlight + 1, done := p.done }
    else p
  | .finish =>
    if 0 < p.inFlight then
      { waiting := p.waiting, inFlight := p.inFlight - 1, done := p.done + 1 }
    else p

def run (limit : Nat) (p : Pool) (steps : List Step) : Pool :=
  steps.foldl (step limit) p

/-- `reads` reads, none started. -/
def fresh (reads : Nat) : Pool := { waiting := reads, inFlight := 0, done := 0 }

theorem step_inFlight_le (limit : Nat) (p : Pool) (s : Step) (h : p.inFlight ≤ limit) :
    (step limit p s).inFlight ≤ limit := by
  cases s with
  | start =>
    simp only [step]
    split
    · show p.inFlight + 1 ≤ limit
      omega
    · exact h
  | finish =>
    simp only [step]
    split
    · show p.inFlight - 1 ≤ limit
      omega
    · exact h

theorem run_inFlight_le (limit : Nat) (p : Pool) (steps : List Step) (h : p.inFlight ≤ limit) :
    (run limit p steps).inFlight ≤ limit := by
  induction steps generalizing p with
  | nil => exact h
  | cons s rest ih => exact ih (step limit p s) (step_inFlight_le limit p s h)

/-- Whatever order reads start and return in, at most `limit` hold a connection. -/
theorem inFlight_le_limit (limit reads : Nat) (steps : List Step) :
    (run limit (fresh reads) steps).inFlight ≤ limit :=
  run_inFlight_le limit (fresh reads) steps (Nat.zero_le limit)

theorem step_total (limit : Nat) (p : Pool) (s : Step) :
    (step limit p s).waiting + (step limit p s).inFlight + (step limit p s).done
      = p.waiting + p.inFlight + p.done := by
  cases s with
  | start =>
    simp only [step]
    split
    · show p.waiting - 1 + (p.inFlight + 1) + p.done = _
      omega
    · rfl
  | finish =>
    simp only [step]
    split
    · show p.waiting + (p.inFlight - 1) + (p.done + 1) = _
      omega
    · rfl

/-- No read is lost or run twice: waiting, in flight and done always add up to the reads asked for. -/
theorem reads_conserved (limit reads : Nat) (steps : List Step) :
    (run limit (fresh reads) steps).waiting + (run limit (fresh reads) steps).inFlight
      + (run limit (fresh reads) steps).done = reads := by
  have total : ∀ (p : Pool), (run limit p steps).waiting + (run limit p steps).inFlight
      + (run limit p steps).done = p.waiting + p.inFlight + p.done := by
    induction steps with
    | nil => intro p; rfl
    | cons s rest ih =>
      intro p
      have next : run limit p (s :: rest) = run limit (step limit p s) rest := rfl
      rw [next, ih, step_total]
  rw [total]
  rfl

/-! ## The budget -/

/-- One report's reads fit the pool its request is given. -/
theorem readLimit_fits_pool : readLimit ≤ requestPoolMax := by decide

/-- Connections held by several reports being built at once. -/
def held : List Pool → Nat
  | [] => 0
  | p :: rest => p.inFlight + held rest

theorem held_le (limit : Nat) (pools : List Pool) (h : ∀ p ∈ pools, p.inFlight ≤ limit) :
    held pools ≤ pools.length * limit := by
  induction pools with
  | nil => simp [held]
  | cons p rest ih =>
    have first : p.inFlight ≤ limit := h p (List.mem_cons_self ..)
    have others : held rest ≤ rest.length * limit := ih (fun q hq => h q (List.mem_cons_of_mem _ hq))
    simp only [held, List.length_cons, Nat.add_mul, Nat.one_mul]
    omega

/-- How many reports can be built at the same moment without exceeding the budget. -/
def simultaneousReports : Nat := connectionBudget / readLimit

/-- Up to `simultaneousReports` (7) reports at once, each inside its limit, stay inside the budget. -/
theorem reports_fit_budget (pools : List Pool) (limited : ∀ p ∈ pools, p.inFlight ≤ readLimit)
    (few : pools.length ≤ simultaneousReports) : held pools ≤ connectionBudget := by
  have bound := held_le readLimit pools limited
  simp only [simultaneousReports, connectionBudget, readLimit] at *
  omega

/-! ## Batches -/

/-- Consecutive batches of at most `size`, as `batches` in `src/lib/sequential.ts`. `fuel` bounds the recursion. -/
def batchesWith (size : Nat) : Nat → List α → List (List α)
  | 0, _ => []
  | _, [] => []
  | fuel + 1, ids => ids.take size :: batchesWith size fuel (ids.drop size)

def batches (size : Nat) (ids : List α) : List (List α) :=
  batchesWith size ids.length ids

theorem batchesWith_flatten (size : Nat) (positive : 0 < size) (fuel : Nat) (ids : List α)
    (enough : ids.length ≤ fuel) : (batchesWith size fuel ids).flatten = ids := by
  induction fuel generalizing ids with
  | zero =>
    have empty : ids = [] := List.length_eq_zero_iff.mp (by omega)
    subst empty
    rfl
  | succ fuel ih =>
    cases ids with
    | nil => rfl
    | cons id rest =>
      have shorter : ((id :: rest).drop size).length ≤ fuel := by
        simp only [List.length_drop, List.length_cons] at *
        omega
      simp only [batchesWith, List.flatten_cons, ih _ shorter, List.take_append_drop]

/-- Batching reads every saved run exactly once, in the order asked for. -/
theorem batches_flatten (size : Nat) (positive : 0 < size) (ids : List α) :
    (batches size ids).flatten = ids :=
  batchesWith_flatten size positive ids.length ids (Nat.le_refl _)

/-- No batch is larger than asked, so no query binds more than `size` run IDs. -/
theorem batches_bounded (size : Nat) (ids : List α) :
    ∀ batch ∈ batches size ids, batch.length ≤ size := by
  unfold batches
  generalize ids.length = fuel
  induction fuel generalizing ids with
  | zero => intro batch member; simp [batchesWith] at member
  | succ fuel ih =>
    cases ids with
    | nil => intro batch member; simp [batchesWith] at member
    | cons id rest =>
      intro batch member
      simp only [batchesWith, List.mem_cons] at member
      cases member with
      | inl first => rw [first, List.length_take]; omega
      | inr later => exact ih _ batch later

/-- Round trips needed for `runs` saved runs. -/
def roundTrips (runs batch : Nat) : Nat := (runs + batch - 1) / batch

/-- A full report's saved runs take 5 round trips, where one per run took 100. -/
theorem full_report_round_trips : roundTrips runLimit runBatch = 5 ∧ roundTrips runLimit 1 = 100 := by decide

end Folio.ReadPlan
