import "server-only";
import type { SemanticPageSearch } from "./index-pages";

/**
 * Semantic page search run by the app itself: embed the question with the same model the crawl's
 * page vectors were built with, then ask the vector store for the nearest pages. Read-only.
 * See docs/EMBEDDINGS.md for the store (turbopuffer, namespace `folio-pages`, 768-dim cosine).
 */
export const PAGE_EMBEDDING_MODEL = "gemini-embedding-2";
export const PAGE_EMBEDDING_DIMENSIONS = 768;
/** The Codegraff model gateway (OpenAI-compatible embeddings). */
const EMBEDDINGS_URL = "https://gateway.codegraff.com/v1/embeddings";
const VECTORS_URL = "https://gcp-us-central1.turbopuffer.com/v2/namespaces/folio-pages/query";
/** Each request normally takes under a second. One retry per search covers a transient timeout or server error. */
const TIMEOUT_MS = 4_000;

export type PageVectorEnvironment = { CODEGRAFF_API_KEY?: string; TURBOPUFFER_API_KEY?: string };

/** Undefined unless both credentials are configured. Each credential is sent only to its own host. */
export function directPageSearch(env: PageVectorEnvironment, fetcher: typeof fetch = fetch): SemanticPageSearch | undefined {
  const embeddingKey = env.CODEGRAFF_API_KEY, vectorKey = env.TURBOPUFFER_API_KEY;
  if (!embeddingKey || !vectorKey) return undefined;
  const send = (url: string, key: string, body: unknown) => fetcher(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { filtersByWebsite: true, async search({ query, limit, site }) {
    if (site !== null && !/^[a-z0-9.-]{1,253}$/.test(site)) throw new Error("Invalid website filter.");
    let retried = false;
    const post = async (url: string, key: string, body: unknown): Promise<Record<string, unknown>> => {
      let response: Response | null = await send(url, key, body).catch(() => null);
      // A rejected credential or request (4xx) is not retried.
      if ((!response || response.status >= 500) && !retried) { retried = true; await response?.body?.cancel(); response = await send(url, key, body).catch(() => null); }
      if (!response) throw new Error("Semantic search request could not be completed.");
      // Never surface a provider body: it can echo the request.
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Semantic search request failed with HTTP ${response.status}.`); }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Unexpected semantic search response.");
      return payload as Record<string, unknown>;
    };
    const embedded = await post(EMBEDDINGS_URL, embeddingKey, { model: PAGE_EMBEDDING_MODEL, input: query, dimensions: PAGE_EMBEDDING_DIMENSIONS });
    const vector = (embedded.data as { embedding?: unknown }[] | undefined)?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== PAGE_EMBEDDING_DIMENSIONS || vector.some(value => typeof value !== "number" || !Number.isFinite(value)))
      throw new Error("Unexpected embedding shape.");
    // `domain` is the page's host, so a website also matches its subdomains.
    const found = await post(VECTORS_URL, vectorKey, { rank_by: ["vector", "ANN", vector], top_k: limit, include_attributes: ["url", "title", "excerpt"],
      ...(site ? { filters: ["Or", [["domain", "Eq", site], ["domain", "Glob", `*.${site}`]]] } : {}) });
    if (!Array.isArray(found.rows)) throw new Error("Unexpected vector search response.");
    return (found.rows as Record<string, unknown>[]).flatMap(row => typeof row.id === "string" && typeof row.url === "string" && typeof row.$dist === "number"
      ? [{ id: row.id.replace(/^v2:/, ""), url: row.url, title: typeof row.title === "string" ? row.title : null, section: null,
        excerpt: typeof row.excerpt === "string" ? row.excerpt : "", score: 1 - row.$dist }] : []);
  } };
}
