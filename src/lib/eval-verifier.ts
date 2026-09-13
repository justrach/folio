/** Browser-safe deterministic verification. This module never contacts a model. */
import { evaluateHtml } from "./evaluation";
import {
  EVAL_SUITE, WEBSITE_EVAL_VERSION,
  type EvaluationRun, type EvidenceCapture, type ExpectedFacts,
  type PricingFact, type VerifiedEvaluation, type VerificationCheck,
  type WebsiteAgentOutput,
} from "./evals";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit = 4_000): value is string =>
  typeof value === "string" && value.length <= limit;
const nonempty = (value: unknown, limit = 4_000): value is string =>
  text(value, limit) && value.trim().length > 0;
const pricing = (value: unknown): value is PricingFact =>
  record(value) && typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0 &&
  nonempty(value.currency, 3) && /^[A-Z]{3}$/.test(value.currency) && nonempty(value.interval, 40);

/** Validate before a provider return can be used as a UI result or scored. */
export function parseWebsiteAgentOutput(value: unknown): WebsiteAgentOutput | null {
  if (!record(value) || !nonempty(value.summary) || !record(value.facts) ||
    !(value.facts.productName === null || nonempty(value.facts.productName, 200)) ||
    !(value.facts.pricing === null || pricing(value.facts.pricing)) ||
    !Array.isArray(value.citations) || value.citations.length > 100 ||
    !value.citations.every(citation => record(citation) &&
      ["productName", "pricing", "finding"].includes(String(citation.field)) &&
      nonempty(citation.evidenceId, 128) && nonempty(citation.quote, 2_000)) ||
    !Array.isArray(value.findings) || value.findings.length > 30 ||
    !value.findings.every(finding => record(finding) && nonempty(finding.dimension, 100) &&
      ["supported", "unmeasured"].includes(String(finding.status)) &&
      Array.isArray(finding.evidenceIds) && finding.evidenceIds.length <= 20 &&
      finding.evidenceIds.every(id => nonempty(id, 128)) &&
      nonempty(finding.explanation) && text(finding.recommendation)) ||
    !Array.isArray(value.missingEvidence) || value.missingEvidence.length > 30 ||
    !value.missingEvidence.every(item => nonempty(item, 500)) || value.publicationReady !== false) return null;
  // Return only allowed fields. Extra provider fields cannot become application state.
  const valid = value as unknown as WebsiteAgentOutput;
  return {
    summary: valid.summary,
    facts: { productName: valid.facts.productName, pricing: valid.facts.pricing && {
      amount: valid.facts.pricing.amount, currency: valid.facts.pricing.currency, interval: valid.facts.pricing.interval,
    } },
    citations: valid.citations.map(({ field, evidenceId, quote }) => ({ field, evidenceId, quote })),
    findings: valid.findings.map(({ dimension, status, evidenceIds, explanation, recommendation }) =>
      ({ dimension, status, evidenceIds: [...evidenceIds], explanation, recommendation })),
    missingEvidence: [...valid.missingEvidence], publicationReady: false,
  };
}

