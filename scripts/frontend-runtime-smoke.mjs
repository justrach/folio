import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

// Run the actual built Worker, without database, account or provider bindings.
const root = process.cwd();
const entry = process.env.FOLIO_SMOKE_ENTRY === "backend" ? "backend" : "frontend";
const temporary = await mkdtemp(join(tmpdir(), "folio-frontend-smoke-"));
await mkdir(resolve(root, ".local"), { recursive: true });
const log = await open(resolve(root, ".local/frontend-runtime-smoke.log"), "w");
const socket = createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise(resolveClose => socket.close(resolveClose));
const config = join(temporary, "wrangler.json");
await writeFile(config, JSON.stringify({
  name: "folio-frontend-runtime-smoke",
  main: resolve(root, `workers/${entry}.ts`),
  compatibility_date: "2026-09-13",
  compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
  assets: { directory: resolve(root, ".open-next/assets"), binding: "ASSETS" },
  services: [{ binding: "WORKER_SELF_REFERENCE", service: "folio-frontend-runtime-smoke" }],
}));
const child = spawn(process.execPath, [resolve(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--config", config, "--local", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", join(temporary, "state")], {
  cwd: temporary,
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false" },
  stdio: ["ignore", log.fd, log.fd],
});
const base = `http://127.0.0.1:${port}`;
try {
  let response;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Worker exited before readiness (${child.exitCode}); see .local/frontend-runtime-smoke.log`);
    try { response = await fetch(`${base}/overview`, { signal: AbortSignal.timeout(2_000) }); break; }
    catch { await new Promise(resolveWait => setTimeout(resolveWait, 250)); }
  }
  if (!response) throw new Error("Built Worker did not become ready; see .local/frontend-runtime-smoke.log");
  if (response.status !== 200) throw new Error(`Built Worker /overview returned ${response.status}; see .local/frontend-runtime-smoke.log`);
  const html = await response.text();
  if (!html.includes("Benchmark dashboard") || !html.includes("Color theme")) throw new Error("Built Worker omitted the dashboard or theme picker.");
  for (const path of ["/login", "/leaderboard"]) {
    const page = await fetch(base + path, { signal: AbortSignal.timeout(15_000) });
    if (page.status !== 200) throw new Error(`Built Worker ${path} returned ${page.status}`);
    await page.arrayBuffer();
  }
  const stylesheet = /href="([^\"]+\.css(?:\?[^\"]*)?)"/.exec(html)?.[1];
  if (!stylesheet) throw new Error("Built Worker omitted its stylesheet.");
  const css = await fetch(new URL(stylesheet, base), { signal: AbortSignal.timeout(15_000) });
  if (css.status !== 200 || !(await css.text()).length) throw new Error("Built Worker stylesheet failed to load.");
  console.log(`Built ${entry} Worker rendered dashboard, login, Index and stylesheet without database/provider bindings.`);
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    await exited;
    clearTimeout(timer);
  }
  await log.close();
  await rm(temporary, { recursive: true, force: true });
}
