import assert from "node:assert/strict";
import test from "node:test";
import { agentApiHash, AgentApiError, requireAgentApiScope } from "../src/lib/agent-api-key-store";
import { agentIdempotencyIdentity } from "../src/lib/agent-observation-store";
import { validateAgentObservationInput } from "../src/lib/agent-observation-service";

test("external API validates fixed owned selectors and canonical 24-hour freshness", async () => {
  const input = validateAgentObservationInput({ kind: "website", websiteId: "saved-site" });
  assert.deepEqual(input, { kind: "website", websiteId: "saved-site", maxAgeSeconds: 86400 });
  for (const extra of [{ ownerId: "other" }, { model: "override" }, { query: "override" }, { caseId: "other" }])
    assert.throws(() => validateAgentObservationInput({ ...input, ...extra }), AgentApiError);
  for (const maxAgeSeconds of [-1, 604801, 1.5, NaN, Infinity]) assert.throws(() => validateAgentObservationInput({ ...input, maxAgeSeconds }), AgentApiError);
  assert.equal(validateAgentObservationInput({ ...input, maxAgeSeconds: 0 }).maxAgeSeconds, 0);
  const a = await agentIdempotencyIdentity("retry-request-123", input);
  assert.deepEqual(a, await agentIdempotencyIdentity("retry-request-123", validateAgentObservationInput({ maxAgeSeconds: 86400, websiteId: "saved-site", kind: "website" })));
  assert.equal(a.idempotencyHash.length, 64); assert.notEqual(a.idempotencyHash, a.requestHash);
  await assert.rejects(agentIdempotencyIdentity("bad key", input), AgentApiError);
  assert.equal(await agentApiHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.throws(() => requireAgentApiScope({ ownerId: "alice", keyId: "key", scopes: ["read"] }, "evaluate"), error => error instanceof AgentApiError && error.status === 403);
});
