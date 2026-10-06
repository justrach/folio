import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONDENSATION_FLEET_API, CondensationFleetError, condensationFleetConfigured, condensationFleetPricing,
  createCondensationSandbox, deleteCondensationSandbox, getCondensationSandbox, runCondensationCommand,
} from "../src/lib/condensation-fleet";

const env = { CONDENSATION_API_KEY: "cnd_sk_fixture_not_a_real_key" };
const box = { id: "box_fixture", state: "running", requestId: "11111111-1111-4111-8111-111111111111" };

test("fleet configuration is presence-only and never treats missing as a lease", () => {
  assert.equal(condensationFleetConfigured({}), false);
  assert.equal(condensationFleetConfigured({ CONDENSATION_API_KEY: "   " }), false);
  assert.equal(condensationFleetConfigured(env), true);
});

test("create requires a UUID request ID, posts once, and treats transport failure as non-retryable", async () => {
  let calls = 0;
  const created = await createCondensationSandbox({ requestId: box.requestId, leaseSeconds: 120, name: "folio-json" }, env, {
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, `${CONDENSATION_FLEET_API}/sandboxes`);
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "manual");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer cnd_sk_fixture_not_a_real_key");
      assert.deepEqual(JSON.parse(String(init?.body)), { requestId: box.requestId, leaseSeconds: 120, name: "folio-json", codegraff: true });
      return Response.json({ ...box, codegraff: { baseUrl: "https://codegraff.example.test" } }, { headers: { "x-request-id": "req_fleet" } });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(created, { id: box.id, state: "running", requestId: box.requestId, codegraffBaseUrl: "https://codegraff.example.test" });
  await assert.rejects(createCondensationSandbox({ requestId: "not-a-uuid" }, env, { fetcher: async () => { throw new Error("unused"); } }), /UUID/);
  calls = 0;
  await assert.rejects(createCondensationSandbox({ requestId: box.requestId }, env, { fetcher: async () => { calls++; throw new Error(env.CONDENSATION_API_KEY); } }),
    error => error instanceof CondensationFleetError && error.ambiguous && !error.message.includes(env.CONDENSATION_API_KEY));
  assert.equal(calls, 1);
});

test("pricing, inspect, run and delete never invent a second create and omit credential text from errors", async () => {
  const seen: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    seen.push(`${init?.method ?? "GET"} ${url}`);
    if (String(url).endsWith("/pricing")) return Response.json({ currency: "USD" });
    if (String(url).endsWith("/exec")) return Response.json({ result: "FOLIO_KEYWORD_JSON_VALID" });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ ...box, state: "terminating" });
  };
  assert.deepEqual(await condensationFleetPricing(env, { fetcher }), { currency: "USD" });
  assert.equal((await getCondensationSandbox(box.id, env, { fetcher })).state, "terminating");
  assert.deepEqual(await runCondensationCommand(box.id, "python3 --version", env, { fetcher }), { result: "FOLIO_KEYWORD_JSON_VALID" });
  assert.equal(await deleteCondensationSandbox(box.id, env, { fetcher }), null);
  assert.deepEqual(seen, [
    `GET ${CONDENSATION_FLEET_API}/pricing`,
    `GET ${CONDENSATION_FLEET_API}/sandboxes/${box.id}`,
    `POST ${CONDENSATION_FLEET_API}/sandboxes/${box.id}/exec`,
    `DELETE ${CONDENSATION_FLEET_API}/sandboxes/${box.id}`,
  ]);
  await assert.rejects(createCondensationSandbox({ requestId: box.requestId }, env, {
    fetcher: async () => new Response(env.CONDENSATION_API_KEY, { status: 402 }),
  }), error => error instanceof CondensationFleetError && error.status === 402 && !error.message.includes(env.CONDENSATION_API_KEY));
});
