import "server-only";

/** DataForSEO v3, verified against the provider documentation on 2026-09-13.
 * Only these fixed provider endpoints can be called. Credentials and raw
 * provider error bodies are never returned to a browser or written to logs.
 */
const API_ORIGIN = "https://api.dataforseo.com";
const ORGANIC_PATH = "/v3/dataforseo_labs/google/domain_rank_overview/live";
const BACKLINKS_PATH = "/v3/backlinks/summary/live";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1_000_000;

export type DataForSeoEnvironment = {
  DATAFORSEO_LOGIN?: string;
  DATAFORSEO_PASSWORD?: string;
  DATAFORSEO_ALLOWED_USER_IDS?: string;
};

export type SeoToolContext = { userId: string };
export type SeoToolOptions = {
  env: DataForSeoEnvironment;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};
export type SeoToolName = "seo_domain_overview" | "seo_backlinks_summary";

export class SeoDataError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SeoDataError";
  }
}

export const seoToolDefinitions = [
  {
    name: "seo_domain_overview",
    title: "Organic domain overview",
    description:
      "Billable DataForSEO Google organic ranking distribution and estimated monthly traffic for a domain, United States / English. Does not fetch backlinks, analytics, or model citations. Requires an authenticated account approved to spend the server's DataForSEO balance.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Public domain, e.g. example.com",
        },
      },
      required: ["domain"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "seo_backlinks_summary",
    title: "Backlinks summary",
    description:
      "Billable DataForSEO backlinks index summary for a domain, including subdomains and live backlinks. May require a Backlinks API subscription. Provider authority rank uses a 0–100 scale and is not a search position. Requires an authenticated account approved to spend the server's DataForSEO balance.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Public domain, e.g. example.com",
        },
      },
      required: ["domain"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
] as const;

