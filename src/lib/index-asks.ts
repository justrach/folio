import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError } from "./agent-api-key-store";

/** One question a keyed agent asked the published index. Owner-private. */
export type IndexAsk = { id: string; tool: "search" | "answer" | "website"; question: string | null; domain: string | null; queryId: string | null;
  resultCount: number; summary: string; keyName: string | null; createdAt: string };
export type IndexAskInput = Pick<IndexAsk, "tool" | "question" | "domain" | "queryId" | "resultCount" | "summary">;
export const INDEX_ASK_HISTORY = 500;
const clean = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim().slice(0, max);

/** Best effort: a failed save never fails the read the agent asked for. Returns whether it was saved. */
export async function recordIndexAsk(db: D1Database, principal: { ownerId: string; keyId: string | null }, ask: IndexAskInput, now = Date.now()): Promise<boolean> {
  if (!principal.ownerId) return false;
  try {
    const saved = await db.prepare(`INSERT INTO agent_index_asks(id,user_id,key_id,tool,question,domain,query_id,result_count,summary,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user WHERE id=?) RETURNING id`)
      .bind(crypto.randomUUID(), principal.ownerId, principal.keyId, ask.tool, ask.question === null ? null : clean(ask.question, 200) || null, ask.domain, ask.queryId,
        ask.resultCount, clean(ask.summary, 400) || "Asked the index.", now, principal.ownerId).first<{ id: string }>();
    if (!saved) return false;
    // Keep the newest rows per owner; when fewer exist the subquery is NULL and nothing is removed.
    await db.prepare(`DELETE FROM agent_index_asks WHERE user_id=? AND created_at < (SELECT created_at FROM agent_index_asks WHERE user_id=? ORDER BY created_at DESC LIMIT 1 OFFSET ${INDEX_ASK_HISTORY - 1})`)
      .bind(principal.ownerId, principal.ownerId).run();
    return true;
  } catch { return false; }
}

export async function listIndexAsks(db: D1Database, ownerId: string, limit = 20) {
  if (!ownerId) throw new AgentApiError("Authentication required.", 401, "unauthorized");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AgentApiError("limit must be 1–50.", 400, "invalid_input");
  const rows = await db.prepare(`SELECT a.id,a.tool,a.question,a.domain,a.query_id,a.result_count,a.summary,a.created_at,k.name AS key_name
    FROM agent_index_asks a LEFT JOIN agent_api_keys k ON k.id=a.key_id AND k.user_id=a.user_id
    WHERE a.user_id=? ORDER BY a.created_at DESC,a.id DESC LIMIT ?`).bind(ownerId, limit + 1)
    .all<{ id: string; tool: IndexAsk["tool"]; question: string | null; domain: string | null; query_id: string | null; result_count: number; summary: string; created_at: number; key_name: string | null }>();
  return { items: rows.results.slice(0, limit).map((row): IndexAsk => ({ id: row.id, tool: row.tool, question: row.question, domain: row.domain, queryId: row.query_id,
    resultCount: Number(row.result_count), summary: row.summary, keyName: row.key_name, createdAt: new Date(Number(row.created_at)).toISOString() })), truncated: rows.results.length > limit };
}
