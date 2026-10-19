import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { onboardingInputSchema, type SavedOnboarding, type OnboardingInput } from "./onboarding-input";
import { normalizeScanUrl } from "./scanner";
import { KeywordBenchmarkStoreError, validateKeywordBenchmarkCase } from "./keyword-benchmark-store";

type Row = { id: string; site_id: string; suite_id: string; profile_json: string; created_at: number };
const decode = (row: Row): SavedOnboarding => ({ ...JSON.parse(row.profile_json), id: row.id,
  websiteId: row.site_id, suiteId: row.suite_id, savedAt: new Date(row.created_at).toISOString() });
export async function getOnboardingProfile(db: D1Database, ownerId: string, id?: string, websiteId?: string): Promise<SavedOnboarding | null> {
  if (!ownerId) throw new KeywordBenchmarkStoreError("Sign in to view your business setup.", 401);
  if (id !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new KeywordBenchmarkStoreError("Choose a saved business setup.", 400);
  if (websiteId !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(websiteId)) throw new KeywordBenchmarkStoreError("Choose a saved website.", 400);
  const row = await db.prepare(`SELECT id,site_id,suite_id,profile_json,created_at FROM onboarding_profiles WHERE user_id=? ${id ? "AND id=?" : ""} ${websiteId ? "AND site_id=?" : ""} ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(ownerId, ...(id ? [id] : []), ...(websiteId ? [websiteId] : [])).first<Row>();
  return row ? decode(row) : null;
}

/** One atomic, capture-free save. A request key can never change its reviewed inputs. */
export async function saveOnboardingProfile(db: D1Database, ownerId: string, raw: unknown): Promise<SavedOnboarding> {
  if (!ownerId) throw new KeywordBenchmarkStoreError("Sign in to save your business setup.", 401);
  const parsed = onboardingInputSchema.safeParse(raw);
  if (!parsed.success) throw new KeywordBenchmarkStoreError(parsed.error.issues[0]?.message ?? "Review your business setup.", 400);
  const input: OnboardingInput = { ...parsed.data, websiteUrl: normalizeScanUrl(parsed.data.websiteUrl).href };
  const { requestKey, ...profile } = input;
  const profileJson = JSON.stringify(profile);
  const replay = async () => {
    const existing = await getOnboardingProfile(db, ownerId, requestKey);
    if (!existing) return null;
    const { id: _id, websiteId: _websiteId, suiteId: _suiteId, savedAt: _savedAt, ...prior } = existing;
    if (JSON.stringify(prior) !== profileJson) throw new KeywordBenchmarkStoreError("This save already contains different reviewed inputs. Start a new save.", 409);
    return existing;
  };
  const previous = await replay();
  if (previous) return previous;
  const siteId = crypto.randomUUID(), suiteId = crypto.randomUUID(), now = Date.now();
  const cases = input.questions.map(query => ({ id: crypto.randomUUID(), value: validateKeywordBenchmarkCase({ query,
    targetUrl: input.websiteUrl, language: "English", locale: "United States", rubricVersion: "keyword-open-web-v1", searchMode: "open-web" }) }));
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO sites(id,user_id,url,name,created_at,is_public)
        SELECT ?,?,?,?,?,0 WHERE (SELECT COUNT(*) FROM sites WHERE user_id=?) < 100
        ON CONFLICT(user_id,url) DO NOTHING`).bind(siteId, ownerId, input.websiteUrl, input.businessName, now, ownerId),
      db.prepare(`INSERT INTO keyword_benchmark_suites(id,user_id,name,description,created_at)
        SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM keyword_benchmark_suites WHERE user_id=?) < 20
        AND EXISTS(SELECT 1 FROM sites WHERE user_id=? AND url=?) RETURNING id`)
        .bind(suiteId, ownerId, `${input.businessName} questions`, "Owner-reviewed onboarding questions. Saved drafts; no observations have been collected.", now, ownerId, ownerId, input.websiteUrl),
      ...cases.map(value => db.prepare(`INSERT INTO keyword_benchmark_cases(id,user_id,suite_id,revision,created_at,updated_at,case_json)
        SELECT ?,?,?,0,?,?,? WHERE EXISTS(SELECT 1 FROM keyword_benchmark_suites WHERE id=? AND user_id=?)`)
        .bind(value.id, ownerId, suiteId, now, now, JSON.stringify(value.value), suiteId, ownerId)),
      // Deliberately unconditional: missing site/suite due to quota fails an FK/NOT NULL
      // constraint, rolling the entire batch back instead of leaving an orphan site.
      db.prepare(`INSERT INTO onboarding_profiles(id,user_id,site_id,suite_id,profile_json,created_at)
        VALUES(?,?,(SELECT id FROM sites WHERE user_id=? AND url=?),?,?,?)`)
        .bind(requestKey, ownerId, ownerId, input.websiteUrl, suiteId, profileJson, now),
    ]);
    if (!result[1].results.length) throw new KeywordBenchmarkStoreError("This workspace has reached its saved setup limit.", 409);
  } catch (error) {
    const concurrent = await replay();
    if (concurrent) return concurrent;
    const counts = await db.prepare(`SELECT (SELECT COUNT(*) FROM sites WHERE user_id=?) AS sites,(SELECT COUNT(*) FROM keyword_benchmark_suites WHERE user_id=?) AS suites`).bind(ownerId, ownerId).first<{sites:number;suites:number}>();
    if ((counts?.sites ?? 0) >= 100 || (counts?.suites ?? 0) >= 20)
      throw new KeywordBenchmarkStoreError("This workspace has reached its website or question-suite limit.", 409);
    throw error;
  }
  return (await getOnboardingProfile(db, ownerId, requestKey))!;
}