export function getSeoDataStatus(env: DataForSeoEnvironment, userId?: string) {
  const configured = Boolean(
    env.DATAFORSEO_LOGIN?.trim() && env.DATAFORSEO_PASSWORD?.trim(),
  );
  const allowed = new Set(
    (env.DATAFORSEO_ALLOWED_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const authorized = configured && Boolean(userId && allowed.has(userId));
  return {
    provider: "DataForSEO" as const,
    configured,
    authorized,
    connectionVerified: false,
    reason: !configured
      ? "Add DataForSEO credentials on the server."
      : !userId
        ? "Sign in to use live SEO data."
        : !authorized
          ? "This account has not been approved to use the owner's DataForSEO balance."
          : "Ready to query. Credentials are configured; provider access is verified only when you run a lookup.",
    tools: seoToolDefinitions,
    billing: {
      paid: true,
      automaticQueries: false,
      maximumTasksPerLookup: 2,
      currency: "USD",
      note: "Each lookup can charge the DataForSEO account. Actual reported cost is shown after the response. No automatic retries.",
    },
    market: {
      locationCode: 2840,
      locationName: "United States",
      languageCode: "en",
      languageName: "English",
    },
  };
}

export function assertSeoDataAccess(
  env: DataForSeoEnvironment,
  context: SeoToolContext,
) {
  const status = getSeoDataStatus(env, context.userId);
  if (!status.configured)
    throw new SeoDataError(
      "DataForSEO credentials are not configured on the server.",
      503,
      "NOT_CONFIGURED",
    );
  if (!context.userId)
    throw new SeoDataError(
      "Sign in to query live SEO data.",
      401,
      "UNAUTHENTICATED",
    );
  if (!status.authorized)
    throw new SeoDataError(
      "This account is not approved to use the owner's DataForSEO balance. An operator must add its verified session user id to DATAFORSEO_ALLOWED_USER_IDS.",
      403,
      "ACCOUNT_NOT_APPROVED",
    );
}

export function normalizeSeoDomain(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.length > 2048)
    throw new SeoDataError(
      "Provide a public domain such as example.com.",
      400,
      "INVALID_DOMAIN",
    );
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`,
    );
  } catch {
    throw new SeoDataError(
      "Provide a valid public domain.",
      400,
      "INVALID_DOMAIN",
    );
  }
  const domain = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    domain.length > 253 ||
    !domain.includes(".") ||
    !domain
      .split(".")
      .every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label)) ||
    /^\d+(?:\.\d+){3}$/.test(domain) ||
    /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(domain)
  ) {
    throw new SeoDataError(
      "Use a public domain without credentials, an IP address, or a custom port.",
      400,
      "INVALID_DOMAIN",
    );
  }
  return domain;
}

export type ProviderError = {
  code:
    | "API_ERROR"
    | "HTTP_ERROR"
    | "NETWORK_ERROR"
    | "TIMEOUT"
    | "INVALID_RESPONSE";
  message: string;
  providerStatusCode?: number;
  httpStatus?: number;
  retryAutomatically: false;
};

export type SeoObservation<T> = {
  status: "success" | "empty" | "error";
  data: T | null;
  error: ProviderError | null;
  costUsd: number | null;
  taskId: string | null;
  providerVersion: string | null;
  endpoint: string;
  fetchedAt: string;
};

export type OrganicOverview = {
  domain: string;
  searchEngine: "Google";
  locationCode: number;
  locationName: "United States";
  languageCode: string;
  organicKeywords: number | null;
  estimatedMonthlyTraffic: number | null;
  estimatedTrafficValueUsd: number | null;
  positions: { label: string; count: number | null }[];
  movement: {
    new: number | null;
    up: number | null;
    down: number | null;
    lost: number | null;
  };
  dataUpdatedAt: null;
  note: string;
};

export type BacklinksOverview = {
  domain: string;
  backlinks: number | null;
  referringDomains: number | null;
  referringMainDomains: number | null;
  referringPages: number | null;
  brokenBacklinks: number | null;
  brokenPages: number | null;
  crawledPages: number | null;
  authorityRank: number | null;
  authorityRankScale: 100;
  backlinksSpamScore: number | null;
  firstSeenAt: string | null;
  includeSubdomains: true;
  statusType: "live";
  note: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
function boundedString(value: unknown, max = 100) {
  return typeof value === "string" && value.length <= max ? value : null;
}

async function readProviderJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Oversized response");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Oversized response");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text);
}

type RawObservation = SeoObservation<Record<string, unknown>[]>;

async function providerRequest(
  path: typeof ORGANIC_PATH | typeof BACKLINKS_PATH,
  payload: Record<string, unknown>,
  options: SeoToolOptions,
): Promise<RawObservation> {
  const metadata = {
    costUsd: null as number | null,
    taskId: null as string | null,
    providerVersion: null as string | null,
    endpoint: `${API_ORIGIN}${path}`,
    fetchedAt: new Date().toISOString(),
  };
  const failed = (error: ProviderError): RawObservation => ({
    ...metadata,
    status: "error",
    data: null,
    error,
  });
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    let response: Response;
    try {
      const authorization = Buffer.from(
        `${options.env.DATAFORSEO_LOGIN!.trim()}:${options.env.DATAFORSEO_PASSWORD!.trim()}`,
        "utf8",
      ).toString("base64");
      response = await (options.fetcher ?? fetch)(`${API_ORIGIN}${path}`, {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify([payload]),
      });
    } catch {
      return failed({
        code: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
        message:
          "The provider request could not be confirmed. It may have been billed; check DataForSEO task history before retrying.",
        retryAutomatically: false,
      });
    }
    if (!response.ok) {
      await response.body?.cancel();
      return failed({
        code: "HTTP_ERROR",
        httpStatus: response.status,
        message: `DataForSEO returned HTTP ${response.status}. ${response.status === 401 || response.status === 403 ? "Check the server credentials and API access." : "The lookup did not complete."} Cost is unknown.`,
        retryAutomatically: false,
      });
    }
    let envelope: Record<string, unknown> | null;
    try {
      envelope = record(await readProviderJson(response));
    } catch {
      return failed({
        code: controller.signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE",
        message:
          "The provider response could not be read safely. Cost is unknown; check task history before retrying.",
        retryAutomatically: false,
      });
    }
    if (!envelope)
      return failed({
        code: "INVALID_RESPONSE",
        message: "DataForSEO returned an unexpected response format.",
        retryAutomatically: false,
      });
    const tasks = Array.isArray(envelope.tasks) ? envelope.tasks : [];
    const task = record(tasks[0]);
    // Each request contains exactly one task. Prefer its cost; never add it to envelope.cost.
    metadata.costUsd = number(task?.cost) ?? number(envelope.cost);
    metadata.taskId = boundedString(task?.id);
    metadata.providerVersion = boundedString(envelope.version);
    const statusCode =
      number(task?.status_code) ?? number(envelope.status_code);
    if (envelope.status_code !== 20000 || !task || task.status_code !== 20000) {
      return failed({
        code: "API_ERROR",
        ...(statusCode !== null ? { providerStatusCode: statusCode } : {}),
        message: `DataForSEO did not complete this ${path === BACKLINKS_PATH ? "backlinks" : "organic"} task${statusCode !== null ? ` (status ${statusCode})` : ""}. ${path === BACKLINKS_PATH ? "Check Backlinks API subscription/access and account balance." : "Check account balance, API access, and target availability."}`,
        retryAutomatically: false,
      });
    }
    if (!Array.isArray(task.result)) {
      if (task.result_count === 0 || task.result === null)
        return { ...metadata, status: "empty", data: [], error: null };
      return failed({
        code: "INVALID_RESPONSE",
        message: "DataForSEO returned an unexpected task result format.",
        retryAutomatically: false,
      });
    }
    const data = task.result
      .map(record)
      .filter((item): item is Record<string, unknown> => item !== null);
    return {
      ...metadata,
      status: data.length ? "success" : "empty",
      data,
      error: null,
    };
  } catch {
    return failed({
      code: controller.signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE",
      message:
        "The provider response could not be confirmed. Check task history before retrying; this request may have been billed.",
      retryAutomatically: false,
    });
  } finally {
    clearTimeout(timer);
  }
}

function withoutData(observation: RawObservation) {
  const { data: _data, ...metadata } = observation;
  return metadata;
}

export async function getOrganicDomainOverview(
  domainInput: unknown,
  context: SeoToolContext,
  options: SeoToolOptions,
): Promise<SeoObservation<OrganicOverview>> {
  assertSeoDataAccess(options.env, context);
  const domain = normalizeSeoDomain(domainInput);
  const raw = await providerRequest(
    ORGANIC_PATH,
    { target: domain, location_code: 2840, language_code: "en", limit: 1 },
    options,
  );
  const metadata = withoutData(raw);
  if (raw.status !== "success") return { ...metadata, data: null };
  const result = raw.data?.[0];
  const items = result && Array.isArray(result.items) ? result.items : [];
  const item = record(items[0]);
  const organic = record(record(item?.metrics)?.organic);
  if (!organic) return { ...metadata, status: "empty", data: null };
  const positions = [
    ["1", "pos_1"],
    ["2–3", "pos_2_3"],
    ["4–10", "pos_4_10"],
    ["11–20", "pos_11_20"],
    ["21–30", "pos_21_30"],
    ["31–40", "pos_31_40"],
    ["41–50", "pos_41_50"],
    ["51–60", "pos_51_60"],
    ["61–70", "pos_61_70"],
    ["71–80", "pos_71_80"],
    ["81–90", "pos_81_90"],
    ["91–100", "pos_91_100"],
  ].map(([label, key]) => ({ label, count: number(organic[key]) }));
  return {
    ...metadata,
    data: {
      domain,
      searchEngine: "Google",
      locationCode: 2840,
      locationName: "United States",
      languageCode: "en",
      organicKeywords: number(organic.count),
      estimatedMonthlyTraffic: number(organic.etv),
      estimatedTrafficValueUsd: number(organic.estimated_paid_traffic_cost),
      positions,
      movement: {
        new: number(organic.is_new),
        up: number(organic.is_up),
        down: number(organic.is_down),
        lost: number(organic.is_lost),
      },
      dataUpdatedAt: null,
      note: "Provider database estimates for Google, United States / English. Traffic is modeled, not analytics. Retrieval time is not the source update time. Missing metrics remain null; zero is retained only when returned by the provider.",
    },
  };
}

export async function getBacklinksSummary(
  domainInput: unknown,
  context: SeoToolContext,
  options: SeoToolOptions,
): Promise<SeoObservation<BacklinksOverview>> {
  assertSeoDataAccess(options.env, context);
  const domain = normalizeSeoDomain(domainInput);
  const raw = await providerRequest(
    BACKLINKS_PATH,
    {
      target: domain,
      include_subdomains: true,
      include_indirect_links: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: "live",
      rank_scale: "one_hundred",
      internal_list_limit: 10,
    },
    options,
  );
  const metadata = withoutData(raw);
  if (raw.status !== "success") return { ...metadata, data: null };
  const result = raw.data?.[0];
  if (
    !result ||
    [result.backlinks, result.referring_domains, result.rank].every(
      (value) => number(value) === null,
    )
  )
    return { ...metadata, status: "empty", data: null };
  return {
    ...metadata,
    data: {
      domain,
      backlinks: number(result.backlinks),
      referringDomains: number(result.referring_domains),
      referringMainDomains: number(result.referring_main_domains),
      referringPages: number(result.referring_pages),
      brokenBacklinks: number(result.broken_backlinks),
      brokenPages: number(result.broken_pages),
      crawledPages: number(result.crawled_pages),
      authorityRank: number(result.rank),
      authorityRankScale: 100,
      backlinksSpamScore: number(result.backlinks_spam_score),
      firstSeenAt: boundedString(result.first_seen),
      includeSubdomains: true,
      statusType: "live",
      note: "DataForSEO backlink index observation. Authority rank is the provider's 0–100 link metric, not Google PageRank, a search position, or Folio's readiness score. Referring domains can include subdomains; referring main domains are separate.",
    },
  };
}

/** Tool dispatchers must obtain context.userId from a validated server session,
 * never from the model's arguments or a browser request body. */
export async function executeSeoTool(
  name: SeoToolName,
  input: unknown,
  context: SeoToolContext,
  options: SeoToolOptions,
) {
  assertSeoDataAccess(options.env, context);
  const args = record(input);
  if (!args || Object.keys(args).some((key) => key !== "domain"))
    throw new SeoDataError(
      "The tool accepts only a domain argument.",
      400,
      "INVALID_ARGUMENTS",
    );
  if (name === "seo_domain_overview")
    return getOrganicDomainOverview(args.domain, context, options);
  if (name === "seo_backlinks_summary")
    return getBacklinksSummary(args.domain, context, options);
  throw new SeoDataError("Unknown SEO tool.", 400, "UNKNOWN_TOOL");
}

export async function fetchSeoOverview(
  domainInput: unknown,
  context: SeoToolContext,
  options: SeoToolOptions,
) {
  assertSeoDataAccess(options.env, context);
  const domain = normalizeSeoDomain(domainInput);
  const [organic, backlinks] = await Promise.all([
    getOrganicDomainOverview(domain, context, options),
    getBacklinksSummary(domain, context, options),
  ]);
  const costIsComplete = organic.costUsd !== null && backlinks.costUsd !== null;
  const knownCostUsd = (organic.costUsd ?? 0) + (backlinks.costUsd ?? 0);
  return {
    id: crypto.randomUUID(),
    domain,
    provider: "DataForSEO" as const,
    fetchedAt: new Date().toISOString(),
    organic,
    backlinks,
    status:
      organic.status === "error" && backlinks.status === "error"
        ? ("error" as const)
        : organic.status === "error" || backlinks.status === "error"
          ? ("partial" as const)
          : ("complete" as const),
    totalCostUsd: costIsComplete ? knownCostUsd : null,
    knownCostUsd,
    costIsComplete,
    notes: [
      "These SEO observations are separate from the deterministic HTML readiness score and any agent evaluation.",
      "Two independent, potentially billable provider tasks were requested. A failed endpoint does not erase a successful result.",
      "No automatic retry was performed. Unknown cost is null, never reported as free.",
      "Results are returned privately to the requesting account and are not added to the public leaderboard.",
    ],
  };
}

export type SeoOverviewResult = Awaited<ReturnType<typeof fetchSeoOverview>>;
