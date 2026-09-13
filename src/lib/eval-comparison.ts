import type { EvaluationRun, VerificationCheck } from "./evals";

/** Stable equality for JSON values; object property order is not evidence. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export type CheckComparison = {
  id: string;
  label: string;
  before: VerificationCheck | null;
  after: VerificationCheck | null;
  change: "unchanged" | "improved" | "regressed" | "coverage changed" | "check added" | "check removed";
};

export function compareEvaluationRuns(before: EvaluationRun, after: EvaluationRun) {
  if (before.status !== "completed" || after.status !== "completed" || !before.result || !after.result)
    throw new Error("Select two completed evaluations with saved verification results.");
  if (before.mode !== after.mode)
    throw new Error("Local fixtures and live Agents API runs cannot be compared together.");
  if (before.publication !== "private" || after.publication !== "private")
    throw new Error("This comparison accepts private evaluation runs only.");

  const beforeChecks = new Map(before.result.checks.map(check => [check.id, check]));
  const afterChecks = new Map(after.result.checks.map(check => [check.id, check]));
  if (beforeChecks.size !== before.result.checks.length || afterChecks.size !== after.result.checks.length)
    throw new Error("A result contains duplicate check IDs and cannot be compared reliably.");
  const checks: CheckComparison[] = [...new Set([...beforeChecks.keys(), ...afterChecks.keys()])].map(id => {
    const a = beforeChecks.get(id) ?? null;
    const b = afterChecks.get(id) ?? null;
    return {
      id, label: b?.label ?? a!.label, before: a, after: b,
      change: !a ? "check added" : !b ? "check removed" : a.status === b.status ? "unchanged" :
        a.status === "unmeasured" || b.status === "unmeasured" ? "coverage changed" :
          b.status === "pass" ? "improved" : "regressed",
    };
  });

  // Captures from distinct runs can have different IDs. Compare source identities by URL and kind.
  const captureIdentities = (run: EvaluationRun) => run.captures.map(capture => ({
    url: capture.url, kind: capture.kind, sha256: capture.sha256,
  })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const sourceHashesChanged = canonicalJson(captureIdentities(before)) !== canonicalJson(captureIdentities(after));
  const referenceFactsChanged = canonicalJson(before.expectedFacts) !== canonicalJson(after.expectedFacts);
  const coverageChanged = checks.some(check => !check.before || !check.after ||
    (check.before.status === "unmeasured") !== (check.after.status === "unmeasured"));
  const suiteChanged = before.suiteVersion !== after.suiteVersion;
  const targetChanged = before.targetUrl !== after.targetUrl;
  const modelChanged = before.model !== after.model;
  const expectationsChanged = checks.some(check => check.before && check.after && check.before.expected !== check.after.expected);
  const reasons = [
    ...(suiteChanged ? ["Suite versions differ."] : []),
    ...(coverageChanged ? ["The measured check set differs; percentages have different denominators or coverage."] : []),
    ...(referenceFactsChanged || expectationsChanged ? ["Reference facts or expected check values changed."] : []),
    ...(targetChanged ? ["The runs evaluated different target URLs."] : []),
    ...(modelChanged ? ["The recorded models differ."] : []),
  ];
  const comparable = reasons.length === 0;
  return {
    checks, sourceHashesChanged, referenceFactsChanged, coverageChanged,
    suiteChanged, targetChanged, modelChanged, comparable, reasons,
    scoreDelta: comparable && before.result.verificationScore !== null && after.result.verificationScore !== null
      ? after.result.verificationScore - before.result.verificationScore : null,
    beforeScore: before.result.verificationScore, afterScore: after.result.verificationScore,
  };
}
