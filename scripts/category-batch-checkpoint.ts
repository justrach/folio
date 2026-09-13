/** Wait out provider cooldown, then reconcile exhausted capacity before declaring it blocked. */
export function categoryReceiptCheckpointAction(input: {
  now: number; lastCheckpoint: number; cooldownUntil: number; activeJobs: number;
  creating: boolean; availableSlots: number; pending: boolean;
}): "collect" | "drain" | "wait" | "recover" {
  const due = input.now >= input.cooldownUntil && input.now - input.lastCheckpoint >= 300_000;
  if (!input.pending && input.availableSlots > 0 && !due) return "collect";
  if (input.activeJobs || input.creating) return "drain";
  return input.now < input.cooldownUntil ? "wait" : "recover";
}
