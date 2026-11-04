import { expect, test } from "@playwright/test";

const email = `e2e-${Date.now()}@example.com`;

test("register, create a deck, add cards from search, undo and redo", async ({ page }) => {
  await page.goto("/register");
  await page.fill("#name", "E2E");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/decks");

  await page
    .getByRole("button", { name: /New deck/ })
    .first()
    .click();
  await page.fill("#deck-name", "E2E deck");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/decks\/[0-9a-f-]{36}/);

  await page.getByRole("button", { name: /Add cards/ }).click();
  const search = page.getByRole("textbox", { name: "Card search" });
  await search.fill("t:creature");
  const add = page.locator('button[aria-label^="Add "]').first();
  await expect(add).toBeVisible({ timeout: 30_000 });
  await add.click();
  await expect(page.getByLabel("Card count")).toContainText("1", { timeout: 15_000 });

  await page.getByRole("button", { name: "Close search" }).click();
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("Card count")).toContainText("0");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByLabel("Card count")).toContainText("1");

  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByRole("tabpanel", { name: "History" }).getByText(/Redo:/)).toBeVisible();
});
