import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { serveFolioMcp, folioToolError, type FolioToolContext, type invokeFolioTool } from "../src/lib/folio-mcp";
import { AgentApiError } from "../src/lib/agent-api-key-store";
import { SeoDataError } from "../src/lib/dataforseo";

const context = { db: {}, principal: { keyId: "fixture", ownerId: "alice", scopes: ["read", "evaluate"] }, env: {} } as FolioToolContext;
async function connect(execute?: typeof invokeFolioTool) {
  const client = new Client({ name: "contract-fixture", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), {
    fetch: async (url, init) => serveFolioMcp(new Request(url, init), context, execute),
  }));
  return client;
}

test("published envelopes reject empty, ambiguous and malformed outputs and validate real SDK results", async () => {
  const client = await connect(async () => ({ fixture: true }));
  try {
    const tools = (await client.listTools()).tools;
    const validators = new AjvJsonSchemaValidator();
    const success = await client.callTool({ name: "folio_index", arguments: {} });
    const error = await client.callTool({ name: "folio_observation", arguments: { kind: "website" } });
    for (const tool of tools) {
      const validate = validators.getValidator(tool.outputSchema!);
      assert.equal(validate(success.structuredContent).valid, true, tool.name);
      assert.equal(validate(error.structuredContent).valid, true, tool.name);
      for (const malformed of [{}, { result: null }, { result: [], error: {} }, { result: {}, ...(error.structuredContent as Record<string, unknown>) }, { error: { code: "invalid_input" } }]) {
        assert.equal(validate(malformed).valid, false, `${tool.name}: ${JSON.stringify(malformed)}`);
      }
    }
    assert.deepEqual(JSON.parse((success.content as { text: string }[])[0].text), success.structuredContent);
  } finally { await client.close(); }
});

test("published target alternatives match preflight and prevent invalid target execution", async () => {
  let executed = 0;
  const client = await connect(async () => { executed++; return { fixture: true }; });
  try {
    const tools = (await client.listTools()).tools;
    const validators = new AjvJsonSchemaValidator();
    const invalid = [
      { name: "folio_observation", arguments: { kind: "website", caseId: "case" } },
      { name: "folio_evaluate", arguments: { kind: "website", websiteId: "site", caseId: "case", requestKey: "fixture-key", confirmSpend: true } },
      { name: "folio_targets", arguments: { kind: "website", suiteId: "suite" } },
      { name: "folio_targets", arguments: { searchMode: "open-web" } },
      { name: "folio_run_history", arguments: { kind: "website", searchMode: "open-web" } },
      { name: "folio_run_history", arguments: { kind: "website", caseId: "case" } },
    ];
    for (const call of invalid) {
      assert.equal(validators.getValidator(tools.find(t => t.name === call.name)!.inputSchema)(call.arguments).valid, false);
      const result = await client.callTool(call);
      assert.equal(result.isError, true);
      assert.equal((result.structuredContent as { error: { code: string } }).error.code, "invalid_input");
    }
    assert.equal(executed, 0);
    const defaults = tools.find(t => t.name === "folio_targets")!;
    assert.equal(validators.getValidator(defaults.inputSchema)({}).valid, true);
    assert.equal((await client.callTool({ name: "folio_targets", arguments: {} })).isError, undefined);
    assert.equal(executed, 1);
  } finally { await client.close(); }
});

test("capabilities disclose conditional SEO permission and missing SEO scope never executes", async () => {
  const discovery = await connect();
  try {
    const result = await discovery.callTool({ name: "folio_capabilities", arguments: {} });
    const payload = result.structuredContent as { result: { supportedFeatures: string[]; tools: { name: string; allowed: boolean; conditionalScopes: unknown[] }[] } };
    assert.ok(payload.result.supportedFeatures.includes("structured-errors"));
    assert.deepEqual(payload.result.tools.find(t => t.name === "folio_evaluate")!.conditionalScopes, [{ when: "useSeoTools=true", requiredScope: "seo", allowed: false }]);
    assert.equal(payload.result.tools.find(t => t.name === "folio_seo_lookup")!.allowed, false);
  } finally { await discovery.close(); }
  let executed = false;
  const client = await connect(async () => { executed = true; return {}; });
  try {
    const result = await client.callTool({ name: "folio_evaluate", arguments: { kind: "keyword", caseId: "case", useSeoTools: true, requestKey: "fixture-key", confirmSpend: true } });
    assert.deepEqual(result.structuredContent, { error: { code: "insufficient_scope", message: "This API key does not permit this action.", retryDisposition: "correct_request_before_retry", requiredScope: "seo" } });
    assert.equal(executed, false);
  } finally { await client.close(); }
});

test("errors distinguish approval, limits, missing records and uncertain execution without leaking internals", async () => {
  for (const [error, code, retry] of [
    [new AgentApiError("missing", 404), "not_found", "correct_request_before_retry"],
    [new AgentApiError("limit", 429), "rate_limited", "wait_then_reuse_same_request_key"],
    [new SeoDataError("approval required", 403, "ACCOUNT_NOT_APPROVED"), "account_not_approved", "correct_request_before_retry"],
    [new SeoDataError("invalid domain", 400, "INVALID_DOMAIN"), "invalid_input", "correct_request_before_retry"],
    [new Error("private internal exception"), "execution_uncertain", "inspect_saved_state_reuse_same_request_key"],
  ] as const) {
    const detail = folioToolError(error, "seo");
    assert.equal(detail.code, code);
    assert.equal(detail.retryDisposition, retry);
    assert.equal(detail.requiredScope, null);
    assert.ok(!detail.message.includes("private internal exception"));
  }
  const client = await connect(async () => undefined);
  try {
    const result = await client.callTool({ name: "folio_index", arguments: {} });
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as { error: { code: string } }).error.code, "execution_uncertain");
  } finally { await client.close(); }
});
