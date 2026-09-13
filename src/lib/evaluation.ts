/** A reproducible page-readiness rubric, independent of any model provider. */
export const EVALUATION_VERSION = "readiness-v1";

export type CheckStatus = "pass" | "warning" | "fail" | "optional";

export type EvaluationCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  points: number;
  maxPoints: number;
  evidence?: string;
  sourceUrl?: string;
};

export type RepairPatch = {
  id: string;
  title: string;
  target: string;
  type: "html" | "json" | "text";
  before: string;
  after: string;
  reason: string;
};

export const evaluationMethodology = {
  version: EVALUATION_VERSION,
  name: "Website readiness",
  summary:
    "A deterministic, source-backed audit of one public HTML page. The score measures the checks below, not search position or AI recommendations.",
  scope:
    "One submitted page, with optional robots.txt and llms.txt observations. JavaScript is not executed; links are not crawled.",
  formula:
    "Sum of earned points, from 0 to 100. Optional files contribute zero points. Equal scores share a rank.",
  weights: [
    { id: "title", label: "Page title", weight: 15 },
    { id: "description", label: "Meta description", weight: 10 },
    { id: "headings", label: "Primary heading", weight: 10 },
    { id: "canonical", label: "Canonical URL", weight: 10 },
    { id: "indexability", label: "Indexing directive", weight: 10 },
    { id: "https", label: "HTTPS delivery", weight: 10 },
    { id: "readable-content", label: "Readable content", weight: 10 },
    { id: "image-alt", label: "Image alternatives", weight: 10 },
    { id: "internal-links", label: "Internal links", weight: 5 },
    { id: "structured-data", label: "Structured data", weight: 10 },
  ],
  rules: [
    "Title: 15 points for one nonempty title of 15–65 characters; 8 for another nonempty title; 0 if missing.",
    "Description: 10 points for one meta description of 50–170 characters; 5 for another nonempty description; 0 if missing.",
    "Primary heading: 10 points for one nonempty H1; 5 for multiple; 0 for none.",
    "Canonical: 10 points for one HTTP(S) canonical matching the final page URL, ignoring fragments and trailing slashes; 5 for another valid canonical; 0 if missing or invalid.",
    "Indexing directive: 10 points when no noindex/none token is observed in robots or Googlebot meta tags or X-Robots-Tag; 0 otherwise. This does not establish crawl access or inclusion in any search index.",
    "HTTPS: 10 points for a final HTTPS URL; 0 otherwise.",
    "Readable content: 10 points for at least 200 visible words; 5 for 50–199; 0 for fewer. This is a text-availability heuristic, not an assessment of prose quality.",
    "Image alternatives: 10 points if every image has an alt attribute, including intentionally empty decorative alternatives, or no images are present; 5 if at least half do; 0 otherwise. Alternative accuracy is not verified.",
    "Internal links: 5 points when at least one HTML anchor links to another path on the same origin; 0 otherwise.",
    "Structured data: 10 points when every JSON-LD block parses and at least one has a schema.org context and typed entity, including an @graph entity; 5 when some JSON-LD parses but these conditions are not met; 0 if no block parses. This is not full schema validation or rich-result eligibility.",
  ],
  limitations: [
    "This version does not measure search rankings, model citations, factual accuracy, conversion, traffic, or accessibility conformance.",
    "Results describe fetched HTML at the displayed time. Bot challenges, client-rendered content, and parser limitations can affect observations.",
    "A public leaderboard contains explicitly published scans; it is a submitted sample, not a comprehensive market ranking.",
    "A separate agent-reader experiment requires recorded prompts, provider and model versions, repeated trials, evidence and uncertainty. Those results must not be folded into this deterministic score.",
  ],
} as const;

function decodeEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (match, entity: string) => {
      const entities: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
      };
      if (!entity.startsWith("#"))
        return entities[entity.toLowerCase()] ?? match;
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : "�";
    },
  );
}

