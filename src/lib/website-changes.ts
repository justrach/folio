import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError, agentApiHash } from "./agent-api-key-store";
import { getKeywordBenchmarkRun } from "./keyword-benchmark-store";
import type { KeywordBenchmarkCaseInput, KeywordBenchmarkRun } from "./keyword-benchmark-types";
import { keywordPublicUrl } from "./keyword-search-mode";
import { savedRows, savedSite, type SavedPage } from "./mcp-saved-evidence";
import { CHANGE_CAVEAT, PUBLICATION_PROVENANCE, changeAnswer, changeNextStep, changeOutcome, changeQuestions,
  type ChangeBaseline, type ChangeStatus, type WebsiteChange } from "./website-change-outcome";

export const WEBSITE_CHANGE_LIMITS = { perOwner: 500, questions: 20, files: 50, laterRuns: 200, candidatesPerQuestion: 3 } as const;
type Detail = { files: string[]; referenceUrl: string | null; payloadHash: string; baseline: ChangeBaseline[] };
type Row = { id: string; user_id: string; site_id: string; title: string; summary: string; status: ChangeStatus; key_id: string | null;
  detail_json: string; published_at: number | null; published_by: "agent" | "owner" | null; created_at: number; updated_at: number;
  site_url: string; site_name: string; key_name: string | null };
export type RecordWebsiteChangeInput = { websiteId: string; title: string; summary: string; caseIds: string[]; files?: string[]; referenceUrl?: string; requestKey: string };
export type UpdateWebsiteChangeInput = { status: "published" | "withdrawn"; publishedAt?: string; referenceUrl?: string };

const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
function text(value: unknown, label: string, max: number, multiline = false) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value))
    throw new AgentApiError(`Use ${label} of 1–${max} characters.`, 400, "invalid_input");
  return value.trim();
}
function reference(value: unknown) {
  if (value === undefined || value === null) return null;
  const url = keywordPublicUrl(value, false);
  if (!url) throw new AgentApiError("referenceUrl must be a public http(s) URL without credentials.", 400, "invalid_input");
  return url.href;
}

async function loadRow(db: D1Database, ownerId: string, id: string) {
  return db.prepare(`SELECT c.id,c.user_id,c.site_id,c.title,c.summary,c.status,c.key_id,c.detail_json,c.published_at,c.published_by,c.created_at,c.updated_at,
      s.url AS site_url,s.name AS site_name,k.name AS key_name
    FROM website_changes c JOIN sites s ON s.id=c.site_id AND s.user_id=c.user_id
    LEFT JOIN agent_api_keys k ON k.id=c.key_id AND k.user_id=c.user_id WHERE c.user_id=? AND c.id=?`).bind(ownerId, id).first<Row>();
}

/** Reads saved runs only: the baseline runs, and attempts created at or after the reported publication. */
async function project(db: D1Database, ownerId: string, row: Row, cache: Map<string, KeywordBenchmarkRun | null>): Promise<WebsiteChange> {
  const detail = JSON.parse(row.detail_json) as Detail;
  const publishedAt = row.published_at === null ? null : new Date(row.published_at).toISOString();
  const run = async (id: string) => { if (!cache.has(id)) cache.set(id, await getKeywordBenchmarkRun(db, ownerId, id)); return cache.get(id) ?? null; };
  const baselineRuns = new Map<string, KeywordBenchmarkRun>(), later = new Map<string, KeywordBenchmarkRun[]>(), incomplete = new Map<string, number>();
  if (row.status === "published" && row.published_at !== null && detail.baseline.length) {
    for (const item of detail.baseline) if (item.answer) { const saved = await run(item.answer.runId); if (saved) baselineRuns.set(saved.id, saved); }
    const cases = detail.baseline.map(item => item.caseId);
    const attempts = await db.prepare(`SELECT id,case_id,status FROM keyword_benchmark_runs WHERE user_id=? AND created_at>=?
      AND case_id IN (${cases.map(() => "?").join(",")}) ORDER BY created_at DESC,id DESC LIMIT ${WEBSITE_CHANGE_LIMITS.laterRuns}`)
      .bind(ownerId, row.published_at, ...cases).all<{ id: string; case_id: string; status: string }>();
    for (const attempt of attempts.results) {
      if (["queued", "running", "requires_action"].includes(attempt.status)) incomplete.set(attempt.case_id, (incomplete.get(attempt.case_id) ?? 0) + 1);
      const loaded = later.get(attempt.case_id) ?? [];
      if (attempt.status !== "completed" || loaded.length >= WEBSITE_CHANGE_LIMITS.candidatesPerQuestion) continue;
      const saved = await run(attempt.id);
      if (saved) later.set(attempt.case_id, [...loaded, saved]);
    }
  }
  const questions = changeQuestions({ status: row.status, publishedAt, baseline: detail.baseline }, { baselineRuns, later, incomplete });
  const outcome = changeOutcome(questions);
  return { id: row.id, website: { id: row.site_id, url: row.site_url, name: row.site_name }, title: row.title, summary: row.summary, status: row.status,
    recordedBy: { keyId: row.key_id, keyName: row.key_name }, files: detail.files, referenceUrl: detail.referenceUrl,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    publication: publishedAt && row.published_by ? { at: publishedAt, reportedBy: row.published_by, provenance: PUBLICATION_PROVENANCE } : null,
    questions, outcome, nextStep: changeNextStep(row.status, outcome), caveat: CHANGE_CAVEAT };
}

