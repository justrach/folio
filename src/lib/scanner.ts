import { evaluateHtml, type EvaluationCheck } from "./evaluation";
import { analyzeDiscoveryDocument, DISCOVERY_DOCUMENT_KINDS, DISCOVERY_DOCUMENT_LIMITS,
  type DiscoveryDocumentAnalysis, type DiscoveryDocumentInput } from "./discovery-documents";

const MAX_BYTES = 750_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
export const DEFAULT_SCAN_HOSTS = ["example.com", "www.example.com"] as const;

export class ScanError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly observation?: { httpStatus?: number; failure?: DiscoveryDocumentInput["failure"] },
  ) {
    super(message);
    this.name = "ScanError";
  }
}

export function configuredScanHosts(value?: string): Set<string> {
  const values = value?.trim()
    ? value
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    : [...DEFAULT_SCAN_HOSTS];
  // Trusted deployment configuration deliberately has no wildcard or IP support.
  return new Set(
    values.filter(
      (host) =>
        /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) &&
        host.includes(".") &&
        !/^\d+(?:\.\d+){3}$/.test(host) &&
        !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host),
    ),
  );
}

export function normalizeScanUrl(input: string): URL {
  if (typeof input !== "string" || !input.trim() || input.length > 2048)
    throw new ScanError("Enter a website URL, up to 2,048 characters.");
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`,
    );
  } catch {
    throw new ScanError("Enter a valid HTTPS website URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new ScanError(
      "Use a public HTTPS URL without credentials or a custom port.",
    );
  if (
    !url.hostname.includes(".") ||
    /[\[\]:]/.test(url.hostname) ||
    /^\d+(?:\.\d+){3}$/.test(url.hostname) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)
  )
    throw new ScanError("Local networks and IP addresses cannot be scanned.");
  url.hash = "";
  return url;
}

export function assertAllowedUrl(url: URL, allowedHosts: Set<string>) {
  normalizeScanUrl(url.href);
  if (!allowedHosts.has(url.hostname.toLowerCase()))
    throw new ScanError(
      "This domain is not enabled for scans. This deployment permits example.com by default; an operator can add a reviewed public domain to SCAN_ALLOWED_HOSTS.",
      403,
    );
}

export type BoundedFetchOptions = {
  allowedHosts: Set<string>;
  fetcher?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  contentType?: "html" | "text" | "discovery";
};

export async function boundedFetch(input: URL, options: BoundedFetchOptions) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );
  const fetcher = options.fetcher ?? fetch;
  let url = new URL(input.href);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      assertAllowedUrl(url, options.allowedHosts);
      const response = await fetcher(url.href, {
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "User-Agent": "FolioReadinessBot/1.0",
          Accept:
            options.contentType === "discovery"
              ? "text/plain,text/markdown,application/xml,text/xml,text/html;q=0.5"
              : options.contentType === "text"
              ? "text/plain"
              : "text/html,application/xhtml+xml",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location)
          throw new ScanError(
            "The website returned a redirect without a destination.",
            422,
          );
        if (redirects === MAX_REDIRECTS)
          throw new ScanError(
            "The website exceeded the limit of three redirects.",
            422,
          );
        try {
          url = new URL(location, url);
        } catch {
          throw new ScanError("The website returned an invalid redirect.", 422);
        }
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ScanError(
          `The website returned HTTP ${response.status}.`,
          422,
          { httpStatus: response.status },
        );
      }
      const contentType =
        response.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() ?? "";
      const accepted =
        options.contentType === "discovery"
          ? ["text/plain", "text/markdown", "application/xml", "text/xml", "text/html", "application/xhtml+xml"]
          : options.contentType === "text"
          ? ["text/plain", "text/markdown"]
          : ["text/html", "application/xhtml+xml"];
      if (!accepted.includes(contentType)) {
        await response.body?.cancel();
        throw new ScanError(
          `Expected ${options.contentType === "text" ? "plain text" : "an HTML page"}; received an unsupported content type.`,
          422,
        );
      }
      const maxBytes = options.maxBytes ?? MAX_BYTES;
      const declaredLength = Number(response.headers.get("content-length"));
      if (declaredLength > maxBytes) {
        await response.body?.cancel();
        throw new ScanError("The response exceeds the scan size limit.", 422, { httpStatus: response.status, failure: "too-large" });
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new ScanError("The website returned an empty response.", 422);
      let bytes = 0;
      let body = "";
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            throw new ScanError(
              "The response exceeds the scan size limit.",
              422,
              { httpStatus: response.status, failure: "too-large" },
            );
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      return { body, url: url.href, headers: response.headers, bytes, httpStatus: response.status };
    }
    throw new ScanError("Too many website redirects.", 422);
  } catch (error) {
    if (error instanceof ScanError) throw error;
    if (controller.signal.aborted)
      throw new ScanError(
        "The website took too long to respond. Try again later.",
        504,
        { failure: "timeout" },
      );
    throw new ScanError(
      "The website could not be fetched. Check that it is publicly reachable.",
      422,
      { failure: "network" },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function scanWebsite(
  input: string,
  options: { allowedHosts?: string; fetcher?: typeof fetch } = {},
) {
  const allowedHosts = configuredScanHosts(options.allowedHosts);
  const url = normalizeScanUrl(input);
  assertAllowedUrl(url, allowedHosts);
  const page = await boundedFetch(url, {
    allowedHosts,
    fetcher: options.fetcher,
  });
  const result = evaluateHtml(page.body, page.url, page.headers);
  const origin = new URL(page.url).origin;
  const optionalChecks = await Promise.all(
    DISCOVERY_DOCUMENT_KINDS.map(async (kind): Promise<EvaluationCheck> => {
      const sourceUrl = `${origin}/${kind}`;
      let analysis: DiscoveryDocumentAnalysis;
      try {
        const response = await boundedFetch(new URL(sourceUrl), {
          allowedHosts, fetcher: options.fetcher,
          maxBytes: DISCOVERY_DOCUMENT_LIMITS[kind], timeoutMs: 4_000, contentType: "discovery",
        });
        analysis = analyzeDiscoveryDocument({ kind, url: response.url, body: response.body,
          httpStatus: response.httpStatus, contentType: response.headers.get("content-type") });
      } catch (error) {
        const observation = error instanceof ScanError ? error.observation : undefined;
        analysis = analyzeDiscoveryDocument({ kind, url: sourceUrl,
          httpStatus: observation?.httpStatus,
          failure: observation?.failure ?? (observation?.httpStatus ? undefined : "network") });
      }
      // Persist a bounded diagnostic through the existing scan/check storage contract.
      // Optional-file observations do not change readiness-v1 weights or page hashes.
      const details = analysis.details;
      const evidence = details?.format === "markdown"
        ? { title: details.title, summary: details.summary, sections: details.sectionTitles.slice(0, 10), linkCount: details.linkCount, sampleLinks: details.links.slice(0, 5) }
        : details?.format === "robots"
          ? { ...details, userAgents: details.userAgents.slice(0, 10), sitemapUrls: details.sitemapUrls.slice(0, 5) }
          : details ? { ...details, urls: details.urls.slice(0, 5) } : null;
      return {
        id: ({ "robots.txt": "robots-file", "llms.txt": "llms-file", "llms-full.txt": "llms-full-file", "sitemap.xml": "sitemap-file" })[kind],
        label: kind, status: "optional", points: 0, maxPoints: 0, sourceUrl: analysis.url,
        detail: `${analysis.status}: ${analysis.summary} ${analysis.warnings.join(" ")} ${analysis.limitations.join(" ")} This does not change the HTML score.`,
        evidence: JSON.stringify({ version: analysis.version, status: analysis.status,
          httpStatus: analysis.httpStatus, bytes: analysis.bytes, limitBytes: analysis.limitBytes, details: evidence }),
      };
    }),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(page.body),
  );
  const contentHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    id: crypto.randomUUID(),
    url: page.url,
    submittedUrl: url.href,
    createdAt: new Date().toISOString(),
    ...result,
    checks: [...result.checks, ...optionalChecks],
    contentHash,
    bytesFetched: page.bytes,
    source: "live" as const,
    pageCount: 1,
  };
}

export type ScanResult = Awaited<ReturnType<typeof scanWebsite>>;
