/**
 * The "Find anything" search: every page (with the words people use for it) and, for a signed-in
 * person, the websites, organizations and saved reports they can open. Client-safe and pure: the
 * index comes from GET /api/workspace-search, and each result only navigates. Opening a result
 * never starts a lookup, an evaluation or anything else that costs money.
 */

export type WorkspaceSearchIndex = {
  websites: { id: string; name: string; url: string }[];
  seoReports: { id: string; domain: string; createdAt: string; complete: boolean }[];
  searchConsole: { id: string; property: string; createdAt: string }[];
  organizations: { id: string; name: string; role: "owner" | "member"; members: number; domains: string[] }[];
};
/** An SEO health audit already loaded on the page. */
export type SearchableAudit = { id: string; url: string; createdAt: string; seoScore: number };

export type CommandKind = "page" | "website" | "organization" | "seo-report" | "search-console" | "audit";
export type CommandResult = { key: string; kind: CommandKind; icon: string; title: string; detail: string; href: string; auditId?: string };
type CommandPage = { id: string; title: string; href: string; detail: string; keywords: string[] };

/** In the order shown before anything is typed. `id` names the page's icon. */
export const COMMAND_PAGES: CommandPage[] = [
  { id: "workspace", title: "My workspace", href: "/overview?view=workspace", detail: "Your websites’ results at a glance", keywords: ["overview", "home", "dashboard", "results", "summary"] },
  { id: "websites", title: "My websites", href: "/websites", detail: "Saved websites, their audits and where each one shows up", keywords: ["sites", "domains", "where it shows up", "gaps", "missing"] },
  { id: "add-website", title: "Add a website", href: "/start?step=1", detail: "Save a website and choose its customer questions", keywords: ["new website", "new site", "get started", "start", "setup", "onboarding"] },
  { id: "orgs", title: "Organizations", href: "/orgs", detail: "Your team: invite people, share websites, see each other’s agents", keywords: ["team", "teams", "org", "orgs", "organisation", "members", "invite", "people", "colleagues", "share", "sharing"] },
  { id: "connect", title: "Connect your agent", href: "/agents#connect", detail: "Claude Code, Codex, Cursor, Manus or any MCP client, with your own key", keywords: ["mcp", "api key", "key", "token", "claude", "claude code", "claude desktop", "codex", "cursor", "vs code", "copilot", "manus", "connector", "integrate"] },
  { id: "agents", title: "Your agents", href: "/agents", detail: "What your agents ran, read and returned", keywords: ["runs", "agent runs", "activity", "managed"] },
  { id: "visibility", title: "AI visibility", href: "/visibility", detail: "How AI answers describe websites (illustrative)", keywords: ["aeo", "geo", "chatgpt", "gemini", "perplexity", "answers", "citations", "sources"] },
  { id: "seo", title: "SEO health", href: "/seo", detail: "Technical checks of a page you audited", keywords: ["audit", "audits", "scan", "technical", "meta", "title tags", "crawl"] },
  { id: "search-data", title: "Search & backlinks", href: "/search-data", detail: "Organic keywords, traffic and the links pointing at a website", keywords: ["backlinks", "links", "referring domains", "keywords", "traffic", "organic", "dataforseo"] },
  { id: "evaluations", title: "Website checks", href: "/evaluations?view=page", detail: "Run, compare and export checks of your website", keywords: ["evaluations", "evals", "tests", "findings", "evidence"] },
  { id: "benchmarks", title: "Keyword evaluations", href: "/benchmarks", detail: "Where your website appears in recorded AI answers", keywords: ["search rankings", "rankings", "benchmarks", "questions", "keyword research", "positions"] },
  { id: "search-console", title: "Search Console", href: "/search-console", detail: "Clicks, impressions and queries from your Google account", keywords: ["google", "gsc", "clicks", "impressions", "queries"] },
  { id: "patches", title: "Patch studio", href: "/patches", detail: "Review and download suggested fixes", keywords: ["fixes", "repairs", "suggestions", "downloads"] },
  { id: "index", title: "The Folio Index", href: "/leaderboard", detail: "Published AI answers, recommendations and page checks", keywords: ["index", "leaderboard", "published answers", "benchmark", "compare"] },
  { id: "api-docs", title: "API docs", href: "/docs/api", detail: "The API reference, your keys and the MCP endpoint", keywords: ["api", "reference", "documentation", "docs", "openapi", "endpoints", "keys", "revoke"] },
  { id: "settings", title: "Settings", href: "/settings", detail: "Your account and the sources behind your reports", keywords: ["account", "profile", "integrations", "connections", "google", "github", "sign out"] },
  { id: "pricing", title: "Pricing", href: "/pricing", detail: "Proposed plans", keywords: ["plans", "billing", "price", "cost", "credits", "subscription", "upgrade"] },
  { id: "demo", title: "Sample report", href: "/overview?view=demo", detail: "Look around with illustrative data", keywords: ["demo", "example", "sample", "tour"] },
  { id: "org-preview", title: "Sample organization", href: "/orgs?view=preview", detail: "A made-up team to look around", keywords: ["sample team", "demo team", "example team"] },
  { id: "privacy", title: "Privacy", href: "/privacy", detail: "How Folio handles your data", keywords: ["data", "policy", "gdpr"] },
];

