import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { getPlatformProxy } from "wrangler";

const WRANGLER_CLI = resolve("node_modules/wrangler/wrangler-dist/cli.js");

test(
  "patched bindings-only proxy worker terminates requests with 404 instead of self-forwarding",
  { timeout: 15000 },
  async () => {
    const source = readFileSync(WRANGLER_CLI, "utf8");
    const sectionStart = source.indexOf("async function getMiniflareOptionsFromConfig");
    const sectionEnd = source.indexOf("function getMiniflarePersistRoot", sectionStart);
    const section = source.slice(sectionStart, sectionEnd);
    assert.ok(sectionStart > 0 && sectionEnd > sectionStart, "expected getMiniflareOptionsFromConfig section");
    assert.ok(
      section.includes('script: "export default { fetch() { return new Response(null, { status: 404 }); } };"'),
      "installed wrangler bindings-only worker must use the explicit terminal 404 script",
    );

    const dir = mkdtempSync(join(tmpdir(), "platform-proxy-test-"));
    const registryDir = mkdtempSync(join(tmpdir(), "wrangler-registry-"));
    const configPath = join(dir, "wrangler.jsonc");
    writeFileSync(
      configPath,
      JSON.stringify({
        name: `platform-proxy-patch-test-${randomUUID().slice(0, 8)}`,
        compatibility_date: "2024-09-23",
        d1_databases: [{ binding: "DB", database_name: "proxy_patch_test", database_id: randomUUID() }],
      }),
    );

    let capturedRuntime: Miniflare | undefined;
    const originalGetBindings = Miniflare.prototype.getBindings;
    const originalGetCf = Miniflare.prototype.getCf;
    const originalRegistryPath = process.env.WRANGLER_REGISTRY_PATH;
    Miniflare.prototype.getBindings = function <Env>(this: Miniflare, workerName?: string): Promise<Env> {
      capturedRuntime = this;
      return originalGetBindings.call(this, workerName) as Promise<Env>;
    } as typeof Miniflare.prototype.getBindings;
    Miniflare.prototype.getCf = async function (this: Miniflare) {
      void this;
      return {} as Awaited<ReturnType<typeof originalGetCf>>;
    };
    process.env.WRANGLER_REGISTRY_PATH = registryDir;

    let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>> | undefined;
    try {
      proxy = await getPlatformProxy<{ DB: D1Database }>({
        configPath,
        envFiles: [],
        remoteBindings: false,
        persist: false,
      });
      assert.ok(capturedRuntime, "Miniflare runtime was captured");
      const entry = await capturedRuntime.ready;

      for (const method of ["HEAD", "GET"]) {
        const response = await fetch(new URL("/", entry), {
          method,
          signal: AbortSignal.timeout(2000),
        });
        await response.arrayBuffer();
        assert.equal(response.status, 404, `${method} / should terminate with 404`);
      }
      const health = await fetch(new URL("/arbitrary/health", entry), {
        signal: AbortSignal.timeout(2000),
      });
      await health.arrayBuffer();
      assert.equal(health.status, 404);
      for (let i = 0; i < 10; i++) {
        const response = await fetch(new URL("/", entry), {
          method: "HEAD",
          signal: AbortSignal.timeout(2000),
        });
        await response.arrayBuffer();
        assert.equal(response.status, 404, `sequential HEAD ${i} should be 404`);
      }

      const row = await proxy.env.DB.prepare("SELECT 7 AS value").first();
      assert.deepEqual(row, { value: 7 }, "local D1 binding should still work");
    } finally {
      Miniflare.prototype.getBindings = originalGetBindings;
      Miniflare.prototype.getCf = originalGetCf;
      if (originalRegistryPath === undefined) delete process.env.WRANGLER_REGISTRY_PATH;
      else process.env.WRANGLER_REGISTRY_PATH = originalRegistryPath;
      try {
        if (proxy) await proxy.dispose();
        else await capturedRuntime?.dispose();
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(registryDir, { recursive: true, force: true });
      }
    }
  },
);
