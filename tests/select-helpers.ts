import { expect, type Locator } from "@playwright/test";

/** Exercise the visible dropdown rather than changing a hidden form field. */
export async function selectValue(trigger: Locator, value: string) {
  await trigger.click();
  const option = trigger.page().getByRole("listbox").locator(`[role="option"][data-value=${JSON.stringify(value)}]`);
  await expect(option).toBeVisible();
  await option.click();
}
