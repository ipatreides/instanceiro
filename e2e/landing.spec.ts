import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("shows app title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Instanceiro");
  });

  test("shows feature cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Cooldowns em tempo real")).toBeVisible();
    await expect(page.locator("text=Histórico completo")).toBeVisible();
    await expect(page.locator("text=Multi-personagem")).toBeVisible();
  });

  test("shows login button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Entrar com Google")).toBeVisible();
  });

  test("shows footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Feito para jogadores de Ragnarok Online LATAM")).toBeVisible();
  });

  test("has correct page title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Instanceiro");
  });

  test("has dark background", async ({ page }) => {
    await page.goto("/");
    const bg = await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
    // Should be dark purple-black (#0f0a1a = rgb(15, 10, 26))
    expect(bg).toContain("rgb(15, 10, 26)");
  });
});
