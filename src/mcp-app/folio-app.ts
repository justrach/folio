/**
 * Folio's MCP App: the page that hosts such as Claude Desktop and VS Code show in the conversation when
 * folio_find or folio_website_gaps returns. It runs on the official App class (@modelcontextprotocol/ext-apps, its
 * prebundled app-with-deps entry),
 * which handles the handshake, sizing and messaging, and is bundled with its dependencies into one HTML file by
 * scripts/build-folio-app.ts.
 *
 * Boundaries: every read is a tools/call the host makes with the person's own key, limited to the read-only
 * FOLIO_APP_CALLS; the page has no network access of its own; report text is drawn with textContent only;
 * links open through the host.
 */
import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-with-deps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { FolioAppCall, FolioFindResult } from "../lib/folio-app";
import type { DataSourceKind, WebsiteGapsReport } from "../lib/website-gaps";

type Organization = { id: string; name: string; role: "owner" | "member"; members: { name: string; role: string; agents: number; you: boolean }[];
  websites: { websiteId: string; name: string; domain: string; sharedBy: string }[] };
type Child = Node | string | null | undefined | false;

const APP_VERSION = "1.1.0";
const number = new Intl.NumberFormat("en-US");
const KIND: Record<DataSourceKind, string> = { google: "Google’s own count", estimate: "Estimate", third_party: "Third-party record", folio: "Recorded by Folio" };
const ICONS: Record<string, [string, Record<string, string>][]> = {
  website: [["circle", { cx: "12", cy: "12", r: "9" }], ["path", { d: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" }]],
  organization: [["circle", { cx: "9", cy: "8", r: "3.5" }], ["path", { d: "M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" }]],
  "seo-report": [["path", { d: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" }]],
  "search-console": [["circle", { cx: "11", cy: "11", r: "7" }], ["path", { d: "m20 20-4-4" }]],
};

const state = { base: "https://usefolio.site", find: null as FolioFindResult | null, org: null as Organization | null, report: null as WebsiteGapsReport | null, timer: 0, seq: 0 };
const view = document.getElementById("view")!, status = document.getElementById("status")!, field = document.getElementById("q") as HTMLInputElement;
const app = new App({ name: "folio", version: APP_VERSION }, { availableDisplayModes: ["inline"] });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> | null = null, children: Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "text") node.textContent = String(value);
    else if (key === "class") node.className = String(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value as EventListener);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}
function icon(kind: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of ICONS[kind] ?? ICONS["search-console"]) {
    const shape = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  return svg;
}
const say = (text: string) => { status.textContent = text; };
const show = (nodes: Child[]) => view.replaceChildren(...nodes.filter((node): node is Node | string => Boolean(node)));
const plural = (count: number, word: string) => `${number.format(count)} ${word}${count === 1 ? "" : /(s|x|ch|sh)$/.test(word) ? "es" : "s"}`;
const day = (iso: string | null) => { if (!iso) return ""; const at = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso); return Number.isNaN(at.getTime()) ? "" : at.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }); };
const failure = (error: unknown) => error instanceof Error ? error.message : "Folio couldn’t answer that.";

/** A Folio tool result carries { result } or { error } in structuredContent, and the same JSON as text. */
function unwrap(result: CallToolResult): unknown {
  let data = result.structuredContent as { result?: unknown; error?: { message?: string } } | undefined;
  const first = result.content?.[0];
  if (!data && first?.type === "text") { try { data = JSON.parse(first.text); } catch { data = undefined; } }
  if (result.isError || !data || data.error) throw new Error(data?.error?.message || "Folio couldn’t answer that.");
  return data.result;
}
/** The only way the page reads Folio: the host calls the tool with the person's key. */
async function callTool(name: FolioAppCall, args: Record<string, unknown>): Promise<unknown> {
  return unwrap(await app.callServerTool({ name, arguments: args }));
}
function openLink(url: string) {
  let full: URL;
  try { full = new URL(url, state.base); } catch { return; }
  if (full.protocol !== "https:" && full.protocol !== "http:") return;
  const fallback = () => say(`The link couldn’t be opened here: ${full.toString()}`);
  app.openLink({ url: full.toString() }).then(result => { if (result.isError) fallback(); }, fallback);
}
const isFind = (value: unknown): value is FolioFindResult => Boolean(value && Array.isArray((value as FolioFindResult).items) && "truncated" in (value as object));
const isReport = (value: unknown): value is WebsiteGapsReport => Boolean(value && (value as WebsiteGapsReport).website && Array.isArray((value as WebsiteGapsReport).gaps));

function search(query: string) {
  const mine = ++state.seq;
  say("Searching your Folio…");
  callTool("folio_find", query ? { q: query } : {}).then(result => { if (mine === state.seq) { if (isFind(result)) renderFind(result); else say("Folio returned something this view doesn’t show."); } },
    error => { if (mine === state.seq) say(failure(error)); });
}
field.addEventListener("input", () => { clearTimeout(state.timer); state.timer = window.setTimeout(() => search(field.value.trim()), 250); });
field.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const first = view.querySelector<HTMLButtonElement>(".row");
  if (first && state.find && !state.report && !state.org) first.click(); else search(field.value.trim());
});

