/** Shared path classification for public research reports.
 *
 * This is a heuristic on the URL path only: it says what section a page appears
 * to live in, never what the page is about or whether it is any good. Unknown
 * shapes stay "other" instead of being guessed.
 */
export type PageType =
  | "blog"
  | "changelog"
  | "templates"
  | "academy"
  | "glossary"
  | "models"
  | "docs"
  | "pricing"
  | "product"
  | "integrations"
  | "customers"
  | "utility"
  | "home"
  | "top-level"
  | "other";

export function pageType(raw: string | null): PageType {
  if (!raw) return "other";
  let path: string;
  try {
    path = new URL(raw).pathname.toLowerCase();
  } catch {
    return "other";
  }
  if (/(^|\/)(blog|news|stories|insights|articles|research|resources)(\/|$)/.test(path)) return "blog";
  if (/(^|\/)(changelog|releases|whats-new)(\/|$)/.test(path)) return "changelog";
  if (/(^|\/)(templates?)(\/|$)/.test(path)) return "templates";
  if (/(^|\/)(academy|courses?|learn)(\/|$)/.test(path)) return "academy";
  if (/(^|\/)(i|glossary|cookbook)(\/|$)/.test(path)) return "glossary";
  if (/(^|\/)(ai-gateway|models?|providers?)(\/|$)/.test(path)) return "models";
  if (/(^|\/)(docs?|documentation|guides?|reference|api|developers?)(\/|$)/.test(path)) return "docs";
  if (/(^|\/)(pricing|plans)(\/|$)/.test(path)) return "pricing";
  if (/(^|\/)(customers?|case-studies)(\/|$)/.test(path)) return "customers";
  if (/(^|\/)(product|products|features|platform|solutions|use-cases)(\/|$)/.test(path)) return "product";
  if (/(^|\/)(integrations?|marketplace|apps|partners)(\/|$)/.test(path)) return "integrations";
  if (/(^|\/)(login|signin|signup|careers?|jobs|support|help|community|events|legal|privacy|terms|status)(\/|$)/.test(path)) return "utility";
  if (path === "/" || path === "") return "home";
  // A single top-level segment is usually a named product or tool page
  // (/payments, /domains) even when the site uses no /product prefix.
  if (path.split("/").filter(Boolean).length === 1) return "top-level";
  return "other";
}

/** First path segment, used as the section key. `/` is the root. */
export function sectionOf(raw: string): string {
  try {
    const segments = new URL(raw).pathname.split("/").filter(Boolean);
    return segments[0] ? `/${segments[0]}` : "/";
  } catch {
    return "/";
  }
}
