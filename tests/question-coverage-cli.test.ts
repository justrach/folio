import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { captureSandboxWebsite } from "../src/lib/sandbox-website-evidence";
import { PUBLIC_SEARCH_RANKINGS } from "../src/lib/public-search-rankings";

const cli = fileURLToPath(new URL("../scripts/question-coverage.ts", import.meta.url));
const loader = createRequire(import.meta.url).resolve("tsx");
const fakeKey = "offline-question-coverage-credential";

async function fixture(mockSuccess = false) {
  const cwd = await mkdtemp(join(tmpdir(), "folio-question-cli-"));
  const evidence = await captureSandboxWebsite("https://example.com/", {
    fetcher: async () => new Response("<html><head><title>Example coding tool</title></head><body><h1>Terminal coding tool</h1><p>A terminal coding assistant for software developers.</p></body></html>", { headers: { "Content-Type": "text/html" } }),
    save: async () => {},
  });
  await writeFile(join(cwd, "receipt.json"), JSON.stringify({ website: evidence, sandboxId: "PRIVATE_SANDBOX_MARKER", sessionId: "PRIVATE_SESSION_MARKER", requestId: "PRIVATE_REQUEST_MARKER" }));
  await writeFile(join(cwd, "second.json"), JSON.stringify({ website: {
    ...evidence, targetUrl: "https://second.example/",
    pages: evidence.pages.map(page => ({ ...page, url: "https://second.example/" })),
    attempts: evidence.attempts.map(attempt => ({ ...attempt, url: "https://second.example/" })),
  } }));
  const guard = join(cwd, "offline.mjs");
  await writeFile(guard, mockSuccess ? `import { appendFileSync } from "node:fs";
    globalThis.fetch = async (url, init) => {
      if (url !== "https://api.typesafe.ai/v1/systemone") throw new Error("Unexpected fixture URL");
      appendFileSync("fetch-attempts", "fixture\\n");
      const request = JSON.parse(init.body);
      const answers = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
        const options = Object.keys(question.criteria), choice = options[0];
        return [id, { type: "choice", choice, confidence: 0.8,
          probabilities: Object.fromEntries(options.map((option, i) => [option, i === 0 ? 0.8 : 0.1])) }];
      }));
      return Response.json({ model: "jev-fixture-resolved", answers, usage: { input_tokens: 123, output_tokens: 45 } });
    };` : 'import { appendFileSync } from "node:fs"; globalThis.fetch = async () => { appendFileSync("fetch-attempts", "blocked\\n"); throw new Error("Offline test: inference blocked"); };');
  const run = (args: string[], key?: string) => spawnSync(process.execPath, ["--conditions=react-server", "--import", loader, "--import", guard, cli, ...args], {
    cwd, encoding: "utf8", timeout: 15_000,
    // Deliberately do not inherit host credentials or load the repository's .dev.vars.
    env: { PATH: process.env.PATH, NODE_ENV: "test", ...(key === undefined ? {} : { TYPESAFE_API_KEY: key }) },
  });
  const path = (name: string, id = "trial") => join(cwd, ".local", "question-coverage", id, name);
  const plan = (extra: string[] = [], id = "trial") => run(["plan", "--id", id, "--receipt", "receipt.json", ...extra]);
  const absent = async (file: string) => assert.rejects(stat(file), { code: "ENOENT" });
  return { cwd, evidence, run, path, plan, absent, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

function success(result: ReturnType<typeof spawnSync>) {
  assert.equal(result.status, 0, String(result.stderr));
}
function failure(result: ReturnType<typeof spawnSync>) {
  assert.equal(result.status, 1, String(result.stdout) + String(result.stderr));
}

test("CLI help/list/plan/report are offline, private, and preserve an existing plan", async () => {
  const f = await fixture();
  try {
    success(f.run(["--help"]));
    const listed = f.run(["list"]); success(listed);
    const bank = JSON.parse(listed.stdout);
    assert.ok(bank.length >= 3);
    assert.ok(bank.every((q: { id: string; query: string }) => q.id && q.query));
    assert.equal(new Set(bank.map((q: { id: string }) => q.id)).size, bank.length);
    success(f.plan());
    const saved = await readFile(f.path("plan.json"), "utf8");
    const plan = JSON.parse(saved);
    assert.equal(plan.questions.length, 3);
    assert.equal(plan.websites.length, 1);
    assert.doesNotMatch(saved, /PRIVATE_(SANDBOX|SESSION|REQUEST)_MARKER/);
    assert.equal((await stat(f.path("plan.json"))).mode & 0o777, 0o600);
    assert.equal((await stat(join(f.cwd, ".local", "question-coverage", "trial"))).mode & 0o777, 0o700);
    const report = f.run(["report", "--id", "trial"]); success(report);
    assert.ok(report.stdout.trim().length > 0);
    failure(f.plan());
    assert.equal(await readFile(f.path("plan.json"), "utf8"), saved);
    await f.absent(f.path("reservation.json"));
    await f.absent(join(f.cwd, "fetch-attempts"));
    success(f.plan(["--receipt", "second.json", "--question", bank[0].id, "--question", bank[1].id, "--model", "glm-5.3-flash"], "two-sites"));
    const two = JSON.parse(await readFile(f.path("plan.json", "two-sites"), "utf8"));
    assert.equal(two.websites.length, 2);
    assert.deepEqual(two.questions.map((q: { id: string }) => q.id), [bank[0].id, bank[1].id]);
  } finally { await f.cleanup(); }
});

test("confirmation and nonempty key are required before any reservation", async () => {
  const f = await fixture();
  try {
    success(f.plan());
    const unconfirmed = f.run(["run", "--id", "trial"], fakeKey);
    failure(unconfirmed); assert.match(unconfirmed.stderr, /confirm-spend/);
    await f.absent(f.path("reservation.json"));
    for (const key of [undefined, "", "   "]) {
      const noKey = f.run(["run", "--id", "trial", "--confirm-spend"], key);
      failure(noKey); assert.match(noKey.stderr, /TYPESAFE_API_KEY/);
      await f.absent(f.path("reservation.json"));
    }
    await f.absent(join(f.cwd, "fetch-attempts"));
  } finally { await f.cleanup(); }
});

test("all existing reservation states block inference and preserve exact bytes", async () => {
  const f = await fixture();
  try {
    for (const status of ["pending", "completed", "needs_attention"]) {
      success(f.plan([], status));
      const saved = JSON.stringify({ status, costUsd: null });
      await writeFile(f.path("reservation.json", status), saved, { flag: "wx", mode: 0o600 });
      const repeat = f.run(["run", "--id", status, "--confirm-spend"], fakeKey);
      failure(repeat); assert.match(repeat.stderr, /reservation already exists/);
      assert.equal(await readFile(f.path("reservation.json", status), "utf8"), saved);
    }
    await f.absent(join(f.cwd, "fetch-attempts"));
  } finally { await f.cleanup(); }
});

test("offline inference failure leaves immutable pending reservation and unknown-cost needs-attention outcome", async () => {
  const f = await fixture();
  try {
    success(f.plan());
    const attempt = f.run(["run", "--id", "trial", "--confirm-spend"], fakeKey);
    failure(attempt);
    assert.doesNotMatch(attempt.stdout + attempt.stderr, new RegExp(fakeKey));
    assert.equal(await readFile(join(f.cwd, "fetch-attempts"), "utf8"), "blocked\n");
    const reservation = await readFile(f.path("reservation.json"), "utf8");
    assert.equal(JSON.parse(reservation).status, "pending");
    const outcome = JSON.parse(await readFile(f.path("outcome.json"), "utf8"));
    assert.equal(outcome.status, "needs_attention");
    assert.equal(outcome.costUsd, null);
    assert.equal(outcome.usage, null);
    assert.ok(outcome.latencyMs >= 0);
    await f.absent(f.path("result.json"));
    failure(f.run(["run", "--id", "trial", "--confirm-spend"], fakeKey));
    assert.equal(await readFile(f.path("reservation.json"), "utf8"), reservation);
    assert.equal(await readFile(join(f.cwd, "fetch-attempts"), "utf8"), "blocked\n");
    success(f.run(["report", "--id", "trial"]));
  } finally { await f.cleanup(); }
});

test("credential-bearing outbound body is refused after reservation without dispatch", async () => {
  const f = await fixture();
  try {
    success(f.plan());
    // An actual public source substring serves as the synthetic configured credential.
    const attempt = f.run(["run", "--id", "trial", "--confirm-spend"], "Terminal coding tool");
    failure(attempt);
    await f.absent(join(f.cwd, "fetch-attempts"));
    assert.equal(JSON.parse(await readFile(f.path("outcome.json"), "utf8")).status, "needs_attention");
  } finally { await f.cleanup(); }
});

test("bounded inputs, safe IDs, receipt count and saved plan validation fail offline", async () => {
  const f = await fixture();
  try {
    for (const args of [
      ["plan", "--id", "../escape", "--receipt", "receipt.json"],
      ["plan", "--id", "trial", "--receipt", "receipt.json", "--receipt", "receipt.json", "--receipt", "receipt.json"],
      ["plan", "--id", "trial", "--receipt", "receipt.json", "--question", "not-a-bank-id"],
      ["report", "--id", "trial", "--confirm-spend"],
    ]) failure(f.run(args));
    await writeFile(join(f.cwd, "large.json"), " ".repeat(2 * 1024 * 1024 + 1));
    failure(f.run(["plan", "--id", "large", "--receipt", "large.json"]));
    success(f.plan());
    const plan = JSON.parse(await readFile(f.path("plan.json"), "utf8"));
    plan.requestSha256 = "0".repeat(64);
    await writeFile(f.path("plan.json"), JSON.stringify(plan));
    failure(f.run(["run", "--id", "trial", "--confirm-spend"], fakeKey));
    await f.absent(f.path("reservation.json"));
    await f.absent(join(f.cwd, "fetch-attempts"));
  } finally { await f.cleanup(); }
});

test("receipt and artifact symlinks cannot escape cwd", async () => {
  const f = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "folio-question-outside-"));
  try {
    success(f.run(["--help"]));
    await writeFile(join(outside, "receipt.json"), JSON.stringify({ website: f.evidence }));
    failure(f.run(["plan", "--id", "absolute", "--receipt", join(outside, "receipt.json")]));
    await symlink(join(outside, "receipt.json"), join(f.cwd, "linked.json"));
    failure(f.run(["plan", "--id", "linked", "--receipt", "linked.json"]));
    await symlink(outside, join(f.cwd, ".local"));
    failure(f.plan());
    await assert.rejects(stat(join(outside, "question-coverage")), { code: "ENOENT" });
    await f.absent(join(f.cwd, "fetch-attempts"));
  } finally { await f.cleanup(); await rm(outside, { recursive: true, force: true }); }
});

