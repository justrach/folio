import { keywordRecommendationMetrics } from "./keyword-search-mode";
import type { KeywordBenchmarkRun } from "./keyword-benchmark-types";

export type WebsiteSnapshotInput = {
  site: { id: string; url: string };
  runs: Pick<KeywordBenchmarkRun, "status" | "case" | "answer" | "createdAt" | "id">[];
};

export type WebsiteSnapshot = {
  id: string;
  url: string;
  answered: number;
  identified: number;
  appeared: number;
  unknown: number;
  sourceCount: number;
  appearanceRate: number | null;
};

/** Pure summary over saved completed answers only. No fetch, inference, or spending. */
export function summarizeWebsiteSnapshots(inputs: WebsiteSnapshotInput[]): WebsiteSnapshot[] {
  return inputs.map(({ site, runs }) => {
    const completed = runs.filter(
      (run) => run.status === "completed" && run.answer && Array.isArray(run.answer.mentions) && Array.isArray(run.answer.citations),
    );
    // Latest completed answer per question only; unfinished attempts never replace it.
    const latest = new Map<string, (typeof completed)[number]>();
    for (const run of [...completed].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))) {
      if (!latest.has(run.case.query)) latest.set(run.case.query, run);
    }
    const observations = [...latest.values()].map((run) => keywordRecommendationMetrics(run));
    const identified = observations.filter((item) => item.targetNamed !== "unknown");
    const appeared = identified.filter((item) => item.targetNamed === "yes").length;
    const sourceCount = new Set(
      [...latest.values()].flatMap((run) => (run.answer ? run.answer.citations.map((citation) => citation.url) : [])),
    ).size;
    return {
      id: site.id,
      url: site.url,
      answered: observations.length,
      identified: identified.length,
      appeared,
      unknown: observations.length - identified.length,
      sourceCount,
      appearanceRate: identified.length ? Math.round((appeared / identified.length) * 100) : null,
    };
  });
}
