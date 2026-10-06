import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { isDeepStrictEqual } from "node:util";
import type { AgentsEnvironment } from "./agents";
import { agentApiHash } from "./agent-api-key-store";
import { keywordPublicUrl } from "./keyword-search-mode";
import { isKeywordBenchmarkId, type KeywordBenchmarkCaseInput, type KeywordBenchmarkRun } from "./keyword-benchmark-types";
import { KEYWORD_OPEN_WEB_MODEL, KEYWORD_OPEN_WEB_MODELS, isKeywordOpenWebModel } from "./keyword-models";
import { createKeywordBenchmarkSuite, getKeywordBenchmarkRun, KeywordBenchmarkStoreError, listKeywordBenchmarkRuns, listWebsiteKeywordRunsPage } from "./keyword-benchmark-store";
import { keywordBenchmarkAccess, startKeywordBenchmark, type KeywordBenchmarkServiceOptions } from "./keyword-benchmark-service";
import type { WebsiteResearchStage } from "./website-research";

export const WEBSITE_QUERY_DISCOVERY_QUERY = "Which customer searches and questions are a good fit for this website?";

async function ownedWebsite(db: D1Database, ownerId: string, websiteId: string) {
  if (!ownerId) throw new KeywordBenchmarkStoreError("Sign in to use private website research.", 401);
  if (!isKeywordBenchmarkId(websiteId)) throw new KeywordBenchmarkStoreError("Choose a saved website.", 400);
  const site = await db.prepare("SELECT id,url FROM sites WHERE user_id=? AND id=?").bind(ownerId, websiteId).first<{ id: string; url: string }>();
  if (!site) throw new KeywordBenchmarkStoreError("The private website was not found.", 404);
  return site;
}

export function websiteResearchAccess(env: AgentsEnvironment, ownerId: string) {
  const access = keywordBenchmarkAccess(env, ownerId);
  const configured = Boolean(env.OPENAI_API_KEY?.trim());
  return { ...access, configured, canRun: configured && access.authorized, model: KEYWORD_OPEN_WEB_MODEL, openWebModels: KEYWORD_OPEN_WEB_MODELS,
    message: !configured ? "Connect OpenAI before generating queries or researching competitors."
      : !access.authorized ? "This account needs approval before it can spend research credits."
        : "Query generation and each competitor investigation are separately authorized paid OpenAI runs. Provider charges may be unknown; saved reads spend nothing." };
}

/** Reads only local, owned records. Opening a website never launches research. */
export async function websiteResearchOverview(db: D1Database, ownerId: string, websiteId: string, env: AgentsEnvironment, cursor?: string) {
  await ownedWebsite(db, ownerId, websiteId);
  const history = await listWebsiteKeywordRunsPage(db, ownerId, { websiteId, searchMode: "open-web", researchOnly: true, cursor });
  return { ...history, access: websiteResearchAccess(env, ownerId) };
}

type ResearchRequest = { stage: WebsiteResearchStage; requestKey: string; confirmSpend: true; model: string; query?: string; discoveryRunId?: string };
function researchRequest(value: unknown): ResearchRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new KeywordBenchmarkStoreError("Provide a research action.", 400);
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["stage", "requestKey", "confirmSpend", "model", "query", "discoveryRunId"].includes(key)) ||
    !["query-discovery", "competitor-research"].includes(String(body.stage)) || body.confirmSpend !== true || !isKeywordBenchmarkId(body.requestKey) ||
    (body.model !== undefined && !isKeywordOpenWebModel(body.model)))
    throw new KeywordBenchmarkStoreError("Authorize one bounded research action with a stable request key and supported OpenAI model.", 400);
  if (body.stage === "query-discovery" && (body.query !== undefined || body.discoveryRunId !== undefined))
    throw new KeywordBenchmarkStoreError("Query discovery starts from the saved website, not a supplied answer or query.", 400);
  if (body.stage === "competitor-research" && (typeof body.query !== "string" || !body.query.trim() || body.query.length > 2000 || /\u0000/.test(body.query) || !isKeywordBenchmarkId(body.discoveryRunId)))
    throw new KeywordBenchmarkStoreError("Review one customer query and select its completed discovery result.", 400);
  return { stage: body.stage as WebsiteResearchStage, requestKey: body.requestKey as string, confirmSpend: true,
    model: body.model as string | undefined ?? KEYWORD_OPEN_WEB_MODEL,
    ...(body.stage === "competitor-research" ? { query: (body.query as string).trim(), discoveryRunId: body.discoveryRunId as string } : {}) };
}

async function existingAttempt(db: D1Database, ownerId: string, caseId: string): Promise<KeywordBenchmarkRun | null> {
  const runs = await listKeywordBenchmarkRuns(db, ownerId, { caseId, includeWebsiteResearch: true });
  return runs.length ? getKeywordBenchmarkRun(db, ownerId, runs[0].id) : null;
}

