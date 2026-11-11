import { expect, test } from "@playwright/test";
import { selectValue } from "./select-helpers";

test("team preview connects assignment, teammate handoff, manager review and sample usage without writes", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/**", route => { if (route.request().method() !== "GET") writes.push(new URL(route.request().url()).pathname); return route.fulfill({ json: null }); });
  // /orgs is now real organizations; the sample preview keeps its own address.
  await page.goto("/orgs?view=preview");
  await expect(page.getByRole("heading", { name: "Organizations", exact: true })).toBeVisible();
  await expect(page.getByText("Interactive team preview.", { exact: true })).toBeVisible();
  await selectValue(page.getByLabel("Task owner", { exact: true }), "leo");
  await expect(page.getByRole("status", { name: "Team preview feedback" })).toContainText("No notification was sent");
  await page.getByRole("button", { name: "Teammate view", exact: true }).click();
  await expect(page.getByText("No sample tasks assigned to Avery Chen.", { exact: false })).toBeVisible();
  await selectValue(page.getByLabel("Preview teammate", { exact: true }), "leo");
  await expect(page.getByRole("heading", { name: "Your work, Leo.", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Sample proposed change" }).fill("");
  await expect(page.getByRole("button", { name: "Send for review", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Sample proposed change" }).fill("A clearer description prepared by Leo in the team preview.");
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await expect(page.getByRole("status", { name: "Team preview feedback" })).toContainText("Switch to Manager view");
  await expect(page.getByRole("button", { name: "Approve sample proposal", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Manager view", exact: true }).click();
  await expect(page.getByRole("region", { name: "Selected sample task" })).toContainText("A clearer description prepared by Leo");
  await page.getByRole("button", { name: "Approve sample proposal", exact: true }).click();
  await expect(page.getByRole("status", { name: "Team preview feedback" })).toContainText("Nothing was published or charged");
  await expect(page.getByRole("region", { name: "Selected sample task" })).toContainText("The website has not changed");
  await expect(page.getByRole("region", { name: "Preview activity" })).toContainText("Leo Park sent");
  await page.getByRole("button", { name: "Reset preview", exact: true }).click();
  await expect(page.getByRole("status", { name: "Team preview feedback" })).toContainText("Preview reset");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.folioTheme = value; }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} layout fits`).toBe(true);
  }
  await page.getByRole("link", { name: "Explore credit usage", exact: true }).click();
  await expect(page).toHaveURL(/view=demo&demo=team/);
  await expect(page.getByRole("heading", { name: "Where did our credits go?", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(writes).toEqual([]);
});
