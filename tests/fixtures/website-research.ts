import type { KeywordBenchmarkAnswer } from "../../src/lib/keyword-benchmark-types";
import type { WebsiteResearchStage } from "../../src/lib/website-research";

export const researchTarget = "https://example.com/";
export const researchQuery = "Which tools document a reproducible setup workflow?";
export function researchAnswer(stage: WebsiteResearchStage, query = researchQuery): KeywordBenchmarkAnswer {
  const competitorUrl = "https://openai.com/";
  const competitorSource = "https://openai.com/docs";
  return stage === "query-discovery" ? {
    text: "Synthetic site research suggests a setup-workflow customer question.", mentions: [],
    citations: [{ url: researchTarget, title: "Synthetic target page" }], limitations: ["Editorial hypothesis, not measured demand."],
    websiteResearch: { stage, targetUrl: researchTarget, siteSummary: "Synthetic workflow software website.",
      queries: [{ query, intent: "Find a documented setup workflow.", fit: "The saved website describes setup tooling.", sourceUrls: [researchTarget] }], sourceUrls: [researchTarget] },
  } : {
    text: "Synthetic competitor evidence supports testing a clearer setup guide; it does not establish a cause of recommendation order.",
    mentions: [{ name: "Synthetic competitor", url: competitorUrl, reason: "Relevant consulted setup page.", citationUrls: [competitorSource] }],
    citations: [{ url: researchTarget, title: "Synthetic target page" }, { url: competitorSource, title: "Synthetic competitor setup" }],
    limitations: ["A bounded API-agent search, not Google rank or consumer ChatGPT visibility."],
    websiteResearch: { stage, targetUrl: researchTarget, query, targetSourceUrls: [researchTarget], competitors: [{ position: 1,
      name: "Synthetic competitor", url: competitorUrl, sourceUrls: [competitorSource], strengths: [{ finding: "The consulted competitor page documents setup steps.",
        sourceUrls: [competitorSource], targetSourceUrls: [researchTarget], comparison: "observed_difference", suggestion: "Test a clearer setup guide on the target website." }] }] },
  };
}
export function researchSession(id: string, stage: WebsiteResearchStage) {
  return { id, object: "agent.session", status: "idle", required_actions: [], environment: { type: "none" },
    metadata: { search_mode: "open-web", website_research_stage: stage }, usage: null };
}
export function researchHistory(sessionId: string, answer: KeywordBenchmarkAnswer) {
  const turn = { id: `turn_${sessionId}`, session_id: sessionId, status: "completed", subagent_id: null,
    usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20 }, output_tokens: 50, total_tokens: 150 } };
  return { turn, items: [
    { id: `search_${sessionId}`, type: "web_search_call", status: "completed", turn_id: turn.id, action: { type: "search", query: researchQuery } },
    ...answer.citations.map((citation, index) => ({ id: `open_${index}_${sessionId}`, type: "web_search_call", status: "completed", turn_id: turn.id,
      action: { type: "open_page", url: citation.url } })),
    { id: `final_${sessionId}`, type: "message", role: "assistant", phase: "final_answer", status: "completed", turn_id: turn.id,
      content: [{ type: "output_text", text: JSON.stringify(answer) }] },
  ] };
}
