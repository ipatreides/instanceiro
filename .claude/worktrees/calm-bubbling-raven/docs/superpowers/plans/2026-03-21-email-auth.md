# Email + Password Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email + password registration and login as alternative to Google OAuth, with email confirmation and password reset.

**Architecture:** Four new pages (signup, login, forgot-password, reset-password) using Supabase Auth methods. Landing page updated with links. All pages use Claudinho purple theme. No schema changes — existing profile trigger handles both auth methods.

**Tech Stack:** Supabase Auth, Next.js, React, TypeScript, Tailwind CSS

---

### Task 1: Signup page

**Files:**
- Create: `src/app/signup/page.tsx`

- [ ] **Step 1: Create signup page**

"use client" page with form: email, password (min 6), confirm password.
Validation: email format, password min 6, passwords match.
Submit: `supabase.auth.signUp({ email, password })`.
After success: show message "Verifique seu email para confirmar a conta."
Error handling: display Supabase error messages.
Link "Já tem conta? Entrar" → /login.
Link "Entrar com Google" → Google OAuth.
Purple theme matching app.

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/signup/page.tsx
git commit -m "feat: add email signup page"
```

---

### Task 2: Login page

**Files:**
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Create login page**

"use client" page with form: email, password.
Submit: `supabase.auth.signInWithPassword({ email, password })`.
On success: redirect to /dashboard.
Error handling: "Email ou senha incorretos", "Email não confirmado".
Links: "Esqueceu a senha?" → /forgot-password, "Criar conta" → /signup.
"Entrar com Google" button also available.
Purple theme.

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: add email login page"
```

---

### Task 3: Forgot password page

**Files:**
- Create: `src/app/forgot-password/page.tsx`

- [ ] **Step 1: Create forgot password page**

"use client" page with email input.
Submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`.
After submit: show "Se o email existir, enviamos um link para redefinir sua senha."
Link back to /login.
Purple theme.

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/forgot-password/page.tsx
git commit -m "feat: add forgot password page"
```

---

### Task 4: Reset password page

**Files:**
- Create: `src/app/reset-password/page.tsx`

- [ ] **Step 1: Create reset password page**

"use client" page with password + confirm password.
On mount: check if user has a recovery session via `supabase.auth.onAuthStateChange`.
Submit: `supabase.auth.updateUser({ password })`.
On success: redirect to /login.
Purple theme.

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/reset-password/page.tsx
git commit -m "feat: add reset password page"
```

---

### Task 5: Update landing page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update CTA section**

Replace single `<LoginButton />` with:
- "Entrar com Google" button (existing LoginButton)
- Divider "ou"
- "Criar conta" link/button → /signup
- "Já tem conta? Entrar" link → /login

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add signup/login links to landing page"
```

---

### Task 6: E2E tests

**Files:**
- Create: `e2e/auth-pages.spec.ts`

- [ ] **Step 1: Write E2E tests**

Test cases:
- /signup page loads with form fields
- /login page loads with form fields
- /forgot-password page loads with email input
- Signup with empty fields shows validation errors
- Login with wrong credentials shows error
- Landing page has both Google and email auth options

- [ ] **Step 2: Run E2E tests**

Run: `npm run test:e2e`

- [ ] **Step 3: Commit**

```bash
git add e2e/auth-pages.spec.ts
git commit -m "test: add E2E tests for auth pages"
```

---

### Task 7: Verification

- [ ] **Step 1: Run all tests**

Run: `npm test && npm run test:e2e`

- [ ] **Step 2: Full build**

Run: `npm run build`

- [ ] **Step 3: Manual test**

1. Visit /signup → create account with email
2. Check email for confirmation link
3. Confirm email → visit /login → login with email/password
4. Verify redirect to onboarding/dashboard
5. Logout → login with Google → works
6. Visit /forgot-password → submit email → check reset link
