import { isDeepStrictEqual } from "node:util";
import type { CondensationSearchAnswer, CondensationSearchReceipt } from "./condensation-search-experiment";
import { validateWebsiteEvidence, validateWebsiteAnswer, type WebsiteEvidence, type WebsiteAnswer } from "./sandbox-website-evidence";

export class CondensationReportError extends Error {}
export type CondensationReport = { markdown: string; completed: boolean };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
function invalid(): never { throw new CondensationReportError("The saved receipt cannot support a private report. Keep the original receipt unchanged."); }
function sourceUrl(value: unknown): string {
  if (!text(value, 2048) || /[\s<>`\\]/.test(value)) invalid();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) invalid();
  } catch { invalid(); }
  return value;
}
function escapeMarkdown(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+\-.!|~])/g, "\\$1");
}
const inline = (value: string) => escapeMarkdown(value.replace(/\s+/g, " ").trim());
const quote = (value: string) => value.replace(/\r\n?/g, "\n").split("\n").map(line => `> ${escapeMarkdown(line)}`).join("\n");

function checkedAnswer(value: unknown, raw: unknown, urls: Set<string>): CondensationSearchAnswer {
  if (!record(value) || !text(value.text, 131_072) || !Array.isArray(value.mentions) || value.mentions.length > 32 ||
    !Array.isArray(value.citations) || value.citations.length > 8 || !Array.isArray(value.limitations) || value.limitations.length > 32 ||
    !value.limitations.every(item => text(item, 4000))) invalid();
  if (!value.mentions.every(item => record(item) && text(item.name, 300) && text(item.reason, 4000) &&
    urls.has(sourceUrl(item.url)) && Array.isArray(item.citationUrls) && item.citationUrls.length > 0 && item.citationUrls.length <= 8 &&
    item.citationUrls.every((url: unknown) => urls.has(sourceUrl(url))))) invalid();
  if (!value.citations.every(item => record(item) && text(item.title, 1000) && urls.has(sourceUrl(item.url)))) invalid();
  if (!text(raw, 131_072)) invalid();
  let original: unknown;
  try { original = JSON.parse(raw); } catch { invalid(); }
  if (!record(original) || JSON.stringify({ text: original.text, mentions: original.mentions, citations: original.citations, limitations: original.limitations }) !==
    JSON.stringify({ text: value.text, mentions: value.mentions, citations: value.citations, limitations: value.limitations })) invalid();
  for (const match of JSON.stringify(value).matchAll(/https?:\/\/[^\s"<>\\]+/g)) {
    if (!urls.has(match[0].replace(/[),.;]+$/, "")) && !urls.has(match[0])) invalid();
  }
  return value as CondensationSearchAnswer;
}

function renderWebsiteReport(receipt: Record<string, unknown>): CondensationReport {
  if (receipt.provider !== "codegraff-gateway-fleet" || receipt.mode !== "host-website-frozen-evidence" ||
    receipt.cleanup !== "confirmed" || !["completed", "failed", "uncertain"].includes(String(receipt.status)) ||
    !text(receipt.query, 2000) || !text(receipt.model, 100) || receipt.search !== null || receipt.parsedAnswer !== null) invalid();
  let evidence: WebsiteEvidence;
  let answer: WebsiteAnswer | null = null;
  const completed = receipt.status === "completed";
  try {
    evidence = validateWebsiteEvidence(receipt.website);
    if (completed) {
      if (receipt.execution !== "complete" || receipt.outputComplete !== true || receipt.exitCode !== 0 ||
        receipt.guestModelAttached !== true || !text(receipt.rawOutput, 131_072)) invalid();
      answer = validateWebsiteAnswer(receipt.rawOutput, evidence);
      if (!isDeepStrictEqual(answer, receipt.websiteAnswer)) invalid();
    }
  } catch { invalid(); }
  const lines = [
    "# Private Codegraff fleet website report", "",
    `**Status:** ${completed ? "Completed model answer" : "Incomplete attempt — source packet only; no confirmed model answer"}`,
    `**Target:** ${inline(evidence.targetUrl)}`,
    `**Question:** ${inline(receipt.query)}`,
    `**Model:** ${inline(receipt.model)}`,
    "**Method:** The host captured frozen public HTML for analysis inside a Codegraff gateway fleet sandbox (Condensation infrastructure).",
    "**Sandbox cleanup:** Confirmed. **Total cost (USD):** Unknown; the receipt is not a provider invoice.", "",
    "## Observed deterministic HTML checks", "",
  ];
  for (const page of evidence.pages) {
    lines.push(`### ${inline(page.id)} — ${inline(page.url)}`, "");
    if (!page.checks.length) lines.push("No checks recorded.", "");
    for (const check of page.checks) {
      lines.push(`- **${inline(check.status)}** ${inline(check.id)} — ${inline(check.label)}`, `  - ${inline(check.detail)}`);
      if (check.evidence !== undefined) lines.push(quote(check.evidence));
      lines.push("");
    }
  }
  if (answer) {
    lines.push("## Model summary (unverified)", "", quote(answer.summary), "", "## Prioritized recommendations (unverified)", "");
    if (!answer.findings.length) lines.push("None recorded.", "");
    for (const finding of answer.findings) {
      lines.push(`### ${inline(finding.priority)} priority`, "", `Observation: ${inline(finding.observation)}`, "", `Recommendation: ${inline(finding.recommendation)}`, "");
      for (const reference of finding.evidence) {
        const page = evidence.pages.find(page => page.id === reference.pageId)!;
        lines.push(`Evidence: ${inline(page.id)} — ${inline(page.url)}`, "");
        if ("quote" in reference) lines.push(quote(reference.quote), "");
        else {
          const check = page.checks.find(check => check.id === reference.checkId)!;
          lines.push(`Check: ${inline(check.id)} — ${inline(check.label)} (${inline(check.status)})`, "", inline(check.detail), "");
          if (check.evidence !== undefined) lines.push(quote(check.evidence), "");
        }
      }
    }
    lines.push("## Model-stated limitations", "");
    if (!answer.limitations.length) lines.push("None stated.", "");
    for (const limitation of answer.limitations) lines.push(`- ${inline(limitation)}`);
    lines.push("");
  } else {
    lines.push("## No confirmed answer", "", "This incomplete attempt exports only the frozen source packet, not a model-generated recommendation report. Model output and advice are suppressed; do not automatically start a replacement.", "");
  }
  lines.push(`## Frozen website excerpts (${evidence.pages.length} pages)`, "");
  for (const page of evidence.pages) lines.push(
    `### ${inline(page.id)} — ${inline(page.title)}`, "", `URL: ${inline(page.url)}`,
    `Captured at: ${inline(page.capturedAt)}`, `Text SHA-256: ${inline(page.sha256)}`, `HTML SHA-256: ${inline(page.htmlSha256)}`,
    `Bytes: ${page.bytes}. Truncated: ${page.truncated ? "Yes" : "No"}.`, "", page.text ? quote(page.text) : "No excerpt captured.", "",
  );
  lines.push("## Capture attempts", "");
  for (const attempt of evidence.attempts) lines.push(`- ${inline(attempt.url)} — ${inline(attempt.status)}${attempt.pageId === null ? "" : ` (${inline(attempt.pageId)})`}`);
  lines.push("", "## Method limitations", "",
    "- Captures are unrendered, read-only HTML, not a browser-rendered or interactive inspection.",
    "- The host chose page traversal, not the agent; this does not demonstrate agent-selected browsing.",
    "- Snippet absence does not prove sitewide absence. Truncated excerpts and unavailable capture attempts limit coverage.",
    "- Quote membership checks establish occurrence only, not semantic support or factual truth. Deterministic HTML checks are separate from unverified model advice.",
    "- Capture hashes identify frozen content; they do not authenticate the source or certify capture timestamps.",
    "- This is not an overall quality score, traffic or AI visibility measurement, or certification.",
    "- This local report is private; it is not saved to Folio's app/owner history or published.", "");
  return { markdown: lines.join("\n"), completed };
}

/** A private source packet for an uncertain run, or a model-answer report only for confirmed output and cleanup. */
export function renderCondensationReport(value: unknown): CondensationReport {
  if (record(value) && value.mode === "host-website-frozen-evidence") return renderWebsiteReport(value);
  if (!record(value) || !["condensation-own-fleet", "codegraff-gateway-fleet"].includes(String(value.provider)) || value.mode !== "host-search-frozen-evidence" ||
    value.cleanup !== "confirmed" || !["completed", "failed", "uncertain"].includes(String(value.status)) ||
    !text(value.query, 2000) || !text(value.model, 100) || !record(value.search) ||
    value.search.provider !== "codegraff-gateway-v1-search" || !Array.isArray(value.search.results) ||
    value.search.results.length < 1 || value.search.results.length > 8) invalid();
  const receipt = value as unknown as CondensationSearchReceipt;
  const sources = receipt.search!.results.map(row => {
    if (!record(row) || !text(row.title, 300) || typeof row.text !== "string" || row.text.length > 800) invalid();
    return { title: row.title, url: sourceUrl(row.url), text: row.text };
  });
  const urls = new Set(sources.map(source => source.url));
  const completed = receipt.status === "completed";
  const answer = completed ? checkedAnswer(receipt.parsedAnswer, receipt.rawOutput, urls) : null;
  if (completed && (receipt.execution !== "complete" || receipt.outputComplete !== true || receipt.exitCode !== 0)) invalid();
  const gatewayFleet = receipt.provider === "codegraff-gateway-fleet";
  if (gatewayFleet && completed && receipt.guestModelAttached !== true) invalid();
  const lines = [
    gatewayFleet ? "# Private Codegraff fleet research pilot" : "# Private Condensation research pilot",
    "",
    `**Status:** ${completed ? "Completed model answer" : "Incomplete attempt — no confirmed model answer"}`,
    `**Question:** ${inline(receipt.query)}`,
    `**Model:** ${inline(receipt.model)}`,
    gatewayFleet
      ? "**Method:** One host-side Codegraff search supplied frozen snippets to analysis inside a Codegraff gateway fleet sandbox (Condensation infrastructure)."
      : "**Method:** One host-side Codegraff search supplied frozen snippets to Codegraff inside a Condensation own-fleet sandbox.",
    "**Sandbox cleanup:** Confirmed. **Total cost:** Unknown; the receipt is not a provider invoice.",
    "",
  ];
  if (answer) {
    lines.push("## Model answer (unverified)", "", quote(answer.text), "", "## Options named in the answer", "");
    if (!answer.mentions.length) lines.push("None recorded.", "");
    for (const mention of answer.mentions) lines.push(`- **${inline(mention.name)}** — ${inline(mention.url)}`, `  - ${inline(mention.reason)}`, `  - Returned citation URLs: ${mention.citationUrls.map(inline).join(", ")}`, "");
    lines.push("## Citations returned by the model", "");
    if (!answer.citations.length) lines.push("None recorded.", "");
    for (const citation of answer.citations) lines.push(`- ${inline(citation.title)} — ${inline(citation.url)}`);
    lines.push("", "## Model-stated limitations", "");
    if (!answer.limitations.length) lines.push("None stated.", "");
    for (const limitation of answer.limitations) lines.push(`- ${inline(limitation)}`);
    lines.push("");
  } else {
    lines.push("## No confirmed answer", "", `The one reserved execution did not produce a validated final answer. The source packet below is **not** a ${gatewayFleet ? "Codegraff fleet" : "Condensation"}-generated recommendation report. Do not infer recommendations or start a replacement from this receipt automatically.`, "");
  }
  lines.push(`## Frozen search evidence (${sources.length} results)`, "", "These are supplied search snippets, not independently captured full pages or verified facts.", "");
  sources.forEach((source, index) => lines.push(`### ${index + 1}. ${inline(source.title)}`, "", `URL: ${inline(source.url)}`, "", source.text ? quote(source.text) : "No excerpt was returned.", ""));
  lines.push("## Method limitations", "", "- Search was performed by the host before the sandbox analysis; this does not demonstrate agent-selected search.", "- Citation URLs were matched to supplied search URLs, not independently fact-checked against page content.", "- This is not a consumer-chat visibility measurement, website quality score, or evidence of causal improvement.", "- This local report is private; it is not saved to Folio's owner history or published index.", "");
  return { markdown: lines.join("\n"), completed };
}
