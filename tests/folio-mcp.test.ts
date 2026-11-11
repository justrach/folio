import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serveFolioMcp, invokeFolioTool, type FolioToolContext } from "../src/lib/folio-mcp";
import { parseAgentObservation, parseAgentQuery } from "../src/lib/agent-api-input";

const context = { db: {}, principal: { keyId: "fixture", ownerId: "alice", scopes: ["read"] }, env: {} } as FolioToolContext;
test("Streamable HTTP SDK client initializes, discovers scoped tools, validates input and handles notifications", async () => {
  const calls: string[] = [];
  const client = new Client({ name: "fixture-client", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), {
    fetch: async (url, init) => serveFolioMcp(new Request(url, init), context, async (name,args,ctx) => { calls.push(name); return invokeFolioTool(name,args,ctx); }),
  });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    assert.ok(listed.tools.some(tool => tool.name === "folio_index"));
    assert.ok(!listed.tools.some(tool => tool.name === "folio_seo_lookup" || tool.name === "folio_evaluate"));
    const result = await client.callTool({ name: "folio_index", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal((result.structuredContent as {result:{format:string}}).result.format, "folio-public-dashboard-v1");
    assert.equal((await client.callTool({ name: "folio_run", arguments: { kind: "website" } })).isError, true);
    assert.equal((await client.callTool({ name: "folio_index", arguments: { ownerId: "bob" } })).isError, true);
    assert.deepEqual(calls, ["folio_index"]);
  } finally { await client.close(); }
});
test("sandbox exposes only one fixed-domain tool; paid schemas require explicit spend and retry identity", async () => {
  const rpc = (method: string) => new Request("https://folio.example/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }) });
  const sandbox: FolioToolContext = { ...context, sandbox: {toolVersion:1, grantId: "grant", ownerId: "alice", domain: "example.com", runId: "run" } };
  const body = await (await serveFolioMcp(rpc("tools/list"), sandbox)).json();
  assert.deepEqual(body.result.tools.map((tool: { name: string }) => tool.name), ["folio_sandbox_seo"]);
  const paid = await (await serveFolioMcp(rpc("tools/list"), { ...context, principal: { ...context.principal, scopes: ["read", "seo", "evaluate"] } })).json();
  const seo = paid.result.tools.find((tool: { name: string }) => tool.name === "folio_seo_lookup");
  assert.deepEqual(seo.inputSchema.required.sort(), ["confirmSpend", "domain", "requestKey"]);
});
test("guided prompts follow the key's permissions; change recording needs its own scope and is not read-only", async () => {
  const connect = async (scopes: FolioToolContext["principal"]["scopes"], calls: string[] = []) => {
    const client = new Client({ name: "prompt-fixture", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), {
      fetch: async (url, init) => serveFolioMcp(new Request(url, init), { ...context, principal: { ...context.principal, scopes } }, async name => { calls.push(name); return {}; }),
    }));
    return client;
  };
  const calls: string[] = [];
  const reader = await connect(["read"], calls);
  try {
    assert.deepEqual((await reader.listPrompts()).prompts.map(prompt => prompt.name), ["improve_aeo", "review_aeo_changes"]);
    const prompt = await reader.getPrompt({ name: "improve_aeo", arguments: { website: "example.com" } });
    const text = (prompt.messages[0].content as { text: string }).text;
    assert.ok(text.includes("example.com") && text.includes("This key cannot record changes"));
    const tools = (await reader.listTools()).tools.map(tool => tool.name);
    assert.ok(tools.includes("folio_changes") && !tools.includes("folio_change_record") && !tools.includes("folio_change_update"));
    const denied = await reader.callTool({ name: "folio_change_record", arguments: { websiteId: "site", title: "Fixture", summary: "Fixture", caseIds: ["case"], requestKey: "fixture-key" } });
    assert.deepEqual((denied.structuredContent as { error: { code: string; requiredScope: string } }).error.requiredScope, "changes");
    assert.deepEqual(calls, []);
  } finally { await reader.close(); }
  const recorder = await connect(["read", "changes"]);
  try {
    const tools = (await recorder.listTools()).tools;
    const record = tools.find(tool => tool.name === "folio_change_record")!;
    assert.equal(record.annotations?.readOnlyHint, false); assert.equal(record.annotations?.openWorldHint, false);
    assert.deepEqual([...(record.inputSchema.required ?? [])].sort(), ["caseIds", "requestKey", "summary", "title", "websiteId"]);
    assert.equal(tools.find(tool => tool.name === "folio_changes")!.annotations?.readOnlyHint, true);
    assert.ok(!tools.some(tool => tool.name === "folio_evaluate"));
    const text = ((await recorder.getPrompt({ name: "improve_aeo" })).messages[0].content as { text: string }).text;
    assert.ok(text.includes("Call folio_change_record") && text.includes("This key cannot start evaluations"));
  } finally { await recorder.close(); }
});
test("the no-key index endpoint exposes only published-index reads, no prompts and no workspace tool", async () => {
  const calls: string[] = [];
  const open: FolioToolContext = { ...context, principal: { keyId: "", ownerId: "", scopes: [] }, publicIndex: true };
  const client = new Client({ name: "public-index-fixture", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/index-mcp"), {
    fetch: async (url, init) => serveFolioMcp(new Request(url, init), open, async (name, args, ctx) => { calls.push(name); return invokeFolioTool(name, args, ctx); }),
  }));
  try {
    assert.equal(client.getServerVersion()?.name, "folio-index");
    assert.equal(client.getServerCapabilities()?.prompts, undefined);
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(tool => tool.name), ["folio_index_overview", "folio_index_search", "folio_index_answer", "folio_index_website"]);
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true && tool.annotations?.openWorldHint === false));
    const overview = (await client.callTool({ name: "folio_index_overview", arguments: {} })).structuredContent as { result: { publishedQuestions: number; source: string } };
    assert.ok(overview.result.publishedQuestions > 0); assert.equal(overview.result.source, "bundled-snapshot");
    const search = await client.callTool({ name: "folio_index_search", arguments: { q: "project tools", limit: 2 } });
    assert.equal(search.isError, undefined);
    const found = search.structuredContent as { result: { items: unknown[]; recorded: boolean } };
    assert.equal(found.result.items.length, 2); assert.equal(found.result.recorded, false);
    // Workspace tools are unknown here, including the full-dataset read and anything owner-scoped or paid.
    for (const [name, args] of [["folio_targets", {}], ["folio_index", {}], ["folio_changes", {}], ["folio_evaluate", { kind: "keyword", caseId: "case", requestKey: "fixture-key", confirmSpend: true }]] as const)
      assert.equal(((await client.callTool({ name, arguments: args })).structuredContent as { error: { code: string } }).error.code, "not_found", name);
    assert.equal(((await client.callTool({ name: "folio_index_search", arguments: { ownerId: "alice" } })).structuredContent as { error: { code: string } }).error.code, "invalid_input");
    assert.deepEqual(calls, ["folio_index_overview", "folio_index_search"]);
  } finally { await client.close(); }
  await assert.rejects(invokeFolioTool("folio_targets", {}, open));
});
test("SEO selection is explicit, keyword-only and survives saved-query parsing", () => {
  assert.deepEqual(parseAgentObservation(parseAgentQuery("https://folio.example/?kind=keyword&caseId=case&useSeoTools=true")), { kind: "keyword", caseId: "case", maxAgeSeconds: 86400, useSeoTools: true });
  assert.throws(() => parseAgentObservation({ kind: "website", websiteId: "site", useSeoTools: true }));
});

test("protocol errors are structured and capability discovery explains unavailable paid tools",async()=>{
  const client=new Client({name:"schema-fixture",version:"1"});
  await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"),{fetch:async(url,init)=>serveFolioMcp(new Request(url,init),context)}));
  try{
    const invalid=await client.callTool({name:"folio_observation",arguments:{kind:"website",websiteId:"site",caseId:"case"}});
    assert.equal(invalid.isError,true);assert.equal((invalid.structuredContent as {error:{code:string}}).error.code,"invalid_input");
    const forbidden=await client.callTool({name:"folio_evaluate",arguments:{kind:"website",websiteId:"site",requestKey:"fixture-key",confirmSpend:true}});
    assert.equal((forbidden.structuredContent as {error:{code:string}}).error.code,"insufficient_scope");
    const capabilities=await client.callTool({name:"folio_capabilities",arguments:{}});
    assert.ok(JSON.stringify(capabilities.structuredContent).includes('"allowed":false'));
    assert.ok((await client.listTools()).tools.every(t=>t.outputSchema));
  }finally{await client.close();}
});