function renderFind(result: FolioFindResult) {
  state.find = result; state.org = null; state.report = null;
  if (result.query && document.activeElement !== field) field.value = result.query;
  if (result.items[0]) { try { state.base = new URL(result.items[0].url).origin; } catch { /* keep the default */ } }
  say(result.items.length ? (result.query ? plural(result.items.length, "match") : "Everything you can open in Folio.") : "");
  if (!result.items.length) {
    show([el("p", { class: "empty", text: result.query ? `Nothing in your Folio matches “${result.query}”. Try a domain, or clear the search.` : "Nothing saved yet. Add a website in Folio first." })]);
    return;
  }
  show([el("ul", { class: "list", "aria-label": result.query ? "Matches" : "Your Folio" }, result.items.map(item => {
    const action = item.kind === "website" ? "What it’s missing" : item.kind === "organization" ? "Shared websites" : "Open in Folio ↗";
    return el("li", null, [el("button", { type: "button", class: "row", "data-kind": item.kind, onclick: () => {
      if (item.kind === "website" && item.websiteId) openReport(item.websiteId, item.title);
      else if (item.kind === "organization" && item.organizationId) openOrganization(item.organizationId, item.title);
      else openLink(item.url);
    } }, [icon(item.kind), el("span", null, [el("strong", { text: item.title }), el("small", { text: item.detail })]), el("span", { class: "row-action", text: action })])]);
  })), result.truncated ? el("p", { class: "note", text: "Showing the first matches. Type to narrow them down." }) : null]);
}

function openOrganization(id: string, name: string) {
  say(`Reading ${name}…`);
  callTool("folio_organizations", {}).then(result => {
    const org = ((result as { items?: Organization[] }).items ?? []).find(item => item.id === id);
    if (!org) { say(`${name} isn’t one of your organizations any more.`); return; }
    state.org = org; state.report = null; say("");
    show([back(), el("div", null, [el("h2", { text: org.name }), el("p", { class: "sub", text: `${org.role === "owner" ? "You own it" : "You’re a member"} · ${plural(org.members.length, "member")}` })]),
      org.websites.length ? el("ul", { class: "list", "aria-label": "Shared websites" }, org.websites.map(site => el("li", null, [
        el("button", { type: "button", class: "row", "data-kind": "website", onclick: () => openReport(site.websiteId, site.domain) },
          [icon("website"), el("span", null, [el("strong", { text: site.domain }), el("small", { text: `Shared by ${site.sharedBy}` })]), el("span", { class: "row-action", text: "What it’s missing" })])])))
        : el("p", { class: "empty", text: `No website is shared with ${org.name} yet.` })]);
  }, error => say(failure(error)));
}

function openReport(websiteId: string, title: string) {
  say(`Reading what ${title} is missing…`);
  callTool("folio_website_gaps", { websiteId }).then(result => {
    if (!isReport(result)) { say("Folio returned something this view doesn’t show."); return; }
    renderReport(result);
    // Tell the agent what the person is looking at, so a follow-up question has the context.
    app.updateModelContext({ content: [{ type: "text", text: `In the Folio app, the person opened the report for ${result.website.domain} (websiteId ${result.website.id}). ${result.summary}`
      + (result.gaps.length ? ` Gaps: ${result.gaps.map(gap => gap.title).join("; ")}.` : "") + (result.googleCheck ? ` ${result.googleCheck.finding}` : "") }] }).catch(() => undefined);
  }, error => say(failure(error)));
}

