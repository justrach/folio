import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_PERMISSIONS, CONNECTION_TROUBLESHOOTING, KEY_PLACEHOLDER, agentClients, connectionTestCommand, exportLine, isFormField, mcpEndpoint, onboardingProgress, reachableOrigin, starterPrompts,
  withKey } from "../src/lib/agent-onboarding";
import { inviteMailto, inviteMessage, signInLink } from "../src/lib/organization-invite-message";
import { folioTools } from "../src/lib/folio-mcp";

const origin = "https://usefolio.site";

test("every client's setup points at this Folio's MCP endpoint and never contains a key", () => {
  const clients = agentClients(origin);
  assert.deepEqual(clients.map(client => client.id), ["claude-code", "codex", "harness", "cursor", "vscode", "claude-desktop", "manus", "other"]);
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
  assert.deepEqual(clients.filter(client => !client.readsShellEnvironment).map(client => client.id), ["harness", "vscode", "claude-desktop", "manus", "other"]);
  // Harness signs in with OAuth; by hand it takes the key as graff's KEY=VALUE header, saved for every project.
  assert.deepEqual(clients.filter(client => client.signsIn).map(client => client.id), ["harness"]);
  assert.equal(byId.harness.blocks[0].code, 'graff mcp add folio --url https://usefolio.site/api/mcp --everywhere \\\n  --header "Authorization=Bearer <your Folio key>"');
  assert.equal(mcpEndpoint("http://localhost:3012/"), "http://localhost:3012/api/mcp");
});

test("Manus, a cloud agent, is always pointed at an address the internet can reach", () => {
  const manus = (origin: string) => agentClients(origin).find(client => client.id === "manus")!;
  const url = (origin: string) => manus(origin).blocks.find(block => block.label === "Server URL")!.code;
  assert.equal(url("https://usefolio.site"), "https://usefolio.site/api/mcp");
  assert.equal(url("https://folio-frontend.example.workers.dev"), "https://folio-frontend.example.workers.dev/api/mcp");
  for (const local of ["http://localhost:3012", "http://127.0.0.1:3012", "https://localhost:3001", "http://usefolio.site", "not a url"]) {
    assert.equal(url(local), "https://usefolio.site/api/mcp", local);
    assert.ok(manus(local).notes.some(note => note.includes("not the address this page is open on")), local);
  }
  assert.ok(!manus("https://usefolio.site").notes.some(note => note.includes("not the address this page is open on")));
  // Every other client keeps the page's own origin, so local development stays local.
  assert.equal(agentClients("http://localhost:3012").find(client => client.id === "codex")!.blocks[0].code, "codex mcp add folio --url http://localhost:3012/api/mcp --bearer-token-env-var FOLIO_API_KEY");
  assert.equal(reachableOrigin("https://usefolio.site/"), "https://usefolio.site");
  assert.ok(manus("https://usefolio.site").notes.some(note => /hasn’t run them in a Manus account/.test(note)), "the setup says it is unverified");
  assert.ok(CONNECTION_TROUBLESHOOTING.some(item => item.problem.startsWith("Manus")));
  // Manus is a form: three one-line fields, the last of which is the key itself.
  assert.deepEqual(manus("https://usefolio.site").blocks.map(block => [block.label, isFormField(block)]), [["Server name", true], ["Server URL", true], ["Bearer token", true]]);
  assert.equal(manus("https://usefolio.site").blocks[2].code, KEY_PLACEHOLDER);
});

test("a new key is filled in only where a snippet asks for it, and only in the copy", () => {
  const token = `folio_v1_${"d".repeat(64)}`, clients = agentClients(origin);
  const desktop = clients.find(client => client.id === "claude-desktop")!.blocks[0].code;
  assert.equal(JSON.parse(withKey(desktop, token)).mcpServers.folio.env.FOLIO_AUTH, `Bearer ${token}`);
  assert.equal(withKey("Authorization: Bearer <your Folio key>", token), `Authorization: Bearer ${token}`);
  // Clients that read FOLIO_API_KEY never contain the placeholder, so their copy is unchanged.
  for (const client of clients.filter(item => item.readsShellEnvironment))
    for (const block of client.blocks) assert.equal(withKey(block.code, token), block.code, `${client.id}: ${block.label}`);
  // Multi-line files and commands stay code blocks; single values become form rows.
  assert.ok(!isFormField(clients[0].blocks[0]));
  assert.ok(isFormField(clients.find(client => client.id === "other")!.blocks[0]));
});

test("the panel points at the next step: key, then setup until the key is used, then prompts", () => {
  const at = (input: Partial<Parameters<typeof onboardingProgress>[0]>) => onboardingProgress({ signedIn: true, activeKeys: 0, usedKeys: 0, newKey: null, ...input });
  assert.deepEqual(at({ signedIn: false, activeKeys: 2, usedKeys: 2 }), { keyReady: false, connected: false, current: 2 });
  assert.deepEqual(at({}), { keyReady: false, connected: false, current: 2 });
  assert.deepEqual(at({ activeKeys: 1 }), { keyReady: true, connected: false, current: 3 });
  assert.deepEqual(at({ activeKeys: 1, usedKeys: 1 }), { keyReady: true, connected: true, current: 5 });
  // A key made on the page is followed until its own first call, even if older keys were used.
  assert.deepEqual(at({ activeKeys: 2, usedKeys: 1, newKey: { used: false } }), { keyReady: true, connected: false, current: 3 });
  assert.deepEqual(at({ activeKeys: 2, usedKeys: 2, newKey: { used: true } }), { keyReady: true, connected: true, current: 5 });
  // A client that signs in (Harness) is approved during step 3, so it starts there; signed out, sign-in comes first.
  assert.deepEqual(at({ signsIn: true }), { keyReady: false, connected: false, current: 3 });
  assert.deepEqual(at({ signsIn: true, signedIn: false }), { keyReady: false, connected: false, current: 2 });
  assert.deepEqual(at({ signsIn: true, activeKeys: 1, usedKeys: 1 }), { keyReady: true, connected: true, current: 5 });
});

test("the note an owner sends says which email to sign in with and links to /orgs", () => {
  const input = { organization: "Manus", email: "natalie@manus.test", origin: "https://usefolio.site/", from: "Rach" };
  assert.equal(signInLink(input.origin), "https://usefolio.site/login?next=/orgs");
  const { subject, body } = inviteMessage(input);
  assert.equal(subject, "Join Manus on Folio");
  assert.match(body, /as natalie@manus\.test/);
  assert.match(body, /https:\/\/usefolio\.site\/login\?next=\/orgs/);
  assert.match(body, /Rach$/);
  assert.doesNotMatch(inviteMessage({ ...input, from: null }).body, /Rach/);
  const mailto = new URL(inviteMailto(input));
  assert.equal(mailto.protocol, "mailto:");
  assert.equal(mailto.pathname, "natalie@manus.test");
  assert.equal(mailto.searchParams.get("subject"), subject);
  assert.equal(decodeURIComponent(inviteMailto(input).split("&body=")[1]), body);
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
