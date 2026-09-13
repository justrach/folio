import catalog from "@/data/developer-tools.json";

export const WEBSITE_AUDIENCES = [
  "Developer tools",
  "Software & work",
  "Shops & brands",
  "Services & travel",
  "Learning",
] as const;

export type WebsiteAudience = (typeof WEBSITE_AUDIENCES)[number];
export type DeveloperToolAudience = WebsiteAudience;

/** Independently described websites; inclusion is not an evaluation result.
 * The existing export names remain stable for saved developer-tool records.
 */
export type DeveloperTool = {
  readonly id: string;
  readonly name: string;
  readonly audience: WebsiteAudience;
  readonly category: string;
  readonly description: string;
  readonly websiteUrl: string;
  /** Official documentation, help, product, or organization reference. */
  readonly docsUrl: string;
  readonly sourceUrls: readonly string[];
  /** Date the linked official sources were checked, not an evaluation date. */
  readonly observedAt: string;
};

export const DEVELOPER_TOOLS: readonly DeveloperTool[] = catalog.map((entry) => {
  const audience = WEBSITE_AUDIENCES.find((value) => value === entry.audience);
  if (!audience) throw new Error(`Unknown website audience for ${entry.id}`);
  return { ...entry, audience };
});

export function getDeveloperTool(id: string): DeveloperTool | undefined {
  return DEVELOPER_TOOLS.find((tool) => tool.id === id);
}