function back(): HTMLButtonElement | null {
  if (!state.find && !state.org) return null;
  const toOrg = Boolean(state.report && state.org);
  return el("button", { type: "button", class: "back", text: toOrg ? `← ${state.org!.name}` : "← Your Folio", onclick: () => {
    if (toOrg) openOrganization(state.org!.id, state.org!.name); else if (state.find) renderFind(state.find);
  } });
}
const measure = (value: { state: string; value: number | null } | undefined) => value?.state === "value" && value.value !== null
  ? value.value > 0 && value.value < 1 ? "under 1" : number.format(Math.round(value.value)) : value?.state === "none" ? "None" : "Not measured";
const perMonth = (value: number) => `${value > 0 && value < 1 ? "under 1" : number.format(Math.round(value))}/mo`;

/** Where each number comes from, and the visits estimate beside Google's own count when the owner has imported it. */
function sources(report: WebsiteGapsReport): Child[] {
  const check = report.googleCheck;
  if (!check) return [];
  const google = check.searchConsole, estimate = check.estimate, top = Math.max(google?.monthlyClicks ?? 0, estimate?.monthlyVisits ?? 0, 1);
  const meter = (label: string, detail: string, value: number, kind: "google" | "estimate") => el("div", { class: "meter-row" }, [
    el("span", null, [el("strong", { text: label }), el("small", { text: detail })]),
    el("span", { class: "meter-track" }, [el("span", { class: `meter ${kind}`, style: `width:${Math.max(1, 100 * value / top)}%` })]),
    el("b", { text: perMonth(value) })]);
  return [
    el("h3", { text: "Where these numbers come from" }),
    el("div", { class: "check" }, [
      check.state === "compared" && google && estimate ? el("div", { class: "meters" }, [
        meter("Google Search Console", `${google.scope === "united_states" ? "US clicks" : "clicks, all countries"} · ${day(google.endDate)}`, google.monthlyClicks, "google"),
        meter("Third-party estimate", `DataForSEO, US${day(estimate.fetchedAt) ? ` · ${day(estimate.fetchedAt)}` : ""}`, estimate.monthlyVisits, "estimate")]) : null,
      el("p", { text: check.finding }),
      el("p", { class: "note" }, [`${check.caveat.text} `, el("button", { type: "button", class: "link", text: "Ahrefs’s study", onclick: () => openLink(check.caveat.sourceUrl) })]),
    ]),
    (report.sources ?? []).length ? el("ul", { class: "sources", "aria-label": "Sources" }, report.sources.map(source => el("li", { class: "source", "data-source-id": source.id }, [
      el("span", { class: `kind ${source.kind}`, text: KIND[source.kind] }),
      el("span", null, [el("strong", { text: source.label }), ` · ${source.provider}${day(source.asOf) ? ` · ${day(source.asOf)}` : ""}`]),
      el("span", { class: "detail", text: source.detail })]))) : null,
  ];
}

