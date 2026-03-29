# Instanceiro Vercel Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Instanceiro to Vercel free tier so the public can access it.

**Architecture:** Next.js app deployed to Vercel, connected to existing Supabase backend. Only code change is adding `engines` to `package.json`. Everything else is CLI/dashboard configuration.

**Tech Stack:** Vercel CLI, GitHub CLI (`gh`), Supabase Dashboard

**Spec:** `docs/superpowers/specs/2026-03-23-vercel-deployment-design.md`

**Important notes:**
- Several tasks require **user interaction** (Vercel CLI prompts, Supabase Dashboard). These cannot be fully automated.
- **Preview deploys** will not support OAuth login (their URLs won't match Supabase redirect patterns). This is expected and acceptable.
- **Discord OAuth** is present in the login UI but not configured for production. If Discord login should work, configure redirect URLs in the Discord Developer Portal separately.

---

### Task 1: Pin Node.js Version in package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Check Vercel's supported Node.js versions**

Vercel supports LTS Node versions. Node 24 is a Current release (not LTS). Check Vercel docs or dashboard for the highest available version. If 24 is not available, use `>=22.0.0` (latest LTS) instead.

- [ ] **Step 2: Add engines field**

Add to `package.json` at the top level (after `"private": true`):

```json
"engines": {
  "node": ">=22.0.0"
},
```

Adjust the version based on Step 1 findings.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: pin Node.js version in engines field"
```

---

### Task 2: Verify Local Build

- [ ] **Step 1: Run production build locally**

```bash
cd D:/rag/instance-tracker
npm run build
```

Expected: Build succeeds with no errors. If there are TypeScript or build errors, fix them before proceeding.

- [ ] **Step 2: Run linter**

```bash
npm run lint
```

Expected: No errors.

---

### Task 3: Rename Branch and Create GitHub Repository

- [ ] **Step 1: Rename branch to main**

Vercel uses `main` as the default production branch. The local repo uses `master`.

```bash
cd D:/rag/instance-tracker
git branch -m master main
```

- [ ] **Step 2: Create GitHub repo and push**

```bash
gh repo create instanceiro --source=. --public --push
```

This creates the repo, adds the remote `origin`, and pushes `main`. Use `--private` instead of `--public` if preferred.

- [ ] **Step 3: Verify push succeeded**

```bash
git remote -v
git log --oneline origin/main -3
```

Expected: Remote `origin` points to `github.com/<username>/instanceiro` and commits match local.

---

### Task 4: Deploy to Vercel

**This task requires user interaction** (CLI prompts, dashboard).

- [ ] **Step 1: Install Vercel CLI and login**

```bash
npm i -g vercel
vercel login
```

Follow the browser-based authentication flow.

- [ ] **Step 2: Link project and deploy**

```bash
cd D:/rag/instance-tracker
vercel
```

The CLI will prompt:
1. **Set up and deploy?** → Yes
2. **Which scope?** → Select your account
3. **Link to existing project?** → No (create new)
4. **Project name?** → `instanceiro`
5. **Directory?** → `./` (default)
6. **Override settings?** → No (Vercel auto-detects Next.js)

This creates a preview deploy. Note the URL it outputs.

- [ ] **Step 3: Set environment variables**

**This is interactive** — the user must enter values when prompted.

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
```
When prompted, enter: `https://swgnctajsbiyhqxstrnx.supabase.co`
Select: **Production**, **Preview**, **Development** (all three).

```bash
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```
When prompted, enter the anon key from `.env.local`.
Select: **Production**, **Preview**, **Development** (all three).

- [ ] **Step 4: Deploy to production**

```bash
vercel --prod
```

Expected: Outputs the production URL (e.g. `https://instanceiro.vercel.app`). Note this URL — it's needed for the next task.

- [ ] **Step 5: Connect Git integration**

Go to the Vercel dashboard → Project Settings → Git → connect the GitHub repo (`instanceiro`). Set `main` as the production branch. This enables automatic deploys on push.

---

### Task 5: Configure Supabase Auth Redirect URLs

**This task is done in the Supabase Dashboard.**

- [ ] **Step 1: Update Site URL**

Go to: Supabase Dashboard → Authentication → URL Configuration

Set **Site URL** to the production URL from Task 4 (e.g. `https://instanceiro.vercel.app`).

- [ ] **Step 2: Add production redirect URL**

In the same page, add to **Redirect URLs**:
```
https://instanceiro.vercel.app/**
```

- [ ] **Step 3: Verify localhost is still in redirect URLs**

Ensure `http://localhost:3000/**` is still listed in Redirect URLs so local dev continues working.

- [ ] **Step 4: Redeploy**

Trigger a fresh production deploy so the new env vars take effect:

```bash
cd D:/rag/instance-tracker
vercel --prod
```

---

### Task 6: Post-Deploy Verification

- [ ] **Step 1: Verify landing page loads**

Open the production URL in a browser. The landing page should render correctly.

- [ ] **Step 2: Test Google OAuth login**

Click "Entrar com Google". Google OAuth flow should complete and redirect back to the app. User profile should appear.

- [ ] **Step 3: Verify data loading**

After login, check that:
- Onboarding flow works (if first-time user)
- Instance list loads from Supabase
- Cooldown timers display correctly

- [ ] **Step 4: Test mobile viewport**

Open the production URL on a phone or use browser dev tools (responsive mode). Verify layout is usable.

- [ ] **Step 5: Test password reset flow**

Navigate to `/forgot-password`, enter an email, verify the flow redirects correctly to `/reset-password`.
