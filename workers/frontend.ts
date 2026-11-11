// @ts-ignore OpenNext generates this module during cf:build.
import app from "../.open-next/worker.js";
import { noIndex, serveFrontend } from "../src/lib/frontend-routing";

type FrontendEnv = CloudflareEnv & {
  FOLIO_BACKEND: { fetch(request: Request): Promise<Response> };
  FOLIO_PUBLIC_INDEX: { fetch(request: Request): Promise<Response> };
  /** Set on review deployments (staging) so no search engine indexes a copy of the site. */
  FOLIO_NOINDEX?: string;
};

export default {
  async fetch(request: Request, env: FrontendEnv, context: unknown) {
    const response = await serveFrontend(request, env, () => app.fetch(request, env, context));
    return env.FOLIO_NOINDEX === "1" ? noIndex(response) : response;
  },
};

// Preserve OpenNext's optional cache object exports.
// @ts-ignore OpenNext generates this module during cf:build.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";
