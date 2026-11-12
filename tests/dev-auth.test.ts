import assert from "node:assert/strict";
import test from "node:test";
import { devAuthUserId, devSession, isLoopbackOrigin } from "../src/lib/dev-auth";

const on = { DEV_AUTH: "1", DEV_AUTH_USER_ID: "dev-local-user" };

test("development sign-in runs only against a loopback origin", () => {
  for (const url of ["http://localhost:3001", "http://127.0.0.1:3117", "http://[::1]:3000", "https://localhost"])
    assert.equal(devAuthUserId({ ...on, BETTER_AUTH_URL: url }), "dev-local-user", url);
  assert.equal(devSession({ ...on, BETTER_AUTH_URL: "http://localhost:3001" })?.user.email, "dev@folio.local");
});

test("any other origin, or none, refuses the development sign-in", () => {
  const previous = process.env.BETTER_AUTH_URL;
  delete process.env.BETTER_AUTH_URL;
  try {
    for (const url of ["https://usefolio.site", "https://folio-visibility.example.workers.dev", "http://localhost.evil.test", "http://10.0.0.5:3001", "not a url", ""])
      assert.throws(() => devAuthUserId({ ...on, BETTER_AUTH_URL: url }), /loopback/, url || "(empty)");
    assert.throws(() => devAuthUserId(on), /loopback/, "unset");
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = previous;
  }
});

test("without DEV_AUTH=1 nothing is checked and no session is made", () => {
  assert.equal(devAuthUserId({ DEV_AUTH: "0", BETTER_AUTH_URL: "https://usefolio.site" }), null);
  assert.equal(isLoopbackOrigin("ftp://localhost"), false);
});
