import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { EVALUATION_VERSION } from "../src/lib/evaluation";
import { ScanError } from "../src/lib/scanner";
import { assertHomepageContent, captureDeveloperHomepage, captureLocalFolio, mapDeveloperTools, validateDeveloperTools,
  DEVELOPER_TOOL_CAPTURE_LIMIT, DEVELOPER_TOOL_TIMEOUT, LOCAL_FOLIO_URL,
  type CapturedDeveloperPage, type DeveloperPageEvaluation, type DeveloperTool,
  type DeveloperToolCaptureKind, type DeveloperToolReadinessResult, type DeveloperToolReadinessSummary } from "../src/lib/developer-tools-evaluation";

const root = fileURLToPath(new URL("../", import.meta.url));
const privateRoot = join(root, ".local", "developer-tool-evaluations");
const evaluatorFile = join(root, "src", "lib", "evaluation.ts");
export const hashCapturedText = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

type FrozenCapture = { schemaVersion: "developer-tool-capture-v1"; result: DeveloperToolReadinessResult;
  html: string | null; headers: Record<string, string>; evaluation: DeveloperPageEvaluation | null };

export async function createReadinessSandbox(directory: string) {
  const bundle = await build({ stdin: { contents: `import { evaluateHtml } from ${JSON.stringify(evaluatorFile)};
    export default { async fetch(request) { const input = await request.json();
      if (typeof input.html !== 'string' || new TextEncoder().encode(input.html).length > ${DEVELOPER_TOOL_CAPTURE_LIMIT}) return new Response('Invalid capture', {status:400});
      return Response.json(evaluateHtml(input.html, input.url, new Headers(input.headers))); } };`,
    resolveDir: root, sourcefile: "readiness-sandbox.ts", loader: "ts" }, bundle: true, write: false, platform: "browser", format: "esm", target: "es2022" });
  const contents = bundle.outputFiles[0].text;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const runtime = new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "tmp"),
    workers: [{ config: { name: "folio-page-readiness-sandbox", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents } } }, env: {} },
      dev: { cacheAPI: false, outboundService: { type: "node-handler", handler(_request, response) { response.writeHead(403); response.end("Sandbox network disabled"); } } },
    }],
  });
  return {
    async evaluate(page: CapturedDeveloperPage): Promise<DeveloperPageEvaluation> {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const response = await runtime.dispatchFetch("http://readiness.invalid/evaluate", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ html: page.body, url: page.url, headers: { "x-robots-tag": page.headers.get("x-robots-tag") ?? "" } }) });
            if (!response.ok) throw new Error("The local readiness sandbox could not evaluate this capture.");
            return response.json() as Promise<DeveloperPageEvaluation>;
          })(),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Readiness sandbox timed out.")), 8000); }),
        ]);
      } finally { clearTimeout(timeout); }
    },
    async dispose() { await runtime.dispose(); },
  };
}

export async function evaluateDeveloperTool(tool: DeveloperTool, kind: DeveloperToolCaptureKind,
  evaluate: (page: CapturedDeveloperPage) => Promise<DeveloperPageEvaluation>, fetcher: typeof fetch = fetch): Promise<FrozenCapture> {
  const result: DeveloperToolReadinessResult = { toolId: tool.id, name: tool.name, category: tool.category,
    ...(tool.audience === undefined ? {} : { audience: tool.audience }),
    submittedUrl: kind === "local-preview" ? LOCAL_FOLIO_URL : tool.websiteUrl, finalUrl: null,
    captureKind: kind, status: "unavailable", capturedAt: new Date().toISOString(), contentHash: null,
    bytesFetched: null, score: null, checks: [], error: null };
  let capturedPage: CapturedDeveloperPage | null = null;
  try {
    const page = kind === "local-preview" ? await captureLocalFolio(fetcher) : await captureDeveloperHomepage(tool, fetcher);
    capturedPage = page;
    result.capturedAt = new Date().toISOString(); result.finalUrl = page.url;
    result.contentHash = hashCapturedText(page.body); result.bytesFetched = page.bytes;
    assertHomepageContent(page.body);
    const headers = { "x-robots-tag": page.headers.get("x-robots-tag") ?? "" };
    const evaluation = await evaluate(page);
    result.status = "complete"; result.score = evaluation.seoScore;
    result.checks = evaluation.checks.map(({ evidence: _evidence, sourceUrl: _sourceUrl, ...check }) => check);
    return { schemaVersion: "developer-tool-capture-v1", result, html: page.body, headers, evaluation };
  } catch (error) {
    result.error = error instanceof ScanError
      ? error.status === 403 ? "The homepage redirected outside its reviewed hostname and www spelling." : error.message
      : "This page could not be evaluated in the local readiness sandbox.";
    return { schemaVersion: "developer-tool-capture-v1", result, html: capturedPage?.body ?? null,
      headers: capturedPage ? { "x-robots-tag": capturedPage.headers.get("x-robots-tag") ?? "" } : {}, evaluation: null };
  }
}

