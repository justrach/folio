// @ts-ignore OpenNext generates this module during cf:build.
import app from "../.open-next/worker.js";
import { withDatabaseRequest } from "../src/lib/pg/request-scope";

export default {
  fetch(request: Request, env: CloudflareEnv, context: unknown) {
    return withDatabaseRequest(() => app.fetch(request, env, context));
  },
};
// @ts-ignore OpenNext generates this module during cf:build.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";
