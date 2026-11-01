import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { EVALUATION_VERSION } from "./evaluation";
import { normalizeScanUrl, ScanError, type ScanResult } from "./scanner";
import { getKeywordBenchmarkSuite } from "./keyword-benchmark-store";
import { normaliseCompetitor, onboardingFixes, scoredCheckCount, suggestAudienceTask } from "./onboarding-suggest";
import { publicCompetitorSuggestions } from "./onboarding-competitors";

export const PENDING_CHECK_COOKIE = "folio_pending_check";
export const PENDING_CHECK_MAX_AGE_SECONDS = 60 * 60 * 24;
export const ANONYMOUS_CHECKS_PER_HOUR = 5;
export const MAX_TRACKED_COMPETITORS = 10;

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const ID = /^[A-Za-z0-9-]{8,64}$/;

/** What the onboarding screens show for a page check. Private page bodies are not included. */
export function onboardingCheckView(result: ScanResult) {
  const checks = result.checks as Parameters<typeof onboardingFixes>[0];
  const fixes = onboardingFixes(checks);
  const title = (result as { title?: string }).title ?? null, description = (result as { description?: string }).description ?? null;
  return {
    id: result.id, url: result.url, host: new URL(result.url).hostname.replace(/^www\./, ""), createdAt: result.createdAt, seoScore: result.seoScore,
    scoredChecks: scoredCheckCount(checks),
    fixes: fixes.map(fix => ({ id: fix.id, label: fix.label, points: fix.points, maxPoints: fix.maxPoints, gap: fix.gap, detail: fix.detail ?? "" })),
    suggestion: suggestAudienceTask({ title, description }),
    competitors: publicCompetitorSuggestions(result.url),
  };
}

export async function recentAnonymousChecks(db: D1Database, requesterHash: string, now = Date.now()) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM pending_scans WHERE requester_hash = ? AND created_at > ?").bind(requesterHash, now - 3_600_000).first<{ count: number }>();
  return row?.count ?? 0;
}