const fold = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9.@:/_-]+/g, " ").trim();
const words = (text: string) => text.split(" ").filter(Boolean);
const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return url; } };
/** sc-domain:manus.im and https://www.manus.im/ both read as manus.im. */
export const propertyLabel = (property: string) => property.startsWith("sc-domain:") ? property.slice(10) : hostOf(property);
const PER_KIND = 8, TOTAL = 40;

/**
 * Ranks by how a query matches: the whole title, a title word, a keyword, then the detail line.
 * Every typed word must match somewhere, so "manus backlinks" finds manus.im's backlinks report only.
 */
function score(query: string, item: { title: string; keywords: string[]; detail: string }) {
  const phrase = fold(query), tokens = words(phrase);
  if (!tokens.length) return 0;
  const title = fold(item.title), titleWords = words(title), keywords = item.keywords.map(fold), detail = fold(item.detail);
  let total = title === phrase ? 200 : title.startsWith(phrase) ? 120 : 0;
  if (keywords.includes(phrase)) total += 60;
  for (const token of tokens) {
    const points = titleWords.some(word => word.startsWith(token)) ? 40 : title.includes(token) ? 25
      : keywords.some(keyword => words(keyword).some(word => word.startsWith(token))) ? 18 : keywords.some(keyword => keyword.includes(token)) ? 10
      : detail.includes(token) ? 5 : 0;
    if (!points) return 0;
    total += points;
  }
  return total;
}

function records(index: WorkspaceSearchIndex | null, audits: SearchableAudit[], date: (iso: string) => string) {
  const items: (CommandResult & { keywords: string[] })[] = [];
  if (index) {
    for (const site of index.websites) items.push({ key: `website:${site.id}`, kind: "website", icon: "website", title: hostOf(site.url), detail: "Your website",
      href: `/websites?site=${encodeURIComponent(site.id)}`, keywords: [site.name, site.url] });
    for (const org of index.organizations) {
      const shares = org.domains.length ? ` · shares ${org.domains.slice(0, 2).join(", ")}${org.domains.length > 2 ? ` and ${org.domains.length - 2} more` : ""}` : "";
      items.push({ key: `organization:${org.id}`, kind: "organization", icon: "orgs", title: org.name,
        detail: `Organization · ${org.role === "owner" ? "owner" : "member"} · ${org.members} member${org.members === 1 ? "" : "s"}${shares}`,
        href: `/orgs?org=${encodeURIComponent(org.id)}`, keywords: org.domains });
    }
    for (const report of index.seoReports) items.push({ key: `seo-report:${report.id}`, kind: "seo-report", icon: "search-data", title: report.domain,
      detail: `Search & backlinks report · ${date(report.createdAt)}${report.complete ? "" : " · no saved result"}`, href: `/search-data?report=${encodeURIComponent(report.id)}`, keywords: [] });
    for (const report of index.searchConsole) items.push({ key: `search-console:${report.id}`, kind: "search-console", icon: "search-console", title: propertyLabel(report.property),
      detail: `Search Console snapshot · ${date(report.createdAt)}`, href: `/search-console?report=${encodeURIComponent(report.id)}`, keywords: [report.property] });
  }
  for (const audit of audits) items.push({ key: `audit:${audit.id}`, kind: "audit", icon: "seo", title: hostOf(audit.url),
    detail: `SEO health audit · score ${audit.seoScore} · ${date(audit.createdAt)}`, href: "/seo", auditId: audit.id, keywords: [audit.url] });
  return items;
}

const defaultDate = (iso: string) => { const at = new Date(iso); return Number.isNaN(at.getTime()) ? "date unknown" : at.toLocaleDateString(undefined, { dateStyle: "medium" }); };

/** Pages in their usual order when nothing is typed; otherwise everything that matches, best first. */
export function commandResults(query: string, input: { index?: WorkspaceSearchIndex | null; audits?: SearchableAudit[]; date?: (iso: string) => string } = {}): CommandResult[] {
  const pages = COMMAND_PAGES.map(page => ({ key: `page:${page.id}`, kind: "page" as const, icon: page.id, title: page.title, detail: page.detail, href: page.href, keywords: page.keywords }));
  const strip = ({ keywords: _keywords, ...result }: CommandResult & { keywords: string[] }): CommandResult => result;
  if (!fold(query)) return pages.map(strip);
  const perKind = new Map<CommandKind, number>();
  return [...pages, ...records(input.index ?? null, input.audits ?? [], input.date ?? defaultDate)]
    .map((item, order) => ({ item, order, points: score(query, item) }))
    .filter(entry => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.order - b.order)
    .filter(({ item }) => { const seen = perKind.get(item.kind) ?? 0; perKind.set(item.kind, seen + 1); return item.kind === "page" || seen < PER_KIND; })
    .slice(0, TOTAL)
    .map(({ item }) => strip(item));
}