function renderReport(report: WebsiteGapsReport) {
  state.report = report; say("");
  const site = report.website, google = report.google, ai = report.aiAnswers;
  const access = site.access === "organization" ? `Shared with you through ${site.organizations.map(org => org.name).join(", ")}` : "Your website";
  const gaps = report.gaps.map(gap => el("li", { class: "gap" }, [
    el("p", null, [el("span", { class: `chip ${gap.severity}`, text: gap.severity === "high" ? "High" : gap.severity === "medium" ? "Medium" : "Low" }), el("strong", { text: gap.title })]),
    el("p", { text: gap.finding }),
    el("p", { class: "next", text: `Next: ${gap.nextStep}` }),
    gap.evidence.length ? el("div", { class: "links" }, gap.evidence.slice(0, 4).map(item => el("button", { type: "button", class: "link", text: item.label, onclick: () => openLink(item.url) }))) : null,
    el("div", { class: "actions" }, [el("button", { type: "button", class: "button primary", text: "Ask my agent to fix this", onclick: () => {
      const unavailable = () => say(`This app can’t send messages here. Ask your agent to fix “${gap.title}”.`);
      app.sendMessage({ role: "user", content: [{ type: "text", text: `Use Folio to fix this gap on ${site.domain} (websiteId ${site.id}): ${gap.title}. ${gap.finding} Suggested next step: ${gap.nextStep}`
        + " Read folio_website_gaps first, propose specific edits, and wait for my approval before changing anything." }] })
        .then(result => { if (result.isError) unavailable(); else say("Sent to your agent."); }, unavailable);
    } })]),
  ]));
  const searches = google.searches.slice(0, 10);
  show([
    back(),
    el("div", null, [el("h2", { text: site.domain }), el("p", { class: "sub", text: `${access} · read ${day(report.generatedAt)}` })]),
    el("p", { class: "summary", text: report.summary }),
    el("div", { class: "metrics" }, [
      el("div", { class: "metric" }, [el("span", { text: "Google page one" }), el("b", { text: google.state === "tracked" ? `${google.bands.top3 + google.bands.page1} of ${plural(google.tracked, "search")}` : google.state === "none_tracked" ? "No searches found" : "Not measured" })]),
      el("div", { class: "metric" }, [el("span", { text: "Linking websites" }), el("b", { text: measure(report.search.referringDomains) })]),
      el("div", { class: "metric" }, [el("span", { text: "Search visits a month (estimate)" }), el("b", { text: measure(report.search.estimatedMonthlyVisits) })]),
      el("div", { class: "metric" }, [el("span", { text: "Named in AI answers" }), el("b", { text: ai.publishedQuestions === null ? "Not measured" : `${number.format(ai.namedIn)} of ${number.format(ai.publishedQuestions)}` })]),
    ]),
    el("h3", { text: report.gaps.length ? `What it’s missing (${report.gaps.length})` : "No gaps found in the saved data" }),
    report.gaps.length ? el("ul", { class: "gaps" }, gaps) : null,
    searches.length ? el("h3", { text: "Google searches that show it" }) : null,
    searches.length ? el("table", null, [el("thead", null, [el("tr", null, [el("th", { text: "Search" }), el("th", { class: "n", text: "Position" }), el("th", { class: "n", text: "Searches a month" })])]),
      el("tbody", null, searches.map(row => el("tr", null, [el("td", { text: row.keyword }), el("td", { class: `n band-${row.band}`, text: `#${row.position}` }),
        el("td", { class: "n", text: row.searchVolume === null ? "–" : number.format(row.searchVolume) })])))]) : null,
    report.notChecked.length ? el("h3", { text: "Not checked yet" }) : null,
    report.notChecked.length ? el("ul", { class: "unknown" }, report.notChecked.map(item => el("li", { text: `${item.title}: ${item.detail}` }))) : null,
    ...sources(report),
    el("div", { class: "actions" }, [el("button", { type: "button", class: "button", text: "Open in Folio ↗", onclick: () => openLink(`/websites?site=${encodeURIComponent(site.id)}`) })]),
    el("p", { class: "note", text: report.howToRead }),
  ]);
}

function applyContext(context: McpUiHostContext | undefined) {
  if (!context) return;
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
  const box = context.containerDimensions;
  if (box && "maxHeight" in box && typeof box.maxHeight === "number") document.documentElement.style.maxHeight = `${box.maxHeight}px`;
}

// Handlers go on before connecting, so the tool's own input and result are never missed.
app.ontoolinput = ({ arguments: args }) => {
  if (typeof args?.q === "string") field.value = args.q;
  say(args?.websiteId ? "Reading the website’s report…" : "Searching your Folio…");
};
app.ontoolresult = result => {
  let data: unknown;
  try { data = unwrap(result); } catch (error) { say(failure(error)); return; }
  if (isFind(data)) renderFind(data);
  else if (isReport(data)) renderReport(data);
  else say("Folio returned something this view doesn’t show.");
};
app.ontoolcancelled = ({ reason }) => say(`The request was cancelled.${reason ? ` ${reason}` : ""}`);
app.onhostcontextchanged = context => applyContext(context);
// Nothing on the page is unsaved, so the host can always tear it down.
app.onteardown = async () => ({});
app.connect().then(() => applyContext(app.getHostContext()),
  () => say("This view opens inside an AI agent that supports MCP Apps, such as Claude Desktop or VS Code."));
