import { PUBLIC_SEARCH_OBSERVATIONS, PUBLIC_SEARCH_QUERIES, type PublicSearchObservation, type PublicSearchQuery } from "./public-search-rankings";

export type CompetitorSuggestion = {
  name: string;
  domain: string;
  aliases: string[];
  aliasCounts: { name: string; answers: number }[];
  answers: number;
  totalAnswers: number;
  averagePosition: number;
  isTarget: boolean;
  /** Answers whose question text already named this product. */
  namedInQuestion: number;
};

const hostOf = (url: string | null) => {
  if (!url) return null;
  try { const parsed = new URL(url); return ["http:", "https:"].includes(parsed.protocol) ? parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") : null; }
  catch { return null; }
};
/** Two-label site key: docs.workos.com and workos.com are the same company. */
const siteKey = (host: string) => host.split(".").slice(-2).join(".");

/**
 * Who the public Folio index already returns for the categories where this website appears.
 * Counts every saved public answer in those categories; positions are per answer, lower is earlier.
 */
export function publicCompetitorSuggestions(websiteUrl: string, data: { queries: PublicSearchQuery[]; observations: PublicSearchObservation[] } = { queries: PUBLIC_SEARCH_QUERIES, observations: PUBLIC_SEARCH_OBSERVATIONS }) {
  const target = hostOf(websiteUrl);
  if (!target) return { category: null, questions: 0, firstObservedAt: null, lastObservedAt: null, totalAnswers: 0, rows: [] as CompetitorSuggestion[] };
  const targetKey = siteKey(target);
  const categoryOf = new Map(data.queries.map(query => [query.id, query.category]));
  const counts = new Map<string, number>();
  for (const observation of data.observations)
    if (observation.recommendations.some(rec => { const host = hostOf(rec.url); return host && siteKey(host) === targetKey; })) {
      const category = categoryOf.get(observation.queryId);
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  const category = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  if (!category) return { category: null, questions: 0, firstObservedAt: null, lastObservedAt: null, totalAnswers: 0, rows: [] as CompetitorSuggestion[] };
  const answers = data.observations.filter(observation => categoryOf.get(observation.queryId) === category);
  const sites = new Map<string, { names: Map<string, number>; positions: number[]; named: number }>();
  const queryText = new Map(data.queries.map(query => [query.id, query.query.toLowerCase()]));
  for (const answer of answers) {
    const seen = new Set<string>();
    for (const rec of [...answer.recommendations].sort((a, b) => a.position - b.position)) {
      const host = hostOf(rec.url), key = host ? siteKey(host) : `name:${rec.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const site: { names: Map<string, number>; positions: number[]; named: number } = sites.get(key) ?? { names: new Map<string, number>(), positions: [], named: 0 };
      if ((queryText.get(answer.queryId) ?? "").includes(rec.name.toLowerCase().split(" ")[0])) site.named += 1;
      site.names.set(rec.name, (site.names.get(rec.name) ?? 0) + 1);
      site.positions.push(rec.position);
      sites.set(key, site);
    }
  }
  const rows = [...sites.entries()].map(([key, site]): CompetitorSuggestion => {
    const aliasCounts = [...site.names.entries()].map(([name, count]) => ({ name, answers: count })).sort((a, b) => b.answers - a.answers || a.name.length - b.name.length);
    return { name: aliasCounts[0].name, domain: key.startsWith("name:") ? "" : key, aliases: aliasCounts.slice(1).map(alias => alias.name), aliasCounts,
      answers: site.positions.length, totalAnswers: answers.length,
      averagePosition: Math.round(site.positions.reduce((sum, value) => sum + value, 0) / site.positions.length * 10) / 10,
      isTarget: key === targetKey, namedInQuestion: site.named };
  }).filter(row => row.answers >= 2 || row.isTarget)
    .sort((a, b) => b.answers - a.answers || a.averagePosition - b.averagePosition || a.name.localeCompare(b.name));
  const dates = answers.map(answer => answer.observedAt).sort();
  return { category, questions: new Set(answers.map(answer => answer.queryId)).size, firstObservedAt: dates[0] ?? null, lastObservedAt: dates[dates.length - 1] ?? null, totalAnswers: answers.length, rows };
}
