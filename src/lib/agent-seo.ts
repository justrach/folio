import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError } from "./agent-api-key-store";
import { agentIdempotencyIdentity } from "./agent-observation-store";
import { assertSeoDataAccess, fetchSeoOverview, normalizeSeoDomain, type SeoToolOptions } from "./dataforseo";
import { completeSeoReport, getOwnedSeoReport } from "./seo-store";

/** Replays return the saved pending/complete record and never repeat an ambiguous provider POST. */
export async function queryAgentSeo(db: D1Database, ownerId: string, domainInput: string, idempotencyKey: string, options: SeoToolOptions) {
  if (!ownerId) throw new AgentApiError("Authentication required.", 401, "unauthorized");
  const domain = normalizeSeoDomain(domainInput);
  const identity = await agentIdempotencyIdentity(idempotencyKey, { tool: "seo-overview-v1", domain });
  type Receipt = { id: string; report_id: string; request_hash: string };
  const read = () => db.prepare("SELECT id,report_id,request_hash FROM seo_agent_requests WHERE user_id=? AND idempotency_hash=?")
    .bind(ownerId, identity.idempotencyHash).first<Receipt>();
  const replay = async (receipt: Receipt) => {
    if (receipt.request_hash !== identity.requestHash) throw new AgentApiError("This idempotency key belongs to a different SEO lookup.", 409, "idempotency_conflict");
    const report = await getOwnedSeoReport(db, ownerId, receipt.report_id);
    if (!report) throw new AgentApiError("The saved SEO receipt is unavailable. Do not repeat the lookup.", 409, "receipt_unavailable");
    return { report, replayed: true, saved: report.state === "complete" };
  };
  const existing = await read();
  if (existing) return replay(existing);
  assertSeoDataAccess(options.env, { userId: ownerId });
  const id = crypto.randomUUID(), reportId = crypto.randomUUID(), now = Date.now(), cutoff = now - 3_600_000;
  const rateKey = `folio:seo-data:${ownerId}`;
  // Shared hourly budget with the browser. D1 executes the batch atomically.
  await db.batch([
    db.prepare(`INSERT INTO seo_agent_requests(id,user_id,idempotency_hash,request_hash,report_id,created_at)
      SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM rate_limit WHERE key=? AND last_request>=? AND count>=20)
      ON CONFLICT(user_id,idempotency_hash) DO NOTHING`).bind(id, ownerId, identity.idempotencyHash, identity.requestHash, reportId, now, rateKey, cutoff),
    db.prepare(`INSERT INTO seo_reports(id,user_id,domain,created_at)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM seo_agent_requests WHERE id=? AND user_id=?)`).bind(reportId, ownerId, domain, now, id, ownerId),
    db.prepare(`INSERT INTO rate_limit(id,key,count,last_request)
      SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM seo_agent_requests WHERE id=? AND user_id=?)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN last_request<? THEN 1 ELSE count+1 END,
      last_request=CASE WHEN last_request<? THEN ? ELSE last_request END`).bind(crypto.randomUUID(), rateKey, now, id, ownerId, cutoff, cutoff, now),
  ]);
  const receipt = await read();
  if (!receipt) throw new AgentApiError("This account has reached 20 SEO lookups in this hour.", 429, "seo_limit");
  if (receipt.id !== id) return replay(receipt);
  const result = await fetchSeoOverview(domain, { userId: ownerId }, options);
  try { return { report: await completeSeoReport(db, ownerId, reportId, result), replayed: false, saved: true }; }
  catch { return { report: { id: reportId, domain, result }, replayed: false, saved: false,
    storageWarning: "The provider result could not be saved. Keep this result; do not use another idempotency key to retry." }; }
}
