# Instanceiro — Vercel Deployment Design

## Overview

Deploy the Instanceiro Next.js app to Vercel's free tier for public access. The Supabase backend is already hosted and fully configured (tables, seed data, RLS policies, Google OAuth).

## Stack

- **Frontend hosting**: Vercel (Free Tier)
- **Backend**: Supabase (already hosted at `swgnctajsbiyhqxstrnx.supabase.co`)
- **Domain**: `instanceiro.vercel.app` (if available; otherwise use the Vercel-assigned subdomain and update all redirect URLs accordingly)

## Steps

### 1. Pre-flight: Local Build Verification

Run `npm run build` locally to catch TypeScript or build errors before the first deploy.

### 2. GitHub Repository

Create a new GitHub repo and push the existing `instance-tracker` git repo.

- Create via `gh repo create` or GitHub UI
- Visibility: user's choice (public or private)
- `.env.local` is already in `.gitignore` — secrets stay local

### 3. Vercel Project Setup

- Connect the GitHub repo to Vercel
- Framework preset: Next.js (auto-detected)
- Environment variables (set in Vercel dashboard, scoped to **all environments** — Production, Preview, Development):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Supabase Auth — Production Redirect URLs

In Supabase Dashboard (Authentication > URL Configuration):
- Set **Site URL** to the production URL (e.g. `https://instanceiro.vercel.app`)
- Add the production URL pattern to **Redirect URLs**: `https://instanceiro.vercel.app/**`
- **Keep** `http://localhost:3000/**` in Redirect URLs so local dev continues working

Google Cloud Console OAuth redirect URI (`https://swgnctajsbiyhqxstrnx.supabase.co/auth/v1/callback`) should already be configured.

**Note on preview deploys:** Preview deploys get unique URLs that won't match the production redirect pattern. OAuth login will not work on preview deploys unless a wildcard pattern is added. This is acceptable for now — preview deploys are for visual review, not auth testing.

**Note on Discord OAuth:** The login UI supports Discord as a provider. If Discord login should work in production, its redirect URLs also need configuration in the Discord Developer Portal. If not needed yet, no action required.

### 5. Build & Deploy

- Vercel runs `next build` automatically on push
- Each push to `main` triggers a production deploy
- PRs/branches get preview deploys (no OAuth on these — see note above)

### 6. Post-Deploy Verification

- Verify the landing page loads
- Test Google OAuth login flow end-to-end
- Test password reset flow (`/forgot-password` → `/reset-password`)
- Verify Supabase data fetching works (instances load, cooldowns calculate)
- Test on mobile viewport

## Constraints

- Vercel Free Tier: 100 GB bandwidth/month, 6000 build minutes/month
- No custom domain initially (can add later)
- No server-side secrets needed beyond the two Supabase public env vars
