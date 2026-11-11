import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { CLAUDE_DESKTOP_EXTENSION_PATH, agentClients, installAction, maskedKey, vscodeInstallLink } from "../src/lib/agent-onboarding";
import { BRIDGE_SCRIPT, buildClaudeDesktopExtension, claudeDesktopManifest } from "../src/lib/claude-desktop-extension";
import { GET as extensionResponse } from "../src/app/api/agent-setup/claude-desktop/route";

const origin = "https://usefolio.site", token = `folio_v1_${"e".repeat(64)}`;

test("Cursor's install link carries the key; nothing is offered until the key exists", () => {
  assert.equal(installAction("cursor", origin, null)!.href, null);
  const action = installAction("cursor", origin, token)!;
  assert.equal(action.kind, "link");
  // Read the link the way Cursor does: "+" is a space, then the value is percent-decoded and base64-decoded.
  const query = action.href!.split("?")[1];
  assert.ok(action.href!.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?name=folio&config="));
  assert.doesNotMatch(query, /\+/);
  const config = JSON.parse(atob(decodeURIComponent(new URLSearchParams(query).get("config")!.replace(/\+/g, " "))));
  assert.deepEqual(config, { url: "https://usefolio.site/api/mcp", headers: { Authorization: `Bearer ${token}` } });
});

test("VS Code's install link holds no key: VS Code asks for it and stores it itself", () => {
  const href = installAction("vscode", origin, token)!.href!;
  assert.equal(href, vscodeInstallLink(origin));
  assert.ok(href.startsWith("vscode:mcp/install?"));
  assert.doesNotMatch(href, /folio_v1_/);
  const server = JSON.parse(decodeURIComponent(href.slice("vscode:mcp/install?".length)));
  assert.deepEqual(server, { name: "folio", type: "http", url: "https://usefolio.site/api/mcp", headers: { Authorization: "Bearer ${input:folio-key}" },
    inputs: [{ type: "promptString", id: "folio-key", description: "Folio API key", password: true }] });
});

test("Claude Code and Codex get one command with the new key in it, safe to run twice", () => {
  assert.equal(installAction("claude-code", origin, null)!.code, null);
  assert.equal(installAction("claude-code", origin, token)!.code,
    `claude mcp remove --scope user folio 2>/dev/null\nclaude mcp add --transport http --scope user folio https://usefolio.site/api/mcp \\\n  --header "Authorization: Bearer ${token}"`);
  const codex = installAction("codex", origin, token)!.code!;
  assert.equal(codex.split("\n").at(-1), "codex mcp add folio --url https://usefolio.site/api/mcp --bearer-token-env-var FOLIO_API_KEY");
  assert.ok(codex.startsWith(`export FOLIO_API_KEY="${token}"\n`));
  assert.ok(codex.includes(`>> "$HOME/.\${SHELL##*/}rc"`));
  // The screen masks the key; only the copy holds it.
  assert.equal(maskedKey(token), `folio_v1_eeee${"•".repeat(16)}`);
  // Clients without a one-step install keep their by-hand setup only.
  assert.equal(installAction("manus", origin, token), null);
  assert.equal(installAction("other", origin, token), null);
  assert.deepEqual(agentClients(origin).filter(client => installAction(client.id, origin, token)).map(client => client.id),
    ["claude-code", "codex", "cursor", "vscode", "claude-desktop"]);
});

test("the Claude Desktop extension asks for the key, holds none, and points at the site it came from", async () => {
  const action = installAction("claude-desktop", origin, token)!;
  assert.equal(action.href, `https://usefolio.site${CLAUDE_DESKTOP_EXTENSION_PATH}`);
  const manifest = claudeDesktopManifest("https://usefolio.site/");
  assert.equal(manifest.manifest_version, "0.3");
  assert.equal(manifest.server.entry_point, "server/index.js");
  assert.deepEqual(manifest.server.mcp_config.args, ["${__dirname}/server/index.js"]);
  assert.deepEqual(manifest.server.mcp_config.env, { FOLIO_API_KEY: "${user_config.api_key}", FOLIO_MCP_URL: "https://usefolio.site/api/mcp" });
  assert.equal(manifest.user_config.api_key.sensitive, true);
  assert.equal(manifest.user_config.api_key.required, true);

  const response = await extensionResponse(new Request("https://usefolio.site/api/agent-setup/claude-desktop"));
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="folio.mcpb"');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  assert.deepEqual(Object.keys(zip.files).filter(name => !zip.files[name].dir).sort(), ["manifest.json", "server/index.js"]);
  assert.deepEqual(JSON.parse(await zip.file("manifest.json")!.async("string")), manifest);
  assert.equal(await zip.file("server/index.js")!.async("string"), BRIDGE_SCRIPT);
  assert.doesNotMatch(await zip.file("manifest.json")!.async("string"), /folio_v1_[a-f0-9]/);
  // The same file every time, and each copy points at the site that served it.
  assert.deepEqual(bytes, new Uint8Array(await buildClaudeDesktopExtension("https://usefolio.site")));
  const local = await JSZip.loadAsync(await buildClaudeDesktopExtension("http://localhost:3012"));
  assert.equal(JSON.parse(await local.file("manifest.json")!.async("string")).server.mcp_config.env.FOLIO_MCP_URL, "http://localhost:3012/api/mcp");
});

/** Runs the bridge against a stand-in for Folio's endpoint and returns what it wrote to Claude, one message per line. */
async function bridge(lines: string[], key: string, answer: (body: { id?: unknown; method?: string }, request: IncomingMessage) => { status: number; json?: unknown; sse?: unknown[] }) {
  const seen: { body: { id?: unknown; method?: string }; authorization?: string; session?: string; protocol?: string; from?: string }[] = [];
  // An unguessable path: other programs on this computer sometimes probe loopback ports (a bare HEAD /), and those aren't the bridge's.
  const path = `/api/mcp/${randomUUID()}`;
  const server = createServer((request, response) => {
    if (request.url !== path) { request.resume(); response.writeHead(404); response.end(); return; }
    let raw = "";
    request.on("data", chunk => { raw += chunk; });
    request.on("end", () => {
      const body = raw ? JSON.parse(raw) : { method: "(empty body)" };
      seen.push({ body, authorization: request.headers.authorization, session: request.headers["mcp-session-id"] as string | undefined, protocol: request.headers["mcp-protocol-version"] as string | undefined,
        from: `${request.method} ${request.url} ${request.headers["user-agent"] ?? ""} ${JSON.stringify(Object.keys(request.headers))}` });
      const reply = answer(body, request);
      if (reply.sse) {
        response.writeHead(reply.status, { "content-type": "text/event-stream", "mcp-session-id": "session-1" });
        response.end(reply.sse.map(item => `event: message\ndata: ${JSON.stringify(item)}\n\n`).join(""));
      } else if (reply.json === undefined) { response.writeHead(reply.status); response.end(); }
      else { response.writeHead(reply.status, { "content-type": "application/json" }); response.end(JSON.stringify(reply.json)); }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const dir = await mkdtemp(join(tmpdir(), "folio-bridge-"));
  try {
    await writeFile(join(dir, "index.js"), BRIDGE_SCRIPT);
    const child = spawn(process.execPath, [join(dir, "index.js")], { env: { PATH: process.env.PATH ?? "", FOLIO_API_KEY: key, FOLIO_MCP_URL: `http://127.0.0.1:${port}${path}` } as unknown as NodeJS.ProcessEnv });
    let out = "", err = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { err += chunk; });
    for (const line of lines) child.stdin.write(`${line}\n`);
    child.stdin.end();
    const code = await new Promise<number | null>(resolve => child.on("close", resolve));
    return { code, err, seen, messages: out.trim() ? out.trim().split("\n").map(line => JSON.parse(line)) : [] };
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
}

test("the bridge relays Claude's messages to Folio with the key, and Folio's answers back", async () => {
  const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude", version: "1" } } };
  const run = await bridge([JSON.stringify(initialize), JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), "",
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })], token, body => body.method === "initialize"
    ? { status: 200, sse: [{ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "folio", version: "1" } } }] }
    // Folio's real tools/list is larger than a pipe buffer (64 KB); all of it must reach Claude before the bridge exits.
    : body.method === "notifications/initialized" ? { status: 202 } : { status: 200, json: { jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "folio_find", description: "x".repeat(200_000) }] } } });
  assert.equal(run.code, 0);
  assert.ok(run.seen.every(request => request.authorization === `Bearer ${token}`), JSON.stringify(run.seen.map(request => [request.from, request.body.method])));
  assert.equal(run.seen.length, 3, run.err);
  // initialize goes first; the messages after it wait for its answer, then go side by side (in any order)
  // carrying the session and the protocol version the server agreed to.
  const sent = run.seen.map(request => [request.body.method, request.session ?? null, request.protocol ?? null]);
  assert.deepEqual(sent[0], ["initialize", null, null]);
  assert.deepEqual(sent.slice(1).sort(), [["notifications/initialized", "session-1", "2025-06-18"], ["tools/list", "session-1", "2025-06-18"]]);
  assert.deepEqual(run.messages.map(message => message.id), [1, 2]);
  assert.equal(run.messages[1].result.tools[0].name, "folio_find");
  assert.equal(run.messages[1].result.tools[0].description.length, 200_000);
  assert.doesNotMatch(run.err, /folio_v1_/);
});

