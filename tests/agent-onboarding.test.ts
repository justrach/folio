import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_PERMISSIONS, CONNECTION_TROUBLESHOOTING, agentClients, connectionTestCommand, exportLine, mcpEndpoint, starterPrompts } from "../src/lib/agent-onboarding";
import { folioTools } from "../src/lib/folio-mcp";

const origin = "https://usefolio.site";

test("every client's setup points at this Folio's MCP endpoint and never contains a key", () => {
  const clients = agentClients(origin);
  assert.deepEqual(clients.map(client => client.id), ["claude-code", "codex", "cursor", "vscode", "claude-desktop", "other"]);
  for (const client of clients) {
    const text = client.blocks.map(block => block.code).join("\n");
    assert.ok(text.includes("https://usefolio.site/api/mcp"), client.id);
    assert.doesNotMatch(text, /folio_v1_/, `${client.id} must not embed a key`);
    for (const block of client.blocks.filter(block => block.language === "json")) assert.doesNotThrow(() => JSON.parse(block.code), `${client.id}: ${block.label}`);
  }
  // The exact strings checked against the real clients on 11 November 2026.
  const byId = Object.fromEntries(clients.map(client => [client.id, client]));
  assert.equal(byId["claude-code"].blocks[0].code, 'claude mcp add --transport http --scope user folio https://usefolio.site/api/mcp \\\n  --header "Authorization: Bearer $FOLIO_API_KEY"');
  assert.equal(JSON.parse(byId["claude-code"].blocks[1].code).mcpServers.folio.headers.Authorization, "Bearer ${FOLIO_API_KEY}");
  assert.equal(byId.codex.blocks[0].code, "codex mcp add folio --url https://usefolio.site/api/mcp --bearer-token-env-var FOLIO_API_KEY");
  assert.equal(JSON.parse(byId.cursor.blocks[0].code).mcpServers.folio.headers.Authorization, "Bearer ${env:FOLIO_API_KEY}");
  const vscode = JSON.parse(byId.vscode.blocks[0].code);
  assert.equal(vscode.servers.folio.headers.Authorization, `Bearer \${input:${vscode.inputs[0].id}}`);
  assert.equal(vscode.inputs[0].password, true);
  assert.deepEqual(JSON.parse(byId["claude-desktop"].blocks[0].code).mcpServers.folio.args, ["-y", "mcp-remote", "https://usefolio.site/api/mcp", "--header", "Authorization:${FOLIO_AUTH}"]);
  // Clients that ignore shell variables are flagged so the page says where to paste the key.
  assert.deepEqual(clients.filter(client => !client.readsShellEnvironment).map(client => client.id), ["vscode", "claude-desktop", "other"]);
  assert.equal(mcpEndpoint("http://localhost:3012/"), "http://localhost:3012/api/mcp");
});

test("the terminal check reads the key from the environment and calls a read-only tool", () => {
  const command = connectionTestCommand(origin);
  assert.match(command, /Authorization: Bearer \$FOLIO_API_KEY/);
  assert.match(command, /"name":"folio_organizations"/);
  assert.doesNotMatch(command, /folio_v1_/);
  assert.equal(exportLine("folio_v1_abc"), 'export FOLIO_API_KEY="folio_v1_abc"');
});

test("the permission guide covers every MCP tool with its real scope", () => {
  const listed = new Map(AGENT_PERMISSIONS.flatMap(group => group.tools.map(tool => [tool, group.scope] as const)));
  for (const tool of folioTools) assert.equal(listed.get(tool.name), tool.scope, `${tool.name} is listed under its scope`);
  assert.equal(listed.size, folioTools.length, "no tool is listed that the server does not offer");
  for (const group of AGENT_PERMISSIONS) {
    assert.ok(group.highlights.every(tool => group.tools.includes(tool)), group.scope);
    assert.equal(group.charges, folioTools.some(tool => tool.scope === group.scope && tool.paid), `${group.scope} charges`);
  }
});

test("starter prompts name real tools, ask nothing paid, and adapt to the website and organization", () => {
  const names = new Set(folioTools.map(tool => tool.name));
  const team = starterPrompts({ domain: "manus.im", organization: "Manus" });
  for (const prompt of team) {
    assert.ok(prompt.tools.every(tool => names.has(tool)), prompt.id);
    assert.ok(prompt.tools.every(tool => prompt.text.includes(tool) || prompt.id === "fix"), `${prompt.id} mentions its tools`);
    assert.ok(prompt.scopes.every(scope => scope === "read" || scope === "changes"), `${prompt.id} needs no paid permission`);
  }
  assert.match(team[0].text, /folio_organizations to find manus\.im in Manus/);
  assert.match(team[2].text, /domain manus\.im/);
  const solo = starterPrompts();
  assert.match(solo[0].text, /folio_targets to find my website/);
  assert.match(solo[2].text, /domain <the website’s domain>/);
  assert.ok(CONNECTION_TROUBLESHOOTING.length >= 5);
});
