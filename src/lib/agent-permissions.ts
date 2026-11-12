/**
 * What an agent's connection may do, in one place for the MCP server (folio_capabilities) and the Connect your agent
 * panel. Client-safe: no server imports. A unit test keeps the tool lists in step with src/lib/folio-mcp.ts.
 */
import type { AgentApiScope } from "./agent-observation-types";

export type PermissionGroup = { scope: AgentApiScope; label: string; charges: boolean; summary: string; highlights: string[]; tools: string[] };
/** Mirrors the scope of every tool in src/lib/folio-mcp.ts (a unit test keeps them in step). */
export const AGENT_PERMISSIONS: PermissionGroup[] = [
  { scope: "read", label: "Read", charges: false,
    summary: "Always included. Find your websites and your organization’s, read what a website is missing, search Folio’s published AI answers and the pages it has read, and open saved runs, reports and changes. Folio saves what the agent asks to your activity.",
    highlights: ["folio_find", "folio_organizations", "folio_website_gaps", "folio_index_search", "folio_index_pages", "folio_visibility"],
    tools: ["folio_targets", "folio_find", "folio_organizations", "folio_website_gaps", "folio_index", "folio_index_overview", "folio_index_search", "folio_index_answer", "folio_index_website",
      "folio_index_pages", "folio_observation", "folio_run", "folio_visibility", "folio_seo_reports", "folio_capabilities", "folio_run_history", "folio_observations",
      "folio_page_evidence", "folio_visibility_compare", "folio_changes"] },
  { scope: "changes", label: "Record changes", charges: false,
    summary: "Let the agent save what it changed on your website and report when it’s live, so Folio can show the answers before and after. It can’t edit or publish the website.",
    highlights: ["folio_change_record", "folio_change_update"], tools: ["folio_change_record", "folio_change_update"] },
  { scope: "evaluate", label: "Start evaluations", charges: true,
    summary: "Run a fresh AI answer or website evaluation. Each run is charged; your account’s limits still apply, and the agent must pass confirmSpend.",
    highlights: ["folio_evaluate", "folio_reconcile"], tools: ["folio_evaluate", "folio_reconcile"] },
  { scope: "seo", label: "Paid search lookups", charges: true,
    summary: "Run a new search and backlink lookup or keyword research from a third-party data provider (charges apply). Saved reports are readable without it, at no charge.",
    highlights: ["folio_seo_lookup", "folio_keyword_research"], tools: ["folio_seo_lookup", "folio_keyword_research"] },
];
const ORDER: AgentApiScope[] = ["read", "changes", "evaluate", "seo"];
/** What each scope lets the agent do, as the end of "This connection can …". */
const VERB: Record<AgentApiScope, string> = { read: "read", changes: "record changes", evaluate: "start evaluations", seo: "run paid search lookups" };
const list = (items: string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export type ConnectionAbilities = {
  /** One or two plain sentences, e.g. "This connection can read and record changes. It can’t start paid work." */
  summary: string;
  /** Short label for a list row, e.g. "Read & record changes". */
  access: string;
  /**
   * The line about money: "Can’t start paid work", or which paid actions it may start. Every paid tool also needs an approved
   * account (folio_capabilities lists "Approved account"; the server refuses with account_not_approved), so the line says so.
   */
  money: string;
  paidActions: string[];
  /** Tools the connection sees, by scope, in the panel's order. */
  tools: { scope: AgentApiScope; count: number }[];
  toolCount: number;
};

/**
 * What a connection with these scopes can do, counted from its real scopes exactly as the MCP server filters its tools
 * (a unit test compares the two for every combination). Unknown scopes are ignored. Every key includes read
 * (createAgentApiKey and the OAuth approval refuse one without it), so the no-read wording below never shows in practice.
 */
export function connectionAbilities(scopes: readonly string[]): ConnectionAbilities {
  const has = ORDER.filter(scope => scopes.includes(scope));
  const paid = has.filter(scope => AGENT_PERMISSIONS.find(group => group.scope === scope)!.charges);
  const paidActions = paid.map(scope => AGENT_PERMISSIONS.find(group => group.scope === scope)!.label.toLowerCase());
  const tools = has.map(scope => ({ scope, count: AGENT_PERMISSIONS.find(group => group.scope === scope)!.tools.length }));
  const summary = !has.length ? "This connection can’t use any Folio tool. It can’t start paid work." : `This connection can ${list(has.map(scope => VERB[scope]))}. ${paid.length
    ? `Each ${list(paid.map(scope => scope === "evaluate" ? "evaluation" : "lookup"))} is charged, needs your account’s approval and must be confirmed in the call.`
    : "It can’t start paid work."}`;
  const key = has.join(",");
  const access = !has.length ? "No access" : key === "read" ? "Read only" : key === "read,changes" ? "Read & record changes"
    : has.map((scope, index) => { const label = AGENT_PERMISSIONS.find(group => group.scope === scope)!.label; return index ? label.toLowerCase() : label; }).join(", ");
  return { summary, access, money: paid.length ? `Can start paid work if your account is approved: ${list(paidActions)}` : "Can’t start paid work", paidActions, tools,
    toolCount: tools.reduce((total, item) => total + item.count, 0) };
}
