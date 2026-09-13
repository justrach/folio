/** Local operator scheduling only; never retries a failed question or widens account capacity. */
export class CategoryBatchRate {
  desired: number;
  spacingMs = 1500;
  cooldownUntil = 0;
  stoppedReason: string | null = null;
  private lastRamp: number;
  private healthyReceipts = 0;
  private failures: number[] = [];
  constructor(readonly ceiling: number, now: number) {
    if (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 20) throw Error("Invalid batch concurrency ceiling");
    this.desired = Math.min(5, ceiling); this.lastRamp = now;
  }
  receipt(now: number) { this.healthyReceipts++; this.ramp(now); }
  ramp(now: number) {
    if (now >= this.cooldownUntil && now - this.lastRamp >= 30_000 && this.healthyReceipts >= 3) {
      this.desired = Math.min(this.ceiling, this.desired + 3);
      this.spacingMs = Math.max(1500, Math.floor(this.spacingMs * .8));
      this.lastRamp = now; this.healthyReceipts = 0;
    }
  }
  failure(status: number | undefined, now: number) {
    this.failures = [...this.failures.filter(at => now - at < 300_000), now];
    this.desired = Math.max(1, Math.floor(this.desired / 2));
    this.spacingMs = Math.min(12_000, this.spacingMs * 2);
    this.cooldownUntil = now + (status === 429 ? 60_000 : 30_000);
    this.lastRamp = this.cooldownUntil; this.healthyReceipts = 0;
    if (status === 401 || status === 403) this.stoppedReason = "provider-access-denied";
    else if (status !== undefined && status >= 400 && status < 500 && status !== 429 && status !== 409) this.stoppedReason = "provider-request-rejected";
    else if (this.failures.length >= 3) this.stoppedReason = "repeated-provider-failures";
  }
  canCreate(now: number, active: number) { this.ramp(now); return !this.stoppedReason && now >= this.cooldownUntil && active < this.desired; }
}
