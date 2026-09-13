import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

if (!existsSync(".dev.vars")) {
  const config = readFileSync(".dev.vars.example", "utf8").replace(
    "replace-with-a-random-secret-of-at-least-32-characters",
    randomBytes(32).toString("hex"),
  );
  writeFileSync(".dev.vars", config, { mode: 0o600 });
  console.log(
    "Created private local configuration. Add provider credentials there when ready.",
  );
} else {
  chmodSync(".dev.vars", 0o600);
  console.log("Existing local configuration preserved.");
}
const result = spawnSync("bun", ["run", "db:migrate:local"], {
  stdio: "inherit",
});
if (result.error) console.error("Bun could not start. Install the Bun version specified in package.json and retry.");
process.exitCode = result.status ?? 1;
