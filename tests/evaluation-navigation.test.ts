import assert from "node:assert/strict";
import test from "node:test";
import { evaluationHref, readEvaluationIntent } from "../src/lib/evaluation-navigation";

test("evaluation handoff round-trips bounded context through one fixed local path", () => {
  const href = evaluationHref({ targetUrl: "EXAMPLE.com/pricing?plan=team#plans", seoReportId: "seo_123", runId: "run-123", baselineId: "base_123" });
  assert.equal(href, "/evaluations?target=https%3A%2F%2Fexample.com%2Fpricing%3Fplan%3Dteam&seoReport=seo_123&run=run-123&baseline=base_123");
  assert.deepEqual(readEvaluationIntent(new URL(href, "https://folio.example").searchParams), {
    targetUrl: "https://example.com/pricing?plan=team", seoReportId: "seo_123", runId: "run-123", baselineId: "base_123",
  });
  assert.equal(evaluationHref(), "/evaluations");
  assert.deepEqual(readEvaluationIntent(new URLSearchParams()), {});
});

test("navigation rejects credentials, malformed schemes, IP literals and local/reserved website targets", () => {
  for (const value of [
    "http://example.com", "javascript:alert(1)", "data:text/html,hello", "//example.com", "https:example.com",
    "https://user:password@example.com", "https://example.com:8443", "https://example.com\\@localhost/",
    "localhost", "https://localhost.localdomain/", "http://127.0.0.1", "https://127.0.0.1", "https://127.1",
    "https://2130706433", "https://0x7f000001", "https://10.1.2.3", "https://172.16.0.2", "https://192.168.1.2",
    "https://169.254.169.254", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://[fc00::1]",
    "https://printer.local", "https://private.internal", "https://sable.example", "https://demo.test", "https://something.invalid",
    "https://example.com\n.evil.org", "https://example.com/ with-space", "https://a.-bad.com", "https://bad-.com", "x".repeat(2049),
  ]) {
    assert.equal(evaluationHref({ targetUrl: value, runId: "valid-run" }), "/evaluations?run=valid-run", value);
    assert.deepEqual(readEvaluationIntent(new URLSearchParams({ target: value })), {}, value);
  }
});

test("safe website prefills normalize case, IDN domains, trailing dots and default HTTPS ports", () => {
  for (const [value, expected] of [
    ["https://EXAMPLE.com:443/docs", "https://example.com/docs"],
    ["example.com.", "https://example.com/"],
    ["https://bücher.de/", "https://xn--bcher-kva.de/"],
  ]) {
    assert.equal(readEvaluationIntent(new URLSearchParams({ target: value })).targetUrl, expected);
  }
});

test("duplicate or malformed identifiers are ignored without authorizing other fields", () => {
  const params = new URLSearchParams("run=first&run=second&baseline=ok_123&seoReport=../../other&target=https%3A%2F%2Fexample.com&redirect=https%3A%2F%2Fevil.com");
  assert.deepEqual(readEvaluationIntent(params), { targetUrl: "https://example.com/", baselineId: "ok_123" });
  for (const id of ["", "../secret", "run/one", "bad value", "bad%20id", "x".repeat(129), "-first", "<script>"]) {
    assert.equal(evaluationHref({ runId: id, seoReportId: id, baselineId: id }), "/evaluations");
  }
  assert.equal(readEvaluationIntent(new URLSearchParams({ run: "x".repeat(128) })).runId?.length, 128);
  assert.deepEqual(readEvaluationIntent(new URLSearchParams("target=example.com&target=other.com&run=one")), { runId: "one" });
});
