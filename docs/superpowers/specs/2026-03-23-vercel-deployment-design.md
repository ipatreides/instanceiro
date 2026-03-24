# Instanceiro — Vercel Deployment Design

## Overview

Deploy the Instanceiro Next.js app to Vercel's free tier for public access. The Supabase backend is already hosted and fully configured (tables, seed data, RLS policies, Google OAuth).

## Stack

- **Frontend hosting**: Vercel (Free Tier)
- **Backend**: Supabase (already hosted at `swgnctajsbiyhqxstrnx.supabase.co`)
- **Domain**: `instanceiro.vercel.app` (Vercel subdomain, free)

## Steps

### 1. GitHub Repository

Push the existing `instance-tracker` git repo to GitHub.

- Visibility: user's choice (public or private)
- `.env.local` is already in `.gitignore` — secrets stay local

### 2. Vercel Project Setup

- Connect the GitHub repo to Vercel
- Framework preset: Next.js (auto-detected)
- Environment variables (set in Vercel dashboard):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. Supabase Auth — Production Redirect URLs

In Supabase Dashboard (Authentication > URL Configuration):
- Set **Site URL** to `https://instanceiro.vercel.app`
- Add `https://instanceiro.vercel.app/**` to **Redirect URLs**

Google Cloud Console OAuth redirect URI (`https://swgnctajsbiyhqxstrnx.supabase.co/auth/v1/callback`) should already be configured.

### 4. Build & Deploy

- Vercel runs `next build` automatically on push
- Each push to `main` triggers a production deploy
- PRs/branches get preview deploys automatically

### 5. Post-Deploy Verification

- Verify the landing page loads
- Test Google OAuth login flow end-to-end
- Verify Supabase data fetching works (instances load, cooldowns calculate)
- Test on mobile viewport

## Constraints

- Vercel Free Tier: 100 GB bandwidth/month, 6000 build minutes/month
- No custom domain initially (can add later)
- No server-side secrets needed beyond the two Supabase public env vars
