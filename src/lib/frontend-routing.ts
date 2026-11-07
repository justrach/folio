type Service = { fetch(request: Request): Promise<Response> };
type Services = { FOLIO_BACKEND: Service; FOLIO_PUBLIC_INDEX: Service };

/** Keep API ownership, auth and paid-operation safeguards in the deployed backend. */
export async function serveFrontend(request: Request, services: Services, render: () => Promise<Response>) {
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return services.FOLIO_BACKEND.fetch(request);
  if (url.pathname === "/leaderboard" && (url.searchParams.get("view") === "questions" || url.searchParams.has("cohort") || url.searchParams.has("q")))
    return services.FOLIO_PUBLIC_INDEX.fetch(request);
  return render();
}
