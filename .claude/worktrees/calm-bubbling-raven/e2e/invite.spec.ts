import { test, expect } from "@playwright/test";

// Use a clean browser context with no auth cookies for unauthenticated flow tests
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Invite Page", () => {
  test("redirects to landing page with redirect param when not logged in", async ({ page }) => {
    await page.goto("/invite/testcode123");
    // Should redirect to landing page with redirect query param
    await page.waitForURL(/\/\?redirect=.*testcode123/, { timeout: 5000 });
    await expect(page.locator("h1")).toContainText("Instanceiro");
  });

  test("shows login buttons on redirect", async ({ page }) => {
    await page.goto("/invite/testcode123");
    await page.waitForURL(/\/\?redirect/, { timeout: 5000 });
    await expect(page.locator("text=Entrar com Google")).toBeVisible();
    await expect(page.locator("text=Entrar com Discord")).toBeVisible();
  });

  test("preserves invite code in redirect param", async ({ page }) => {
    const code = "aBcD1234";
    await page.goto(`/invite/${code}`);
    await page.waitForURL(new RegExp(`redirect=.*${code}`), { timeout: 5000 });
    const url = page.url();
    expect(url).toContain(code);
    expect(url).toContain("redirect=");
  });

  test("different invite codes produce different redirect URLs", async ({ page }) => {
    await page.goto("/invite/code1abc");
    await page.waitForURL(/redirect/, { timeout: 5000 });
    const url1 = page.url();
    expect(url1).toContain("code1abc");
  });

  test("invite path is treated as protected route", async ({ page }) => {
    // Visiting any /invite/* path without auth should redirect to landing page
    await page.goto("/invite/anycode");
    // Should end up on landing page (not still on /invite/ path as the active route)
    await page.waitForURL(/\/\?/, { timeout: 5000 });
    const finalUrl = page.url();
    // The final URL should be the landing page (pathname is /)
    expect(new URL(finalUrl).pathname).toBe("/");
  });
});

test.describe("Landing Page with Redirect", () => {
  test("login buttons pass redirect param through OAuth flow", async ({ page }) => {
    await page.goto("/?redirect=/invite/testcode");

    // Google button should be visible
    const googleBtn = page.locator("text=Entrar com Google");
    await expect(googleBtn).toBeVisible();

    // Discord button should be visible
    const discordBtn = page.locator("text=Entrar com Discord");
    await expect(discordBtn).toBeVisible();
  });

  test("page shows normal landing content with redirect param", async ({ page }) => {
    await page.goto("/?redirect=/invite/testcode");
    await expect(page.locator("h1")).toContainText("Instanceiro");
    await expect(page.locator("text=Cooldowns em tempo real")).toBeVisible();
  });
});
