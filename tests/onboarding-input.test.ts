import assert from "node:assert/strict";
import test from "node:test";
import { onboardingInputSchema } from "../src/lib/onboarding-input";
const profile = { requestKey: "a76efa18-44e5-43bc-a38e-a928c66ab62c", websiteUrl: "https://example.com/", businessName: "Business", description: "Reviewed description", audience: "Small teams", competitors: [], questions: ["Which service fits a small team?"] };
test("onboarding accepts only bounded reviewed business inputs and normalizes optional capabilities", () => {
  assert.equal(onboardingInputSchema.parse(profile).capabilities, "");
  for (const invalid of [
    {...profile,userId:"other-owner"}, {...profile,observations:[{rank:1}]},
    {...profile,questions:[]}, {...profile,questions:["Question?"," question? "]},
    {...profile,questions:["a".repeat(301)]}, {...profile,description:""},
    {...profile,requestKey:"same-key"}, {...profile,competitors:Array(11).fill("Company")},
  ]) assert.equal(onboardingInputSchema.safeParse(invalid).success, false);
});

test("invalid onboarding URL returns a user error before touching storage or making network requests", async () => {
  const { saveOnboardingProfile } = await import("../src/lib/onboarding-store");
  const { ScanError } = await import("../src/lib/scanner");
  const { keywordBenchmarkErrorResponse } = await import("../src/lib/keyword-benchmark-api");
  const db = { prepare() { throw new Error("Invalid URL must not reach storage."); } };
  for (const websiteUrl of ["http://example.com/", "https://127.0.0.1/", "https://user:password@example.com/", "https://example.com:1234/"]) {
    await assert.rejects(saveOnboardingProfile(db as never, "fixture-owner", {...profile, websiteUrl}), error => {
      assert.ok(error instanceof ScanError);
      assert.equal(keywordBenchmarkErrorResponse(error).status, 400);
      return true;
    });
  }
});
