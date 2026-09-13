import { chmodSync, mkdirSync, mkdtempSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Keep the application, migration commands and local exports on one existing state root.
// The CLI appends /v3, while getPlatformProxy in next.config.ts needs it explicitly.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
if (!["migrate", "status", "backup"].includes(action) || process.argv.length !== 3) {
  console.error("Usage: node scripts/local-db.mjs migrate|status|backup");
  process.exit(1);
}
const common = ["--local", "--config", resolve(root, "wrangler.jsonc"), "--persist-to", resolve(root, ".wrangler/state")];
let output;
if (action === "backup") {
  const backups = resolve(root, ".local/backups");
  mkdirSync(backups, { recursive: true, mode: 0o700 });
  const folder = mkdtempSync(resolve(backups, `${new Date().toISOString().replaceAll(":", "-")}-`));
  chmodSync(folder, 0o700);
  output = resolve(folder, "folio-d1.sql");
}
const command = action === "backup"
  // Wrangler export uses its default state root and does not accept --persist-to.
  // cwd + the explicit project config keep that default on the same local database.
  ? ["d1", "export", "DB", "--local", "--config", resolve(root, "wrangler.jsonc"), "--output", output]
  : ["d1", "migrations", action === "migrate" ? "apply" : "list", "DB", ...common];
const result = spawnSync(process.execPath, [resolve(root, "node_modules/wrangler/bin/wrangler.js"), ...command], {
  cwd: root, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
});
if (result.error) console.error("Local Wrangler could not start. Run bun install and retry.");
if (result.status === 0 && output) {
  chmodSync(output, 0o600);
  console.log(`Private local backup saved: ${output}`);
  console.log("Contains account and evidence data. Keep it private; it is excluded from Git.");
}
process.exitCode = result.status ?? 1;
