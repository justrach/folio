import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { createKeywordBenchmarkSuite, KeywordBenchmarkStoreError } from "./keyword-benchmark-store";
import { parseQuestionSuiteInput } from "./question-suite-input";

/** Saves question drafts only. No provider, capture, or evaluation is started. */
export async function saveQuestionSuite(db: D1Database, ownerId: string, raw: unknown) {
  if (!ownerId) throw new KeywordBenchmarkStoreError("Sign in to save questions.", 401);
  let input;
  try { input = parseQuestionSuiteInput(raw); }
  catch (error) { throw new KeywordBenchmarkStoreError(error instanceof Error ? error.message : "Check the question suite.", 400); }
  const site = await db.prepare("SELECT url FROM sites WHERE user_id=? AND id=?").bind(ownerId, input.websiteId).first<{ url: string }>();
  if (!site) throw new KeywordBenchmarkStoreError("Choose a website saved in your account.", 404);
  return createKeywordBenchmarkSuite(db, ownerId, {
    name: input.name,
    description: "Customer questions for separate Astra open-web observations. Saved drafts are not completed evaluations.",
    cases: input.questions.map(query => ({ query, targetUrl: site.url, language: input.language, locale: input.locale,
      rubricVersion: "keyword-open-web-v1", searchMode: "open-web" as const })),
  });
}