export async function getWebsiteChange(db: D1Database, ownerId: string, id: string): Promise<WebsiteChange> {
  if (!ownerId) throw new AgentApiError("Authentication required.", 401, "unauthorized");
  const row = validId(id) ? await loadRow(db, ownerId, id) : null;
  if (!row) throw new AgentApiError("The recorded change was not found.", 404, "not_found");
  return project(db, ownerId, row, new Map());
}

export async function listWebsiteChanges(db: D1Database, ownerId: string, input: SavedPage & { websiteId?: string; changeId?: string } = {}) {
  if (!ownerId) throw new AgentApiError("Authentication required.", 401, "unauthorized");
  if (input.changeId) return { items: [await getWebsiteChange(db, ownerId, input.changeId)], nextCursor: null, truncated: false, ordering: "single record" };
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new AgentApiError("limit must be 1–25.", 400, "invalid_input");
  const site = input.websiteId ? await savedSite(db, ownerId, input.websiteId) : null;
  const page = await savedRows(db, `SELECT id,created_at FROM website_changes WHERE user_id=?${site ? " AND site_id=?" : ""}`,
    site ? [ownerId, site.id] : [ownerId], { limit, cursor: input.cursor });
  const cache = new Map<string, KeywordBenchmarkRun | null>(), items: WebsiteChange[] = [];
  for (const item of page.items) { const row = await loadRow(db, ownerId, item.id); if (row) items.push(await project(db, ownerId, row, cache)); }
  return { ...page, items };
}

/** Saves the change and, per targeted question, the latest completed answer as its baseline. Starts no work. */
export async function recordWebsiteChange(db: D1Database, principal: { ownerId: string; keyId: string | null }, input: RecordWebsiteChangeInput, options: { now?: Date } = {}) {
  const ownerId = principal.ownerId;
  const site = await savedSite(db, ownerId, input.websiteId);
  const title = text(input.title, "a title", 160), summary = text(input.summary, "a summary", 2000, true);
  if (typeof input.requestKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(input.requestKey)) throw new AgentApiError("Use a stable requestKey of 8–128 permitted characters.", 400, "invalid_input");
  if (!Array.isArray(input.caseIds) || !input.caseIds.length || input.caseIds.length > WEBSITE_CHANGE_LIMITS.questions || !input.caseIds.every(validId) || new Set(input.caseIds).size !== input.caseIds.length)
    throw new AgentApiError(`Choose 1–${WEBSITE_CHANGE_LIMITS.questions} distinct saved question IDs.`, 400, "invalid_input");
  const files = input.files ?? [];
  if (!Array.isArray(files) || files.length > WEBSITE_CHANGE_LIMITS.files) throw new AgentApiError(`List at most ${WEBSITE_CHANGE_LIMITS.files} files.`, 400, "invalid_input");
  const paths = files.map(path => text(path, "file paths", 300)), referenceUrl = reference(input.referenceUrl);
  const requestHash = await agentApiHash(`website-change:${input.requestKey}`);
  const payloadHash = await agentApiHash(JSON.stringify([site.id, title, summary, [...input.caseIds].sort(), paths, referenceUrl]));
  const replay = async () => {
    const existing = await db.prepare("SELECT id,detail_json FROM website_changes WHERE user_id=? AND request_hash=?").bind(ownerId, requestHash).first<{ id: string; detail_json: string }>();
    if (!existing) return null;
    if ((JSON.parse(existing.detail_json) as Detail).payloadHash !== payloadHash) throw new AgentApiError("This requestKey already recorded a different change. Use a new key for a new change.", 409, "conflict");
    return { change: await getWebsiteChange(db, ownerId, existing.id), replayed: true };
  };
  const saved = await replay();
  if (saved) return saved;
  const baseline: ChangeBaseline[] = [];
  for (const caseId of input.caseIds) {
    const row = await db.prepare("SELECT case_json FROM keyword_benchmark_cases WHERE user_id=? AND id=?").bind(ownerId, caseId).first<{ case_json: string }>();
    if (!row) throw new AgentApiError("A saved question was not found.", 404, "not_found");
    const question = JSON.parse(row.case_json) as KeywordBenchmarkCaseInput;
    if (question.targetUrl !== site.url) throw new AgentApiError("Every question must target the selected website.", 400, "invalid_input");
    const latest = await db.prepare("SELECT id FROM keyword_benchmark_runs WHERE user_id=? AND case_id=? AND status='completed' ORDER BY created_at DESC,id DESC LIMIT 1").bind(ownerId, caseId).first<{ id: string }>();
    const run = latest ? await getKeywordBenchmarkRun(db, ownerId, latest.id) : null;
    baseline.push({ caseId, query: question.query, answer: run?.answer ? changeAnswer(run) : null });
  }
  const now = (options.now ?? new Date()).getTime(), id = crypto.randomUUID();
  const detail: Detail = { files: paths, referenceUrl, payloadHash, baseline };
  const inserted = await db.prepare(`INSERT INTO website_changes(id,user_id,site_id,request_hash,title,summary,status,key_id,detail_json,created_at,updated_at)
    SELECT ?,?,?,?,?,?,'proposed',?,?,?,? WHERE EXISTS(SELECT 1 FROM sites WHERE user_id=? AND id=?)
      AND (SELECT COUNT(*) FROM website_changes WHERE user_id=?) < ${WEBSITE_CHANGE_LIMITS.perOwner}
    ON CONFLICT(user_id,request_hash) DO NOTHING RETURNING id`)
    .bind(id, ownerId, site.id, requestHash, title, summary, principal.keyId, JSON.stringify(detail), now, now, ownerId, site.id, ownerId).first<{ id: string }>();
  if (inserted) return { change: await getWebsiteChange(db, ownerId, inserted.id), replayed: false };
  const raced = await replay();
  if (raced) return raced;
  throw new AgentApiError("This workspace cannot record another change right now.", 429, "change_limit");
}

