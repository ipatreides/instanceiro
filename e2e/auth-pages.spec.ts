import { test, expect } from "@playwright/test";

test.describe("Signup Page", () => {
  test("loads with form fields", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Criar Conta" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("shows validation error for short password", async ({ page }) => {
    await page.goto("/signup");
    await page.locator('input[type="email"]').fill("test@test.com");
    await page.locator('input[type="password"]').first().fill("123");
    await page.locator('input[type="password"]').nth(1).fill("123");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("text=6 caracteres")).toBeVisible({ timeout: 3000 });
  });

  test("has link to login", async ({ page }) => {
    await page.goto("/signup");
    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink).toBeVisible();
  });

  test("has Google OAuth option", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("text=Google")).toBeVisible();
  });
});

test.describe("Login Page", () => {
  test("loads with form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("shows error for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("nonexistent@test.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("text=incorretos").or(page.locator("text=error"))).toBeVisible({ timeout: 5000 });
  });

  test("has link to signup", async ({ page }) => {
    await page.goto("/login");
    const signupLink = page.locator('a[href="/signup"]');
    await expect(signupLink).toBeVisible();
  });

  test("has link to forgot password", async ({ page }) => {
    await page.goto("/login");
    const forgotLink = page.locator('a[href="/forgot-password"]');
    await expect(forgotLink).toBeVisible();
  });

  test("has Google OAuth option", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=Google")).toBeVisible();
  });
});

test.describe("Forgot Password Page", () => {
  test("loads with email input", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("text=Esqueceu a senha")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("has link back to login", async ({ page }) => {
    await page.goto("/forgot-password");
    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink).toBeVisible();
  });
});

test.describe("Landing Page Auth Links", () => {
  test("has signup link", async ({ page }) => {
    await page.goto("/");
    const signupLink = page.locator('a[href="/signup"]');
    await expect(signupLink).toBeVisible();
  });

  test("has login link", async ({ page }) => {
    await page.goto("/");
    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink).toBeVisible();
  });

  test("has Google button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Entrar com Google")).toBeVisible();
  });

  test("has 'ou' divider", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=ou")).toBeVisible();
  });
});
