import "server-only";
import JSZip from "jszip";
import { mcpEndpoint } from "./agent-onboarding";

/**
 * Folio as a Claude Desktop extension (MCPB, manifest 0.3): one file a person opens to add Folio to Claude Desktop.
 * Claude asks for the Folio key at install time (a sensitive setting it masks and stores), so the file holds no
 * secret and is the same for everyone. Claude Desktop runs node extensions with its own Node.js, so the person
 * installs nothing else. The server is a small bridge: Claude speaks MCP over stdio, Folio over HTTPS.
 */
export const CLAUDE_DESKTOP_EXTENSION_VERSION = "1.0.0";
export const CLAUDE_DESKTOP_EXTENSION_FILENAME = "folio.mcpb";

/**
 * Relays newline-delimited JSON-RPC from stdin to Folio's MCP endpoint and writes Folio's answers to stdout.
 * Folio's endpoint is stateless and answers each POST with JSON, so each message is one request. A request
 * Folio refuses (bad key, rate limit) gets a JSON-RPC error with Folio's own message. Needs Node 18+ (fetch).
 * It never logs the key.
 */
export const BRIDGE_SCRIPT = String.raw`"use strict";
// Folio for Claude Desktop ${CLAUDE_DESKTOP_EXTENSION_VERSION}: passes MCP messages between Claude (stdio) and Folio (HTTPS).
const readline = require("node:readline");
const endpoint = process.env.FOLIO_MCP_URL || "";
const key = (process.env.FOLIO_API_KEY || "").trim();
const settings = new URL("/agents#connect", endpoint || "https://usefolio.site").toString();
let session = null, protocolVersion = null;
const pending = new Set();
// Messages after initialize wait for its answer, so they carry the session and protocol version; then they run side by side.
let ready = Promise.resolve();
const NOT_SENT = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);
// True when the connection failed before the message went out (a connect or DNS failure), so sending it again can't repeat a call.
function notSent(error) { const cause = error && error.cause; return Boolean(cause && (NOT_SENT.has(cause.code) || cause.syscall === "connect")); }

function write(message) { process.stdout.write(JSON.stringify(message) + "\n"); }
function fail(id, message) { if (id !== undefined && id !== null) write({ jsonrpc: "2.0", id, error: { code: -32000, message } }); }
function log(text) { process.stderr.write("[folio] " + text + "\n"); }

async function forward(message) {
  const id = message && typeof message === "object" ? message.id : undefined;
  const isRequest = Boolean(message && typeof message.method === "string" && id !== undefined && id !== null);
  if (!/^folio_v1_[a-f0-9]{64}$/.test(key)) return fail(id, "Add your Folio API key in Claude Desktop's settings for the Folio extension. Create one at " + settings + ".");
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer " + key,
    "User-Agent": "folio-claude-desktop/${CLAUDE_DESKTOP_EXTENSION_VERSION}" };
  if (session) headers["Mcp-Session-Id"] = session;
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  let response, text;
  const send = () => fetch(endpoint, { method: "POST", headers, body: JSON.stringify(message), signal: AbortSignal.timeout(90000) });
  try {
    // A failed connection never reached Folio, so it is safe to try once more.
    response = await send().catch(error => {
      if (!notSent(error)) throw error;
      return new Promise(resolve => setTimeout(resolve, 1000)).then(send);
    });
    text = await response.text();
  } catch (error) {
    const cause = error && error.cause ? " (" + (error.cause.code || error.cause.message || error.cause) + ")" : "";
    log("request failed: " + (error && error.message) + cause);
    return fail(id, "Folio couldn't be reached at " + endpoint + ". Check your connection and try again.");
  }
  const sessionId = response.headers.get("mcp-session-id");
  if (sessionId) session = sessionId;
  if (!text.trim()) { if (!response.ok) fail(id, "Folio answered " + response.status + "."); return; }
  let messages = [];
  if ((response.headers.get("content-type") || "").includes("text/event-stream")) {
    for (const line of text.split(/\r?\n/)) if (line.startsWith("data:")) { try { messages.push(JSON.parse(line.slice(5))); } catch (error) { /* not JSON */ } }
  } else {
    try { const parsed = JSON.parse(text); messages = Array.isArray(parsed) ? parsed : [parsed]; }
    catch (error) { return fail(id, "Folio answered " + response.status + " with something other than JSON."); }
  }
  let answered = false;
  for (const item of messages) {
    if (item && item.jsonrpc === "2.0") {
      if (message.method === "initialize" && item.result && typeof item.result.protocolVersion === "string") protocolVersion = item.result.protocolVersion;
      if (item.id === id) answered = true;
      write(item);
    } else if (item && item.error && !answered) {
      // Folio's API refused the request before MCP (for example 401 for a revoked key, or 429).
      answered = true;
      fail(id, (item.error.message || "Folio refused the request.") + (response.status === 401 ? " Update the key in the Folio extension's settings." : ""));
    }
  }
  if (isRequest && !answered) fail(id, "Folio answered " + response.status + " without a result.");
}

if (!endpoint) { log("FOLIO_MCP_URL is not set."); process.exit(1); }
const input = readline.createInterface({ input: process.stdin });
input.on("line", line => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch (error) { return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  const run = () => forward(message).catch(error => { log("unexpected: " + (error && error.message)); fail(message && message.id, "The Folio extension hit an unexpected error."); });
  const task = message && message.method === "initialize" ? (ready = ready.then(run)) : ready.then(run);
  pending.add(task); task.finally(() => pending.delete(task));
});
// Exit once every answer is written: stdout to a pipe is asynchronous, so the empty write's callback waits for the rest.
input.on("close", () => { Promise.allSettled([...pending]).then(() => process.stdout.write("", () => process.exit(0))); });
`;

