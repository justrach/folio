import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serveFolioMcp, invokeFolioTool, folioTools, type FolioToolContext } from "../src/lib/folio-mcp";
import { FOLIO_APP_CALLS, FOLIO_APP_MIME, FOLIO_APP_URI } from "../src/lib/folio-app";
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
test("Folio's MCP App: two read tools point at one ui:// page, read with resources/read; the no-key endpoint has none", async () => {
  const client = new Client({ name: "apps-host-fixture", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), { fetch: async (url, init) => serveFolioMcp(new Request(url, init), context) }));
  let html = "";
  try {
    const tools = (await client.listTools()).tools;
    const withApp = tools.filter(tool => (tool._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri);
    assert.deepEqual(withApp.map(tool => tool.name).sort(), ["folio_find", "folio_website_gaps"]);
    for (const tool of withApp) {
      assert.equal((tool._meta as Record<string, unknown>)["ui/resourceUri"], FOLIO_APP_URI, "the deprecated key some hosts still read");
      assert.equal(tool.annotations?.readOnlyHint, true);
    }
    const listed = (await client.listResources()).resources.find(resource => resource.uri === FOLIO_APP_URI);
    assert.equal(listed?.mimeType, FOLIO_APP_MIME);
    const read = (await client.readResource({ uri: FOLIO_APP_URI })).contents[0] as unknown as { mimeType: string; text: string; _meta: { ui: { prefersBorder: boolean; csp?: unknown } } };
    assert.equal(read.mimeType, "text/html;profile=mcp-app");
    assert.deepEqual(read._meta.ui, { prefersBorder: true }, "no CSP domains: the page gets the host's no-network default");
    html = read.text;
  } finally { await client.close(); }
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /"ui\/initialize"/);
  assert.doesNotThrow(() => new Function(html.split("<script>")[1].split("</script>")[0]), "the page's script parses");
  // The page reaches Folio only through the host, only with read tools, and never puts data into innerHTML.
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|WebSocket|<script src|<link /);
  assert.equal(html.match(/innerHTML/g)?.length, 1, "only the static icons");
  assert.deepEqual([...new Set([...html.matchAll(/callTool\("([a-z_]+)"/g)].map(match => match[1]))].sort(), [...FOLIO_APP_CALLS].sort());
  for (const name of FOLIO_APP_CALLS) {
    const tool = folioTools.find(item => item.name === name)!;
    assert.ok(tool.scope === "read" && !tool.paid && !tool.write, name);
  }
  const open: FolioToolContext = { ...context, principal: { keyId: "", ownerId: "", scopes: [] }, publicIndex: true };
  const publicClient = new Client({ name: "apps-public-fixture", version: "1" });
  await publicClient.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/index-mcp"), { fetch: async (url, init) => serveFolioMcp(new Request(url, init), open) }));
  try {
    assert.equal(publicClient.getServerCapabilities()?.resources, undefined);
    assert.ok((await publicClient.listTools()).tools.every(tool => tool._meta === undefined));
  } finally { await publicClient.close(); }
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
