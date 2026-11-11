/**
 * Folio as an MCP App (io.modelcontextprotocol/ui, spec 2026-01-26). Hosts such as Claude Desktop and VS Code
 * render one page, ui://folio/workspace.html, when folio_find or folio_website_gaps returns. The page's source is
 * src/mcp-app/ (built on the official App class from @modelcontextprotocol/ext-apps); scripts/build-folio-app.ts
 * bundles it into folio-app.generated.ts. Nothing in it spends: it calls only the read tools below.
 */
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

export const FOLIO_APP_URI = "ui://folio/workspace.html";
export const FOLIO_APP_MIME = RESOURCE_MIME_TYPE;
/** The tools the page may call. A unit test keeps this list read-only and in step with the page's source. */
export const FOLIO_APP_CALLS = ["folio_find", "folio_organizations", "folio_website_gaps"] as const;
export type FolioAppCall = typeof FOLIO_APP_CALLS[number];

/** folio_find's result: what the person can open in Folio, with the IDs other tools take. */
export type FolioFindResult = {
  query: string | null; truncated: boolean; note: string;
  items: { kind: "website" | "organization" | "seo-report" | "search-console"; title: string; detail: string; url: string;
    websiteId: string | null; organizationId: string | null; reportId: string | null }[];
};

export { FOLIO_APP_HTML } from "./folio-app.generated";
