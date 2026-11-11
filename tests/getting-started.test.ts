import assert from "node:assert/strict";
import test from "node:test";
import { GETTING_STARTED_STEPS, gettingStartedSummary } from "../src/lib/getting-started";

const none = { website: false, "search-console": false, agent: false, ask: false, team: false };

test("getting started: five free steps in order, the next one is the first not done", () => {
  assert.deepEqual(GETTING_STARTED_STEPS.map(step => step.id), ["website", "search-console", "agent", "ask", "team"]);
  assert.deepEqual(GETTING_STARTED_STEPS.map(step => step.href), ["/websites", "/search-console", "/agents#connect", "/agents#connect", "/orgs"]);
  const fresh = gettingStartedSummary({ done: none });
  assert.deepEqual([fresh.completed, fresh.total, fresh.next?.id, fresh.finished], [0, 5, "website", false]);
  // Steps can happen out of order (joining a team before adding a website); the next is still the first open one.
  const mixed = gettingStartedSummary({ done: { ...none, website: true, team: true } });
  assert.deepEqual([mixed.completed, mixed.next?.id], [2, "search-console"]);
  assert.deepEqual(mixed.steps.map(step => step.done), [true, false, false, false, true]);
  const all = gettingStartedSummary({ done: { website: true, "search-console": true, agent: true, ask: true, team: true } });
  assert.deepEqual([all.completed, all.next, all.finished], [5, null, true]);
});
