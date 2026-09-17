import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import type { AgentReservationGuard } from "./agent-observation-types";
import { validateKeywordCollectionEvidence } from "./keyword-search-mode";
import { KEYWORD_BENCHMARK_SURFACE, KEYWORD_BENCHMARK_QUERY_MAX_LENGTH, isKeywordBenchmarkId, keywordSearchMode, type KeywordBenchmarkAnswer, type KeywordBenchmarkCase,
  type KeywordBenchmarkCaseInput, type KeywordBenchmarkExecution, type KeywordBenchmarkRun,
  type KeywordBenchmarkRunSummary, type KeywordBenchmarkSuite, type KeywordBenchmarkSuiteSummary,
  type KeywordBenchmarkUsage } from "./keyword-benchmark-types";

export class KeywordBenchmarkStoreError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); this.name = "KeywordBenchmarkStoreError"; }
}
const unknownUsage: KeywordBenchmarkUsage = { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null };
const emptyMetadata: KeywordBenchmarkRun["providerMetadata"] = { environmentId: null, requestId: null, turnId: null };
const active = new Set(["queued", "running", "requires_action"]);
const statuses = new Set([...active, "completed", "failed", "cancelled"]);
function requireOwner(ownerId: string) { if (!ownerId) throw new KeywordBenchmarkStoreError("A signed-in owner is required.", 401); }
function benchmarkId(value: unknown, label: string): string {
  if (!isKeywordBenchmarkId(value)) throw new KeywordBenchmarkStoreError(`Invalid ${label}.`, 400);
  return value;
}
function bounded(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max || /\u0000/.test(value))
    throw new KeywordBenchmarkStoreError(`Invalid ${label}.`, 400);
  return value;
}
function json(value: unknown, bytes: number): string {
  const result = JSON.stringify(value);
  if (new TextEncoder().encode(result).byteLength > bytes) throw new KeywordBenchmarkStoreError("Benchmark evidence exceeds the saved size limit.", 413);
  return result;
}
function webUrl(value: unknown): string {
  const text = bounded(value, "website URL", 2048);
  let url: URL;
  try { url = new URL(text); } catch { throw new KeywordBenchmarkStoreError("Invalid website URL.", 400); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new KeywordBenchmarkStoreError("A public HTTP(S) URL without credentials is required.", 400);
  return text;
}
export function validateKeywordBenchmarkCase(value: KeywordBenchmarkCaseInput): KeywordBenchmarkCaseInput {
  if (!value || typeof value !== "object") throw new KeywordBenchmarkStoreError("Invalid benchmark case.", 400);
  const result: KeywordBenchmarkCaseInput = {
    query: bounded(value.query, "query", KEYWORD_BENCHMARK_QUERY_MAX_LENGTH), targetUrl: value.targetUrl === null ? null : webUrl(value.targetUrl),
    language: bounded(value.language, "language", 40), locale: bounded(value.locale, "locale", 40),
    rubricVersion: bounded(value.rubricVersion, "rubric version", 100),
  };
  if (value.searchMode !== undefined) {
    try { result.searchMode = keywordSearchMode(value.searchMode); }
    catch { throw new KeywordBenchmarkStoreError("Invalid keyword search mode.", 400); }
  }
  if (value.referenceFacts !== undefined) {
    if (!Array.isArray(value.referenceFacts) || value.referenceFacts.length > 30) throw new KeywordBenchmarkStoreError("At most 30 independent reference facts are allowed.", 400);
    result.referenceFacts = value.referenceFacts.map(fact => ({ id: bounded(fact?.id, "reference ID", 100), statement: bounded(fact?.statement, "reference statement", 2000) }));
    if (new Set(result.referenceFacts.map(fact => fact.id)).size !== result.referenceFacts.length) throw new KeywordBenchmarkStoreError("Reference IDs must be unique.", 400);
  }
  json(result, 50_000);
  return result;
}
export function validateKeywordBenchmarkAnswer(value: KeywordBenchmarkAnswer): KeywordBenchmarkAnswer {
  if (!value || typeof value !== "object" || !Array.isArray(value.mentions) || !Array.isArray(value.citations) || value.mentions.length > 100 || value.citations.length > 200)
    throw new KeywordBenchmarkStoreError("Invalid benchmark answer.", 400);
  const result: KeywordBenchmarkAnswer = {
    text: bounded(value.text, "answer text", 500_000),
    mentions: value.mentions.map(mention => ({ name: bounded(mention?.name, "mentioned product", 300), url: mention?.url === null ? null : webUrl(mention?.url),
      ...(mention.reason === undefined ? {} : { reason: bounded(mention.reason, "recommendation reason", 4000, true) }),
      ...(mention.citationUrls === undefined ? {} : { citationUrls: Array.isArray(mention.citationUrls) && mention.citationUrls.length <= 50
        ? mention.citationUrls.map(webUrl) : (() => { throw new KeywordBenchmarkStoreError("Invalid recommendation citations.", 400); })() }),
    })),
    citations: value.citations.map(citation => ({ url: webUrl(citation?.url),
      ...(citation.title === undefined ? {} : { title: bounded(citation.title, "citation title", 1000, true) }),
      ...(citation.quote === undefined ? {} : { quote: bounded(citation.quote, "citation quote", 4000, true) }),
    })),
  };
  if (value.limitations !== undefined) {
    if (!Array.isArray(value.limitations) || value.limitations.length > 50) throw new KeywordBenchmarkStoreError("Invalid answer limitations.", 400);
    result.limitations = value.limitations.map(item => bounded(item, "answer limitation", 4000));
  }
  if (value.evidence !== undefined) {
    if (!Array.isArray(value.evidence) || value.evidence.length > 200) throw new KeywordBenchmarkStoreError("Invalid answer evidence.", 400);
    result.evidence = value.evidence.map(item => {
      if (!["passed", "failed", "unmeasured"].includes(item?.outcome)) throw new KeywordBenchmarkStoreError("Invalid evidence outcome.", 400);
      return { id: bounded(item.id, "evidence ID", 100), outcome: item.outcome, detail: bounded(item.detail, "evidence detail", 4000, true) };
    });
  }
  if (value.collection !== undefined) {
    try { result.collection = validateKeywordCollectionEvidence(value.collection); }
    catch { throw new KeywordBenchmarkStoreError("Invalid or oversized keyword collection evidence.", 400); }
  }
  json(result, 1_000_000);
  return result;
}
function execution(value: KeywordBenchmarkExecution): KeywordBenchmarkExecution {
  return { model: bounded(value.model, "model", 200), harnessVersion: bounded(value.harnessVersion, "harness version", 100),
    environmentType: bounded(value.environmentType, "environment type", 100), environmentFingerprint: bounded(value.environmentFingerprint, "environment fingerprint", 200) };
}
function limits(value: { maxRunsPerDay?: number | null; maxActiveRuns?: number }) {
  const maxRunsPerDay = value.maxRunsPerDay === undefined ? 1 : value.maxRunsPerDay, maxActiveRuns = value.maxActiveRuns ?? 1;
  if ((maxRunsPerDay !== null && (!Number.isInteger(maxRunsPerDay) || maxRunsPerDay < 1 || maxRunsPerDay > 100)) || !Number.isInteger(maxActiveRuns) || maxActiveRuns < 1 || maxActiveRuns > 100)
    throw new KeywordBenchmarkStoreError("Invalid deployment benchmark limit.", 500);
  return { maxRunsPerDay, maxActiveRuns };
}
function nowMillis(now?: Date) {
  const timestamp = (now ?? new Date()).getTime();
  if (!Number.isFinite(timestamp)) throw new KeywordBenchmarkStoreError("Invalid benchmark timestamp.", 500);
  return timestamp;
}

type SuiteRow = { id: string; name: string; description: string; created_at: number; case_count?: number };
type CaseRow = { id: string; suite_id: string; revision: number; created_at: number; updated_at: number; case_json: string };
function decodeCase(row: CaseRow): KeywordBenchmarkCase {
  return { ...JSON.parse(row.case_json) as KeywordBenchmarkCaseInput, id: row.id, suiteId: row.suite_id,
    revision: row.revision, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
/** Suite insertion and all cases are a single D1 transaction; quota failures add no rows. */
export async function createKeywordBenchmarkSuite(db: D1Database, ownerId: string,
  input: { name: string; description?: string; cases: (KeywordBenchmarkCaseInput & { id?: string })[] }, options: { maxSuites?: number } = {}): Promise<KeywordBenchmarkSuite> {
  requireOwner(ownerId);
  const name = bounded(input.name, "suite name", 200), description = bounded(input.description ?? "", "suite description", 4000, true);
  if (!Array.isArray(input.cases) || !input.cases.length || input.cases.length > 50) throw new KeywordBenchmarkStoreError("A benchmark suite requires 1 to 50 cases.", 400);
  const maxSuites = options.maxSuites ?? 20;
  if (!Number.isInteger(maxSuites) || maxSuites < 1 || maxSuites > 100) throw new KeywordBenchmarkStoreError("Invalid operator suite allowance.", 400);
  const suiteId = crypto.randomUUID(), now = Date.now();
  const cases = input.cases.map(value => ({ input: validateKeywordBenchmarkCase(value), id: value.id === undefined ? crypto.randomUUID() : benchmarkId(value.id, "case ID") }));
  if (new Set(cases.map(value => value.id)).size !== cases.length) throw new KeywordBenchmarkStoreError("Case IDs must be unique.", 400);
  const result = await db.batch([
    db.prepare(`INSERT INTO keyword_benchmark_suites (id,user_id,name,description,created_at)
      SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM keyword_benchmark_suites WHERE user_id=?) < ? RETURNING id`)
      .bind(suiteId, ownerId, name, description, now, ownerId, maxSuites),
    ...cases.map(value => db.prepare(`INSERT INTO keyword_benchmark_cases(id,user_id,suite_id,revision,created_at,updated_at,case_json)
      SELECT ?,?,?,0,?,?,? WHERE EXISTS(SELECT 1 FROM keyword_benchmark_suites WHERE id=? AND user_id=?)`)
      .bind(value.id, ownerId, suiteId, now, now, json(value.input, 50_000), suiteId, ownerId)),
  ]);
  if (!result[0].results.length) throw new KeywordBenchmarkStoreError(`This account has reached its ${maxSuites}-suite limit.`, 429);
  return (await getKeywordBenchmarkSuite(db, ownerId, suiteId))!;
}
export async function getKeywordBenchmarkSuite(db: D1Database, ownerId: string, id: string): Promise<KeywordBenchmarkSuite | null> {
  requireOwner(ownerId);
  benchmarkId(id, "suite ID");
  const row = await db.prepare("SELECT id,name,description,created_at FROM keyword_benchmark_suites WHERE user_id=? AND id=?").bind(ownerId, id).first<SuiteRow>();
  if (!row) return null;
  const cases = await db.prepare("SELECT id,suite_id,revision,created_at,updated_at,case_json FROM keyword_benchmark_cases WHERE user_id=? AND suite_id=? ORDER BY created_at,id").bind(ownerId, id).all<CaseRow>();
  return { id: row.id, name: row.name, description: row.description, createdAt: new Date(row.created_at).toISOString(), cases: cases.results.map(decodeCase) };
}
export async function listKeywordBenchmarkSuites(db: D1Database, ownerId: string): Promise<KeywordBenchmarkSuiteSummary[]> {
  requireOwner(ownerId);
  const rows = await db.prepare(`SELECT s.id,s.name,s.description,s.created_at,
    (SELECT COUNT(*) FROM keyword_benchmark_cases c WHERE c.user_id=s.user_id AND c.suite_id=s.id) AS case_count
    FROM keyword_benchmark_suites s WHERE s.user_id=? ORDER BY s.created_at DESC,s.id LIMIT 20`).bind(ownerId).all<SuiteRow>();
  return rows.results.map(row => ({ id: row.id, name: row.name, description: row.description, createdAt: new Date(row.created_at).toISOString(), caseCount: row.case_count ?? 0 }));
}
export async function updateKeywordBenchmarkCase(db: D1Database, ownerId: string, caseId: string, revision: number, input: KeywordBenchmarkCaseInput): Promise<KeywordBenchmarkCase> {
  requireOwner(ownerId);
  benchmarkId(caseId, "case ID");
  const value = validateKeywordBenchmarkCase(input);
  const row = await db.prepare(`UPDATE keyword_benchmark_cases SET case_json=?,revision=revision+1,updated_at=?
    WHERE user_id=? AND id=? AND revision=? RETURNING id,suite_id,revision,created_at,updated_at,case_json`)
    .bind(json(value, 50_000), Date.now(), ownerId, caseId, revision).first<CaseRow>();
  if (!row) throw new KeywordBenchmarkStoreError("This benchmark case changed or is unavailable. Reload before continuing.");
  return decodeCase(row);
}

type RunRow = { id: string; suite_id: string; case_id: string; kind: "baseline" | "fresh"; baseline_run_id: string | null;
  model: string; harness_version: string; environment_type: string; environment_fingerprint: string; case_json: string;
  status: KeywordBenchmarkRun["status"]; session_id: string | null; create_attempt_at: number | null; created_at: number; updated_at: number; revision: number;
  answer_json?: string | null; usage_json: string; provider_metadata_json: string; error: string | null; answer_characters: number; mention_count: number; citation_count: number;
  allowed_domains_json: string; deadline_at: number | null; cancel_attempt_at: number | null; cancel_acknowledged_at: number | null;
  archived_at: number | null; hold_release_at: number | null; hold_release_reason: KeywordBenchmarkRun["holdReleaseReason"] };
const runColumns = `id,suite_id,case_id,kind,baseline_run_id,model,harness_version,environment_type,environment_fingerprint,
  case_json,status,session_id,create_attempt_at,created_at,updated_at,revision,usage_json,provider_metadata_json,error,answer_characters,mention_count,citation_count,
  allowed_domains_json,deadline_at,cancel_attempt_at,cancel_acknowledged_at,hold_release_at,hold_release_reason,archived_at`;
function decodeRun(row: RunRow): KeywordBenchmarkRun {
  return { id: row.id, suiteId: row.suite_id, caseId: row.case_id, kind: row.kind, baselineRunId: row.baseline_run_id,
    model: row.model, harnessVersion: row.harness_version, environmentType: row.environment_type, environmentFingerprint: row.environment_fingerprint,
    case: JSON.parse(row.case_json), surface: KEYWORD_BENCHMARK_SURFACE, publication: "private", status: row.status,
    sessionId: row.session_id, createAttemptAt: row.create_attempt_at === null ? null : new Date(row.create_attempt_at).toISOString(),
    archivedAt: row.archived_at == null ? null : new Date(row.archived_at).toISOString(),
    holdReleasedAt: row.hold_release_at === null ? null : new Date(row.hold_release_at).toISOString(), holdReleaseReason: row.hold_release_reason,
    allowedDomains: JSON.parse(row.allowed_domains_json), deadlineAt: row.deadline_at === null ? null : new Date(row.deadline_at).toISOString(),
    cancelAttemptAt: row.cancel_attempt_at === null ? null : new Date(row.cancel_attempt_at).toISOString(),
    cancelAcknowledgedAt: row.cancel_acknowledged_at === null ? null : new Date(row.cancel_acknowledged_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), revision: row.revision,
    answer: row.answer_json ? JSON.parse(row.answer_json) : null, usage: JSON.parse(row.usage_json), providerMetadata: JSON.parse(row.provider_metadata_json), error: row.error };
}
export async function getKeywordBenchmarkRun(db: D1Database, ownerId: string, id: string): Promise<KeywordBenchmarkRun | null> {
  requireOwner(ownerId);
  benchmarkId(id, "run ID");
  const row = await db.prepare(`SELECT ${runColumns},answer_json FROM keyword_benchmark_runs WHERE user_id=? AND id=?`).bind(ownerId, id).first<RunRow>();
  return row ? decodeRun(row) : null;
}
export async function listKeywordBenchmarkRuns(db: D1Database, ownerId: string, options: { suiteId?: string; caseId?: string } = {}): Promise<KeywordBenchmarkRunSummary[]> {
  requireOwner(ownerId);
  if (options.suiteId !== undefined) benchmarkId(options.suiteId, "suite ID");
  if (options.caseId !== undefined) benchmarkId(options.caseId, "case ID");
  const rows = await db.prepare(`SELECT ${runColumns} FROM keyword_benchmark_runs WHERE user_id=?
    AND (? IS NULL OR suite_id=?) AND (? IS NULL OR case_id=?) ORDER BY created_at DESC,id DESC LIMIT 100`)
    .bind(ownerId, options.suiteId ?? null, options.suiteId ?? null, options.caseId ?? null, options.caseId ?? null).all<RunRow>();
  return rows.results.map(row => {
    const { answer: _answer, case: input, ...run } = decodeRun(row);
    const { referenceFacts: _references, ...publicCase } = input;
    return { ...run, case: publicCase, answerCharacters: row.answer_characters, mentionCount: row.mention_count, citationCount: row.citation_count };
  });
}
/** Page saved attempts after owned website/scope/model filtering, never after an account-wide limit. */
export async function listWebsiteKeywordRunsPage(db: D1Database, ownerId: string, options: {
  websiteId: string; searchMode: string; model?: string; cursor?: string;
}) {
  requireOwner(ownerId); benchmarkId(options.websiteId, "website ID");
  if (!["open-web", "reviewed-domains"].includes(options.searchMode)) throw new KeywordBenchmarkStoreError("Invalid search scope.", 400);
  if (options.model !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(options.model)) throw new KeywordBenchmarkStoreError("Invalid model.", 400);
  let before: number | null = null, beforeId: string | null = null;
  if (options.cursor !== undefined) {
    const match = /^(\d{1,16}):([a-zA-Z0-9_-]+)$/.exec(options.cursor);
    if (!match || !Number.isSafeInteger(Number(match[1])) || !isKeywordBenchmarkId(match[2])) throw new KeywordBenchmarkStoreError("Invalid history cursor.", 400);
    before = Number(match[1]); beforeId = match[2];
  }
  const site = await db.prepare("SELECT url FROM sites WHERE id=? AND user_id=?").bind(options.websiteId, ownerId).first<{url:string}>();
  if (!site) throw new KeywordBenchmarkStoreError("Owned website not found.", 404);
  const where = "user_id=? AND json_extract(case_json,'$.targetUrl')=? AND COALESCE(json_extract(case_json,'$.searchMode'),'reviewed-domains')=?";
  const models = await db.prepare(`SELECT DISTINCT model FROM keyword_benchmark_runs WHERE ${where} ORDER BY model`).bind(ownerId, site.url, options.searchMode).all<{model:string}>();
  const rows = await db.prepare(`SELECT ${runColumns} FROM keyword_benchmark_runs WHERE ${where}
    AND (? IS NULL OR model=?) AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 101`)
    .bind(ownerId, site.url, options.searchMode, options.model ?? null, options.model ?? null, before, before, before, beforeId).all<RunRow>();
  const page = rows.results.slice(0,100), last = page.at(-1);
  return { runs: page.map(row => {
    const {answer: _answer, case: input, ...run} = decodeRun(row);
    const {referenceFacts: _references, ...publicCase} = input;
    return {...run, case: publicCase, answerCharacters: row.answer_characters, mentionCount: row.mention_count, citationCount: row.citation_count};
  }), models: models.results.map(item=>item.model), nextCursor: rows.results.length>100 && last ? `${last.created_at}:${last.id}` : null };
}
/** One atomic INSERT freezes the owned case and reserves capacity before any remote POST. */
export function prepareKeywordBenchmarkReservation(db: D1Database, ownerId: string,
  input: KeywordBenchmarkExecution & { caseId: string; kind: "baseline" | "fresh"; baselineRunId?: string | null; allowedDomains?: string[]; deadlineMs?: number },
  options: { maxRunsPerDay?: number | null; maxActiveRuns?: number; now?: Date; id?: string; guard?: AgentReservationGuard } = {}) {
  requireOwner(ownerId);
  const config = execution(input), { maxRunsPerDay, maxActiveRuns } = limits(options), now = nowMillis(options.now), id = options.id ?? crypto.randomUUID();
  benchmarkId(id, "run ID");
  const guard = options.guard;
  if (guard && (guard.ownerId !== ownerId || guard.runId !== id)) throw new KeywordBenchmarkStoreError("Invalid API reservation owner or run.", 400);
  benchmarkId(input.caseId, "case ID");
  if ((input.kind !== "baseline" && input.kind !== "fresh") || (input.kind === "baseline" && input.baselineRunId) || (input.kind === "fresh" && !input.baselineRunId))
    throw new KeywordBenchmarkStoreError("Fresh answers require an owned completed baseline; baseline runs cannot link another run.", 400);
  if (input.baselineRunId) benchmarkId(input.baselineRunId, "baseline run ID");
  const domains = input.allowedDomains ?? [];
  if (!Array.isArray(domains) || domains.length > 100 || domains.some(value => typeof value !== "string" || value.length > 253)) throw new KeywordBenchmarkStoreError("Invalid research corpus.", 400);
  if (input.deadlineMs !== undefined && (!Number.isInteger(input.deadlineMs) || input.deadlineMs < 1000 || input.deadlineMs > 600_000)) throw new KeywordBenchmarkStoreError("Invalid benchmark deadline.", 400);
  const statement = db.prepare(`INSERT INTO keyword_benchmark_runs
    (id,user_id,suite_id,case_id,kind,baseline_run_id,model,harness_version,environment_type,environment_fingerprint,case_json,
      status,session_id,create_attempt_at,created_at,updated_at,revision,answer_json,usage_json,provider_metadata_json,error,allowed_domains_json,deadline_at)
    SELECT ?,c.user_id,c.suite_id,c.id,?,?,?,?,?,?,c.case_json,'queued',NULL,NULL,?,?,0,NULL,?,?,NULL,?,?
    FROM keyword_benchmark_cases c WHERE c.user_id=? AND c.id=?
      AND (? IS NULL OR EXISTS(SELECT 1 FROM keyword_benchmark_runs b WHERE b.id=? AND b.user_id=c.user_id AND b.case_id=c.id AND b.kind='baseline' AND b.status='completed'))
      AND (? IS NULL OR (SELECT COUNT(*) FROM keyword_benchmark_runs WHERE user_id=? AND created_at>=?) < ?)
      AND (SELECT COUNT(*) FROM keyword_benchmark_runs WHERE user_id=? AND status IN ('queued','running','requires_action')
        AND NOT(status='requires_action' AND archived_at IS NOT NULL)
        AND NOT(status='requires_action' AND session_id IS NULL AND create_attempt_at IS NOT NULL AND hold_release_at IS NOT NULL)) < ?
      AND NOT EXISTS(SELECT 1 FROM keyword_benchmark_runs h WHERE h.user_id=c.user_id AND h.case_id=c.id
        AND h.status='requires_action' AND (h.archived_at IS NOT NULL OR (h.session_id IS NULL AND h.create_attempt_at IS NOT NULL AND h.hold_release_at IS NOT NULL)))
      ${guard ? "AND EXISTS(SELECT 1 FROM agent_api_requests WHERE id=? AND user_id=? AND run_id=? AND disposition='started')" : ""}
    RETURNING ${runColumns},answer_json`).bind(id, input.kind, input.baselineRunId ?? null, config.model, config.harnessVersion, config.environmentType,
      config.environmentFingerprint, now, now, json(unknownUsage, 1000), json(emptyMetadata, 2000), json(domains, 30_000), input.deadlineMs === undefined ? null : now + input.deadlineMs, ownerId, input.caseId,
      input.baselineRunId ?? null, input.baselineRunId ?? null, maxRunsPerDay, ownerId, now - 86_400_000, maxRunsPerDay, ownerId, maxActiveRuns, ...(guard ? [guard.requestId, guard.ownerId, guard.runId] : []));
  return { id, statement };
}

export async function reserveKeywordBenchmarkRun(db: D1Database, ownerId: string,
  input: Parameters<typeof prepareKeywordBenchmarkReservation>[2],
  options: Parameters<typeof prepareKeywordBenchmarkReservation>[3] = {}): Promise<KeywordBenchmarkRun> {
  const { statement } = prepareKeywordBenchmarkReservation(db, ownerId, input, options);
  const row = await statement.first<RunRow>();
  if (!row) {
    const ownedCase = await db.prepare("SELECT id FROM keyword_benchmark_cases WHERE user_id=? AND id=?").bind(ownerId, input.caseId).first();
    const baseline = input.baselineRunId ? await getKeywordBenchmarkRun(db, ownerId, input.baselineRunId) : null;
    if (!ownedCase || (input.baselineRunId && (!baseline || baseline.caseId !== input.caseId || baseline.kind !== "baseline" || baseline.status !== "completed")))
      throw new KeywordBenchmarkStoreError("The owned case or completed baseline is unavailable.", 404);
    const releasedUnknown = await db.prepare(`SELECT id FROM keyword_benchmark_runs WHERE user_id=? AND case_id=?
      AND status='requires_action' AND (archived_at IS NOT NULL OR (session_id IS NULL AND create_attempt_at IS NOT NULL AND hold_release_at IS NOT NULL)) LIMIT 1`)
      .bind(ownerId, input.caseId).first();
    if (releasedUnknown) throw new KeywordBenchmarkStoreError("This case has an unresolved creation. Its released hold permits different cases only; do not start a replacement.", 409);
    throw new KeywordBenchmarkStoreError("This account has reached its benchmark allowance or active-run limit.", 429);
  }
  return decodeRun(row);
}
export async function getKeywordBenchmarkUsage(db: D1Database, ownerId: string, options: { maxRunsPerDay?: number | null; maxActiveRuns?: number; now?: Date } = {}) {
  requireOwner(ownerId);
  const { maxRunsPerDay, maxActiveRuns } = limits(options), now = nowMillis(options.now);
  const row = await db.prepare(`SELECT COUNT(CASE WHEN created_at>=? THEN 1 END) AS attempts,
    COUNT(CASE WHEN status IN ('queued','running','requires_action')
      AND NOT(status='requires_action' AND archived_at IS NOT NULL)
        AND NOT(status='requires_action' AND session_id IS NULL AND create_attempt_at IS NOT NULL AND hold_release_at IS NOT NULL)
      THEN 1 END) AS active FROM keyword_benchmark_runs WHERE user_id=?`)
    .bind(now - 86_400_000, ownerId).first<{ attempts: number; active: number }>();
  return { attemptsLast24Hours: row?.attempts ?? 0, remainingRuns: maxRunsPerDay === null ? null : Math.max(0, maxRunsPerDay - (row?.attempts ?? 0)),
    activeRuns: row?.active ?? 0, remainingActiveRuns: Math.max(0, maxActiveRuns - (row?.active ?? 0)) };
}
export const KEYWORD_HOLD_RELEASE_REASON = "owner-acknowledged-unknown-creation-cost" as const;
/** Read-only preview. The full result is private, including unknown usage and the saved receipt. */
export async function previewKeywordBenchmarkHoldRelease(db: D1Database, ownerId: string, id: string, revision: number) {
  requireOwner(ownerId);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new KeywordBenchmarkStoreError("Provide a nonnegative saved run revision.", 400);
  const run = await getKeywordBenchmarkRun(db, ownerId, id);
  if (!run) throw new KeywordBenchmarkStoreError("The private benchmark was not found.", 404);
  if (run.revision !== revision || run.status !== "requires_action" || run.sessionId || !run.createAttemptAt || run.answer || run.holdReleasedAt)
    throw new KeywordBenchmarkStoreError("Only the current unreleased creation without a confirmed session can release its local hold.", 409);
  return { run, releaseReason: KEYWORD_HOLD_RELEASE_REASON,
    effect: "Allows an explicit start for a different case. The original provider outcome and cost remain unknown; this case cannot be restarted." };
}
/** Exact owner/revision acknowledgement; never changes provider state, evidence, usage, or daily accounting. */
export async function releaseKeywordBenchmarkHold(db: D1Database, ownerId: string, id: string, revision: number,
  acknowledgement: { acknowledgeUnknownCost: true }): Promise<KeywordBenchmarkRun> {
  if (acknowledgement?.acknowledgeUnknownCost !== true) throw new KeywordBenchmarkStoreError("Explicit acknowledgement of the unknown provider cost is required.", 400);
  await previewKeywordBenchmarkHoldRelease(db, ownerId, id, revision);
  const now = Date.now();
  const row = await db.prepare(`UPDATE keyword_benchmark_runs SET hold_release_at=?,hold_release_reason=?,updated_at=?,revision=revision+1
    WHERE user_id=? AND id=? AND revision=? AND status='requires_action' AND session_id IS NULL
      AND create_attempt_at IS NOT NULL AND answer_json IS NULL AND hold_release_at IS NULL AND hold_release_reason IS NULL
    RETURNING ${runColumns},answer_json`).bind(now, KEYWORD_HOLD_RELEASE_REASON, now, ownerId, id, revision).first<RunRow>();
  if (!row) throw new KeywordBenchmarkStoreError("This hold changed or was already released. Reload its saved state before continuing.", 409);
  return decodeRun(row);
}
/** Exactly one caller wins permission to attempt session creation. Never retry an ambiguous POST. */
export async function markKeywordBenchmarkCreateAttempt(db: D1Database, ownerId: string, id: string, revision: number): Promise<KeywordBenchmarkRun> {
  requireOwner(ownerId);
  benchmarkId(id, "run ID");
  const now = Date.now();
  const row = await db.prepare(`UPDATE keyword_benchmark_runs SET create_attempt_at=?,updated_at=?,revision=revision+1
    WHERE user_id=? AND id=? AND revision=? AND status='queued' AND create_attempt_at IS NULL AND session_id IS NULL RETURNING ${runColumns},answer_json`)
    .bind(now, now, ownerId, id, revision).first<RunRow>();
  if (!row) throw new KeywordBenchmarkStoreError("Session creation was already attempted or this reservation changed. Do not retry creation.");
  return decodeRun(row);
}
const safeErrors = new Set([
  "Session creation could not be confirmed. Do not retry; provider cost is unknown.",
  "The provider session failed.", "The provider session was cancelled.", "The provider session requires attention.",
  "The completed provider answer could not be validated.", "The provider session could not be retrieved. Try retrieving this saved session again.",
  "The benchmark exceeded its local wait deadline; cancellation is not yet confirmed.",
  "Cancellation was requested. The final provider outcome is not yet confirmed.",
  "Cancellation could not be confirmed. Retrieve the saved session; cancellation will not be submitted again automatically.",
  "Session creation was rejected before a session receipt was confirmed.",
  "The provider session is idle with no saved turn, items or requested action. The initial submission remains unresolved; do not resend it.",
  "The missing receipt was recovered; its final provider outcome is still unresolved.",
]);
export function sanitizeKeywordBenchmarkError(value: string | null): string | null {
  return value === null ? null : safeErrors.has(value) ? value : "The provider operation needs attention. Retrieve the saved session before continuing.";
}
export type KeywordBenchmarkRunPatch = Partial<Pick<KeywordBenchmarkRun, "status" | "sessionId" | "answer" | "usage" | "providerMetadata" | "error">>;
/** Lifecycle CAS only. Frozen input, create marker and terminal evidence cannot be overwritten. */
export async function updateKeywordBenchmarkRun(db: D1Database, ownerId: string, id: string, revision: number, patch: KeywordBenchmarkRunPatch): Promise<KeywordBenchmarkRun> {
  requireOwner(ownerId);
  const existing = await getKeywordBenchmarkRun(db, ownerId, id);
  if (!existing || existing.revision !== revision || !active.has(existing.status)) throw new KeywordBenchmarkStoreError("This benchmark changed or is unavailable. Reload before continuing.");
  const status = patch.status ?? existing.status, sessionId = patch.sessionId === undefined ? existing.sessionId : patch.sessionId;
  if (existing.holdReleasedAt && !sessionId && status !== existing.status)
    throw new KeywordBenchmarkStoreError("An acknowledged unknown creation needs a confirmed provider receipt before its status can change.", 409);
  if (!statuses.has(status) || (status === "queued" && existing.status !== "queued")) throw new KeywordBenchmarkStoreError("Invalid benchmark status transition.", 400);
  if (sessionId !== null) bounded(sessionId, "provider session ID", 200);
  if ((sessionId && !existing.createAttemptAt) || (existing.sessionId && existing.sessionId !== sessionId) || (status === "running" && !sessionId))
    throw new KeywordBenchmarkStoreError("A saved creation attempt and stable session ID are required.", 400);
  const answer = patch.answer === undefined ? existing.answer : patch.answer === null ? null : validateKeywordBenchmarkAnswer(patch.answer);
  if ((status === "completed" && (!answer || !sessionId)) || (status !== "completed" && answer))
    throw new KeywordBenchmarkStoreError("Only a completed provider session may save a final answer.", 400);
  const suppliedUsage = { ...existing.usage, ...patch.usage };
  const usage = { inputTokens: suppliedUsage.inputTokens, outputTokens: suppliedUsage.outputTokens, totalTokens: suppliedUsage.totalTokens, costUsd: suppliedUsage.costUsd };
  for (const [field, number] of Object.entries(usage)) if (number !== null && (!Number.isFinite(number) || number < 0 || (field !== "costUsd" && !Number.isInteger(number))))
    throw new KeywordBenchmarkStoreError("Invalid provider usage.", 400);
  const suppliedMetadata = { ...existing.providerMetadata, ...patch.providerMetadata };
  const providerMetadata: KeywordBenchmarkRun["providerMetadata"] = {
    environmentId: suppliedMetadata.environmentId, requestId: suppliedMetadata.requestId, turnId: suppliedMetadata.turnId,
    ...(suppliedMetadata.creationHttpStatus === undefined ? {} : { creationHttpStatus: suppliedMetadata.creationHttpStatus }),
    ...(suppliedMetadata.creationErrorCode === undefined ? {} : { creationErrorCode: suppliedMetadata.creationErrorCode }),
  };
  for (const field of ["environmentId", "requestId", "turnId"] as const) if (providerMetadata[field] !== null) bounded(providerMetadata[field], "provider metadata", 200);
  if (providerMetadata.creationHttpStatus !== undefined && (!Number.isInteger(providerMetadata.creationHttpStatus) || providerMetadata.creationHttpStatus < 100 || providerMetadata.creationHttpStatus > 599))
    throw new KeywordBenchmarkStoreError("Invalid creation HTTP status.", 400);
  if (providerMetadata.creationErrorCode !== undefined && !["INVALID_INPUT", "NOT_CONFIGURED", "UPSTREAM_ERROR", "INVALID_RESPONSE"].includes(providerMetadata.creationErrorCode))
    throw new KeywordBenchmarkStoreError("Invalid creation error code.", 400);
  for (const field of ["creationHttpStatus", "creationErrorCode"] as const) {
    if (providerMetadata[field] !== undefined && !existing.createAttemptAt)
      throw new KeywordBenchmarkStoreError("Creation diagnostics require a saved creation attempt.", 400);
    if (existing.providerMetadata[field] !== undefined && providerMetadata[field] !== existing.providerMetadata[field])
      throw new KeywordBenchmarkStoreError("Original creation diagnostics cannot be changed.", 409);
  }
  const error = patch.error === undefined ? existing.error : sanitizeKeywordBenchmarkError(patch.error);
  const row = await db.prepare(`UPDATE keyword_benchmark_runs SET status=?,session_id=?,updated_at=?,revision=revision+1,answer_json=?,usage_json=?,provider_metadata_json=?,error=?,answer_characters=?,mention_count=?,citation_count=?
    WHERE user_id=? AND id=? AND revision=? AND status IN ('queued','running','requires_action') RETURNING ${runColumns},answer_json`)
    .bind(status, sessionId, Date.now(), answer ? json(answer, 1_000_000) : null, json(usage, 1000), json(providerMetadata, 2000), error,
      answer?.text.length ?? 0, answer?.mentions.length ?? 0, answer?.citations.length ?? 0, ownerId, id, revision).first<RunRow>();
  if (!row) throw new KeywordBenchmarkStoreError("This benchmark changed or is unavailable. Reload before continuing.");
  return decodeRun(row);
}

/** Claim before the cancel POST. A timeout leaves this marker intact and prevents duplicate submissions. */
export async function reserveKeywordBenchmarkCancellation(db: D1Database, ownerId: string, id: string, revision: number): Promise<KeywordBenchmarkRun> {
  requireOwner(ownerId); benchmarkId(id, "run ID");
  const now = Date.now();
  const row = await db.prepare(`UPDATE keyword_benchmark_runs SET cancel_attempt_at=?,updated_at=?,revision=revision+1,status='requires_action',error=?
    WHERE user_id=? AND id=? AND revision=? AND session_id IS NOT NULL AND cancel_attempt_at IS NULL
    AND status IN ('queued','running','requires_action') RETURNING ${runColumns},answer_json`)
    .bind(now, now, "Cancellation was requested. The final provider outcome is not yet confirmed.", ownerId, id, revision).first<RunRow>();
  if (!row) throw new KeywordBenchmarkStoreError("Cancellation was already attempted or this saved run changed.");
  return decodeRun(row);
}
export async function acknowledgeKeywordBenchmarkCancellation(db: D1Database, ownerId: string, id: string, revision: number): Promise<KeywordBenchmarkRun> {
  requireOwner(ownerId); benchmarkId(id, "run ID");
  const now = Date.now();
  const row = await db.prepare(`UPDATE keyword_benchmark_runs SET cancel_acknowledged_at=?,updated_at=?,revision=revision+1
    WHERE user_id=? AND id=? AND revision=? AND cancel_attempt_at IS NOT NULL AND cancel_acknowledged_at IS NULL
    AND status IN ('queued','running','requires_action') RETURNING ${runColumns},answer_json`)
    .bind(now, now, ownerId, id, revision).first<RunRow>();
  if (!row) throw new KeywordBenchmarkStoreError("This cancellation changed or is unavailable.");
  return decodeRun(row);
}

/** Owner-requested archive: keeps unresolved outcome, receipts, usage and daily quota intact. */
export async function archiveKeywordBenchmarkRun(db: D1Database, ownerId: string, id: string, revision: number) {
  requireOwner(ownerId);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new KeywordBenchmarkStoreError("Choose the current saved revision.", 400);
  const now = Date.now();
  const row = await db.prepare(`UPDATE keyword_benchmark_runs SET archived_at=?,updated_at=?,revision=revision+1
    WHERE user_id=? AND id=? AND revision=? AND status='requires_action' AND archived_at IS NULL
    AND create_attempt_at IS NOT NULL AND answer_json IS NULL AND created_at<=?
    AND (session_id IS NULL OR cancel_attempt_at IS NOT NULL) RETURNING ${runColumns},answer_json`)
    .bind(now,now,ownerId,id,revision,now-86400000).first<RunRow>();
  if (!row) throw new KeywordBenchmarkStoreError("Only an unchanged unresolved attempt older than 24 hours can be archived. Request cancellation first when a session is recorded.",409);
  return decodeRun(row);
}
