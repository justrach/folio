import assert from "node:assert/strict";
import { test } from "node:test";
import { CODEGRAFF_SANDBOX_API, CodegraffSandboxError, createCodegraffFleetSandbox, getCodegraffFleetSandbox, runCodegraffFleetCommand, deleteCodegraffFleetSandbox, downloadCodegraffFleetFile } from "../src/lib/codegraff-sandbox";

const env = { CODEGRAFF_API_KEY: "cg_sk_fixture_not_a_real_key" };
const box = { id: "cnd_fixture", state: "started", provider: "fleet", tier: "ephemeral" };

test("gateway fleet create uses the Codegraff key, an explicit provider and bounded lease", async () => {
  let calls = 0;
  const created = await createCodegraffFleetSandbox({}, env, { fetcher: async (url, init) => {
    calls++;
    assert.equal(url, CODEGRAFF_SANDBOX_API);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${env.CODEGRAFF_API_KEY}`);
    assert.deepEqual(JSON.parse(String(init?.body)), { provider: "fleet", autoStopMinutes: 15 });
    return Response.json(box, { headers: { "x-request-id": "req_fixture" } });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(created, { id: box.id, state: "started", requestId: "req_fixture" });
});

test("opt-in guest attachment must be model-only, confirmed and bounded by the sandbox lease", async () => {
  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  const attached = { attached: true, scope: "inference", expiresAt, modelBaseUrl: "https://gateway.codegraff.com", command: "graff" };
  const create = (codegraff: unknown, leaseExpiresAt = expiresAt) => createCodegraffFleetSandbox({ codegraff: true }, env, { fetcher: async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { provider: "fleet", autoStopMinutes: 15, codegraff: true });
    return Response.json({ ...box, expiresAt: leaseExpiresAt, codegraff });
  } });
  assert.equal((await create(attached)).id, box.id);
  for (const candidate of [undefined, { ...attached, attached: false }, { ...attached, scope: "api" }, { ...attached, expiresAt: expiresAt + 60 }, { ...attached, modelBaseUrl: "https://other.example" }]) {
    await assert.rejects(create(candidate), error => error instanceof CodegraffSandboxError && error.sandboxId === box.id && error.ambiguous);
  }
  const expired = Math.floor(Date.now() / 1000) - 1;
  await assert.rejects(create({ ...attached, expiresAt: expired }, expired), /did not confirm/);
});

test("invalid credentials and leases fail before any request", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("unused"); };
  for (const autoStopMinutes of [0, 31, 1.5]) await assert.rejects(createCodegraffFleetSandbox({ autoStopMinutes }, env, { fetcher }), /1–30/);
  for (const credentials of [{}, { CODEGRAFF_API_KEY: "cnd_sk_wrong_provider" }]) await assert.rejects(createCodegraffFleetSandbox({}, credentials, { fetcher }), /Codegraff API key/);
  assert.equal(calls, 0);
});

test("lost create response is ambiguous and never retried or leaked", async () => {
  let calls = 0;
  await assert.rejects(createCodegraffFleetSandbox({}, env, { fetcher: async () => { calls++; throw new Error(env.CODEGRAFF_API_KEY); } }),
    error => error instanceof CodegraffSandboxError && error.ambiguous && !error.message.includes(env.CODEGRAFF_API_KEY));
  assert.equal(calls, 1);
});

test("failed attachment preserves only the owned sandbox handle from the bounded error envelope", async () => {
  await assert.rejects(createCodegraffFleetSandbox({ codegraff: true }, env, { fetcher: async () => Response.json({ error: { type: "fleet_attach_failed", sandboxId: box.id, message: env.CODEGRAFF_API_KEY } }, { status: 502 }) }),
    error => error instanceof CodegraffSandboxError && error.sandboxId === box.id && error.status === 502 && !error.message.includes(env.CODEGRAFF_API_KEY));
});

test("create does not mistake allocated spec for readiness or accept another provider", async () => {
  assert.equal((await createCodegraffFleetSandbox({}, env, { fetcher: async () => Response.json({ id: box.id, cpu: 2, memory: 2 }) })).state, "unknown");
  await assert.rejects(createCodegraffFleetSandbox({}, env, { fetcher: async () => Response.json({ ...box, provider: "standard" }) }),
    error => error instanceof CodegraffSandboxError && error.ambiguous && error.sandboxId === box.id);
  await assert.rejects(getCodegraffFleetSandbox(box.id, env, { fetcher: async () => Response.json({ ...box, id: "cnd_other" }) }), /different sandbox/);
});

test("gateway read, synchronous exec and delete use the saved fleet ID", async () => {
  const seen: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    seen.push(`${init?.method ?? "GET"} ${url}`);
    if (String(url).endsWith("/exec")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { command: "python3 --version", timeoutSeconds: 15 });
      return Response.json({ exitCode: 0, result: "Python fixture\n" });
    }
    if (String(url).endsWith("/download")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { path: "/tmp/output" });
      return Response.json({ contentBase64: "Zml4dHVyZQ==" });
    }
    if (init?.method === "DELETE") return Response.json({ ok: true, provider: "fleet", state: "stopping", costMicro: null });
    return Response.json(box);
  };
  assert.equal((await getCodegraffFleetSandbox(box.id, env, { fetcher })).state, "started");
  assert.deepEqual(await runCodegraffFleetCommand(box.id, "python3 --version", env, { fetcher }), { exitCode: 0, result: "Python fixture\n" });
  assert.deepEqual(await downloadCodegraffFleetFile(box.id, "/tmp/output", env, { fetcher }), { contentBase64: "Zml4dHVyZQ==" });
  await deleteCodegraffFleetSandbox(box.id, env, { fetcher });
  assert.deepEqual(seen, [`GET ${CODEGRAFF_SANDBOX_API}/${box.id}`, `POST ${CODEGRAFF_SANDBOX_API}/${box.id}/exec`, `POST ${CODEGRAFF_SANDBOX_API}/${box.id}/download`, `DELETE ${CODEGRAFF_SANDBOX_API}/${box.id}`]);
});

test("command truncation and unsafe response bodies cannot be accepted or exposed", async () => {
  await assert.rejects(runCodegraffFleetCommand(box.id, "echo fixture", env, { fetcher: async () => Response.json({ exitCode: 0, result: "partial", truncated: true }) }), /incomplete/);
  await assert.rejects(createCodegraffFleetSandbox({}, env, { fetcher: async () => new Response(env.CODEGRAFF_API_KEY, { status: 402 }) }),
    error => error instanceof CodegraffSandboxError && error.status === 402 && !error.message.includes(env.CODEGRAFF_API_KEY));
  await assert.rejects(deleteCodegraffFleetSandbox(box.id, env, { fetcher: async () => { throw new Error("lost delete"); } }),
    error => error instanceof CodegraffSandboxError && error.ambiguous);
});
