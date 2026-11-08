/**
 * Dev launcher that loads `.dev.vars` the way Wrangler does.
 *
 *   bun run dev            # next dev with the local secrets and DB_ENGINE
 *   bun run dev --port 3011
 *
 * `next dev` only reads `.env*`, so without this the app would start with no
 * PLANETSCALE_APP_URL and no DEV_AUTH, and every request would look signed out.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const file = ".dev.vars";
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    process.env[key] ??= value;
  }
}

const devUser = process.env.DEV_AUTH === "1" ? process.env.DEV_AUTH_USER_ID : "";
console.log(devUser
  ? `[dev] pseudo auth ON as ${process.env.DEV_AUTH_EMAIL ?? devUser} — every request is already signed in`
  : "[dev] pseudo auth OFF — set DEV_AUTH=1 and DEV_AUTH_USER_ID in .dev.vars to stay signed in");

const args = process.argv.slice(2);
const child = spawn("next", ["dev", "--hostname", "0.0.0.0", ...args], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
child.on("exit", code => process.exit(code ?? 0));
