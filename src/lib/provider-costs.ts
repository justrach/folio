import type { D1Database } from "@cloudflare/workers-types";
export type CostGroup = { provider: string; model: string | null; source: string; runs: number;
  estimated_runs: number; unknown_runs: number; estimated_token_micros: number | null;
  reported_known_micros: number | null; reported_complete_runs: number; input_tokens: number | null;
  output_tokens: number | null };
export type CostSummary = { currency: "USD"; groups: CostGroup[]; recent: {
  source: string; source_id: string; provider: string; model: string | null; status: string;
  source_created_at: number; estimated_token_micros: number | null; reported_known_micros: number | null;
  reported_complete: number; rate_version: string | null;
}[]; recentLimit: number };
/** Saved D1 observations only. Cumulative snapshots are never summed together. */
export async function ownedCostSummary(db: D1Database, ownerId: string): Promise<CostSummary> {
  if (!ownerId) throw new Error("Authentication required");
  const groups = await db.prepare(`SELECT provider,model,source,COUNT(*) runs,
    COUNT(estimated_token_micros) estimated_runs,
    SUM(CASE WHEN estimated_token_micros IS NULL AND reported_complete=0 THEN 1 ELSE 0 END) unknown_runs,
    SUM(estimated_token_micros) estimated_token_micros, SUM(reported_known_micros) reported_known_micros,
    SUM(reported_complete) reported_complete_runs, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens
    FROM provider_cost_latest WHERE user_id=? GROUP BY provider,model,source ORDER BY provider,model,source`).bind(ownerId).all<CostGroup>();
  const recent = await db.prepare(`SELECT source,source_id,provider,model,status,source_created_at,
    estimated_token_micros,reported_known_micros,reported_complete,rate_version
    FROM provider_cost_latest WHERE user_id=? ORDER BY source_created_at DESC,id DESC LIMIT 50`).bind(ownerId).all<CostSummary["recent"][number]>();
  return { currency: "USD", groups: groups.results, recent: recent.results, recentLimit: 50 };
}