/** Publication is the caller's report. A withdrawn change stays withdrawn. */
export async function updateWebsiteChange(db: D1Database, ownerId: string, id: string, input: UpdateWebsiteChangeInput, by: "agent" | "owner", options: { now?: Date } = {}) {
  if (!ownerId) throw new AgentApiError("Authentication required.", 401, "unauthorized");
  const row = validId(id) ? await loadRow(db, ownerId, id) : null;
  if (!row) throw new AgentApiError("The recorded change was not found.", 404, "not_found");
  if (input.status !== "published" && input.status !== "withdrawn") throw new AgentApiError("status must be published or withdrawn.", 400, "invalid_input");
  if (row.status === "withdrawn") {
    if (input.status === "withdrawn") return { change: await project(db, ownerId, row, new Map()) };
    throw new AgentApiError("A withdrawn change cannot be published. Record a new change instead.", 409, "conflict");
  }
  const now = (options.now ?? new Date()).getTime(), detail = JSON.parse(row.detail_json) as Detail;
  if (input.status === "withdrawn" && input.publishedAt !== undefined) throw new AgentApiError("publishedAt applies only to a published change.", 400, "invalid_input");
  // Repeating "published" without a time keeps the first reported time, so retests already paired stay paired.
  let publishedAt = row.published_at, publishedBy = row.published_by;
  if (input.status === "published" && (input.publishedAt !== undefined || row.published_at === null)) {
    publishedAt = input.publishedAt === undefined ? now : Date.parse(input.publishedAt);
    if (!Number.isFinite(publishedAt) || publishedAt > now + 300_000 || publishedAt < now - 90 * 86_400_000)
      throw new AgentApiError("publishedAt must be a time within the last 90 days, not in the future.", 400, "invalid_input");
    publishedBy = by;
  }
  if (input.referenceUrl !== undefined) detail.referenceUrl = reference(input.referenceUrl);
  const updated = await db.prepare(`UPDATE website_changes SET status=?,published_at=?,published_by=?,detail_json=?,updated_at=?
    WHERE user_id=? AND id=? AND status IN ('proposed','published') AND updated_at=? RETURNING id`)
    .bind(input.status, publishedAt, publishedBy, JSON.stringify(detail), Math.max(now, row.updated_at + 1), ownerId, id, row.updated_at).first<{ id: string }>();
  if (!updated) throw new AgentApiError("This change was updated elsewhere. Read it again before continuing.", 409, "conflict");
  return { change: await getWebsiteChange(db, ownerId, id) };
}
