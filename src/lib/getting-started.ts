import type { D1Database } from "@cloudflare/workers-types";

/**
 * Getting started: five free steps from a new account to an agent that reads your website. Each is measured from what
 * Folio already records for the person, never from page visits or clicks, so a step is done only when it really happened.
 * Nothing here spends credits.
 */
export const GETTING_STARTED_STEPS = [
  { id: "website", label: "Add your website", detail: "Save the website you want Folio to watch.", href: "/websites" },
  { id: "search-console", label: "Connect Search Console", detail: "Bring in Google’s own clicks, so estimates sit beside real numbers.", href: "/search-console" },
  { id: "agent", label: "Connect your agent", detail: "Approve Claude Code, Codex, Harness, Cursor or another agent to read your websites.", href: "/agents#connect" },
  { id: "ask", label: "Ask what your website is missing", detail: "Have your agent read Folio’s report on your website.", href: "/agents#connect" },
  { id: "team", label: "Bring in your team", detail: "Create or join an organization and share a website.", href: "/orgs" },
] as const;
export type GettingStartedStepId = (typeof GETTING_STARTED_STEPS)[number]["id"];
export type GettingStartedProgress = { done: Record<GettingStartedStepId, boolean> };

/** The steps in order, with which are done and which one to do next (the first not done). */
export function gettingStartedSummary(progress: GettingStartedProgress) {
  const steps = GETTING_STARTED_STEPS.map(step => ({ ...step, done: Boolean(progress.done[step.id]) }));
  const completed = steps.filter(step => step.done).length;
  return { steps, completed, total: steps.length, next: steps.find(step => !step.done) ?? null, finished: completed === steps.length };
}

/** One read: whether each step has happened for this person. Revoked keys still count; they did connect once. */
export async function loadGettingStarted(db: D1Database, userId: string): Promise<GettingStartedProgress> {
  const row = await db.prepare(`SELECT
      CASE WHEN EXISTS(SELECT 1 FROM sites WHERE user_id = ?) THEN 1 ELSE 0 END AS website,
      CASE WHEN EXISTS(SELECT 1 FROM search_console_reports WHERE user_id = ?) THEN 1 ELSE 0 END AS search_console,
      CASE WHEN EXISTS(SELECT 1 FROM agent_api_keys WHERE user_id = ? AND last_used_at IS NOT NULL) THEN 1 ELSE 0 END AS agent,
      CASE WHEN EXISTS(SELECT 1 FROM agent_index_asks WHERE user_id = ? AND tool = 'website') THEN 1 ELSE 0 END AS ask,
      CASE WHEN EXISTS(SELECT 1 FROM organization_members WHERE user_id = ?) THEN 1 ELSE 0 END AS team`)
    .bind(userId, userId, userId, userId, userId)
    .first<{ website: number; search_console: number; agent: number; ask: number; team: number }>();
  const yes = (value: unknown) => Number(value) === 1;
  return { done: { website: yes(row?.website), "search-console": yes(row?.search_console), agent: yes(row?.agent), ask: yes(row?.ask), team: yes(row?.team) } };
}
