import assert from "node:assert/strict";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { MAX_CUSTOMER_GROUPS } from "../src/lib/onboarding-customers";
import { parseOnboardingPatch, updateOnboarding, type OnboardingPatch } from "../src/lib/onboarding-store";
import { ScanError } from "../src/lib/scanner";

const badRequest = (error: unknown) => error instanceof ScanError && error.status === 400;

const invalidGroups: unknown[] = [
  null, "Customers", {}, 4, [], ["", "  ", "\t\n"],
  ["a", "b", "c", "d", "e"], ["Customers", "", "", "", ""],
  [null], [undefined], [42], [false], [{}], [["Customers"]], [, "Customers"],
  ["before\u0000after"], ["before\u007fafter"],
];

test("customer group bounds are browser-safe and parsing preserves one through four groups in order", () => {
  assert.equal(MAX_CUSTOMER_GROUPS, 4);
  for (let count = 1; count <= MAX_CUSTOMER_GROUPS; count++) {
    const input = { customerGroups: Array.from({ length: count }, (_, i) => `  Customer \t group ${i + 1} \n`), task: " Find\t a service " };
    const before = JSON.stringify(input);
    const result = parseOnboardingPatch(input);
    assert.deepEqual(result, { customerGroups: input.customerGroups, task: "Find a service" });
    assert.equal(JSON.stringify(input), before, "Parsing must not mutate caller input.");
    assert.notEqual(result.customerGroups, input.customerGroups);
  }
  assert.deepEqual(parseOnboardingPatch({ customerGroups: [" ", "  First  group ", "\t", " Second\n group "] }), { customerGroups: ["  First  group ", " Second\n group "] });
  const longDescription = `  ${"Customers comparing detailed product requirements. ".repeat(12)}\r\n\t日本の購入者\nSecond line with  repeated spaces.  `;
  assert.deepEqual(parseOnboardingPatch({ customerGroups: ["x".repeat(61), longDescription] }).customerGroups, ["x".repeat(61), longDescription]);
});

test("customer group parsing rejects excessive raw counts, invalid types, all-blank groups, and control characters", () => {
  for (const customerGroups of invalidGroups)
    assert.throws(() => parseOnboardingPatch({ customerGroups }), badRequest, JSON.stringify(customerGroups));
  assert.throws(() => parseOnboardingPatch({ customerGroups: ["Customers"], audience: "Customers" }), /not both/);
  assert.throws(() => parseOnboardingPatch({ customerGroups: ["Customers"], audience: "" }), /not both/);
  assert.throws(() => parseOnboardingPatch({ customerGroups: ["Customers"], userId: "other-owner" }), /unsupported field/);
});

test("legacy audience preserves raw descriptions and remains optional independently of task", () => {
  assert.deepEqual(parseOnboardingPatch({ audience: "  Small\n teams ", task: " Buy a service " }), { audience: "  Small\n teams ", task: "Buy a service" });
  assert.deepEqual(parseOnboardingPatch({ audience: " \t " }), { audience: " \t " });
  assert.deepEqual(parseOnboardingPatch({ task: "Only change the task" }), { task: "Only change the task" });
  const longDescription = `  ${"Legacy customers with detailed requirements. ".repeat(12)}\n\tSecond line  `;
  assert.deepEqual(parseOnboardingPatch({ audience: longDescription }), { audience: longDescription });
  for (const audience of [null, 4, {}, [], "before\u0000after"])
    assert.throws(() => parseOnboardingPatch({ audience }), badRequest);
});

test("direct store callers cannot bypass customer group validation or write invalid input to D1", async () => {
  let prepared = false;
  const db = { prepare() { prepared = true; throw new Error("Invalid input must not reach D1."); } } as unknown as D1Database;
  for (const customerGroups of invalidGroups)
    await assert.rejects(updateOnboarding(db, "owner", { customerGroups } as OnboardingPatch), badRequest);
  await assert.rejects(updateOnboarding(db, "owner", { customerGroups: ["Customers"], audience: "Different" }), badRequest);
  assert.equal(prepared, false, "Validation precedes inserts, updates, and owner lookups.");
});
