import { publishedSnapshotResponse } from "./frontend-public-snapshot";

type Service = { fetch(request: Request): Promise<Response> };
type Services = { FOLIO_BACKEND: Service; FOLIO_PUBLIC_INDEX: Service };

/** Keep API ownership, auth and paid-operation safeguards in the deployed backend. */
export async function serveFrontend(request: Request, services: Services, render: () => Promise<Response>) {
  const url = new URL(request.url);
  if (url.pathname === "/api/question-index" || url.pathname.startsWith("/api/question-index/")) return services.FOLIO_PUBLIC_INDEX.fetch(request);
  if (url.pathname === "/api/public/benchmarks" && request.method === "GET") {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const signal = AbortSignal.any([request.signal, controller.signal]);
      const response = await Promise.race([
        services.FOLIO_BACKEND.fetch(new Request(request, { signal })),
        new Promise<Response>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("Public snapshot read timed out")); }, 5_000); }),
      ]);
      if (response.status < 500) return response;
      await response.body?.cancel();
    } catch (error) {
      if (request.signal.aborted) throw error;
    } finally {
      clearTimeout(timeout);
    }
    return publishedSnapshotResponse();
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return services.FOLIO_BACKEND.fetch(request);
  if (url.pathname === "/leaderboard" && (url.searchParams.get("view") === "questions" || url.searchParams.has("cohort") || url.searchParams.has("q")))
    return services.FOLIO_PUBLIC_INDEX.fetch(request);
  return render();
}
