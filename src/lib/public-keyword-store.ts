import "server-only";
import { createHash } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { getKeywordBenchmarkRun, KeywordBenchmarkStoreError } from "./keyword-benchmark-store";
import { projectWebsitePublicObservation, PublicCollectionUsageError } from "./public-observation-projection";
import type { PublicSearchQuery, PublicSearchRankings } from "./public-search-rankings";
import { assertPublicSearchRankings } from "./public-search-rankings-validation";
import { assertPublicCollectionProgress, type PublicCollectionProgress } from "./public-dashboard";

type Row = { revision: number; payload_json: string | null; updated_at: string };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type PublicKeywordPreview = { payload: PublicSearchRankings; reviewHash: string; revision: number };
async function owned(db: D1Database, ownerId: string, runId: string) {
  const run = await getKeywordBenchmarkRun(db, ownerId, runId);
  if (!run) throw new KeywordBenchmarkStoreError("The private observation was not found.", 404);
  return run;
}
async function row(db: D1Database, ownerId: string, runId: string) {
  return db.prepare("SELECT revision,payload_json,updated_at FROM public_keyword_observations WHERE run_id=? AND user_id=?")
    .bind(runId, ownerId).first<Row>();
}
export async function getKeywordPublication(db: D1Database, ownerId: string, runId: string) {
  await owned(db, ownerId, runId);
  const saved = await row(db, ownerId, runId);
  const payload: unknown = saved?.payload_json ? JSON.parse(saved.payload_json) : null;
  if (payload) assertPublicSearchRankings(payload);
  return { revision: saved?.revision ?? 0, published: !!payload, payload: payload as PublicSearchRankings | null };
}
export async function previewKeywordPublication(db: D1Database, ownerId: string, runId: string,
  metadata: { audience: PublicSearchQuery["audience"]; category: string }, catalog: readonly PublicSearchQuery[] = []): Promise<PublicKeywordPreview> {
  const run = await owned(db, ownerId, runId);
  const existing = catalog.find(query => query.query === run.case.query && query.language === run.case.language && query.locale === run.case.locale);
  const query: PublicSearchQuery = existing ?? {
    id: `shared-${digest([run.case.query, run.case.language, run.case.locale, metadata.audience, metadata.category]).slice(0, 40)}`,
    query: run.case.query, language: run.case.language, locale: run.case.locale,
    audience: metadata.audience, category: metadata.category,
  };
  let payload: PublicSearchRankings;
  try {
    payload = { format: "folio-public-search-rankings-v1", queries: [query],
      observations: [projectWebsitePublicObservation(run, query, [ownerId])] };
    assertPublicSearchRankings(payload);
  } catch (error) {
    throw new KeywordBenchmarkStoreError(error instanceof PublicCollectionUsageError ? error.message : "This observation cannot be published with these public fields.", 400);
  }
  const revision = (await row(db, ownerId, runId))?.revision ?? 0;
  return { payload, revision, reviewHash: digest([ownerId, runId, run.revision, revision, payload]) };
}
export async function publishKeywordObservation(db: D1Database, ownerId: string, runId: string,
  metadata: { audience: PublicSearchQuery["audience"]; category: string }, reviewHash: string, catalog: readonly PublicSearchQuery[] = []) {
  const preview = await previewKeywordPublication(db, ownerId, runId, metadata, catalog);
  if (reviewHash !== preview.reviewHash) throw new KeywordBenchmarkStoreError("The preview changed. Review it again before publishing.", 409);
  const run = await owned(db, ownerId, runId);
  // A second read must still match the reviewed source before the atomic write.
  if (digest([ownerId, runId, run.revision, preview.revision, preview.payload]) !== reviewHash)
    throw new KeywordBenchmarkStoreError("The observation changed. Review it again.", 409);
  const result = await db.prepare(`INSERT INTO public_keyword_observations(run_id,user_id,revision,payload_json,updated_at)
    SELECT id,user_id,1,?,? FROM keyword_benchmark_runs WHERE id=? AND user_id=? AND revision=? AND status='completed'
    AND (? > 0 OR NOT EXISTS(SELECT 1 FROM public_keyword_observations WHERE run_id=? AND user_id=?))
    ON CONFLICT(run_id,user_id) DO UPDATE SET revision=public_keyword_observations.revision+1,payload_json=excluded.payload_json,updated_at=excluded.updated_at
    WHERE public_keyword_observations.revision=? RETURNING revision`)
    .bind(JSON.stringify(preview.payload), new Date().toISOString(), runId, ownerId, run.revision,
      preview.revision, runId, ownerId, preview.revision).first<{revision: number}>();
  if (!result) throw new KeywordBenchmarkStoreError("Publication changed. Refresh and review again.", 409);
  return { published: true, revision: result.revision, payload: preview.payload };
}
export async function withdrawKeywordObservation(db: D1Database, ownerId: string, runId: string, revision: number) {
  await owned(db, ownerId, runId);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new KeywordBenchmarkStoreError("Refresh publication before withdrawing.", 409);
  const result = await db.prepare(`UPDATE public_keyword_observations SET payload_json=NULL,revision=revision+1,updated_at=?
    WHERE run_id=? AND user_id=? AND revision=? RETURNING revision`)
    .bind(new Date().toISOString(), runId, ownerId, revision).first<{revision: number}>();
  if (!result) throw new KeywordBenchmarkStoreError("Publication changed. Refresh before withdrawing.", 409);
  return { published: false, revision: result.revision, payload: null };
}
/** This read never joins private source records. Only explicitly published projections leave D1. */
export async function readSharedKeywordObservations(db: D1Database) {
  const result = await db.prepare("SELECT payload_json,updated_at FROM public_keyword_observations WHERE payload_json IS NOT NULL ORDER BY updated_at,run_id").all<{payload_json:string;updated_at:string}>();
  return result.results.map(row => { const payload:unknown=JSON.parse(row.payload_json); assertPublicSearchRankings(payload); return {payload,updatedAt:row.updated_at}; });
}
export function mergeSharedKeywordObservations(base: unknown, progress: unknown,
  shared: {payload: PublicSearchRankings; updatedAt:string}[]) {
  assertPublicSearchRankings(base); assertPublicCollectionProgress(progress,base.queries,base.observations);
  const rankings=structuredClone(base), status=structuredClone(progress);
  for(const entry of shared) {
    assertPublicSearchRankings(entry.payload);
    for(const query of entry.payload.queries) {
      const previous=rankings.queries.find(value=>value.id===query.id);
      if(previous && JSON.stringify(previous)!==JSON.stringify(query)) throw new Error("Conflicting published query identity.");
      if(!previous) { rankings.queries.push(query);status.queries.push({queryId:query.id,status:"completed"}); }
    }
    for(const observation of entry.payload.observations) {
      const previous=rankings.observations.find(value=>value.id===observation.id);
      if(previous && JSON.stringify(previous)!==JSON.stringify(observation)) throw new Error("Conflicting published observation identity.");
      if(!previous) rankings.observations.push(observation);
      const current=status.queries.find(value=>value.queryId===observation.queryId)!;
      const lastAttempt=Date.parse(current.finishedAt ?? current.startedAt ?? "1970-01-01T00:00:00.000Z");
      if(Date.parse(observation.observedAt)>=lastAttempt) {
        const index=status.queries.indexOf(current);
        status.queries[index]={queryId:observation.queryId,status:"completed",finishedAt:observation.observedAt,observationId:observation.id};
      }
    }
    if(Date.parse(entry.updatedAt)>Date.parse(status.updatedAt))status.updatedAt=entry.updatedAt;
  }
  assertPublicSearchRankings(rankings);assertPublicCollectionProgress(status,rankings.queries,rankings.observations);
  return {rankings,progress:status as PublicCollectionProgress};
}
