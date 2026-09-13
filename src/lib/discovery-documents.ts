/** Pure observations of supplied documents. Never fetch, follow links, or execute document instructions. */
export const DISCOVERY_DOCUMENT_VERSION = "discovery-documents-v1";
export const DISCOVERY_DOCUMENT_KINDS = ["robots.txt", "llms.txt", "llms-full.txt", "sitemap.xml"] as const;
export type DiscoveryDocumentKind = (typeof DISCOVERY_DOCUMENT_KINDS)[number];
export const DISCOVERY_DOCUMENT_LIMITS: Record<DiscoveryDocumentKind, number> = {
  "robots.txt": 512_000, "llms.txt": 256_000, "llms-full.txt": 2_000_000, "sitemap.xml": 2_000_000,
};
export const DISCOVERY_LINK_LIMIT = 200;
export const DISCOVERY_DOCUMENT_SOURCES = {
  "robots.txt": "https://www.rfc-editor.org/rfc/rfc9309.html",
  "llms.txt": "https://llmstxt.org/",
  "llms-full.txt": "https://llmstxt.org/changes.html",
  "sitemap.xml": "https://www.sitemaps.org/protocol.html",
} as const;

export type DiscoveryDocumentInput = {
  kind: DiscoveryDocumentKind;
  url: string;
  httpStatus?: number | null;
  contentType?: string | null;
  body?: string | null;
  /** Classified by the fetcher; raw network errors and credentials do not belong here. */
  failure?: "blocked" | "timeout" | "network" | "too-large";
  truncated?: boolean;
};
export type DiscoveryDocumentStatus = "usable" | "missing" | "blocked" | "malformed" | "unavailable" | "limited";
export type DiscoveryMarkdownDetails = {
  format: "markdown"; title: string | null; summary: string | null; sectionTitles: string[];
  linkCount: number; links: { label: string; url: string; external: boolean }[]; linksTruncated: boolean;
};
export type DiscoveryRobotsDetails = {
  format: "robots"; atOriginRoot: boolean; groupCount: number; userAgents: string[];
  allowCount: number; disallowCount: number; emptyRuleCount: number; malformedLineCount: number;
  unknownDirectiveCount: number; sitemapUrls: string[]; referencesTruncated: boolean; policyEvaluated: false;
};
export type DiscoverySitemapDetails = {
  format: "urlset" | "sitemapindex"; entryCount: number; validUrlCount: number; invalidEntryCount: number;
  urls: string[]; urlsTruncated: boolean; externalUrlCount: number; schemaValidated: false;
};
export type DiscoveryDocumentAnalysis = {
  version: typeof DISCOVERY_DOCUMENT_VERSION; kind: DiscoveryDocumentKind; url: string;
  status: DiscoveryDocumentStatus; httpStatus: number | null; bytes: number | null; limitBytes: number;
  experimental: boolean; scored: false; summary: string; warnings: string[]; limitations: string[];
  details: DiscoveryMarkdownDetails | DiscoveryRobotsDetails | DiscoverySitemapDetails | null;
};

