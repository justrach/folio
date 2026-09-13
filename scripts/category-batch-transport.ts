/** One provider mutation at a time; research sessions still execute concurrently. */
export class ProviderMutationGate {
  private tail: Promise<void> = Promise.resolve();
  private finishedAt = 0;
  constructor(private readonly gapMs = 1500, private readonly now = Date.now,
    private readonly sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {}
  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const delay = Math.max(0, this.finishedAt + this.gapMs - this.now());
      if (delay) await this.sleep(delay);
      try { return await work(); } finally { this.finishedAt = this.now(); }
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
