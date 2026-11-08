/** Client for the Folio index API (index-v1).
 *
 * This file is the public half of the contract: it contains no server code, no
 * database access and no provider credentials. The frontend talks to the index
 * exclusively through these methods, which means the backend can change shape
 * internally without touching a component.
 *
 * The record types below are the published contract. The private service in
 * `folio-index` must return exactly these shapes; see docs/INDEX-API.md.
 */

export const INDEX_API_VERSION = "index-v1";

export type EntityRecord = {
  id: string;
  type: "entity";
  name: string;
  domain: string;
  category: string | null;
  description: string | null;
  links: { home: string; docs: string | null };
  coverage: { inventory: boolean; rankings: boolean; content: boolean };
  counts: {
    inventoryPages: number;
    sections: number;
    sampledPages: number;
    rankedKeywords: number;
    landingPages: number;
  };
  freshness: Record<string, number | null> | null;
  ranking: { rows: number; perThousandInventoryPages: number | null; status: string | null } | null;
};

export type SectionRecord = { id: string; type: "section"; entity: string; path: string; pages: number; share: number | null };

export type PageRecord = {
  id: string;
  type: "page";
  entity: string;
  url: string;
  title: string | null;
  section: string;
  excerpt: string;
  topics: string[];
  embedding: { model: string; dimensions: number } | null;
};

export type KeywordRecord = {
  id: string;
  type: "keyword";
  entity: string;
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  estimatedTraffic: number | null;
  landingPage: string | null;
  landingPageId: string | null;
};

export type SearchHit = PageRecord & { score: number };

export type ListResult<T> = { items: T[]; nextCursor: string | null; truncated: boolean; version: string };

/** How current the index is, derived from the data rather than asserted. */
export type IndexHealth = {
  version: string;
  generated_at: string;
  subjects: number;
  subjects_profiled: number;
  subjects_pending: number;
  urls_total: number;
  urls_unread: number;
  urls_claimed: number;
  urls_extracted: number;
  urls_failed: number;
  pages_total: number;
  pages_with_content: number;
  pages_embedded: number;
  newest_content_at: string | null;
  oldest_content_at: string | null;
  content_older_than_30d: number;
  content_last_7d: number;
  content_coverage_pct: number;
  domains: {
    domain: string;
    urls: number;
    extracted: number;
    unread: number;
    newest_at: string | null;
    oldest_at: string | null;
  }[];
};

export type IndexClientErrorCode = "invalid_input" | "not_found" | "unauthorized" | "rate_limited" | "index_unavailable";

export class IndexClientError extends Error {
  constructor(
    message: string,
    public readonly code: IndexClientErrorCode,
    public readonly status: number,
    public readonly retryDisposition: "correct_request_before_retry" | "wait_then_reuse_same_request_key" | "inspect_saved_state_reuse_same_request_key",
  ) {
    super(message);
    this.name = "IndexClientError";
  }
}

export type IndexClientOptions = {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const RETRY: Record<number, IndexClientError["retryDisposition"]> = {
  400: "correct_request_before_retry",
  404: "correct_request_before_retry",
  429: "wait_then_reuse_same_request_key",
  503: "inspect_saved_state_reuse_same_request_key",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Minimal shape check: enough to catch a contract drift, not a validator. */
function assertList<T>(payload: unknown): ListResult<T> {
  if (!isRecord(payload) || !Array.isArray(payload.items) || typeof payload.version !== "string" ||
      (payload.nextCursor !== null && typeof payload.nextCursor !== "string"))
    throw new IndexClientError("The index returned an unexpected list shape.", "index_unavailable", 503, RETRY[503]);
  return {
    items: payload.items as T[],
    nextCursor: (payload.nextCursor as string | null) ?? null,
    truncated: payload.truncated === true,
    version: payload.version,
  };
}

function assertEntity(payload: unknown): EntityRecord {
  if (!isRecord(payload) || typeof payload.id !== "string" || typeof payload.domain !== "string" ||
      payload.type !== "entity" || !isRecord(payload.counts) || !isRecord(payload.coverage))
    throw new IndexClientError("The index returned an unexpected entity shape.", "index_unavailable", 503, RETRY[503]);
  return payload as EntityRecord;
}

export function createIndexClient(options: IndexClientOptions) {
  const base = options.baseUrl.replace(/\/$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const timeout = options.timeoutMs ?? 15_000;

  async function request<T>(path: string, parse: (payload: unknown) => T): Promise<T> {
    const url = `${base}/api/index/v1${path}`;
    let response: Response;
    try {
      response = await doFetch(url, {
        headers: {
          Accept: "application/json",
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new IndexClientError("The index could not be reached.", "index_unavailable", 503, RETRY[503]);
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
      const code = typeof error.code === "string" ? error.code : "index_unavailable";
      throw new IndexClientError(
        typeof error.message === "string" ? error.message : `Index request failed with HTTP ${response.status}.`,
        code as IndexClientErrorCode,
        response.status,
        RETRY[response.status] ?? "correct_request_before_retry",
      );
    }
    return parse(payload);
  }

  return {
    /** Resolve a company by domain or id. Throws `not_found` outside the index. */
    entity(input: { domain?: string; id?: string }) {
      const params = new URLSearchParams(input.domain ? { domain: input.domain } : { id: input.id ?? "" });
      return request(`/entity?${params}`, assertEntity);
    },
    sections(entityId: string, page?: { limit?: number; cursor?: string }) {
      return request(`/entities/${encodeURIComponent(entityId)}/sections${page ? pageQuery(page) : ""}`, assertList<SectionRecord>);
    },
    pages(entityId: string, options?: { section?: string; limit?: number; cursor?: string }) {
      const params = new URLSearchParams();
      if (options?.section) params.set("section", options.section);
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.cursor) params.set("cursor", options.cursor);
      const query = params.toString();
      return request(`/entities/${encodeURIComponent(entityId)}/pages${query ? `?${query}` : ""}`, assertList<PageRecord>);
    },
    keywords(entityId: string, page?: { limit?: number; cursor?: string }) {
      return request(`/entities/${encodeURIComponent(entityId)}/keywords${page ? pageQuery(page) : ""}`, assertList<KeywordRecord>);
    },
    /** Freshness and queue depth. Cheap enough to poll from a dashboard. */
    health() {
      return request(`/health`, payload => {
        if (!isRecord(payload) || typeof payload.version !== "string" || typeof payload.pages_with_content !== "number")
          throw new IndexClientError("The index returned an unexpected health shape.", "index_unavailable", 503, RETRY[503]);
        return payload as IndexHealth;
      });
    },
    search(input: { query: string; entityId?: string; limit?: number }) {
      const params = new URLSearchParams({ q: input.query });
      if (input.entityId) params.set("entityId", input.entityId);
      if (input.limit) params.set("limit", String(input.limit));
      return request(`/search?${params}`, assertList<SearchHit>);
    },
  };
}

function pageQuery(page: { limit?: number; cursor?: string }) {
  const params = new URLSearchParams();
  if (page.limit) params.set("limit", String(page.limit));
  if (page.cursor) params.set("cursor", page.cursor);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type IndexClient = ReturnType<typeof createIndexClient>;