function webUrl(value: string, base?: string): string | null {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function withoutInlineCode(text: string): string {
  const runs = [...text.matchAll(/`+/g)];
  const following = new Map<number, number>(), pairs = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index--) {
    const next = following.get(runs[index][0].length);
    if (next !== undefined) pairs.set(index, next);
    following.set(runs[index][0].length, index);
  }
  let output = "", offset = 0;
  for (let index = 0; index < runs.length; index++) {
    const end = pairs.get(index);
    if (end === undefined) continue;
    output += text.slice(offset, runs[index].index);
    offset = runs[end].index + runs[end][0].length; index = end;
  }
  return output + text.slice(offset);
}

function markdown(body: string, source: string, full: boolean): { status: DiscoveryDocumentStatus; summary: string; warnings: string[]; details: DiscoveryMarkdownDetails } {
  const lines: string[] = []; let fence: string | null = null;
  for (const line of body.split(/\r\n|\n|\r/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = null; continue; }
    if (!fence) lines.push(line);
  }
  const text = lines.join("\n");
  const headings = [...text.matchAll(/^ {0,3}#\s+(.+?)(?:\s+#+)?\s*$/gm)].map(match => match[1].trim());
  const summary = text.match(/(?:^|\n)((?: {0,3}>[^\n]*(?:\n|$))+)/)?.[1].split("\n").map(line => line.replace(/^ {0,3}>\s?/, "")).join(" ").trim() || null;
  const details: DiscoveryMarkdownDetails = { format: "markdown", title: headings[0]?.slice(0, 300) ?? null,
    summary: summary?.slice(0, 1000) ?? null, sectionTitles: [...text.matchAll(/^ {0,3}##\s+(.+?)\s*$/gm)].slice(0, 100).map(match => match[1].slice(0, 300)),
    linkCount: 0, links: [], linksTruncated: false };
  const warnings: string[] = []; let invalidLinks = 0;
  // A bounded subset of Markdown inline links; code fences and inline code are excluded.
  const prose = withoutInlineCode(text);
  for (const match of prose.matchAll(/(?<!!)\[([^\]\n]{1,300})\]\(\s*(<[^>\n]+>|[^()\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g)) {
    const href = match[2].startsWith("<") ? match[2].slice(1, -1) : match[2];
    // Exclude destination syntax this bounded reader cannot decode faithfully.
    const url = /\\|&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(href) ? null : webUrl(href, source);
    if (!url) { invalidLinks++; continue; }
    details.linkCount++;
    if (details.links.length < DISCOVERY_LINK_LIMIT) details.links.push({ label: match[1], url, external: new URL(url).origin !== new URL(source).origin });
    else details.linksTruncated = true;
  }
  if (!details.title) warnings.push(full ? "No Markdown H1 title was observed; a descriptive title may help readers." : "The llms.txt proposal requires a Markdown H1 naming the site or project.");
  else if (!full && lines.find(line => line.trim())?.trim().startsWith("# ")) { /* Expected first section. */ }
  else if (!full) warnings.push("The H1 is not the first content section; the proposal places it first.");
  if (!full && headings.length > 1) warnings.push("More than one H1 was observed; the proposal uses one opening site title.");
  if (!details.summary) warnings.push("No blockquote summary was observed. A short summary is useful but optional.");
  if (!details.linkCount) warnings.push("No supported inline document links were observed. Linked detail is useful but not required.");
  if (invalidLinks) warnings.push(`${invalidLinks} inline links were not retained because their destinations were unsafe or used unsupported Markdown escapes or entities.`);
  if (details.linksTruncated) warnings.push(`Only the first ${DISCOVERY_LINK_LIMIT} links are retained; none were fetched.`);
  if (fence) warnings.push("An unclosed fenced code block was observed.");
  const status = !body.trim() || (!full && !details.title) ? "malformed" : "usable";
  return { status, summary: status === "usable" ? `${full ? "Optional full-text document" : "llms.txt title"} observed; ${details.linkCount} supported document links found.` : "The supplied content did not provide the expected llms.txt title or readable document.", warnings, details };
}

function robots(body: string, source: string): { status: DiscoveryDocumentStatus; summary: string; warnings: string[]; details: DiscoveryRobotsDetails } {
  const details: DiscoveryRobotsDetails = { format: "robots", atOriginRoot: new URL(source).pathname === "/robots.txt", groupCount: 0,
    userAgents: [], allowCount: 0, disallowCount: 0, emptyRuleCount: 0, malformedLineCount: 0,
    unknownDirectiveCount: 0, sitemapUrls: [], referencesTruncated: false, policyEvaluated: false };
  const agents = new Set<string>(); let hasGroup = false, groupHasRules = false, recognized = 0, invalidSitemaps = 0;
  for (const original of body.split(/\r\n|\n|\r/)) {
    const line = original.split("#", 1)[0].trim(); if (!line) continue;
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) { details.malformedLineCount++; continue; }
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === "user-agent") {
      if (!/^(?:\*|[a-z_-]+)$/i.test(value)) { details.malformedLineCount++; continue; }
      if (!hasGroup || groupHasRules) { details.groupCount++; hasGroup = true; groupHasRules = false; }
      agents.add(value); recognized++;
    } else if (key === "allow" || key === "disallow") {
      if (!hasGroup || (value !== "" && !/^[/*]/.test(value)) || /[\u0000-\u001f\u007f]/.test(value)) { details.malformedLineCount++; continue; }
      groupHasRules = true; recognized++;
      if (key === "allow") details.allowCount++; else details.disallowCount++;
      if (!value) details.emptyRuleCount++;
    } else if (key === "sitemap") {
      const url = value.length < 2048 ? webUrl(value) : null;
      if (!url) { invalidSitemaps++; continue; }
      recognized++;
      if (details.sitemapUrls.length < DISCOVERY_LINK_LIMIT) details.sitemapUrls.push(url); else details.referencesTruncated = true;
    } else details.unknownDirectiveCount++;
  }
  details.userAgents = [...agents].slice(0, DISCOVERY_LINK_LIMIT);
  if (agents.size > DISCOVERY_LINK_LIMIT) details.referencesTruncated = true;
  const warnings: string[] = [];
  if (!details.atOriginRoot) warnings.push("The supplied document is not at /robots.txt on its origin; this does not establish an origin-wide robots file.");
  if (!details.groupCount) warnings.push("No user-agent group was observed. No crawler access decision has been inferred.");
  if (details.malformedLineCount) warnings.push(`${details.malformedLineCount} lines could not be interpreted; parseable directives are retained separately.`);
  if (details.unknownDirectiveCount) warnings.push(`${details.unknownDirectiveCount} other records were observed but not interpreted.`);
  if (invalidSitemaps) warnings.push(`${invalidSitemaps} Sitemap references were invalid or unsafe.`);
  if (details.referencesTruncated) warnings.push(`Reference lists retain at most ${DISCOVERY_LINK_LIMIT} values.`);
  return { status: !recognized && (details.malformedLineCount > 0 || invalidSitemaps > 0) ? "malformed" : "usable",
    summary: `${details.groupCount} user-agent groups, ${details.allowCount} Allow and ${details.disallowCount} Disallow records observed. Crawler policy was not evaluated.`, warnings, details };
}

class XmlObservationError extends Error {
  constructor(message: string, readonly limited = false) { super(message); }
}
function xmlText(value: string): string {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(value)) throw new XmlObservationError("XML contains an unknown or unescaped entity.");
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, entity => {
    const names: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    if (names[entity]) return names[entity];
    const code = entity[2]?.toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    if (!Number.isInteger(code) || !(code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff))
      throw new XmlObservationError("XML contains an invalid character reference.");
    return String.fromCodePoint(code);
  });
}

/** Small XML observation reader: no DTD, entities, external resources, or schema validation. */
function sitemap(body: string, source: string): { status: DiscoveryDocumentStatus; summary: string; warnings: string[]; details: DiscoverySitemapDetails } {
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) throw new XmlObservationError("DTD and entity declarations are not supported; no external entities were resolved.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/u.test(body)) throw new XmlObservationError("XML contains an invalid literal character.");
  const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
  type Frame = { name: string; local: string; namespace: string; namespaces: Record<string, string>; text: string; children: number; locs: number; validLocs: number; entry: boolean; loc: boolean };
  const stack: Frame[] = []; let offset = 0, roots = 0, nodes = 0;
  const details: DiscoverySitemapDetails = { format: "urlset", entryCount: 0, validUrlCount: 0, invalidEntryCount: 0,
    urls: [], urlsTruncated: false, externalUrlCount: 0, schemaValidated: false };
  function content(text: string, cdata = false) {
    if (!cdata && (text.includes("<") || text.includes("]]>"))) throw new XmlObservationError("XML contains malformed markup.");
    const decoded = cdata ? text : xmlText(text);
    if (!stack.length && decoded.trim()) throw new XmlObservationError("XML has content outside its document root.");
    if (stack.at(-1)?.loc) stack.at(-1)!.text += decoded;
  }
  function close(frame: Frame) {
    if (frame.loc) {
      const parent = stack.at(-1)!; parent.locs++;
      const value = frame.text.trim(), url = frame.children === 0 && value.length < 2048 ? webUrl(value) : null;
      if (url) {
        parent.validLocs++; details.validUrlCount++;
        if (details.urls.length < DISCOVERY_LINK_LIMIT) details.urls.push(url); else details.urlsTruncated = true;
        if (new URL(url).origin !== new URL(source).origin) details.externalUrlCount++;
      }
    }
    if (frame.entry) { details.entryCount++; if (frame.locs !== 1 || frame.validLocs !== 1) details.invalidEntryCount++; }
  }
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_](?:"[^"<]*"|'[^'<]*'|[^<>"'])*>/g;
  for (const match of body.matchAll(tokens)) {
    content(body.slice(offset, match.index)); offset = match.index + match[0].length;
    const token = match[0];
    if (token.startsWith("<!--")) { if (token.slice(4, -3).includes("--")) throw new XmlObservationError("XML contains a malformed comment."); continue; }
    if (token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) { content(token.slice(9, -3), true); continue; }
    if (token.startsWith("</")) {
      const name = token.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/)?.[1];
      const frame = stack.pop(); if (!frame || frame.name !== name) throw new XmlObservationError("XML closing tags do not match."); close(frame); continue;
    }
    if (++nodes > 100_000 || stack.length >= 32) throw new XmlObservationError("XML exceeds the bounded node or nesting limit.", true);
    const parts = token.match(/^<([A-Za-z_][\w:.-]*)([\s\S]*?)\s*(\/?)>$/);
    if (!parts) throw new XmlObservationError("XML contains an unsupported tag.");
    const attributes: Record<string, string> = Object.create(null); let remainder = parts[2];
    while (remainder.trim()) {
      const attribute = remainder.match(/^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/);
      if (!attribute || Object.hasOwn(attributes, attribute[1])) throw new XmlObservationError("XML contains malformed or duplicate attributes.");
      attributes[attribute[1]] = xmlText(attribute[2] ?? attribute[3]); remainder = remainder.slice(attribute[0].length);
    }
    const parent = stack.at(-1), namespaces: Record<string, string> = Object.assign(Object.create(null), parent?.namespaces ?? { xml: "http://www.w3.org/XML/1998/namespace" });
    for (const [key, value] of Object.entries(attributes)) if (key === "xmlns") namespaces[""] = value; else if (key.startsWith("xmlns:")) namespaces[key.slice(6)] = value;
    for (const key of Object.keys(attributes)) {
      const names = key.split(":");
      if (names.length > 2 || names.length === 2 && names[0] !== "xmlns" && !namespaces[names[0]]) throw new XmlObservationError("XML uses an undeclared attribute namespace prefix.");
    }
    const names = parts[1].split(":"); if (names.length > 2 || names.length === 2 && !namespaces[names[0]]) throw new XmlObservationError("XML uses an undeclared namespace prefix.");
    const local = names.at(-1)!, uri = namespaces[names.length === 2 ? names[0] : ""] ?? "";
    if (!parent) {
      if (++roots !== 1 || !["urlset", "sitemapindex"].includes(local) || uri !== namespace) throw new XmlObservationError("Expected one urlset or sitemapindex root in the Sitemap protocol namespace.");
      details.format = local as DiscoverySitemapDetails["format"];
    } else parent.children++;
    const entryName = details.format === "urlset" ? "url" : "sitemap";
    const entry = stack.length === 1 && local === entryName && uri === namespace;
    if (stack.length === 1 && uri === namespace && !entry) throw new XmlObservationError("The Sitemap root contains an unexpected protocol element.");
    const frame: Frame = { name: parts[1], local, namespace: uri, namespaces, text: "", children: 0, locs: 0, validLocs: 0, entry,
      loc: Boolean(parent?.entry && local === "loc" && uri === namespace) };
    if (parts[3]) close(frame); else stack.push(frame);
  }
  content(body.slice(offset));
  if (stack.length || roots !== 1) throw new XmlObservationError("XML is incomplete or has no Sitemap document root.");
  const warnings: string[] = [];
  if (!details.entryCount) warnings.push("No URL entries were observed in this document.");
  if (details.invalidEntryCount) warnings.push(`${details.invalidEntryCount} entries lacked exactly one valid absolute HTTP(S) loc value.`);
  if (details.urlsTruncated) warnings.push(`Only the first ${DISCOVERY_LINK_LIMIT} URLs are retained; all ${details.entryCount} entries in this bounded document were counted.`);
  if (details.externalUrlCount) warnings.push(`${details.externalUrlCount} URL values use a different origin. Cross-site submission authority was not checked.`);
  if (details.entryCount > 50_000) warnings.push("The document exceeds the Sitemap protocol's 50,000-entry limit.");
  return { status: details.invalidEntryCount || details.entryCount > 50_000 ? "malformed" : "usable", summary: `${details.entryCount} ${details.format === "sitemapindex" ? "sitemap references" : "page entries"} observed; no listed URLs were fetched.`, warnings, details };
}

export function analyzeDiscoveryDocument(input: DiscoveryDocumentInput): DiscoveryDocumentAnalysis {
  const source = webUrl(input.url);
  if (!source || !DISCOVERY_DOCUMENT_KINDS.includes(input.kind)) throw new TypeError("Use a supported document kind and an absolute HTTP(S) source URL without credentials.");
  const experimental = input.kind === "llms.txt" || input.kind === "llms-full.txt";
  const result: DiscoveryDocumentAnalysis = { version: DISCOVERY_DOCUMENT_VERSION, kind: input.kind, url: source,
    status: "unavailable", httpStatus: input.httpStatus ?? null, bytes: null, limitBytes: DISCOVERY_DOCUMENT_LIMITS[input.kind],
    experimental, scored: false, summary: "No complete document was supplied.", warnings: [], details: null,
    limitations: ["Presence or structure does not establish indexing, search ranking, model citations, or successful agent use.", "Document instructions and linked destinations were not executed or fetched."] };
  if (input.kind === "robots.txt") result.limitations.push("This is a directive inventory, not a complete RFC 9309 crawler-policy implementation or access authorization.");
  if (experimental) result.limitations.push(input.kind === "llms.txt" ? "llms.txt is an optional community proposal; summaries and links are optional. Only supported Markdown patterns are observed." : "llms-full.txt is an optional full-text publishing convention, not a required section of the llms.txt v2 proposal.");
  if (input.kind === "sitemap.xml") result.limitations.push("This checks bounded XML structure and loc entries, not full XSD validity, coverage, lastmod accuracy, submission ownership, or indexing.");
  const finish = (status: DiscoveryDocumentStatus, summary: string) => ({ ...result, status, summary });
  if (input.failure === "blocked" || [401, 403, 429].includes(input.httpStatus ?? 0)) return finish("blocked", "The document was blocked or rate-limited; its contents are unmeasured.");
  if ([404, 410].includes(input.httpStatus ?? 0)) return finish("missing", "The requested document was not found at this URL.");
  if (input.failure === "too-large" || input.truncated) return finish("limited", "The capture was incomplete or exceeded its bound; document validity is unmeasured.");
  if (input.failure || input.httpStatus !== undefined && input.httpStatus !== null && (input.httpStatus < 200 || input.httpStatus >= 300))
    return finish("unavailable", "The request did not supply a successful document response.");
  if (typeof input.body !== "string") return result;
  if (input.body.length > result.limitBytes) return finish("limited", "The supplied document exceeds the analysis byte limit; it was not parsed.");
  result.bytes = new TextEncoder().encode(input.body).byteLength;
  if (result.bytes > result.limitBytes) return finish("limited", "The supplied document exceeds the analysis byte limit; it was not parsed.");
  const body = input.body.replace(/^\uFEFF/, "");
  const title = body.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1].trim() ?? "";
  if (/^(?:Client Challenge|Just a moment|Attention Required|Access Denied|Robot Check)/i.test(title)) return finish("blocked", "An access challenge was returned instead of the requested document.");
  const documentStart = body.replace(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*/i, "");
  if (/^(?:<!doctype\s+html|<(?:html|head|body)\b)/i.test(documentStart)
    || /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(input.contentType ?? "") && documentStart.startsWith("<"))
    return finish("malformed", "HTML was returned instead of the requested text or XML document.");
  if (/^\s*(?:#\s*|error:\s*)?(?:404\s+not found|not found|403\s+forbidden|access denied)\s*$/i.test(body)
    || /^\s*\{\s*"error"\s*:\s*"(?:not found|forbidden|access denied)"\s*\}\s*$/i.test(body)) return finish("malformed", "An error message was returned instead of the requested document.");
  if (/\u0000/.test(body)) return finish("malformed", "The document contains a null character and is not supported text.");
  const media = input.contentType?.split(";")[0].trim().toLowerCase();
  const expectedMedia = input.kind === "sitemap.xml" ? ["application/xml", "text/xml"] : input.kind === "robots.txt" ? ["text/plain"] : ["text/plain", "text/markdown"];
  if (!media || !expectedMedia.includes(media)) result.warnings.push("The Content-Type is missing or differs from the expected document media type; analysis uses the supplied content.");
  try {
    const parsed = input.kind === "robots.txt" ? robots(body, source) : input.kind === "sitemap.xml" ? sitemap(body, source) : markdown(body, source, input.kind === "llms-full.txt");
    return { ...result, ...parsed, warnings: [...result.warnings, ...parsed.warnings] };
  } catch (error) {
    if (error instanceof XmlObservationError) return finish(error.limited ? "limited" : "malformed", error.message);
    throw error;
  }
}