/** A request key binds one immutable case and at most one provider attempt, including unknown outcomes. */
export async function startWebsiteResearch(db: D1Database, ownerId: string, websiteId: string, body: unknown,
  env: AgentsEnvironment, options: KeywordBenchmarkServiceOptions = {}): Promise<KeywordBenchmarkRun> {
  const request = researchRequest(body);
  const site = await ownedWebsite(db, ownerId, websiteId);
  const target = keywordPublicUrl(site.url);
  if (!target || target.search) throw new KeywordBenchmarkStoreError("Research needs a public HTTPS website URL without a query string.", 400);
  if (request.stage === "competitor-research") {
    const source = await getKeywordBenchmarkRun(db, ownerId, request.discoveryRunId!);
    if (!source || source.status !== "completed" || source.case.targetUrl !== site.url || source.case.websiteResearch?.stage !== "query-discovery" ||
      source.answer?.websiteResearch?.stage !== "query-discovery")
      throw new KeywordBenchmarkStoreError("Review a completed query-discovery result belonging to this website first.", 409);
  }
  const input: KeywordBenchmarkCaseInput = { query: request.query ?? WEBSITE_QUERY_DISCOVERY_QUERY, targetUrl: site.url,
    language: "en", locale: "en-US", searchMode: "open-web",
    rubricVersion: request.stage === "query-discovery" ? "website-query-discovery-v1" : "website-competitor-research-v1",
    websiteResearch: { stage: request.stage, ...(request.discoveryRunId ? { discoveryRunId: request.discoveryRunId } : {}) } };
  // Hashes are local request identities. They never enter provider input or public projections.
  const caseId = `wr_${await agentApiHash(JSON.stringify([ownerId, websiteId, request.requestKey]))}`;
  const readCase = () => db.prepare("SELECT case_json FROM keyword_benchmark_cases WHERE user_id=? AND id=?")
    .bind(ownerId, caseId).first<{ case_json: string }>();
  const assertSameCase = (saved: { case_json: string }) => {
    if (!isDeepStrictEqual(JSON.parse(saved.case_json), input))
      throw new KeywordBenchmarkStoreError("This research request key already belongs to different inputs. Preserve the original attempt.", 409);
  };
  const saved = await readCase();
  if (saved) {
    assertSameCase(saved);
    const previous = await existingAttempt(db, ownerId, caseId);
    if (previous) {
      if (previous.model !== request.model) throw new KeywordBenchmarkStoreError("This research request key already belongs to a different model.", 409);
      return previous;
    }
  }
  const access = websiteResearchAccess(env, ownerId);
  if (!access.configured) throw new KeywordBenchmarkStoreError("Connect OpenAI before starting website research.", 503);
  if (!access.authorized) throw new KeywordBenchmarkStoreError("This account is not approved to spend research credits.", 403);
  if (!saved) {
    // Reuse one bounded private suite per website rather than consuming a suite for every paid stage.
    const suiteId = `wr_suite_${await agentApiHash(JSON.stringify([ownerId, websiteId]))}`;
    const readSuite = () => db.prepare("SELECT id FROM keyword_benchmark_suites WHERE user_id=? AND id=?").bind(ownerId, suiteId).first();
    if (!(await readSuite())) {
      try {
        await createKeywordBenchmarkSuite(db, ownerId, { name: `Private website research: ${target.hostname}`,
          description: "Separately authorized query discovery and competitor briefs. Not a public ranking or visibility measurement.", cases: [{ ...input, id: caseId }] }, { id: suiteId });
      } catch (error) {
        // Another same-site request may have created the owned suite in its complete transaction.
        if (!(await readSuite())) throw error;
      }
    }
    if (!(await readCase())) {
      const now = Date.now();
      await db.prepare(`INSERT INTO keyword_benchmark_cases(id,user_id,suite_id,revision,created_at,updated_at,case_json)
        SELECT ?,?,?,0,?,?,? WHERE EXISTS(SELECT 1 FROM keyword_benchmark_suites WHERE id=? AND user_id=?)
        AND (SELECT COUNT(*) FROM keyword_benchmark_cases WHERE user_id=? AND suite_id=?) < 50
        AND NOT EXISTS(SELECT 1 FROM keyword_benchmark_cases WHERE id=?)`)
        .bind(caseId, ownerId, suiteId, now, now, JSON.stringify(input), suiteId, ownerId, ownerId, suiteId, caseId).run();
    }
    const prepared = await readCase();
    if (!prepared) throw new KeywordBenchmarkStoreError("This website has reached its 50 saved research-attempt limit.", 429);
    assertSameCase(prepared);
  }
  try {
    return await startKeywordBenchmark(db, ownerId, { caseId, kind: "baseline", model: request.model }, env, options);
  } catch (error) {
    if (!(error instanceof KeywordBenchmarkStoreError)) throw error;
    const previous = await existingAttempt(db, ownerId, caseId);
    if (!previous) throw error;
    if (previous.model !== request.model) throw new KeywordBenchmarkStoreError("This research request key already belongs to a different model.", 409);
    return previous;
  }
}
