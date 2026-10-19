import { expect, test } from "@playwright/test";

// Opt in only against a disposable local server with its own auth secret and D1.
// Never point this at the normal workspace database or a hosted environment.
test("real onboarding saves the reviewed profile and exact question suite after login", async ({ page, request, baseURL }) => {
  test.setTimeout(90_000);
  test.skip(process.env.GUI_ISOLATED_ONBOARDING !== "1", "Requires a disposable local auth/database runtime.");
  expect(new URL(baseURL!).hostname).toBe("localhost");
  const email = `onboarding-${crypto.randomUUID()}@example.test`;
  const password = "Synthetic isolated onboarding fixture 2026";
  const account = await request.post("/api/auth/sign-up/email", {
    headers: { Origin: baseURL! }, data: { email, password, name: "Isolated onboarding fixture" },
  });
  expect(account.ok()).toBeTruthy();
  const paidWrites: string[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      !["/api/auth/sign-in/email", "/api/onboarding", "/api/benchmarks"].includes(path)) {
      paidWrites.push(`${request.method()} ${path}`);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/onboarding");
  await page.getByLabel("Website URL", { exact: true }).fill("https://example.com");
  await page.getByLabel("Business name", { exact: true }).fill("Orbit Workshop");
  await page.getByRole("button", { name: "Continue →", exact: true }).click();
  await page.getByLabel("What does your business do?", { exact: true }).fill("Practical coding workshops for small teams.");
  await page.getByLabel("Who is it for?", { exact: true }).fill("Engineering leads and educators.");
  await page.getByRole("button", { name: "Continue →", exact: true }).click();
  const questions = ["Which workshops help small teams onboard developers?", "How can educators plan coding exercises?"];
  await page.getByLabel("Customer questions, one per line", { exact: true }).fill(questions.join("\n"));
  await page.getByRole("button", { name: "Continue →", exact: true }).click();
  await page.getByRole("link", { name: "Sign in to save privately →" }).click();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review your workspace setup" })).toBeVisible();
  await expect(page.getByText(questions[0], { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save to my workspace" }).click();
  await expect(page.getByText("Saved privately to your workspace.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Saved privately to your workspace.", { exact: true })).toBeVisible();
  const response = await page.request.get("/api/onboarding");
  expect(response.ok()).toBeTruthy();
  const { profile } = await response.json();
  expect(profile.businessName).toBe("Orbit Workshop");
  expect(profile.questions).toEqual(questions);
  await page.getByRole("link", { name: "Open your workspace →" }).click();
  await expect(page.locator(".saved-business-profile")).toContainText("Orbit Workshop");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `.local/onboarding-review/codegraff-profile-${test.info().project.name}.png`, fullPage: true });
  const openNavigation = page.getByRole("button", { name: "Open navigation", exact: true });
  const mobileNavigation = await openNavigation.isVisible();
  if (mobileNavigation) await openNavigation.click();
  const moreTools = page.getByRole("button", { name: "More tools", exact: true });
  await expect(moreTools).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link")).toHaveCount(3);
  await moreTools.click();
  await expect(moreTools).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "More tools", exact: true }).getByRole("link", { name: "SEO health", exact: true })).toBeVisible();
  await moreTools.click();
  if (mobileNavigation) await page.keyboard.press("Escape");
  await page.waitForLoadState("networkidle");
  await page.getByText("Business details & saved questions", { exact: true }).click();
  await page.getByRole("link", { name: "Reopen business setup" }).click();
  await expect(page.getByRole("heading", { name: "Your business is ready to follow." })).toBeVisible();
  await page.getByRole("link", { name: "Review saved questions", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`suite=${profile.suiteId}`));
  await expect(page.getByRole("heading", { name: "Review your question", exact: true })).toBeVisible();
  expect(questions).toContain(await page.locator(".guided-run-question").innerText());
  await page.getByText("Advanced workspace controls", { exact: true }).click();
  await page.getByText("Save a new question suite", { exact: true }).click();
  await page.getByRole("button", { name: "Write or edit these questions", exact: true }).click();
  const editor = page.getByRole("form", { name: "Write a question suite" });
  await editor.getByRole("textbox", { name: "Questions, one per line", exact: true }).fill(questions.join("\n"));
  await editor.getByText("Prepare new questions for your website", { exact: true }).click();
  await editor.getByLabel("Who are your customers?", { exact: true }).fill("small engineering teams");
  await editor.getByLabel("What do they need to do?", { exact: true }).fill("onboard developers with coding workshops");
  await editor.getByRole("button", { name: "Add three scenario drafts", exact: true }).click();
  const drafts = (await editor.getByRole("textbox", { name: "Questions, one per line", exact: true }).inputValue()).split("\n").filter(Boolean);
  expect(drafts).toHaveLength(5);
  await expect(editor.getByText("5 / 10 questions · up to 300 characters each", { exact: true })).toBeVisible();
  await editor.getByLabel("Suite name", { exact: true }).fill("Orbit Workshop scenario questions");
  await editor.getByRole("button", { name: "Save questions", exact: true }).click();
  await expect(page.getByText("Questions saved. No observation has been started.", { exact: true })).toBeVisible();
  await page.getByText("Advanced workspace controls", { exact: true }).click();
  await expect(page.locator(".benchmark-question-list").getByRole("button")).toHaveCount(5);
  await page.reload();
  await page.getByText("Advanced workspace controls", { exact: true }).click();
  await expect(page.locator(".benchmark-question-list").getByRole("button")).toHaveCount(5);
  expect(paidWrites).toEqual([]);
});
