import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError, agentApiHash } from "./agent-api-key-store";
import { assertSeoDataAccess, normalizeSeoDomain, type DataForSeoEnvironment } from "./dataforseo";
import { keywordPublicUrl } from "./keyword-search-mode";
import type { KeywordBenchmarkRun } from "./keyword-benchmark-types";

export type SandboxSeoEnvironment = DataForSeoEnvironment & { FOLIO_MCP_URL?: string };
export function sandboxSeoUrl(env: SandboxSeoEnvironment, ownerId: string, target: string | null) {
  assertSeoDataAccess(env, { userId: ownerId });
  if (!target) throw new AgentApiError("Choose a question with a target website before enabling SEO tools.");
  normalizeSeoDomain(target);
  const url = keywordPublicUrl(env.FOLIO_MCP_URL ?? "");
  if (!url || url.pathname !== "/api/mcp" || url.search || url.hash)
    throw new AgentApiError("Configure a public HTTPS FOLIO_MCP_URL ending in /api/mcp before enabling sandbox SEO tools.", 503, "mcp_not_configured");
  return url.href;
}
export async function createSandboxSeoGrant(db: D1Database, ownerId: string, run: KeywordBenchmarkRun, env: SandboxSeoEnvironment) {
  const url = sandboxSeoUrl(env, ownerId, run.case.targetUrl);
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
  const token = `folio_sandbox_${secret}`, id = crypto.randomUUID(), now = Date.now();
  const inserted = await db.prepare(`INSERT INTO sandbox_seo_grants(id,user_id,run_id,token_hash,domain,expires_at,created_at)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM keyword_benchmark_runs WHERE id=? AND user_id=? AND status='queued' AND create_attempt_at IS NULL) RETURNING id`)
    .bind(id, ownerId, run.id, await agentApiHash(token), normalizeSeoDomain(run.case.targetUrl), Math.min(now + 300_000, Date.parse(run.deadlineAt ?? run.createdAt)), now, run.id, ownerId).first();
  if (!inserted) throw new AgentApiError("The run changed before SEO authorization was saved.", 409, "conflict");
  return { url, authorization: `Bearer ${token}` };
}
export type SandboxSeoPrincipal = { grantId: string; ownerId: string; domain: string; runId: string };
export async function authenticateSandboxSeoGrant(db: D1Database, token: string): Promise<SandboxSeoPrincipal> {
  if (!/^folio_sandbox_[a-f0-9]{64}$/.test(token)) throw new AgentApiError("Invalid sandbox capability.", 401, "unauthorized");
  const row = await db.prepare(`SELECT g.id AS grantId,g.user_id AS ownerId,g.domain,g.run_id AS runId
    FROM sandbox_seo_grants g JOIN keyword_benchmark_runs r ON r.id=g.run_id AND r.user_id=g.user_id
    WHERE g.token_hash=? AND g.expires_at>? AND r.status IN ('queued','running','requires_action')
      AND r.cancel_attempt_at IS NULL AND r.hold_release_at IS NULL`)
    .bind(await agentApiHash(token), Date.now()).first<SandboxSeoPrincipal>();
  if (!row) throw new AgentApiError("Sandbox capability expired or its run is no longer active.", 401, "unauthorized");
  return row;
}