function plainText(html: string) {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const match of tag.matchAll(
    /([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
  )) {
    const key = match[1].toLowerCase();
    if (!(key in result))
      result[key] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function htmlEscape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function normalizedPageUrl(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.href;
}

function hasSchemaEntity(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const context = JSON.stringify(item["@context"] ?? "");
  const hasType =
    typeof item["@type"] === "string" ||
    (Array.isArray(item["@type"]) &&
      item["@type"].some((type) => typeof type === "string"));
  const graphHasType =
    Array.isArray(item["@graph"]) &&
    item["@graph"].some(
      (child) =>
        child &&
        typeof child === "object" &&
        typeof child["@type"] === "string",
    );
  return (
    /https?:\/\/schema\.org\/?(?:["\s]|$)/i.test(context) &&
    (hasType || graphHasType)
  );
}

export function evaluateHtml(
  html: string,
  url: string,
  headers: Headers = new Headers(),
) {
  const page = new URL(url);
  // Scripts/comments cannot contribute headings, links or visible text.
  const document = html.replace(/<!--[\s\S]*?-->/g, "");
  const withoutScripts = document.replace(
    /<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  const titles = [
    ...withoutScripts.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi),
  ]
    .map((match) => plainText(match[1]))
    .filter(Boolean);
  const title = titles[0] ?? "";
  const metas = [...withoutScripts.matchAll(/<meta\b[^>]*>/gi)].map((match) =>
    attributes(match[0]),
  );
  const descriptions = metas.filter(
    (meta) =>
      meta.name?.toLowerCase() === "description" && meta.content?.trim(),
  );
  const description = descriptions[0]?.content.trim() ?? "";
  const headings = [
    ...withoutScripts.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi),
  ]
    .map((match) => plainText(match[1]))
    .filter(Boolean);
  const canonicals = [...withoutScripts.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => attributes(match[0]))
    .filter((link) =>
      link.rel?.toLowerCase().split(/\s+/).includes("canonical"),
    );
  let canonical = "";
  try {
    const target = canonicals[0]?.href && new URL(canonicals[0].href, url);
    if (
      target &&
      /^https?:$/.test(target.protocol) &&
      !target.username &&
      !target.password
    )
      canonical = target.href;
  } catch {
    /* An invalid canonical remains a failed observation. */
  }
  const directives = metas
    .filter((meta) => /^(robots|googlebot)$/i.test(meta.name ?? ""))
    .map((meta) => meta.content ?? "");
  const xRobots = headers.get("x-robots-tag");
  if (xRobots) directives.push(xRobots);
  const isNoindex = directives.some((directive) =>
    /(?:^|[\s,:])(?:noindex|none)(?=$|[\s,;])/i.test(directive),
  );
  const body =
    withoutScripts.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ??
    withoutScripts.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, "");
  const visibleText = plainText(
    body.replace(/<(nav|footer|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ""),
  );
  const wordCount =
    visibleText.match(/[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const images = [...withoutScripts.matchAll(/<img\b[^>]*>/gi)].map((match) =>
    attributes(match[0]),
  );
  const imagesWithAlt = images.filter((image) =>
    Object.hasOwn(image, "alt"),
  ).length;
  const internalLinks = [...withoutScripts.matchAll(/<a\b[^>]*>/gi)]
    .map((match) => attributes(match[0]).href)
    .filter((href) => {
      if (!href || href.startsWith("#")) return false;
      try {
        const target = new URL(href, url);
        return (
          target.origin === page.origin && target.pathname !== page.pathname
        );
      } catch {
        return false;
      }
    }).length;
  const jsonLd = [
    ...document.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi),
  ].filter(
    (match) =>
      attributes(match[1]).type?.toLowerCase() === "application/ld+json",
  );
  let validJsonLd = 0;
  let schemaEntities = 0;
  for (const match of jsonLd) {
    try {
      const parsed: unknown = JSON.parse(match[2]);
      validJsonLd++;
      if ((Array.isArray(parsed) ? parsed : [parsed]).some(hasSchemaEntity))
        schemaEntities++;
    } catch {
      /* Invalid source JSON is represented in the finding. */
    }
  }

  const checks: EvaluationCheck[] = [];
  const add = (
    id: string,
    label: string,
    points: number,
    maxPoints: number,
    detail: string,
    evidence?: string,
  ) => {
    checks.push({
      id,
      label,
      points,
      maxPoints,
      detail,
      evidence,
      sourceUrl: url,
      status: points === maxPoints ? "pass" : points > 0 ? "warning" : "fail",
    });
  };
  add(
    "title",
    "Page title",
    title
      ? titles.length === 1 && title.length >= 15 && title.length <= 65
        ? 15
        : 8
      : 0,
    15,
    title
      ? `${titles.length} title element(s); ${title.length} characters. Recommended heuristic: one title, 15–65 characters.`
      : "No nonempty page title was found.",
    title || "<title> missing",
  );
  add(
    "description",
    "Meta description",
    description
      ? descriptions.length === 1 &&
        description.length >= 50 &&
        description.length <= 170
        ? 10
        : 5
      : 0,
    10,
    description
      ? `${descriptions.length} description(s); ${description.length} characters. Recommended heuristic: 50–170 characters.`
      : "No nonempty meta description was found.",
    description || 'meta[name="description"] missing',
  );
  add(
    "headings",
    "Primary heading",
    headings.length === 1 ? 10 : headings.length > 1 ? 5 : 0,
    10,
    `${headings.length} nonempty H1 heading(s) found.`,
    headings.join(" · ").slice(0, 400) || "<h1> missing",
  );
  const matchingCanonical =
    canonical && normalizedPageUrl(canonical) === normalizedPageUrl(url);
  add(
    "canonical",
    "Canonical URL",
    canonical ? (matchingCanonical && canonicals.length === 1 ? 10 : 5) : 0,
    10,
    canonical
      ? `${canonicals.length} canonical link(s); ${matchingCanonical ? "matches the fetched page" : "points to a different URL; this may be intentional"}.`
      : "No valid HTTP(S) canonical link was found.",
    canonical || 'link[rel="canonical"] missing',
  );
  add(
    "indexability",
    "Indexing directive",
    isNoindex ? 0 : 10,
    10,
    isNoindex
      ? "A noindex/none directive was observed. Confirm whether this page is intended to be indexed."
      : "No noindex/none directive observed in supported meta tags or the response header. Search inclusion and robots.txt access are not established.",
    directives.join("; ") || "No supported indexing directive present",
  );
  add(
    "https",
    "HTTPS delivery",
    page.protocol === "https:" ? 10 : 0,
    10,
    `The fetched page uses ${page.protocol.replace(":", "").toUpperCase()}.`,
    url,
  );
  add(
    "readable-content",
    "Readable content",
    wordCount >= 200 ? 10 : wordCount >= 50 ? 5 : 0,
    10,
    `${wordCount} words found after removing scripts, styles, navigation and footer markup. A text-availability heuristic; client-rendered content is not included.`,
    visibleText.slice(0, 350),
  );
  add(
    "image-alt",
    "Image alternatives",
    images.length === imagesWithAlt
      ? 10
      : imagesWithAlt / images.length >= 0.5
        ? 5
        : 0,
    10,
    images.length
      ? `${imagesWithAlt} of ${images.length} images have an alt attribute. Empty decorative alternatives are allowed; accuracy requires review.`
      : "No image elements found; this check passes vacuously.",
    `${imagesWithAlt}/${images.length} images have alt attributes`,
  );
  add(
    "internal-links",
    "Internal links",
    internalLinks > 0 ? 5 : 0,
    5,
    `${internalLinks} links to another path on the same origin found. Destinations have not been crawled.`,
    `${internalLinks} internal links`,
  );
  add(
    "structured-data",
    "Structured data",
    schemaEntities > 0 && validJsonLd === jsonLd.length
      ? 10
      : validJsonLd > 0
        ? 5
        : 0,
    10,
    `${jsonLd.length} JSON-LD block(s), ${validJsonLd} parseable, ${schemaEntities} with a schema.org context and typed entity. This is not full schema validation.`,
    jsonLd.length
      ? jsonLd
          .map((match) => match[2].trim())
          .join("\n")
          .slice(0, 700)
      : "JSON-LD not found",
  );

  const patches: RepairPatch[] = [];
  if (!canonical)
    patches.push({
      id: "add-canonical",
      title: "Declare the preferred page URL",
      target: "HTML <head>",
      type: "html",
      before: "",
      after: `<link rel="canonical" href="${htmlEscape(url)}" />`,
      reason:
        "A canonical tag helps communicate the preferred URL. Review the intended canonical before applying.",
    });
  if (!title)
    patches.push({
      id: "add-title",
      title: "Add a descriptive page title",
      target: "HTML <head>",
      type: "html",
      before: "",
      after: `<title>${htmlEscape(headings[0] || page.hostname)}</title>`,
      reason:
        "The page has no nonempty title. This source-derived starting point needs editorial review.",
    });
  if (!description)
    patches.push({
      id: "add-description",
      title: "Draft a page description",
      target: "HTML <head>",
      type: "html",
      before: "",
      after: `<meta name="description" content="${htmlEscape(visibleText.slice(0, 155) || "Describe this page accurately before publishing.")}" />`,
      reason:
        "The page has no meta description. This excerpt is a draft and must be checked for accuracy and relevance.",
    });

  return {
    title: title || page.hostname,
    description,
    wordCount,
    seoScore: checks.reduce((sum, check) => sum + check.points, 0),
    checks,
    patches,
    evaluationVersion: EVALUATION_VERSION,
  };
}