test("completed fixture inference preserves the resolved model, reopens without fetch, and never retries", async () => {
  const f = await fixture(true);
  try {
    success(f.plan());
    assert.match(await readFile(f.path("plan.md"), "utf8"), /Prepared only/);
    success(f.run(["run", "--id", "trial", "--confirm-spend"], fakeKey));
    const result = JSON.parse(await readFile(f.path("result.json"), "utf8"));
    assert.equal(result.requestedModel, "jev-latest");
    assert.equal(result.model, "jev-fixture-resolved");
    assert.equal(result.rows.length, 3);
    assert.ok(result.rows.every((row: { status: string }) => row.status === "direct"));
    assert.equal(result.humanReviewRequired, true);
    const outcome = JSON.parse(await readFile(f.path("outcome.json"), "utf8"));
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.model, result.model);
    assert.equal(outcome.usage.input_tokens, 123);
    assert.equal(outcome.costUsd, null);
    assert.ok(outcome.latencyMs >= 0);
    const report = f.run(["report", "--id", "trial"]); success(report);
    assert.match(report.stdout, /Advisory model classifications/);
    assert.match(report.stdout, /resolved model: jev-fixture-resolved/);
    assert.equal(await readFile(f.path("report.md"), "utf8"), report.stdout);
    assert.equal(await readFile(join(f.cwd, "fetch-attempts"), "utf8"), "fixture\n");
    const reservation = await readFile(f.path("reservation.json"), "utf8");
    failure(f.run(["run", "--id", "trial", "--confirm-spend"], fakeKey));
    assert.equal(await readFile(f.path("reservation.json"), "utf8"), reservation);
    assert.equal(await readFile(join(f.cwd, "fetch-attempts"), "utf8"), "fixture\n");
    result.rows[0].status = "irrelevant";
    await writeFile(f.path("result.json"), JSON.stringify(result));
    failure(f.run(["report", "--id", "trial"]));
  } finally { await f.cleanup(); }
});

