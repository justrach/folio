/**
 * TEST-ONLY local preview: proxies a running `bun run dev` server and answers every
 * /api/* request from the illustrative overview fixture. Not part of the app build,
 * not deployed, and it never forwards API calls (no real auth, D1 or providers).
 *
 *   bun run dev --port 3001
 *   node --import tsx scripts/overview-fixture-preview.ts   # http://localhost:3101
 */
import http from "node:http";
import net from "node:net";
import { overviewFixture } from "../tests/fixtures/overview-preview-fixture";

const upstream = new URL(process.env.FOLIO_DEV_URL ?? "http://127.0.0.1:3001");
const port = Number(process.env.FIXTURE_PREVIEW_PORT ?? 3101);
const fixture = overviewFixture(Date.now());
const emptyPreview = process.env.OVERVIEW_PREVIEW_STAGE === "empty";
const banner = '<style>body{padding-top:64px}.app-shell>.sidebar{top:64px;height:calc(100dvh - 64px)}</style><aside style="position:fixed;z-index:2147483647;top:0;left:0;right:0;height:64px;display:flex;align-items:center;justify-content:center;padding:4px 16px;background:#8a500e;color:#fff;font:500 12px/1.5 system-ui;text-align:center;pointer-events:none">SAMPLE PREVIEW · Example account and results. Actions don’t save or run searches.</aside>';

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://fixture.local");
  if (url.pathname.startsWith("/api/")) {
    const result = emptyPreview && req.method === "GET" && ["/api/sites", "/api/scans", "/api/benchmarks", "/api/benchmarks/runs"].includes(url.pathname)
      ? { status: 200, json: url.pathname === "/api/sites" ? { sites: [] } : url.pathname === "/api/scans" ? { scans: [] } : url.pathname === "/api/benchmarks" ? { suites: [] } : { runs: [], models: [], nextCursor: null } }
      : fixture.respond(req.method ?? "GET", url.pathname);
    res.writeHead(result.status, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(result.json));
  }
  const headers = { ...req.headers, host: upstream.host, "accept-encoding": "identity" };
  const forward = http.request({ hostname: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers }, upstreamRes => {
    const type = String(upstreamRes.headers["content-type"] ?? "");
    if (!type.includes("text/html")) { res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers); return upstreamRes.pipe(res); }
    const chunks: Buffer[] = [];
    upstreamRes.on("data", chunk => chunks.push(chunk));
    upstreamRes.on("end", () => {
      const html = Buffer.concat(chunks).toString("utf8").replace("</body>", `${banner}</body>`);
      const { "content-length": _length, ...rest } = upstreamRes.headers;
      res.writeHead(upstreamRes.statusCode ?? 200, rest);
      res.end(html);
    });
  });
  forward.on("error", () => { res.writeHead(502); res.end("Start `bun run dev --port 3001` first."); });
  req.pipe(forward);
});
// Pass dev-server websockets (hot reload) through unchanged.
server.on("upgrade", (req, socket, head) => {
  const target = net.connect(Number(upstream.port), upstream.hostname, () => {
    target.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries({ ...req.headers, host: upstream.host }).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
    target.write(head); socket.pipe(target).pipe(socket);
  });
  target.on("error", () => socket.destroy()); socket.on("error", () => target.destroy());
});
server.listen(port, "127.0.0.1", () => console.log(`Overview fixture preview: http://localhost:${port}/overview?view=workspace&website=site-example`));
