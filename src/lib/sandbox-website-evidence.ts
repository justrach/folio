import { createHash } from "node:crypto";
import { z } from "zod";
import { boundedFetch, normalizeScanUrl } from "./scanner";
import { publicFetch } from "./public-fetch";
import { evaluateHtml, evaluationMethodology } from "./evaluation";
import { extractCrawlPage } from "./website-crawl";
import { assertHomepageContent, DEVELOPER_TOOL_CAPTURE_LIMIT } from "./developer-tools-evaluation";

export const WEBSITE_PAGE_LIMIT = 6;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const checkIds = new Set(evaluationMethodology.weights.map(check => check.id));
const cleanUrl = (value: string) => {
  const url = normalizeScanUrl(value);
  if (url.search || /[\s<>`\\]/.test(value)) throw new Error("Website capture requires a public URL without query parameters.");
  return url;
};
const checkSchema = z.strictObject({ id: z.string().max(100), label: z.string().min(1).max(300), status: z.enum(["pass", "warning", "fail", "optional"]), detail: z.string().min(1).max(4000), evidence: z.string().max(4000).optional() });
const evidenceSchema = z.strictObject({
  provider: z.literal("folio-public-html-v1"), targetUrl: z.string().max(2048), maxPages: z.literal(6),
  pages: z.array(z.strictObject({ id: z.string().regex(/^page-[1-6]$/), url: z.string().max(2048), title: z.string().max(200), text: z.string().max(6000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/), htmlSha256: z.string().regex(/^[a-f0-9]{64}$/), capturedAt: z.iso.datetime(), truncated: z.boolean(),
    bytes: z.number().int().positive().max(DEVELOPER_TOOL_CAPTURE_LIMIT), checks: z.array(checkSchema).length(10) })).min(1).max(WEBSITE_PAGE_LIMIT),
  attempts: z.array(z.strictObject({ url: z.string().max(2048), status: z.enum(["captured", "unavailable"]), pageId: z.string().nullable() })).min(1).max(WEBSITE_PAGE_LIMIT),
});
export type WebsiteEvidence = z.infer<typeof evidenceSchema>;
const answerSchema = z.strictObject({
  summary: z.string().min(1).max(4000),
  findings: z.array(z.strictObject({ priority: z.enum(["high", "medium", "low"]), observation: z.string().min(1).max(2000), recommendation: z.string().min(1).max(2000),
    evidence: z.array(z.union([z.strictObject({ pageId: z.string(), quote: z.string().min(1).max(2000) }), z.strictObject({ pageId: z.string(), checkId: z.string() })])).min(1).max(4) })).min(1).max(12),
  limitations: z.array(z.string().min(1).max(1000)).min(1).max(16),
});
export type WebsiteAnswer = z.infer<typeof answerSchema>;

/** Structural/provenance checks only: quote membership does not certify a model's interpretation. */
export function validateWebsiteEvidence(value: unknown): WebsiteEvidence {
  const evidence = evidenceSchema.parse(value);
  const target = cleanUrl(evidence.targetUrl);
  const pages = new Map(evidence.pages.map(page => [page.id, page]));
  if (pages.size !== evidence.pages.length || new Set(evidence.attempts.map(attempt => attempt.url)).size !== evidence.attempts.length ||
      evidence.attempts[0].url !== target.href || evidence.attempts[0].status !== "captured") throw new Error("Invalid website capture provenance.");
  const captured = evidence.attempts.filter(attempt => attempt.status === "captured");
  if (captured.length !== pages.size || new Set(captured.map(attempt => attempt.pageId)).size !== pages.size) throw new Error("Invalid website capture count.");
  for (const attempt of evidence.attempts) {
    if (cleanUrl(attempt.url).origin !== target.origin || (attempt.status === "unavailable" ? attempt.pageId !== null : !pages.has(attempt.pageId!))) throw new Error("Invalid website attempt.");
  }
  for (const page of evidence.pages) {
    if (cleanUrl(page.url).origin !== target.origin || digest(page.text) !== page.sha256 ||
        new Set(page.checks.map(check => check.id)).size !== checkIds.size || page.checks.some(check => !checkIds.has(check.id as typeof evaluationMethodology.weights[number]["id"]))) throw new Error("Invalid captured website page.");
  }
  return evidence;
}

export function validateWebsiteAnswer(raw: string, evidence: WebsiteEvidence): WebsiteAnswer {
  if (Buffer.byteLength(raw) > 131_072) throw new Error("Website answer too large.");
  const value = answerSchema.parse(JSON.parse(raw));
  const pages = new Map(evidence.pages.map(page => [page.id, page]));
  for (const finding of value.findings) for (const reference of finding.evidence) {
    const page = pages.get(reference.pageId);
    if (!page || ("quote" in reference ? !page.text.includes(reference.quote) : !page.checks.some(check => check.id === reference.checkId))) throw new Error("Website answer cited unsaved evidence.");
  }
  const urls = new Set(evidence.pages.map(page => page.url));
  // Exact source quotes may themselves contain URLs; only model-authored prose is restricted.
  const prose = [value.summary, ...value.limitations, ...value.findings.flatMap(finding => [finding.observation, finding.recommendation])].join("\n");
  for (const match of prose.matchAll(/https?:\/\/[^\s"<>\\]+/g)) {
    if (!urls.has(match[0]) && !urls.has(match[0].replace(/[),.;]+$/, ""))) throw new Error("Website answer invented a source URL.");
  }
  return value;
}

/** Host-selected public HTML capture. No cookies, provider keys, scripts, forms, or agent traversal. */
export async function captureSandboxWebsite(input: string, options: {
  fetcher?: typeof fetch; redact?: (text: string) => string; save: (evidence: WebsiteEvidence) => Promise<void>;
}): Promise<WebsiteEvidence> {
  const target = cleanUrl(input);
  const redact = options.redact ?? (text => text);
  const evidence: WebsiteEvidence = { provider: "folio-public-html-v1", targetUrl: target.href, maxPages: WEBSITE_PAGE_LIMIT, pages: [], attempts: [] };
  const queue = [target.href], seen = new Set<string>();
  while (queue.length && evidence.attempts.length < WEBSITE_PAGE_LIMIT) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    let links: string[] = [];
    try {
      const response = await boundedFetch(new URL(url), { allowedHosts: new Set([target.hostname]), fetcher: options.fetcher ?? publicFetch,
        maxBytes: DEVELOPER_TOOL_CAPTURE_LIMIT, timeoutMs: 10_000 });
      if (cleanUrl(response.url).origin !== target.origin) throw new Error("Cross-origin redirect.");
      assertHomepageContent(response.body);
      const extracted = extractCrawlPage(response.body, response.url, `page-${evidence.attempts.length + 1}`);
      const text = redact(extracted.text);
      const checks = evaluateHtml(response.body, response.url, response.headers).checks.map(check => ({ id: check.id, label: check.label, status: check.status,
        detail: redact(check.detail.slice(0, 4000)), ...(check.evidence === undefined ? {} : { evidence: redact(check.evidence.slice(0, 4000)) }) }));
      evidence.pages.push({ id: extracted.id, url: extracted.url, title: redact(extracted.title), text, sha256: digest(text), htmlSha256: digest(response.body),
        capturedAt: extracted.capturedAt, truncated: extracted.truncated, bytes: response.bytes, checks });
      evidence.attempts.push({ url, status: "captured", pageId: extracted.id });
      // Extracted links are data, not commands. Ignore query-bearing/auth/download links and other origins.
      links = extracted.links.flatMap(link => {
        try {
          const next = cleanUrl(link);
          if (next.origin !== target.origin || redact(next.href) !== next.href || /\/(?:api|login|logout|signin|signout|signup|auth|account|checkout)(?:\/|$)/i.test(next.pathname) || /\.(?:pdf|zip|gz|png|jpg|svg|xml)$/i.test(next.pathname)) return [];
          return [next.href];
        } catch { return []; }
      });
    } catch {
      evidence.attempts.push({ url, status: "unavailable", pageId: null });
    }
    // Persistence failures must propagate, never be mistaken for an unavailable page.
    await options.save(structuredClone(evidence));
    if (!evidence.pages.length) throw new Error("The starting page could not be captured; no sandbox was created.");
    const priority = (link: string) => /pricing|product|features|about|faq|docs/i.test(new URL(link).pathname) ? 0 : 1;
    queue.push(...links.filter(link => !seen.has(link) && !queue.includes(link)));
    queue.sort((a, b) => priority(a) - priority(b));
    if (queue.length > 80) queue.length = 80;
  }
  return validateWebsiteEvidence(evidence);
}
