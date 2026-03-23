import { test, expect } from "@playwright/test";

test.describe("Reset Password Page", () => {
  test("shows spinner then error when no recovery token", async ({ page }) => {
    await page.goto("/reset-password");

    // Should show spinner with "Verificando link..." initially
    await expect(page.locator("text=Verificando link...")).toBeVisible({ timeout: 2000 });

    // After ~3s timeout, should show error
    await expect(page.locator("text=Link inválido ou expirado")).toBeVisible({ timeout: 5000 });

    // Spinner should be gone
    await expect(page.locator("text=Verificando link...")).not.toBeVisible();

    // Should show link to request a new one
    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
  });
});
