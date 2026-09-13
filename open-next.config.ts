import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Authenticated data is fetched dynamically; an R2 incremental cache is optional.
export default defineCloudflareConfig();
