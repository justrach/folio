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

test("public read failures report unavailable live data without substituting snapshots or retrying private requests", async () => {
  let reads = 0;
  const services = {
    FOLIO_BACKEND: { async fetch() { reads++; return new Response("Unavailable", { status: 500 }); } },
    FOLIO_PUBLIC_INDEX: { async fetch() { throw new Error("Wrong service"); } },
  };
  const render = async () => { throw new Error("Not a UI route"); };
  const response = await serveFrontend(new Request("https://usefolio.site/api/public/benchmarks"), services, render);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("X-Folio-Public-Source"), null);
  const data = await response.json();
  assert.equal(data.error.code, "public_data_unavailable");
  assert.equal(data.observations, undefined);
  assert.equal((await serveFrontend(new Request("https://usefolio.site/api/sites"), services, render)).status, 500);
  assert.equal((await serveFrontend(new Request("https://usefolio.site/api/public/benchmarks", { method: "POST" }), services, render)).status, 500);
  assert.equal(reads, 3, "Every request is forwarded once; paid/private requests are not retried");
});

test("public availability error handles a failed binding but propagates a cancelled visitor request", async () => {
  const services = { FOLIO_BACKEND: { async fetch() { throw new Error("Binding unavailable"); } }, FOLIO_PUBLIC_INDEX: { async fetch() { throw new Error("Wrong service"); } } };
  const render = async () => { throw new Error("Not a UI route"); };
  assert.equal((await serveFrontend(new Request("https://usefolio.site/api/public/benchmarks"), services, render)).status, 503);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(serveFrontend(new Request("https://usefolio.site/api/public/benchmarks", { signal: controller.signal }), services, render), /Binding unavailable/);
});

test("public read deadline reports unavailable data when the binding never settles", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  const services = { FOLIO_BACKEND: { fetch(request: Request): Promise<Response> { signal = request.signal; return new Promise(() => {}); } }, FOLIO_PUBLIC_INDEX: { async fetch() { throw new Error("Wrong service"); } } };
  const result = serveFrontend(new Request("https://usefolio.site/api/public/benchmarks"), services, async () => { throw new Error("Wrong renderer"); });
  context.mock.timers.tick(12_000);
  assert.equal((await result).status, 503);
  assert.equal(signal?.aborted, true);
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
  for (const path of ["/api/question-index", "/api/question-index/fixture"])
    assert.equal(await (await serveFrontend(new Request(`https://usefolio.site${path}`), services, async () => { throw new Error("Wrong renderer"); })).text(), "legacy");
  assert.deepEqual(calls, ["legacy", "legacy", "legacy", "legacy", "legacy"]);
});
