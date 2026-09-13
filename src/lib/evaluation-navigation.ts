/** Navigation intent is a prefill only. Server ownership, target access and explicit launch still apply. */
export type EvaluationIntent = {
  targetUrl?: string;
  seoReportId?: string;
  runId?: string;
  baselineId?: string;
};

const identifier = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) ? value : undefined;

function target(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048 || !value.length ||
    /[\s\\\u0000-\u001f\u007f]/.test(value) || value.startsWith("//")) return undefined;
  const explicit = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (explicit && !/^https:\/\//i.test(value)) return undefined;
  try {
    const parsed = new URL(explicit ? value : `https://${value}`);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return undefined;
    const host = parsed.hostname.replace(/\.$/, "").toLowerCase();
    // Literal IPs and local/reserved names are not valid website-prefill targets.
    // DNS is not resolved here; the backend independently applies its exact-host policy.
    if (!host.includes(".") || host.includes(":") || /^\d+(?:\.\d+){3}$/.test(host) || host.length > 253 ||
      /(?:^|\.)(?:localhost|localdomain|local|internal|intranet|corp|home|lan|test|example|invalid|onion|arpa)$/.test(host) ||
      !host.split(".").every(label => /^(?!-)[a-z\d-]{1,63}(?<!-)$/.test(label)) ||
      !/[a-z]/.test(host.split(".").at(-1)!)) return undefined;
    parsed.hostname = host;
    parsed.hash = "";
    return parsed.href.length <= 2048 ? parsed.href : undefined;
  } catch { return undefined; }
}

/** Duplicate values are ambiguous and ignored rather than selecting an attacker-controlled occurrence. */
export function readEvaluationIntent(params: Pick<URLSearchParams, "getAll">): EvaluationIntent {
  const single = (key: string) => {
    const values = params.getAll(key);
    return values.length === 1 ? values[0] : undefined;
  };
  const targetUrl = target(single("target"));
  const seoReportId = identifier(single("seoReport"));
  const runId = identifier(single("run"));
  const baselineId = identifier(single("baseline"));
  return {
    ...(targetUrl ? { targetUrl } : {}), ...(seoReportId ? { seoReportId } : {}),
    ...(runId ? { runId } : {}), ...(baselineId ? { baselineId } : {}),
  };
}

/** The pathname is fixed: query data can never select a redirect destination. */
export function evaluationHref(intent: EvaluationIntent = {}): string {
  const params = new URLSearchParams();
  const targetUrl = target(intent.targetUrl);
  const seoReportId = identifier(intent.seoReportId);
  const runId = identifier(intent.runId);
  const baselineId = identifier(intent.baselineId);
  if (targetUrl) params.set("target", targetUrl);
  if (seoReportId) params.set("seoReport", seoReportId);
  if (runId) params.set("run", runId);
  if (baselineId) params.set("baseline", baselineId);
  const query = params.toString();
  return `/evaluations${query ? `?${query}` : ""}`;
}
