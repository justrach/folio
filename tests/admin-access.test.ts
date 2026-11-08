import assert from "node:assert/strict";
import test from "node:test";

process.env.ADMIN_EMAILS = "dev@folio.local, Extra@Example.com ";

import { adminEmails, isAdmin } from "../src/lib/admin";

test("admin allowlist keeps the two owner accounts and normalises extras", () => {
  const emails = adminEmails();
  assert.ok(emails.includes("rachxpradhan@gmail.com"));
  assert.ok(emails.includes("yuxilim22@gmail.com"));
  assert.ok(emails.includes("dev@folio.local"), "ADMIN_EMAILS is additive");
  assert.ok(emails.includes("extra@example.com"), "entries are trimmed and lower-cased");
  assert.equal(new Set(emails).size, emails.length, "no duplicates");
});

test("admin access is case-insensitive and fails closed", () => {
  assert.equal(isAdmin("RachxPradhan@Gmail.com"), true);
  assert.equal(isAdmin(" rachxpradhan@gmail.com "), true);
  assert.equal(isAdmin("yuxilim22@gmail.com"), true);
  assert.equal(isAdmin("someone@else.test"), false);
  assert.equal(isAdmin(""), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
});
