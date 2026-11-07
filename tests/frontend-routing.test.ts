import test from "node:test";
import assert from "node:assert/strict";
import { serveFrontend } from "../src/lib/frontend-routing";

test("frontend forwards API requests and responses unchanged without rendering or reading a database", async () => {
  const request = new Request("https://usefolio.site/api/auth/callback/google?code=fixture", { method: "POST", headers: { cookie: "fixture=session", "content-type": "text/plain" }, body: "fixture payload" });
  const response = new Response(null, { status: 302, headers: { location: "/overview?view=workspace", "set-cookie": "fixture=next; HttpOnly; Secure" } });
  const result = await serveFrontend(request, {
    FOLIO_BACKEND: { async fetch(value) { assert.equal(value, request); assert.equal(value.headers.get("cookie"), "fixture=session"); assert.equal(await value.text(), "fixture payload"); return response; } },
    FOLIO_PUBLIC_INDEX: { async fetch() { throw new Error("Wrong service"); } },
  }, async () => { throw new Error("API must not invoke Next rendering"); });
  assert.equal(result, response);
  assert.equal(result.headers.get("set-cookie"), "fixture=next; HttpOnly; Secure");
});

test("frontend renders current pages and preserves explicit legacy index links", async () => {
  const calls: string[] = [];
  const services = {
    FOLIO_BACKEND: { async fetch() { calls.push("backend"); return new Response("backend"); } },
    FOLIO_PUBLIC_INDEX: { async fetch() { calls.push("legacy"); return new Response("legacy"); } },
  };
  for (const path of ["/", "/overview", "/leaderboard?query=ikea", "/login", "/_next/static/app.css"])
    assert.equal(await (await serveFrontend(new Request(`https://usefolio.site${path}`), services, async () => new Response("ui"))).text(), "ui");
  assert.deepEqual(calls, []);
  for (const query of ["view=questions", "cohort=fixture", "q=fixture"])
    assert.equal(await (await serveFrontend(new Request(`https://usefolio.site/leaderboard?${query}`), services, async () => { throw new Error("Wrong renderer"); })).text(), "legacy");
  assert.deepEqual(calls, ["legacy", "legacy", "legacy"]);
});
