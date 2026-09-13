import type { D1Database, Fetcher } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    ASSETS: Fetcher;
    WORKER_SELF_REFERENCE: Fetcher;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    OPENAI_API_KEY?: string;
    OPENAI_AGENTS_MODEL?: string;
    OPENAI_ALLOWED_USER_IDS?: string;
    OPENAI_MAX_RUNS_PER_DAY?: string;
    DATAFORSEO_LOGIN?: string;
    DATAFORSEO_PASSWORD?: string;
    DATAFORSEO_ALLOWED_USER_IDS?: string;
    SCAN_ALLOWED_HOSTS?: string;
    NEXTJS_ENV?: string;
    EVALUATION_RECONCILE_ENABLED?: string;
    EVALUATION_RECONCILE_SECRET?: string;
  }
}

export {};
