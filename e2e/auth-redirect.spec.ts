import { test, expect } from "@playwright/test";

test.describe("Auth Redirects", () => {
  test("dashboard redirects to landing when not logged in", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to landing page since user is not authenticated
    await page.waitForURL("/", { timeout: 5000 });
    await expect(page.locator("h1")).toContainText("Instanceiro");
  });

  test("onboarding page loads without crash when not logged in", async ({ page }) => {
    await page.goto("/onboarding");
    // Onboarding is a client page — without auth it shows the onboarding UI
    // but any Supabase calls will fail gracefully
    await expect(page.locator("text=Configuração Inicial")).toBeVisible({ timeout: 5000 });
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
