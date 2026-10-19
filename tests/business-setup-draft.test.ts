import test from "node:test";
import assert from "node:assert/strict";
import { parseBusinessSetupDraft } from "../src/lib/business-setup-draft";
const now = 1800000000000;
const draft = {
  websiteUrl: "https://example.com",
  businessName: "Example",
  description: "Business",
  audience: "Customers",
  capabilities: "",
  competitors: "",
  questions: "Which business can help?",
};
const raw = (extra = {}) =>
  JSON.stringify({ savedAt: now, draft, step: 4, ...extra });
test("same-tab refresh retains reviewed questions and uncertain-save identity", () => {
  const request = {
    body: "reviewed save",
    key: "12345678-1234-1234-1234-123456789012",
  };
  assert.deepEqual(parseBusinessSetupDraft(raw({ request }), false, now), {
    draft,
    step: 4,
    request,
  });
});
test("login transfer requires explicit marker and bounded fresh content", () => {
  assert.equal(parseBusinessSetupDraft(raw(), true, now), null);
  assert.ok(parseBusinessSetupDraft(raw({ transfer: true }), true, now));
  assert.equal(
    parseBusinessSetupDraft(raw({ savedAt: now - 86400001 }), false, now),
    null,
  );
  assert.equal(
    parseBusinessSetupDraft(raw({ savedAt: now + 1 }), false, now),
    null,
  );
  assert.equal(
    parseBusinessSetupDraft(
      raw({ draft: { ...draft, questions: "x".repeat(4001) } }),
      false,
      now,
    ),
    null,
  );
  assert.equal(parseBusinessSetupDraft("invalid", false, now), null);
});
test("restoring a draft drops unexpected owner/profile metadata and rejects malformed reservations", () => {
  assert.deepEqual(
    parseBusinessSetupDraft(
      raw({ draft: { ...draft, id: "private-profile", ownerId: "other" } }),
      false,
      now,
    )?.draft,
    draft,
  );
  assert.equal(
    parseBusinessSetupDraft(
      raw({ request: { key: "wrong", body: "payload" } }),
      false,
      now,
    ),
    null,
  );
});
