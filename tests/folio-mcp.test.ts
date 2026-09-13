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
  const sandbox: FolioToolContext = { ...context, sandbox: { grantId: "grant", ownerId: "alice", domain: "example.com", runId: "run" } };
  const body = await (await serveFolioMcp(rpc("tools/list"), sandbox)).json();
  assert.deepEqual(body.result.tools.map((tool: { name: string }) => tool.name), ["folio_sandbox_seo"]);
  const paid = await (await serveFolioMcp(rpc("tools/list"), { ...context, principal: { ...context.principal, scopes: ["read", "seo", "evaluate"] } })).json();
  const seo = paid.result.tools.find((tool: { name: string }) => tool.name === "folio_seo_lookup");
  assert.deepEqual(seo.inputSchema.required.sort(), ["confirmSpend", "domain", "requestKey"]);
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
