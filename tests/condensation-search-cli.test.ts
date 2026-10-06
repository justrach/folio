import assert from "node:assert/strict";
import { test } from "node:test";
import { ExperimentUsageError, parseCondensationSearchCli } from "../scripts/condensation-search-experiment";

test("sandbox experiment help, inspection and reports do not require spending options", () => {
  assert.deepEqual(parseCondensationSearchCli([]), { command: "help" });
  assert.deepEqual(parseCondensationSearchCli(["inspect", "--id", "trial-1"]), { command: "inspect", id: "trial-1" });
  assert.deepEqual(parseCondensationSearchCli(["report", "--id", "trial-1"]), { command: "report", id: "trial-1" });
  assert.throws(() => parseCondensationSearchCli(["inspect", "--id", "trial-1", "--confirm-spend"]), ExperimentUsageError);
  assert.throws(() => parseCondensationSearchCli(["report", "--id", "trial-1", "--confirm-spend"]), ExperimentUsageError);
  assert.throws(() => parseCondensationSearchCli(["report", "--id", "trial-1", "--query", "new work"]), ExperimentUsageError);
});

test("sandbox experiment requires a deliberate paid start and bounded explicit inputs", () => {
  const args = ["run", "--id", "trial-1", "--query", "Which coding tools have a terminal?"];
  assert.throws(() => parseCondensationSearchCli(args), /confirm-spend/);
  assert.deepEqual(parseCondensationSearchCli([...args, "--confirm-spend"]), {
    command: "run", id: "trial-1", query: "Which coding tools have a terminal?", model: "glm-5.3-flash",
  });
  assert.throws(() => parseCondensationSearchCli([...args, "--query", "duplicate", "--confirm-spend"]), ExperimentUsageError);
  assert.throws(() => parseCondensationSearchCli([...args, "--model", "model; echo injected", "--confirm-spend"]), ExperimentUsageError);
  assert.throws(() => parseCondensationSearchCli(["run", "--id", "trial-1", "--query", "x".repeat(2_001), "--confirm-spend"]), ExperimentUsageError);
});

test("website mode is an explicit captured-page paid start, with optional evaluation focus", () => {
  const args = ["run", "--id", "website-1", "--website", "https://example.com/"];
  assert.throws(() => parseCondensationSearchCli(args), /confirm-spend/);
  assert.deepEqual(parseCondensationSearchCli([...args, "--confirm-spend"]), {
    command: "run", id: "website-1", query: "Evaluate the captured website's product clarity, audience, pricing clarity and technical HTML issues.", model: "glm-5.3-flash", websiteUrl: "https://example.com/",
  });
  assert.equal(parseCondensationSearchCli([...args, "--query", "Focus on pricing clarity.", "--confirm-spend"]).command, "run");
  for (const website of ["http://example.com", "https://user:password@example.com", "https://127.0.0.1/", "https://example.com/?token=secret", "https://example.com:3333/"]) {
    assert.throws(() => parseCondensationSearchCli(["run", "--id", "website-1", "--website", website, "--confirm-spend"]), ExperimentUsageError);
  }
  assert.throws(() => parseCondensationSearchCli(["inspect", "--id", "website-1", "--website", "https://example.com/"]), ExperimentUsageError);
  assert.throws(() => parseCondensationSearchCli(["report", "--id", "website-1", "--website", "https://example.com/"]), ExperimentUsageError);
});

test("sandbox experiment IDs cannot select files outside the private experiment directory", () => {
  for (const id of ["..", "../other", "/tmp/other", "a/b", "a".repeat(65)]) {
    assert.throws(() => parseCondensationSearchCli(["inspect", "--id", id]), ExperimentUsageError);
    assert.throws(() => parseCondensationSearchCli(["report", "--id", id]), ExperimentUsageError);
  }
});
