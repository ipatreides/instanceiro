# Username System

## Goal

Allow each user to choose a unique `@username` (lowercase alphanumeric, 3-20 chars) during onboarding, editable later on a profile page.

## Schema Changes

Add column to `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN username TEXT UNIQUE;
ALTER TABLE profiles ADD CONSTRAINT username_format CHECK (username ~ '^[a-z0-9]{3,20}$');
```

Nullable initially — becomes set during onboarding. After onboarding, should always have a value.

Add RLS policy for reading any user's username (needed for future character sharing):

```sql
CREATE POLICY "Anyone can read usernames"
  ON profiles FOR SELECT
  USING (TRUE);
```

Note: This replaces the existing "Users can view own profile" SELECT policy to allow cross-user username lookups.

## Onboarding Changes

Add step 0 "Username" before the current step 1 "Personagens". Total steps go from 3 to 4:

1. **Username** (new) — input with `@` prefix, live availability check
2. Personagens (was step 1)
3. Instâncias (was step 2)
4. Histórico (was step 3)

The username step shows:
- Title: "Escolha seu @username"
- Subtitle: "Esse será seu identificador público no Instanceiro."
- Input field with `@` prefix, auto-lowercase, regex validation
- Real-time availability feedback: green check if available, red X if taken
- "Próximo" button disabled until username is valid and available

Availability check: debounced query (300ms) to Supabase `profiles` table checking if username exists.

## Profile Page

New route `/profile` with:
- Current username displayed
- Edit form with same validation as onboarding
- Save button
- Back to dashboard link

## Dashboard Header

Show `@username` next to the display name in the header. Add a link to `/profile` (clickable username or small settings icon).

## Middleware

Update `middleware.ts` to allow `/profile` as an authenticated route (same as `/dashboard`).

## Validation

- **Regex:** `/^[a-z0-9]{3,20}$/`
- **Frontend:** real-time validation + debounced availability check
- **Backend:** CHECK constraint + UNIQUE index
- **Transform:** auto-lowercase on input

## Files

- Migration: `supabase/migrations/005_add_username.sql`
- Types: `src/lib/types.ts` — add `username` to Profile interface
- Onboarding: `src/app/onboarding/page.tsx` — add step 0, update step count
- New component: `src/components/onboarding/step-username.tsx`
- New page: `src/app/profile/page.tsx`
- Dashboard header: `src/app/dashboard/page.tsx` — show @username, link to profile
- Middleware: `middleware.ts` — allow /profile route