test("existing-index CLI plan, one fixture inference, exact preview and explicit local publication stay linked to the original result", async () => {
  const f = await fixture(true);
  try {
    const observation = PUBLIC_SEARCH_RANKINGS.observations.find(item => item.recommendations.some(row => row.url?.startsWith("https:")))!;
    const recommendation = observation.recommendations.find(row => row.url?.startsWith("https:"))!;
    const query = PUBLIC_SEARCH_RANKINGS.queries.find(item => item.id === observation.queryId)!;
    const origin = new URL(recommendation.url!).origin + "/";
    const evidence = { ...f.evidence, targetUrl: origin, pages: f.evidence.pages.map(page => ({ ...page, url: origin })), attempts: f.evidence.attempts.map(attempt => ({ ...attempt, url: origin })) };
    await writeFile(join(f.cwd, "receipt.json"), JSON.stringify({ website: evidence, sessionId: "PRIVATE_SESSION_MARKER" }));
    const args = ["plan", "--id", "trial", "--observation", observation.id, "--position", String(recommendation.position), "--receipt", "receipt.json"];
    success(f.run(args));
    const plan = JSON.parse(await readFile(f.path("plan.json"), "utf8"));
    assert.equal(plan.format, "folio-index-question-coverage-plan-v1");
    assert.equal(plan.coverage.questions[0].id, query.id); assert.equal(plan.coverage.questions[0].query, query.query);
    assert.deepEqual(plan.rankings.observations[0], observation);
    assert.ok(!JSON.stringify(plan.coverage.request).includes(observation.id));
    failure(f.run(["preview", "--id", "trial"]));
    await f.absent(join(f.cwd, "fetch-attempts"));
    success(f.run(["run", "--id", "trial", "--confirm-spend"], fakeKey));
    const preview = f.run(["preview", "--id", "trial"]); success(preview);
    const projection = JSON.parse(preview.stdout);
    assert.equal(projection.records[0].queryId, query.id);
    assert.equal(projection.records[0].observationId, observation.id);
    assert.equal(projection.records[0].position, recommendation.position);
    assert.equal(projection.records[0].recommendationUrl, recommendation.url);
    assert.doesNotMatch(preview.stdout, /PRIVATE_SESSION_MARKER|usage|htmlSha256/);
    const hash = preview.stderr.match(/SHA-256: ([a-f0-9]{64})/)![1];
    await mkdir(join(f.cwd, "src", "data"), { recursive: true });
    const artifact = join(f.cwd, "src", "data", "public-question-coverage.json");
    const empty = JSON.stringify({ format: "folio-public-question-coverage-v1", records: [] }) + "\n";
    await writeFile(artifact, empty);
    failure(f.run(["publish", "--id", "trial", "--review-sha256", hash]));
    failure(f.run(["publish", "--id", "trial", "--confirm-publish", "--review-sha256", "0".repeat(64)]));
    assert.equal(await readFile(artifact, "utf8"), empty);
    success(f.run(["publish", "--id", "trial", "--confirm-publish", "--review-sha256", hash]));
    assert.deepEqual(JSON.parse(await readFile(artifact, "utf8")), projection);
    assert.equal(await readFile(join(f.cwd, "fetch-attempts"), "utf8"), "fixture\n");
    // A snapshot with the same public IDs but changed question wording cannot be published.
    const edited = { format: PUBLIC_SEARCH_RANKINGS.format, queries: [{ ...query, query: query.query + " Changed wording" }], observations: [observation] };
    await writeFile(join(f.cwd, "snapshot.json"), JSON.stringify(edited));
    success(f.run([...args.map(value => value === "trial" ? "changed" : value), "--rankings", "snapshot.json"]));
    success(f.run(["run", "--id", "changed", "--confirm-spend"], fakeKey));
    const changed = f.run(["preview", "--id", "changed"]); success(changed);
    const changedHash = changed.stderr.match(/SHA-256: ([a-f0-9]{64})/)![1];
    failure(f.run(["publish", "--id", "changed", "--confirm-publish", "--review-sha256", changedHash]));
    assert.deepEqual(JSON.parse(await readFile(artifact, "utf8")), projection);
  } finally { await f.cleanup(); }
});
