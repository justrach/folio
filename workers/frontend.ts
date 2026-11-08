// @ts-ignore OpenNext generates this module during cf:build.
import app from "../.open-next/worker.js";
import { serveFrontend } from "../src/lib/frontend-routing";

type FrontendEnv = CloudflareEnv & {
  FOLIO_BACKEND: { fetch(request: Request): Promise<Response> };
  FOLIO_PUBLIC_INDEX: { fetch(request: Request): Promise<Response> };
};

export default {
  fetch(request: Request, env: FrontendEnv, context: unknown) {
    return serveFrontend(request, env, () => app.fetch(request, env, context));
  },
};

// Preserve OpenNext's optional cache object exports.
// @ts-ignore OpenNext generates this module during cf:build.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";
