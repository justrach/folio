/** Display identity only: parsing a website never fetches it or verifies ownership. */
export function competitorDomain(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || /\s/.test(value.trim())) return undefined;
  try {
    const url = new URL(value.includes("://") ? value.trim() : `https://${value.trim()}`);
    const host = url.hostname.replace(/^www\./, "").replace(/\.$/, "");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !host.includes(".") || host.length > 253) return undefined;
    if (!host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return undefined;
    return host;
  } catch { return undefined; }
}

export function competitorWebsite(company: { domain?: string | null; aliases: string[] }): string | undefined {
  return competitorDomain(company.domain) ?? company.aliases.map(competitorDomain).find(Boolean);
}