/** Stores an anonymous page check. Returns the cookie value; only its hash is saved. */
export async function savePendingScan(db: D1Database, result: ScanResult, requesterHash: string, now = Date.now()) {
  const secret = crypto.randomUUID() + crypto.randomUUID();
  await db.prepare("DELETE FROM pending_scans WHERE created_at < ? AND claimed_by IS NULL").bind(now - PENDING_CHECK_MAX_AGE_SECONDS * 1000).run();
  await db.prepare("INSERT INTO pending_scans (id, claim_hash, requester_hash, url, seo_score, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(result.id, await sha256Hex(secret), requesterHash, result.url, result.seoScore, JSON.stringify(result), now).run();
  return `${result.id}.${secret}`;
}

/** Saves a page check to an account exactly like the existing scan endpoint does. */
export async function persistScanForUser(db: D1Database, userId: string, submittedUrl: string, result: ScanResult) {
  const url = normalizeScanUrl(submittedUrl);
  await db.prepare("INSERT INTO sites (id, user_id, url, name, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, url) DO NOTHING")
    .bind(crypto.randomUUID(), userId, url.href, url.hostname, Date.now()).run();
  const site = await db.prepare("SELECT id FROM sites WHERE user_id = ? AND url = ?").bind(userId, url.href).first<{ id: string }>();
  if (!site) throw new Error("The checked site could not be saved.");
  await db.prepare("INSERT INTO scans (id, site_id, user_id, url, created_at, seo_score, result_json, evaluation_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .bind(result.id, site.id, userId, result.url, Date.parse(result.createdAt), result.seoScore, JSON.stringify(result), EVALUATION_VERSION).run();
  await updateOnboarding(db, userId, { siteId: site.id });
  return site.id;
}

/** Attaches the browser's pending check to the signed-in account. One claim per check. */
export async function claimPendingScan(db: D1Database, userId: string, cookieValue: string | null) {
  const [id, secret] = (cookieValue ?? "").split(".");
  if (!id || !secret || !ID.test(id)) throw new ScanError("There is no page check to save. Check your page again.", 404);
  const row = await db.prepare("SELECT claim_hash, url, result_json, claimed_by, created_at FROM pending_scans WHERE id = ?").bind(id)
    .first<{ claim_hash: string; url: string; result_json: string; claimed_by: string | null; created_at: number }>();
  if (!row || row.claim_hash !== await sha256Hex(secret) || row.created_at < Date.now() - PENDING_CHECK_MAX_AGE_SECONDS * 1000)
    throw new ScanError("This page check has expired. Check your page again.", 404);
  if (row.claimed_by && row.claimed_by !== userId) throw new ScanError("This page check was already saved to another account.", 409);
  const result = JSON.parse(row.result_json) as ScanResult;
  const siteId = await persistScanForUser(db, userId, result.submittedUrl ?? row.url, result);
  await db.prepare("UPDATE pending_scans SET claimed_by = ?, claimed_at = ? WHERE id = ?").bind(userId, Date.now(), id).run();
  return { siteId, check: onboardingCheckView(result) };
}

type StateRow = { user_id: string; site_id: string | null; audience: string | null; task: string | null; suite_id: string | null; competitors_saved_at: number | null;
  baseline_requested_at: number | null; search_console_skipped_at: number | null; completed_at: number | null; dismissed_at: number | null; created_at: number; updated_at: number };
export type OnboardingPatch = { siteId?: string; audience?: string; task?: string; suiteId?: string; baselineRequested?: boolean; searchConsoleSkipped?: boolean; completed?: boolean; dismissed?: boolean };

const iso = (value: number | null) => value ? new Date(value).toISOString() : null;
function serializeState(row: StateRow | null) {
  if (!row) return null;
  return { siteId: row.site_id, audience: row.audience ?? "", task: row.task ?? "", suiteId: row.suite_id, competitorsSavedAt: iso(row.competitors_saved_at),
    baselineRequestedAt: iso(row.baseline_requested_at), searchConsoleSkippedAt: iso(row.search_console_skipped_at), completedAt: iso(row.completed_at), dismissedAt: iso(row.dismissed_at) };
}
export type OnboardingState = NonNullable<ReturnType<typeof serializeState>>;

export function parseOnboardingPatch(body: Record<string, unknown>): OnboardingPatch {
  const allowed = ["siteId", "audience", "task", "suiteId", "baselineRequested", "searchConsoleSkipped", "completed", "dismissed"];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ScanError("This request contains an unsupported field.");
  const patch: OnboardingPatch = {};
  for (const key of ["siteId", "suiteId"] as const) if (body[key] !== undefined) {
    if (typeof body[key] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(body[key] as string)) throw new ScanError(`Provide a valid ${key}.`);
    patch[key] = body[key] as string;
  }
  for (const [key, max] of [["audience", 60], ["task", 120]] as const) if (body[key] !== undefined) {
    const value = typeof body[key] === "string" ? (body[key] as string).replace(/\s+/g, " ").trim() : null;
    if (value === null || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new ScanError(`Use up to ${max} characters for ${key}.`);
    patch[key] = value;
  }
  for (const key of ["baselineRequested", "searchConsoleSkipped", "completed", "dismissed"] as const) if (body[key] !== undefined) {
    if (body[key] !== true) throw new ScanError(`${key} can only be set to true.`);
    patch[key] = true;
  }
  return patch;
}

export async function getOnboardingState(db: D1Database, userId: string) {
  return serializeState(await db.prepare("SELECT * FROM onboarding_state WHERE user_id = ?").bind(userId).first<StateRow>());
}

/** Owner-scoped upsert. Referenced sites and suites must belong to the same account. */
export async function updateOnboarding(db: D1Database, userId: string, patch: OnboardingPatch) {
  if (patch.siteId && !await db.prepare("SELECT id FROM sites WHERE id = ? AND user_id = ?").bind(patch.siteId, userId).first())
    throw new ScanError("Choose a website saved in your account.", 404);
  if (patch.suiteId && !await getKeywordBenchmarkSuite(db, userId, patch.suiteId)) throw new ScanError("Choose a question suite saved in your account.", 404);
  const now = Date.now();
  await db.prepare("INSERT INTO onboarding_state (user_id, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(userId, now, now).run();
  const sets: string[] = [], values: unknown[] = [];
  const set = (column: string, value: unknown) => { sets.push(`${column} = ?`); values.push(value); };
  if (patch.siteId !== undefined) set("site_id", patch.siteId);
  if (patch.audience !== undefined) set("audience", patch.audience);
  if (patch.task !== undefined) set("task", patch.task);
  if (patch.suiteId !== undefined) set("suite_id", patch.suiteId);
  if (patch.baselineRequested) set("baseline_requested_at", now);
  if (patch.searchConsoleSkipped) set("search_console_skipped_at", now);
  if (patch.completed) set("completed_at", now);
  if (patch.dismissed) set("dismissed_at", now);
  set("updated_at", now);
  await db.prepare(`UPDATE onboarding_state SET ${sets.join(", ")} WHERE user_id = ?`).bind(...values, userId).run();
  return getOnboardingState(db, userId);
}

export type TrackedCompetitor = { id: string; name: string; aliases: string[]; source: string };
export async function listTrackedCompetitors(db: D1Database, userId: string, siteId: string): Promise<TrackedCompetitor[]> {
  const { results } = await db.prepare("SELECT id, name, aliases_json, source FROM tracked_competitors WHERE user_id = ? AND site_id = ? ORDER BY created_at, name")
    .bind(userId, siteId).all<{ id: string; name: string; aliases_json: string; source: string }>();
  return results.map(row => ({ id: row.id, name: row.name, aliases: JSON.parse(row.aliases_json) as string[], source: row.source }));
}

/** Replaces the pinned competitors for one owned website. */
export async function replaceTrackedCompetitors(db: D1Database, userId: string, siteId: string, raw: unknown) {
  if (!await db.prepare("SELECT id FROM sites WHERE id = ? AND user_id = ?").bind(siteId, userId).first()) throw new ScanError("Choose a website saved in your account.", 404);
  if (!Array.isArray(raw) || raw.length > MAX_TRACKED_COMPETITORS) throw new ScanError(`Track up to ${MAX_TRACKED_COMPETITORS} competitors.`);
  const list = raw.map(item => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const competitor = normaliseCompetitor(value.name, value.aliases);
    if (!competitor) throw new ScanError("Each competitor needs a name of up to 80 characters.");
    const source = ["manual", "public-index", "starter-pack"].includes(String(value.source)) ? String(value.source) : "manual";
    return { ...competitor, source };
  });
  if (new Set(list.map(item => item.name.toLowerCase())).size !== list.length) throw new ScanError("Remove duplicate competitors.");
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM tracked_competitors WHERE user_id = ? AND site_id = ?").bind(userId, siteId),
    ...list.map((item, index) => db.prepare("INSERT INTO tracked_competitors (id, user_id, site_id, name, aliases_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, siteId, item.name, JSON.stringify(item.aliases), item.source, now + index)),
  ]);
  await db.prepare("INSERT INTO onboarding_state (user_id, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(userId, now, now).run();
  await db.prepare("UPDATE onboarding_state SET competitors_saved_at = ?, updated_at = ? WHERE user_id = ?").bind(now, now, userId).run();
  return listTrackedCompetitors(db, userId, siteId);
}

/** Everything the onboarding screens and the workspace checklist need, in one owner-scoped read. */
export async function onboardingSummary(db: D1Database, userId: string) {
  const state = await getOnboardingState(db, userId);
  if (!state) return { state: null, site: null, check: null, suite: null, competitors: [] as TrackedCompetitor[] };
  const site = state.siteId ? await db.prepare("SELECT id, url, name FROM sites WHERE id = ? AND user_id = ?").bind(state.siteId, userId).first<{ id: string; url: string; name: string }>() : null;
  const scan = site ? await db.prepare("SELECT result_json FROM scans WHERE site_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").bind(site.id, userId).first<{ result_json: string }>() : null;
  const suite = state.suiteId ? await getKeywordBenchmarkSuite(db, userId, state.suiteId) : null;
  return {
    state, site, check: scan ? onboardingCheckView(JSON.parse(scan.result_json) as ScanResult) : null,
    suite: suite ? { id: suite.id, name: suite.name, cases: suite.cases.map(item => ({ id: item.id, query: item.query })) } : null,
    competitors: site ? await listTrackedCompetitors(db, userId, site.id) : [],
  };
}
