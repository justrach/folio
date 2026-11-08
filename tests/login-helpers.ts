import type { Page } from "@playwright/test";

export async function openEmailLogin(page: Page) {
  if (!(await page.getByLabel("Email address", { exact: true }).isVisible())) await page.getByRole("button", { name: "Continue with email", exact: true }).click();
}
