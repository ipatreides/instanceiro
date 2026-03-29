import { test, expect } from "@playwright/test";

test.describe("Auth Redirects", () => {
  test("dashboard redirects to landing when not logged in", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to landing page since user is not authenticated
    await page.waitForURL("/", { timeout: 5000 });
    await expect(page.locator("h1")).toContainText("Instanceiro");
  });

  test("onboarding page no longer exists (removed)", async ({ page }) => {
    const response = await page.goto("/onboarding");
    // Should return 404 since onboarding was removed
    expect(response?.status()).toBe(404);
  });

  test("profile redirects to landing when not logged in", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL("/", { timeout: 5000 });
    await expect(page.locator("h1")).toContainText("Instanceiro");
  });

  test("login button is clickable", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator("text=Entrar com Google");
    await expect(btn).toBeEnabled();
  });
});
