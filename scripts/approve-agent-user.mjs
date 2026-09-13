import { readFileSync, writeFileSync } from "node:fs";

const id = process.argv[2]?.trim();
if (!id || !/^[A-Za-z0-9_-]{10,128}$/.test(id)) {
  console.error("Usage: bun run agents:approve <Better-Auth-account-ID>");
  process.exit(1);
}
const file = ".dev.vars";
let config;
try {
  config = readFileSync(file, "utf8");
} catch {
  console.error("Run bun run setup first.");
  process.exit(1);
}
const key = "OPENAI_ALLOWED_USER_IDS";
const previous =
  config
    .split("\n")
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1) ?? "";
const approved = [
  ...new Set([
    ...previous
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    id,
  ]),
];
const lines = config.split("\n").filter((line) => !line.startsWith(`${key}=`));
writeFileSync(
  file,
  `${lines.join("\n").trimEnd()}\n${key}=${approved.join(",")}\n`,
  { mode: 0o600 },
);
console.log(
  "Account approved for local managed Agents API runs. Restart the dev server to load the updated access list.",
);
