import { KEYWORD_OPEN_WEB_MODEL, keywordAgentHarnessVersion } from "../../src/lib/keyword-benchmark-agent";
import type { KeywordBenchmarkRun } from "../../src/lib/keyword-benchmark-types";
import type { PublicSearchQuery } from "../../src/lib/public-search-rankings";

export const publicKeywordQuery: PublicSearchQuery = { id: "public-fixture", audience: "Learning", category: "Courses", query: "Where can a beginner learn a language?", language: "en", locale: "en-US" };
export function publicKeywordRunFixture(): KeywordBenchmarkRun {
  const value: KeywordBenchmarkRun = { id: "private_run_123", suiteId: "private_suite_123", caseId: "private_case_123", kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: KEYWORD_OPEN_WEB_MODEL,
    harnessVersion: keywordAgentHarnessVersion("open-web"), environmentType: "openai_hosted", environmentFingerprint: "private_configuration_digest",
    case: { query: publicKeywordQuery.query, targetUrl: null, language: publicKeywordQuery.language, locale: publicKeywordQuery.locale, rubricVersion: "keyword-observation-v1", searchMode: "open-web" },
    status: "completed", sessionId: "private_session_123", createAttemptAt: "2026-09-13T00:00:00.000Z", allowedDomains: [], deadlineAt: "2026-09-13T00:03:00.000Z",
    cancelAttemptAt: null, cancelAcknowledgedAt: null, createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:30.000Z", revision: 3,
    providerMetadata: { environmentId: "private_environment_123", requestId: "private_request_123", turnId: "private_turn_123" }, error: null,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
    answer: { text: "Raw private response.", mentions: [
      { name: "Beta", url: "https://beta.com/", reason: "Original reason", citationUrls: ["https://beta.com/docs"] },
      { name: "Alpha", url: null, citationUrls: [] },
      { name: "Beta", url: "https://beta.com/", citationUrls: ["https://beta.com/docs"] },
    ], citations: [{ url: "https://beta.com/docs", title: "Beta documentation", quote: "Private raw quote omitted from public artifact." }], limitations: ["One observed response; not a general market rank."],
      collection: { format: "folio-keyword-collection-v1", searchMode: "open-web", collectedAt: "2026-09-13T00:00:30.000Z", sessionId: "private_session_123", rootTurnId: "private_turn_123",
        finalAnswerItemId: "private_final_123", finalAnswerJson: '{"raw":"private_owner_123"}',
        searchItems: [{ id: "private_search_123", type: "web_search_call", turn_id: "private_turn_123", status: "completed", raw: "private raw search material" }],
        validationItem: { id: "private_validation_123", type: "command_execution", turn_id: "private_turn_123", status: "completed", exit_code: null, output: "FOLIO_KEYWORD_JSON_VALID" } } },
  };
  retainPublicKeywordAnswer(value);
  return value;
}
export function retainPublicKeywordAnswer(value: KeywordBenchmarkRun) {
  const { collection, ...answer } = value.answer!;
  if (collection) collection.finalAnswerJson = JSON.stringify({ ...answer, rawPrivateField: "private_owner_123" });
}