export async function verifyFrozenCapture(capture: FrozenCapture, evaluate: (page: CapturedDeveloperPage) => Promise<DeveloperPageEvaluation>) {
  if (capture.result.status === "unavailable") {
    if (capture.result.score !== null || capture.result.checks.length || capture.evaluation !== null) throw new Error("Unavailable capture contains invented measurements.");
    if (capture.html !== null && hashCapturedText(capture.html) !== capture.result.contentHash) throw new Error("Unavailable capture hash does not match.");
    return;
  }
  if (typeof capture.html !== "string" || hashCapturedText(capture.html) !== capture.result.contentHash || !capture.result.finalUrl || !capture.evaluation)
    throw new Error("Frozen capture hash or metadata does not match.");
  const recomputed = await evaluate({ body: capture.html, url: capture.result.finalUrl, headers: new Headers(capture.headers), bytes: capture.result.bytesFetched ?? 0 });
  if (JSON.stringify(recomputed) !== JSON.stringify(capture.evaluation) || recomputed.seoScore !== capture.result.score
    || JSON.stringify(recomputed.checks.map(({ evidence: _evidence, sourceUrl: _sourceUrl, ...check }) => check)) !== JSON.stringify(capture.result.checks))
    throw new Error("Frozen capture does not reproduce its saved evaluation.");
}

export function publicHomepageSummary(summary: DeveloperToolReadinessSummary): DeveloperToolReadinessSummary | null {
  const results = summary.results.filter(result => result.captureKind === "public-homepage");
  // A local-only run must never replace the existing public homepage baseline.
  return results.length ? { ...summary, results } : null;
}

async function main(args: string[]) {
  const verifyIndex = args.indexOf("--verify-offline");
  if (verifyIndex >= 0) {
    if (args.length !== 2 || verifyIndex !== 0 || !/^[a-zA-Z0-9_-]+$/.test(args[1] ?? "")) throw new Error("Use --verify-offline <batchId>.");
    const directory = join(privateRoot, args[1]);
    const summary: DeveloperToolReadinessSummary = JSON.parse(await readFile(join(directory, "summary.json"), "utf8"));
    if (summary.evaluatorSourceHash !== hashCapturedText(await readFile(evaluatorFile, "utf8"))) throw new Error("The evaluator source changed; this batch needs its recorded evaluator revision to reproduce.");
    const sandbox = await createReadinessSandbox(join(directory, "verify-runtime"));
    try {
      for (const result of summary.results) {
        if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(result.toolId)) throw new Error("Invalid saved tool ID.");
        const capture: FrozenCapture = JSON.parse(await readFile(join(directory, `${result.toolId}.json`), "utf8"));
        if (JSON.stringify(capture.result) !== JSON.stringify(result)) throw new Error("Private summary differs from its frozen capture.");
        await verifyFrozenCapture(capture, sandbox.evaluate);
      }
      console.log(`Reproduced ${summary.results.length} saved outcomes offline; no websites or providers contacted.`);
    } finally { await sandbox.dispose(); await rm(join(directory, "verify-runtime"), { recursive: true, force: true }); }
    return;
  }
  if (args.some(arg => !["--include-local-folio", "--only-local-folio", "--write-public-summary"].includes(arg))) throw new Error("Options: --include-local-folio, --only-local-folio, --write-public-summary, or --verify-offline <batchId>.");
  const localOnly = args.includes("--only-local-folio");
  const tools = localOnly ? [] : validateDeveloperTools(JSON.parse(await readFile(join(root, "src", "data", "developer-tools.json"), "utf8")));
  const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const directory = join(privateRoot, batchId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const sandbox = await createReadinessSandbox(join(directory, "runtime"));
  try {
    const jobs = tools.map(tool => ({ tool, kind: "public-homepage" as DeveloperToolCaptureKind }));
    if (args.includes("--include-local-folio") || localOnly) jobs.push({ tool: { id: "folio-local", name: "Folio", category: "Local preview", websiteUrl: LOCAL_FOLIO_URL }, kind: "local-preview" });
    const captures = await mapDeveloperTools(jobs, async ({ tool, kind }) => {
      const capture = await evaluateDeveloperTool(tool, kind, sandbox.evaluate);
      await writeFile(join(directory, `${tool.id}.json`), JSON.stringify(capture, null, 2) + "\n", { mode: 0o600 });
      console.log(`${tool.name}: ${capture.result.score === null ? "unavailable" : `${capture.result.score}/100 page readiness`} (${kind})`);
      return capture;
    });
    const summary: DeveloperToolReadinessSummary = { schemaVersion: "developer-tool-readiness-v1", suiteVersion: EVALUATION_VERSION,
      generatedAt: new Date().toISOString(), batchId, scope: "Homepage HTML only; no JavaScript or API tasks", runtime: "workerd",
      evaluatorSourceHash: hashCapturedText(await readFile(evaluatorFile, "utf8")), captureLimitBytes: DEVELOPER_TOOL_CAPTURE_LIMIT,
      timeoutMs: DEVELOPER_TOOL_TIMEOUT, results: captures.map(capture => capture.result) };
    await writeFile(join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
    if (args.includes("--write-public-summary")) {
      const published = publicHomepageSummary(summary);
      if (published) {
        const target = join(root, "src", "data", "developer-tool-evaluations.json");
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.tmp`;
        await writeFile(temporary, JSON.stringify(published, null, 2) + "\n"); await rename(temporary, target);
        console.log("Wrote public homepage summary; local previews and full captures remain in ignored local storage.");
      } else {
        console.log("No public homepages in this batch; the public summary is unchanged. Local previews remain private.");
      }
    }
    console.log(`Batch ${batchId}. ${summary.results.filter(result => result.status === "complete").length}/${summary.results.length} pages measured. No model calls or API transactions.`);
  } finally { await sandbox.dispose(); await rm(join(directory, "runtime"), { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : "Developer-tool evaluation failed."); process.exitCode = 1; });
}
