/**
 * Folio as an MCP App (io.modelcontextprotocol/ui, spec 2026-01-26): one static page that hosts such as
 * Claude Desktop and VS Code render in a sandboxed iframe when folio_find or folio_website_gaps returns.
 * It searches the person's Folio and shows a website's report, and every read goes through the host as a
 * tools/call with the person's own key. It has no network access of its own (default CSP), draws untrusted
 * report text with textContent only, opens links through ui/open-link, and can hand a gap to the agent
 * with ui/message. Nothing in it spends: it calls only folio_find, folio_organizations and folio_website_gaps.
 */
export const FOLIO_APP_URI = "ui://folio/workspace.html";
export const FOLIO_APP_MIME = "text/html;profile=mcp-app";
/** The tools the page may call. A unit test keeps this list read-only and in step with the page. */
export const FOLIO_APP_CALLS = ["folio_find", "folio_organizations", "folio_website_gaps"] as const;

export const FOLIO_APP_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Folio</title>
<style>
:root{color-scheme:light dark;--f-bg:#fbfaf6;--f-bg2:#f1efe7;--f-text:#1d2420;--f-muted:#59625c;--f-border:#dcd8cc;--f-accent:#2f6b4f;--f-good:#2b7a4b;--f-warn:#8a5a00;--f-bad:#a8322a;--f-chip:#e7efe9}
html[data-theme=dark]{--f-bg:#171c19;--f-bg2:#202723;--f-text:#eef1ec;--f-muted:#b1bab3;--f-border:#36403a;--f-accent:#8fd1a8;--f-good:#8fd1a8;--f-warn:#f0c674;--f-bad:#ff9b8f;--f-chip:#26332c}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--color-background-primary,var(--f-bg));color:var(--color-text-primary,var(--f-text));font:14px/1.55 var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif)}
main{display:grid;gap:12px;padding:14px}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--color-ring-primary,var(--f-accent));outline-offset:2px}
svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:8px;font-weight:600}
.mark{display:grid;grid-template-columns:repeat(2,6px);gap:2px}.mark i{width:6px;height:6px;border-radius:2px;background:var(--f-accent)}.mark i:nth-child(2),.mark i:nth-child(3){opacity:.55}
.search{flex:1 1 220px;display:flex;align-items:center;gap:8px;min-height:38px;padding:0 10px;border:1px solid var(--color-border-primary,var(--f-border));border-radius:var(--border-radius-md,8px);background:var(--color-background-secondary,var(--f-bg2));color:var(--color-text-secondary,var(--f-muted))}
.search:focus-within{border-color:var(--f-accent)}
.search input{flex:1;min-width:0;height:36px;border:0;outline:0;background:none;color:var(--color-text-primary,var(--f-text));font:inherit}
#view{display:grid;gap:12px;min-width:0}
#status{min-height:1em;margin:0;font-size:13px;color:var(--color-text-secondary,var(--f-muted))}
#status:empty{display:none}
.list{display:grid;gap:4px;margin:0;padding:0;list-style:none}
.row{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;padding:9px 10px;border:1px solid transparent;border-radius:var(--border-radius-md,8px);background:none;text-align:left;cursor:pointer}
.row:hover{background:var(--color-background-secondary,var(--f-bg2))}
.row>svg{color:var(--color-text-secondary,var(--f-muted))}
.row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:var(--color-text-secondary,var(--f-muted))}
.row-action{font-size:12.5px;color:var(--f-accent);white-space:nowrap}
.empty,.note{margin:0;color:var(--color-text-secondary,var(--f-muted))}
.note{font-size:12.5px}
.back{justify-self:start;padding:2px 0;border:0;background:none;color:var(--f-accent);cursor:pointer;font-size:13px}
h2{margin:0;font-size:19px;line-height:1.3}
h3{margin:4px 0 0;font-size:14px}
.sub{margin:2px 0 0;font-size:12.5px;color:var(--color-text-secondary,var(--f-muted))}
.summary{margin:0}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.metric{padding:10px 12px;border-radius:var(--border-radius-md,8px);background:var(--color-background-secondary,var(--f-bg2))}
.metric span{display:block;font-size:12px;color:var(--color-text-secondary,var(--f-muted))}
.metric b{display:block;margin-top:2px;font-size:15px}
.gaps{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.gap{display:grid;gap:6px;padding:12px;border:1px solid var(--color-border-primary,var(--f-border));border-radius:var(--border-radius-md,8px)}
.gap p{margin:0}
.chip{display:inline-block;margin-right:6px;padding:0 7px;border-radius:999px;background:var(--f-chip);font-size:11.5px;font-weight:600;vertical-align:1px}
.chip.high{color:var(--f-bad)}.chip.medium{color:var(--f-warn)}.chip.low{color:var(--f-good)}
.next{color:var(--color-text-secondary,var(--f-muted))}
.links{display:flex;flex-wrap:wrap;gap:4px 12px}
.link{padding:0;border:0;background:none;color:var(--f-accent);cursor:pointer;font-size:12.5px;text-align:left;text-decoration:underline;text-underline-offset:2px}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.button{min-height:32px;padding:0 12px;border:1px solid var(--color-border-primary,var(--f-border));border-radius:var(--border-radius-md,8px);background:var(--color-background-primary,var(--f-bg));cursor:pointer;font-size:13px}
.button.primary{border-color:var(--f-accent);color:var(--f-accent);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:6px 4px;border-top:1px solid var(--color-border-primary,var(--f-border));text-align:left;font-weight:400}
th{color:var(--color-text-secondary,var(--f-muted));font-size:12px}
td.n,th.n{text-align:right;white-space:nowrap}
.band-top3,.band-page1{color:var(--f-good)}.band-page2{color:var(--f-warn)}
.unknown{display:grid;gap:4px;margin:0;padding-left:18px;color:var(--color-text-secondary,var(--f-muted));font-size:13px}
</style>
</head>
<body>
<main>
  <div class="bar">
    <span class="brand"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Folio</span>
    <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
      <input id="q" type="search" autocomplete="off" spellcheck="false" aria-label="Search your Folio" placeholder="Search your Folio"></label>
  </div>
  <p id="status" role="status">Waiting for Folio…</p>
  <section id="view" aria-live="polite"></section>
</main>
<script>
(function () {
  "use strict";
  var ICONS = {
    "website": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    "organization": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>',
    "seo-report": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
    "search-console": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>'
  };
  var number = new Intl.NumberFormat("en-US");
  var state = { base: "https://usefolio.site", find: null, org: null, report: null, timer: 0, seq: 0 };
  var nextId = 1, pending = {};
  var view = document.getElementById("view"), status = document.getElementById("status"), field = document.getElementById("q");

  // JSON-RPC over postMessage with the host (or its sandbox proxy), which is always this frame's parent.
  function post(message) { window.parent.postMessage(message, "*"); }
  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
      setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error("The app host didn’t answer.")); } }, 30000);
    });
  }
  function notify(method, params) { post({ jsonrpc: "2.0", method: method, params: params || {} }); }
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method === undefined && message.id !== undefined) {
      var waiting = pending[message.id];
      if (!waiting) return;
      delete pending[message.id];
      if (message.error) waiting.reject(new Error(message.error.message || "The request was refused."));
      else waiting.resolve(message.result);
      return;
    }
    if (message.id !== undefined) {
      // Requests from the host. Nothing is unsaved here, so teardown can always proceed.
      if (message.method === "ui/resource-teardown" || message.method === "ping") post({ jsonrpc: "2.0", id: message.id, result: {} });
      else post({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
      return;
    }
    var params = message.params || {};
    if (message.method === "ui/notifications/tool-input") toolInput(params.arguments || {});
    else if (message.method === "ui/notifications/tool-result") toolResult(params);
    else if (message.method === "ui/notifications/tool-cancelled") say("The request was cancelled." + (params.reason ? " " + params.reason : ""));
    else if (message.method === "ui/notifications/host-context-changed") applyContext(params);
  });

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === "text") node.textContent = String(value);
      else if (key === "class") node.className = value;
      else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    (children || []).forEach(function (child) { if (child !== null && child !== undefined && child !== false) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child); });
    return node;
  }
  function icon(kind) { var holder = document.createElement("span"); holder.innerHTML = ICONS[kind] || ICONS["search-console"]; return holder.firstChild; }
  function say(text) { status.textContent = text || ""; }
  function show(nodes) { view.replaceChildren.apply(view, nodes.filter(Boolean)); }
  function plural(count, word) { return number.format(count) + " " + word + (count === 1 ? "" : /(s|x|ch|sh)$/.test(word) ? "es" : "s"); }
  function day(iso) { var at = new Date(iso); return isNaN(at.getTime()) ? "" : at.toLocaleDateString(undefined, { dateStyle: "medium" }); }

  // A tool result carries { result } or { error } in structuredContent, and the same JSON as text.
  function unwrap(callResult) {
    var data = callResult && callResult.structuredContent;
    if (!data && callResult && callResult.content && callResult.content[0] && callResult.content[0].type === "text") { try { data = JSON.parse(callResult.content[0].text); } catch (error) { data = null; } }
    if (callResult && callResult.isError || !data || data.error) throw new Error(data && data.error && data.error.message || "Folio couldn’t answer that.");
    return data.result;
  }
  function callTool(name, args) { return request("tools/call", { name: name, arguments: args }).then(unwrap); }
  function openLink(url) {
    var full; try { full = new URL(url, state.base); } catch (error) { return; }
    if (full.protocol !== "https:" && full.protocol !== "http:") return;
    request("ui/open-link", { url: full.toString() }).catch(function () { say("The link couldn’t be opened here: " + full.toString()); });
  }

  function toolInput(args) {
    if (typeof args.q === "string") field.value = args.q;
    say(args.websiteId ? "Reading the website’s report…" : "Searching your Folio…");
  }
  function toolResult(callResult) {
    var result;
    try { result = unwrap(callResult); } catch (error) { say(error.message); return; }
    if (result && Array.isArray(result.items) && "truncated" in result) renderFind(result);
    else if (result && result.website && Array.isArray(result.gaps)) renderReport(result, false);
    else say("Folio returned something this view doesn’t show.");
  }

  function search(query) {
    var mine = ++state.seq;
    say("Searching your Folio…");
    callTool("folio_find", query ? { q: query } : {}).then(function (result) { if (mine === state.seq) renderFind(result); })
      .catch(function (error) { if (mine === state.seq) say(error.message); });
  }
  field.addEventListener("input", function () { clearTimeout(state.timer); state.timer = setTimeout(function () { search(field.value.trim()); }, 250); });
  field.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    var first = view.querySelector(".row");
    if (first && state.find && !state.report && !state.org) first.click(); else search(field.value.trim());
  });

  function renderFind(result) {
    state.find = result; state.org = null; state.report = null;
    if (result.query && document.activeElement !== field) field.value = result.query;
    if (result.items[0]) { try { state.base = new URL(result.items[0].url).origin; } catch (error) { /* keep the default */ } }
    say(result.items.length ? (result.query ? plural(result.items.length, "match") : "Everything you can open in Folio.") : "");
    if (!result.items.length) { show([el("p", { class: "empty", text: result.query ? "Nothing in your Folio matches “" + result.query + "”. Try a domain, or clear the search." : "Nothing saved yet. Add a website in Folio first." })]); return; }
    var list = el("ul", { class: "list", "aria-label": result.query ? "Matches" : "Your Folio" }, result.items.map(function (item) {
      var action = item.kind === "website" ? "What it’s missing" : item.kind === "organization" ? "Shared websites" : "Open in Folio ↗";
      return el("li", null, [el("button", { type: "button", class: "row", "data-kind": item.kind, onclick: function () {
        if (item.kind === "website") openReport(item.websiteId, item.title);
        else if (item.kind === "organization") openOrganization(item.organizationId, item.title);
        else openLink(item.url);
      } }, [icon(item.kind), el("span", null, [el("strong", { text: item.title }), el("small", { text: item.detail })]), el("span", { class: "row-action", text: action })])]);
    }));
    show([list, result.truncated ? el("p", { class: "note", text: "Showing the first matches. Type to narrow them down." }) : null]);
  }

  function openOrganization(id, name) {
    say("Reading " + name + "…");
    callTool("folio_organizations", {}).then(function (result) {
      var org = (result.items || []).filter(function (item) { return item.id === id; })[0];
      if (!org) { say(name + " isn’t one of your organizations any more."); return; }
      state.org = org; state.report = null; say("");
      show([back(), el("div", null, [el("h2", { text: org.name }), el("p", { class: "sub", text: (org.role === "owner" ? "You own it" : "You’re a member") + " · " + plural(org.members.length, "member") })]),
        org.websites.length ? el("ul", { class: "list", "aria-label": "Shared websites" }, org.websites.map(function (site) {
          return el("li", null, [el("button", { type: "button", class: "row", "data-kind": "website", onclick: function () { openReport(site.websiteId, site.domain); } },
            [icon("website"), el("span", null, [el("strong", { text: site.domain }), el("small", { text: "Shared by " + site.sharedBy })]), el("span", { class: "row-action", text: "What it’s missing" })])]);
        })) : el("p", { class: "empty", text: "No website is shared with " + org.name + " yet." })]);
    }).catch(function (error) { say(error.message); });
  }

  function openReport(websiteId, title) {
    say("Reading what " + title + " is missing…");
    callTool("folio_website_gaps", { websiteId: websiteId }).then(function (report) {
      renderReport(report, true);
      // Tell the agent what the person is looking at, so a follow-up question has the context.
      request("ui/update-model-context", { content: [{ type: "text", text: "In the Folio app, the person opened the report for " + report.website.domain + " (websiteId " + report.website.id + "). " + report.summary +
        (report.gaps.length ? " Gaps: " + report.gaps.map(function (gap) { return gap.title; }).join("; ") + "." : "") }] }).catch(function () {});
    }).catch(function (error) { say(error.message); });
  }

  function back() {
    if (!state.find && !state.org) return null;
    var org = state.report && state.org;
    return el("button", { type: "button", class: "back", text: org ? "← " + state.org.name : "← Your Folio", onclick: function () {
      if (org) openOrganization(state.org.id, state.org.name); else if (state.find) renderFind(state.find);
    } });
  }
  function measure(value, unit) { return value && value.state === "value" && value.value !== null ? number.format(value.value) + unit : value && value.state === "none" ? "None" : "Not measured"; }

  function renderReport(report, inApp) {
    state.report = report; say(inApp ? "" : "");
    var site = report.website, google = report.google, ai = report.aiAnswers;
    var pageOne = google.bands.top3 + google.bands.page1;
    var access = site.access === "organization" ? "Shared with you through " + site.organizations.map(function (org) { return org.name; }).join(", ") : "Your website";
    var gaps = report.gaps.map(function (gap) {
      return el("li", { class: "gap" }, [
        el("p", null, [el("span", { class: "chip " + gap.severity, text: gap.severity === "high" ? "High" : gap.severity === "medium" ? "Medium" : "Low" }), el("strong", { text: gap.title })]),
        el("p", { text: gap.finding }),
        el("p", { class: "next", text: "Next: " + gap.nextStep }),
        gap.evidence.length ? el("div", { class: "links" }, gap.evidence.slice(0, 4).map(function (item) { return el("button", { type: "button", class: "link", text: item.label, onclick: function () { openLink(item.url); } }); })) : null,
        el("div", { class: "actions" }, [el("button", { type: "button", class: "button primary", text: "Ask my agent to fix this", onclick: function () {
          // content is an array of blocks in the schema hosts validate against (the spec's prose shows one object).
          request("ui/message", { role: "user", content: [{ type: "text", text: "Use Folio to fix this gap on " + site.domain + " (websiteId " + site.id + "): " + gap.title + ". " + gap.finding + " Suggested next step: " + gap.nextStep +
            " Read folio_website_gaps first, propose specific edits, and wait for my approval before changing anything." }] })
            .then(function () { say("Sent to your agent."); }).catch(function () { say("This app can’t send messages here. Ask your agent to fix “" + gap.title + "”."); });
        } })])
      ]);
    });
    var searches = google.searches.slice(0, 10);
    show([
      back(),
      el("div", null, [el("h2", { text: site.domain }), el("p", { class: "sub", text: access + " · read " + day(report.generatedAt) })]),
      el("p", { class: "summary", text: report.summary }),
      el("div", { class: "metrics" }, [
        el("div", { class: "metric" }, [el("span", { text: "Google page one" }), el("b", { text: google.state === "tracked" ? pageOne + " of " + plural(google.tracked, "search") : google.state === "none_tracked" ? "No searches found" : "Not measured" })]),
        el("div", { class: "metric" }, [el("span", { text: "Linking websites" }), el("b", { text: measure(report.search.referringDomains, "") })]),
        el("div", { class: "metric" }, [el("span", { text: "Search visits a month" }), el("b", { text: measure(report.search.estimatedMonthlyVisits, "") })]),
        el("div", { class: "metric" }, [el("span", { text: "Named in AI answers" }), el("b", { text: ai.publishedQuestions === null ? "Not measured" : number.format(ai.namedIn) + " of " + number.format(ai.publishedQuestions) })])
      ]),
      el("h3", { text: report.gaps.length ? "What it’s missing (" + report.gaps.length + ")" : "No gaps found in the saved data" }),
      report.gaps.length ? el("ul", { class: "gaps" }, gaps) : null,
      searches.length ? el("h3", { text: "Google searches that show it" }) : null,
      searches.length ? el("table", null, [el("thead", null, [el("tr", null, [el("th", { text: "Search" }), el("th", { class: "n", text: "Position" }), el("th", { class: "n", text: "Searches a month" })])]),
        el("tbody", null, searches.map(function (row) {
          return el("tr", null, [el("td", { text: row.keyword }), el("td", { class: "n band-" + row.band, text: "#" + row.position }), el("td", { class: "n", text: row.searchVolume === null ? "–" : number.format(row.searchVolume) })]);
        }))]) : null,
      report.notChecked.length ? el("h3", { text: "Not checked yet" }) : null,
      report.notChecked.length ? el("ul", { class: "unknown" }, report.notChecked.map(function (item) { return el("li", { text: item.title + ": " + item.detail }); })) : null,
      el("div", { class: "actions" }, [el("button", { type: "button", class: "button", text: "Open in Folio ↗", onclick: function () { openLink("/websites?site=" + encodeURIComponent(site.id)); } })]),
      el("p", { class: "note", text: report.howToRead })
    ]);
  }

  function applyContext(context) {
    if (!context) return;
    var root = document.documentElement;
    if (context.theme === "dark" || context.theme === "light") root.setAttribute("data-theme", context.theme);
    var variables = context.styles && context.styles.variables;
    if (variables) Object.keys(variables).forEach(function (name) { if (/^--[a-z0-9-]+$/.test(name) && typeof variables[name] === "string") root.style.setProperty(name, variables[name]); });
    var fonts = context.styles && context.styles.css && context.styles.css.fonts;
    if (typeof fonts === "string") { var style = document.getElementById("host-fonts") || document.head.appendChild(el("style", { id: "host-fonts" })); style.textContent = fonts; }
    var box = context.containerDimensions;
    if (box && typeof box.maxHeight === "number") root.style.maxHeight = box.maxHeight + "px";
  }

  // Report the content size so a flexible-height host can fit the frame to it. The document's own scrollHeight
  // never drops below the frame, so measure the content, or the frame could grow but never shrink.
  var last = "", content = document.querySelector("main");
  function reportSize() {
    var box = content.getBoundingClientRect(), width = Math.ceil(document.documentElement.scrollWidth), height = Math.ceil(box.height), key = width + "x" + height;
    if (key !== last) { last = key; notify("ui/notifications/size-changed", { width: width, height: height }); }
  }

  request("ui/initialize", { appInfo: { name: "folio", version: "1.0.0" }, appCapabilities: { availableDisplayModes: ["inline"] }, protocolVersion: "2026-01-26" })
    .then(function (result) {
      applyContext(result && result.hostContext);
      notify("ui/notifications/initialized", {});
      say("Waiting for Folio…");
      if (window.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(reportSize); }).observe(content);
      reportSize();
    })
    .catch(function () { say("This view opens inside an AI agent that supports MCP Apps, such as Claude Desktop or VS Code."); });
})();
</script>
</body>
</html>`;