export async function sha256Source(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const priceText = (value: PricingFact | null | undefined) => value == null ? "No price stated" : `${value.amount} ${value.currency}/${value.interval}`;
const samePrice = (a: PricingFact, b: PricingFact) =>
  a.amount === b.amount && a.currency === b.currency && normalize(a.interval) === normalize(b.interval);

export async function verifyEvaluationResult(
  input: { captures: EvidenceCapture[]; expectedFacts?: ExpectedFacts },
  returnedOutput: unknown,
): Promise<VerifiedEvaluation> {
  const output = parseWebsiteAgentOutput(returnedOutput);
  const checks: VerificationCheck[] = [];
  const evidenceIds = input.captures.map(capture => capture.id);
  const uniqueIds = new Set(evidenceIds).size === evidenceIds.length;
  const validHashes = await Promise.all(input.captures.map(async capture =>
    /^[a-f0-9]{64}$/.test(capture.sha256) && await sha256Source(capture.content) === capture.sha256));
  const sourceIntegrity = input.captures.length > 0 && uniqueIds && validHashes.every(Boolean);
  checks.push({
    id: "source-integrity", label: "Frozen source integrity", status: sourceIntegrity ? "pass" : "fail",
    expected: "Every UTF-8 capture matches its SHA-256 hash and has a unique evidence ID.",
    actual: `${validHashes.filter(Boolean).length}/${input.captures.length} hashes match; IDs ${uniqueIds ? "unique" : "duplicated"}.`,
    detail: "Content hashes detect modified input. They do not authenticate the website or capture time.", evidenceIds,
  });
  checks.push({
    id: "output-schema", label: "Structured agent return", status: output ? "pass" : "fail",
    expected: "Versioned facts, citations, findings and missing-evidence fields; publicationReady=false.",
    actual: output ? "Return passes the frozen output schema." : "Return is missing or does not match the frozen output schema.",
    detail: "Malformed output cannot become application findings. No model-generated score is accepted.", evidenceIds: [],
  });
  const expected = input.expectedFacts;
  const trustedFacts = expected?.source === "fixture" || expected?.source === "owner-confirmed";
  const productKnown = trustedFacts && nonempty(expected?.productName, 200);
  checks.push({
    id: "product-understanding", label: "Product name accuracy",
    status: productKnown ? (output?.facts.productName != null && normalize(output.facts.productName) === normalize(expected!.productName!) ? "pass" : "fail") : "unmeasured",
    expected: productKnown ? expected!.productName! : "Independent owner-confirmed product name needed.",
    actual: output?.facts.productName ?? "No product name returned.",
    detail: productKnown ? `Compared with ${expected!.source} ground truth, not with another model judgment.` : "The model's interpretation is shown; correctness is not inferred from its own answer.",
    evidenceIds: output?.citations.filter(citation => citation.field === "productName").map(citation => citation.evidenceId) ?? [],
  });
  const priceKnown = trustedFacts && pricing(expected?.pricing);
  const priceAbsent = trustedFacts && expected?.pricing === null;
  checks.push({
    id: "pricing-extraction", label: "Pricing fact accuracy",
    status: priceKnown ? (output?.facts.pricing && samePrice(output.facts.pricing, expected!.pricing!) ? "pass" : "fail")
      : priceAbsent && (!output || output.facts.pricing !== null) ? "fail" : "unmeasured",
    expected: priceKnown ? priceText(expected!.pricing) : priceAbsent ? "Price is not stated; return null and abstain." : "Independent amount, currency and billing interval needed.",
    actual: output ? priceText(output.facts.pricing) : "No valid structured return.",
    detail: priceKnown ? `Compared with ${expected!.source} ground truth.` : "Unavailable pricing is unmeasured. A fabricated price fails when trusted evidence explicitly establishes that none is stated.",
    evidenceIds: output?.citations.filter(citation => citation.field === "pricing").map(citation => citation.evidenceId) ?? [],
  });
  const captureMap = new Map(input.captures.map(capture => [capture.id, capture]));
  const citations = output?.citations ?? [];
  const validCitations = citations.filter(citation => {
    const capture = captureMap.get(citation.evidenceId);
    return uniqueIds && Boolean(capture?.content.includes(citation.quote));
  });
  checks.push({
    id: "citation-integrity", label: "Exact source citations",
    status: !output ? "fail" : citations.length === 0 ? "unmeasured" : validCitations.length === citations.length && sourceIntegrity ? "pass" : "fail",
    expected: "Every citation resolves to an unchanged capture and an exact, nonempty source substring.",
    actual: `${validCitations.length}/${citations.length} citations resolve to exact source text.`,
    detail: "Literal quotation presence is verified. Semantic entailment and source truth still require review.",
    evidenceIds: citations.map(citation => citation.evidenceId),
  });
  const requiredFields = [
    ...(output?.facts.productName !== null && output?.facts.productName !== undefined ? ["productName"] : []),
    ...(output?.facts.pricing !== null && output?.facts.pricing !== undefined ? ["pricing"] : []),
  ];
  const citedFields = requiredFields.filter(field => validCitations.some(citation => citation.field === field));
  checks.push({
    id: "fact-evidence", label: "Extracted fact evidence",
    status: !output ? "fail" : requiredFields.length === 0 ? "unmeasured" : citedFields.length === requiredFields.length && sourceIntegrity ? "pass" : "fail",
    expected: "Every non-null extracted fact has a field-specific exact source citation.",
    actual: `${citedFields.length}/${requiredFields.length} extracted fields have a valid citation.`,
    detail: "This checks evidence coverage. Accuracy is graded separately against reference answers supplied separately from the model.",
    evidenceIds: validCitations.filter(citation => citation.field !== "finding").map(citation => citation.evidenceId),
  });
  const supportedFindings = output?.findings.filter(finding => finding.status === "supported") ?? [];
  const linkedFindings = supportedFindings.filter(finding => finding.evidenceIds.length > 0 && finding.evidenceIds.every(id =>
    captureMap.has(id) && validCitations.some(citation => citation.field === "finding" && citation.evidenceId === id)));
  checks.push({
    id: "finding-evidence", label: "Finding evidence links",
    status: !output ? "fail" : supportedFindings.length === 0 ? "unmeasured" : linkedFindings.length === supportedFindings.length && sourceIntegrity ? "pass" : "fail",
    expected: "Every finding marked supported links its evidence IDs to exact finding citations.",
    actual: `${linkedFindings.length}/${supportedFindings.length} supported findings link to source quotes.`,
    detail: "Recommendations remain agent-authored proposals. Passing this check does not certify their meaning or impact.",
    evidenceIds: [...new Set(supportedFindings.flatMap(finding => finding.evidenceIds))],
  });
  // Recompute from the hashed page instead of trusting editable saved check labels.
  const readability = input.captures.filter(capture => capture.kind === "page").flatMap(capture => evaluateHtml(capture.content, capture.url).checks
    .filter(check => check.id === "readable-content").map(check => ({ capture, check })));
  checks.push({
    id: "readable-content", label: "Readable captured source",
    status: readability.length === 0 ? "unmeasured" : readability.every(({ check }) => check.status === "pass") && sourceIntegrity ? "pass" : "fail",
    expected: "Captured HTML passes the separate deterministic readable-content check (at least 200 visible words).",
    actual: readability.length ? readability.map(({ check }) => check.detail).join(" ") : "No HTML page capture supplied for a deterministic readability observation.",
    detail: "Text availability is a technical observation. It is not a model-visibility or prose-quality score.",
    evidenceIds: readability.map(({ capture }) => capture.id),
  });
  const passed = checks.filter(check => check.status === "pass").length;
  const failed = checks.filter(check => check.status === "fail").length;
  const unmeasured = checks.filter(check => check.status === "unmeasured").length;
  return {
    summary: output?.summary ?? "The agent return did not pass the required structured-output schema.",
    checks, passed, failed, unmeasured, measured: passed + failed,
    verificationScore: passed + failed > 0 ? Math.round(passed / (passed + failed) * 100) : null,
    findings: output?.findings ?? [], citations,
    limitations: [...EVAL_SUITE.limitations, "Verification percentage is measured checks passed ÷ measured checks. Always show unmeasured checks alongside it; it is not comparable across different evidence coverage."],
  };
}

/** Deliberately fictional input and output; never represented as an OpenAI run. */
export const DEMO_WEBSITE_HTML = `<!doctype html><html><head><title>Sable Analytics — product documentation</title><meta name="description" content="Sable Analytics is a fictional product for demonstrating repeatable website evidence checks and transparent source citations." /></head><body><h1>Sable Analytics</h1><p>Sable Analytics turns product events into private, readable reports.</p><p>The Starter plan costs 29 USD per month.</p><h2>How it works</h2><p>${"Teams connect their product events and review weekly reports. Every report links back to its inputs so reviewers can check the evidence. ".repeat(10)}</p><a href="/docs">Read the documentation</a></body></html>`;
export const DEMO_EXPECTED_FACTS: ExpectedFacts = Object.freeze({ source: "fixture", productName: "Sable Analytics", pricing: Object.freeze({ amount: 29, currency: "USD", interval: "month" }) });
export const DEMO_AGENT_OUTPUT: WebsiteAgentOutput = {
  summary: "The fictional Sable Analytics capture states its product name, purpose and Starter price. This is a local output fixture, not a model response.",
  facts: { productName: "Sable Analytics", pricing: { amount: 29, currency: "USD", interval: "month" } },
  citations: [
    { field: "productName", evidenceId: "demo-home-v1", quote: "Sable Analytics turns product events into private, readable reports." },
    { field: "pricing", evidenceId: "demo-home-v1", quote: "The Starter plan costs 29 USD per month." },
    { field: "finding", evidenceId: "demo-home-v1", quote: "Every report links back to its inputs so reviewers can check the evidence." },
  ],
  findings: [{ dimension: "product-understanding", status: "supported", evidenceIds: ["demo-home-v1"], explanation: "The captured product description describes reports linked to their input evidence.", recommendation: "Retain clear source links when documentation changes." }],
  missingEvidence: ["Actual search results and real-world model recommendation observations were not collected."],
  publicationReady: false,
};

export async function createDemoEvaluationRun(): Promise<EvaluationRun> {
  const startedAt = new Date().toISOString();
  const targetUrl = "https://sable.example/";
  const capture: EvidenceCapture = {
    id: "demo-home-v1", url: targetUrl, capturedAt: "2026-09-13T00:00:00.000Z",
    content: DEMO_WEBSITE_HTML, sha256: await sha256Source(DEMO_WEBSITE_HTML),
    hashEncoding: "utf8-text-v1", kind: "page", transport: "fixture",
    technicalChecks: evaluateHtml(DEMO_WEBSITE_HTML, targetUrl).checks,
  };
  const expectedFacts = structuredClone(DEMO_EXPECTED_FACTS);
  const agentOutput = structuredClone(DEMO_AGENT_OUTPUT);
  const result = await verifyEvaluationResult({ captures: [capture], expectedFacts }, agentOutput);
  const finishedAt = new Date().toISOString();
  return {
    id: `demo-${crypto.randomUUID()}`, targetUrl, siteName: "Sable Analytics · fictional fixture",
    suiteVersion: WEBSITE_EVAL_VERSION, mode: "demo", status: "completed",
    createdAt: startedAt, updatedAt: finishedAt, sessionId: null, model: null,
    captures: [capture], expectedFacts,
    events: [
      { id: "capture", at: startedAt, type: "capture", title: "Frozen fictional capture loaded", detail: "Local fixture; this website was not fetched.", status: "completed" },
      { id: "verified", at: finishedAt, type: "verification", title: "Local fixture verified", detail: "No OpenAI API request. The same frozen input and canned output were checked locally.", status: "completed" },
    ],
    result, agentOutput, error: null, usage: null, publication: "private", revision: 0,
  };
}

export const makeDemoEvaluationRun = createDemoEvaluationRun;