test("the bridge tries once more when the connection fails before anything is sent", async () => {
  // Find a free port, leave it closed for the first attempt, then start Folio's stand-in on it.
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise(resolve => probe.close(resolve));
  const dir = await mkdtemp(join(tmpdir(), "folio-bridge-"));
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } })); });
  });
  try {
    await writeFile(join(dir, "index.js"), BRIDGE_SCRIPT);
    const child = spawn(process.execPath, [join(dir, "index.js")], { env: { PATH: process.env.PATH ?? "", FOLIO_API_KEY: token, FOLIO_MCP_URL: `http://127.0.0.1:${port}/api/mcp` } as unknown as NodeJS.ProcessEnv });
    let out = "", err = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { err += chunk; });
    child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`);
    await new Promise(resolve => setTimeout(resolve, 300));
    await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve));
    await new Promise(resolve => child.on("close", resolve));
    assert.deepEqual(JSON.parse(out), { jsonrpc: "2.0", id: 1, result: { tools: [] } }, err);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});

test("the bridge turns a refused key into a readable error, and asks for a key before calling Folio", async () => {
  const refused = await bridge([JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" })], token,
    () => ({ status: 401, json: { error: { code: "unauthorized", message: "A valid Folio API key is required." } } }));
  assert.deepEqual(refused.messages, [{ jsonrpc: "2.0", id: 7, error: { code: -32000, message: "A valid Folio API key is required. Update the key in the Folio extension's settings." } }]);

  const missing = await bridge([JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), "not json"], "  ", () => { throw new Error("must not call Folio"); });
  assert.equal(missing.seen.length, 0);
  assert.equal(missing.messages.length, 2);
  assert.match(missing.messages.find(message => message.id === 1).error.message,
    /Add your Folio API key in Claude Desktop's settings for the Folio extension\. Create one at http:\/\/127\.0\.0\.1:\d+\/agents#connect\./);
  assert.deepEqual(missing.messages.find(message => message.id === null), { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
});