/** The manifest for this Folio. Its only setting is the person's key; the endpoint is fixed to the site it came from. */
export function claudeDesktopManifest(origin: string) {
  const site = origin.replace(/\/$/, "");
  return {
    manifest_version: "0.3",
    name: "folio",
    display_name: "Folio",
    version: CLAUDE_DESKTOP_EXTENSION_VERSION,
    description: "Your websites' Folio reports in Claude: where they show up on Google and in AI answers, and what they're missing.",
    long_description: "Folio connects Claude to your Folio workspace with your own Folio API key. Claude can find your websites, organizations and saved reports, read what a website is missing, and search Folio's published AI answers. Tools that cost money appear only if your key allows them, and still ask you to confirm.",
    author: { name: "Folio", url: site },
    homepage: site,
    documentation: `${site}/agents#connect`,
    support: `${site}/agents#connect`,
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: { command: "node", args: ["${__dirname}/server/index.js"], env: { FOLIO_API_KEY: "${user_config.api_key}", FOLIO_MCP_URL: mcpEndpoint(site) } },
    },
    tools_generated: true,
    prompts_generated: true,
    keywords: ["seo", "aeo", "websites", "ai answers", "folio"],
    privacy_policies: [`${site}/privacy`],
    compatibility: { platforms: ["darwin", "win32", "linux"], runtimes: { node: ">=18.0.0" } },
    user_config: {
      api_key: { type: "string", title: "Folio API key", description: `Starts with folio_v1_. Create one at ${site}/agents#connect.`, sensitive: true, required: true },
    },
  };
}

/** The .mcpb file: a zip of the manifest and the bridge. */
export async function buildClaudeDesktopExtension(origin: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  // A fixed date keeps the file identical between requests.
  const date = new Date("2026-11-11T00:00:00Z");
  zip.file("manifest.json", `${JSON.stringify(claudeDesktopManifest(origin), null, 2)}\n`, { date });
  // The folder entry gets the same fixed date; left to JSZip it would carry the build time and change the bytes.
  zip.file("server/", null, { dir: true, date });
  zip.file("server/index.js", BRIDGE_SCRIPT, { date, createFolders: false });
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", platform: "UNIX" });
}
