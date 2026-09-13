import { boundedFetch, normalizeScanUrl, ScanError } from "./scanner";
import { EVALUATION_VERSION, type EvaluationCheck, type evaluateHtml } from "./evaluation";
import type { DeveloperToolAudience } from "./developer-tools-source";

/** Complete modern homepage HTML, including embedded assets; never truncate for scoring. */
export const DEVELOPER_TOOL_CAPTURE_LIMIT = 5_000_000;
export const DEVELOPER_TOOL_TIMEOUT = 8_000;
export const LOCAL_FOLIO_URL = "http://localhost:3001/";
export type DeveloperTool = { id: string; name: string; category: string; websiteUrl: string; audience?: DeveloperToolAudience };
export type DeveloperToolCaptureKind = "public-homepage" | "local-preview";
export type DeveloperToolReadinessResult = {
  toolId: string; name: string; category: string; submittedUrl: string; finalUrl: string | null;
  audience?: DeveloperToolAudience;
  captureKind: DeveloperToolCaptureKind; status: "complete" | "unavailable"; capturedAt: string;
  contentHash: string | null; bytesFetched: number | null; score: number | null;
  checks: Omit<EvaluationCheck, "evidence" | "sourceUrl">[]; error: string | null;
};
export type DeveloperToolReadinessSummary = {
  schemaVersion: "developer-tool-readiness-v1"; suiteVersion: typeof EVALUATION_VERSION;
  generatedAt: string; batchId: string; scope: string; runtime: "workerd";
  evaluatorSourceHash: string; captureLimitBytes: number; timeoutMs: number;
  results: DeveloperToolReadinessResult[];
};
export type CapturedDeveloperPage = { body: string; url: string; headers: Headers; bytes: number };
export type DeveloperPageEvaluation = ReturnType<typeof evaluateHtml>;

/** Known access interstitials are not the requested homepage, even with HTTP 200. */
export function assertHomepageContent(html: string): void {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1].replace(/\s+/g, " ").trim() ?? "";
  if (/^(?:Client Challenge|Just a moment(?:\.{3}|…)?|Attention Required!?(?:\s*\|\s*Cloudflare)?|Access Denied|Robot Check|Security Check)$/i.test(title))
    throw new ScanError("The homepage returned an access challenge instead of page content; no readiness score was measured.", 422);
}

/** The reviewed homepage host and its www/non-www spelling, never arbitrary subdomains. */
export function reviewedHomepageHosts(websiteUrl: string): Set<string> {
  const submitted = new URL(websiteUrl);
  if (submitted.search || submitted.hash) throw new ScanError("Catalog homepages must not contain query parameters or fragments.");
  const url = normalizeScanUrl(websiteUrl);
  if (url.search || url.hash) throw new ScanError("Catalog homepages must not contain query parameters or fragments.");
  const host = url.hostname;
  return new Set([host, host.startsWith("www.") ? host.slice(4) : `www.${host}`]);
}

export async function captureDeveloperHomepage(tool: DeveloperTool, fetcher: typeof fetch = fetch): Promise<CapturedDeveloperPage> {
  return boundedFetch(normalizeScanUrl(tool.websiteUrl), { allowedHosts: reviewedHomepageHosts(tool.websiteUrl), fetcher,
    maxBytes: DEVELOPER_TOOL_CAPTURE_LIMIT, timeoutMs: DEVELOPER_TOOL_TIMEOUT });
}

/** A separate fixed local-preview operation; never expands the public scanner's allowlist. */
export async function captureLocalFolio(fetcher: typeof fetch = fetch): Promise<CapturedDeveloperPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEVELOPER_TOOL_TIMEOUT);
  try {
    const response = await fetcher(LOCAL_FOLIO_URL, { redirect: "manual", signal: controller.signal,
      cache: "no-store", headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "FolioReadinessBot/1.0" } });
    if (!response.ok || response.status >= 300) { await response.body?.cancel(); throw new ScanError(`Local Folio returned HTTP ${response.status}; redirects are not followed.`, 422); }
    const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!["text/html", "application/xhtml+xml"].includes(type ?? "")) { await response.body?.cancel(); throw new ScanError("Local Folio did not return HTML.", 422); }
    const reader = response.body?.getReader();
    if (!reader) throw new ScanError("Local Folio returned no response body.", 422);
    let bytes = 0, body = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > DEVELOPER_TOOL_CAPTURE_LIMIT) { await reader.cancel(); throw new ScanError("Local Folio exceeds the capture size limit.", 422); }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
    return { body, bytes, url: LOCAL_FOLIO_URL, headers: response.headers };
  } catch (error) {
    if (error instanceof ScanError) throw error;
    throw new ScanError(controller.signal.aborted ? "Local Folio exceeded the eight-second capture timeout." : "Local Folio could not be reached on port 3001.", 422);
  } finally { clearTimeout(timeout); }
}

export function validateDeveloperTools(value: unknown): DeveloperTool[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw new Error("Provide a catalog of 1–50 reviewed websites.");
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id)
      || seen.has(item.id) || typeof item.name !== "string" || item.name.length > 100 || !item.name
      || typeof item.category !== "string" || item.category.length > 100 || !item.category
      || typeof item.websiteUrl !== "string"
      || (item.audience !== undefined && !["Developer tools", "Software & work", "Shops & brands", "Services & travel", "Learning"].includes(item.audience)))
      throw new Error("The website catalog contains an invalid or duplicate entry.");
    reviewedHomepageHosts(item.websiteUrl); seen.add(item.id);
    if (item.id === "folio-local") throw new Error("folio-local is reserved for the explicit local-preview option.");
    return { id: item.id, name: item.name, category: item.category, websiteUrl: item.websiteUrl,
      ...(item.audience === undefined ? {} : { audience: item.audience }) };
  });
}

export async function mapDeveloperTools<T, U>(items: T[], work: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const results: U[] = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await work(items[index], index); }
  }));
  return results;
}
