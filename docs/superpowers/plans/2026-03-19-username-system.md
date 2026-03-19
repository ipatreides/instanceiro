# Username System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to choose a unique @username during onboarding, editable on a profile page.

**Architecture:** Add `username` column to `profiles` table with UNIQUE + CHECK constraints. New onboarding step 0 with live availability check. New `/profile` page for editing. Show @username in dashboard header.

**Tech Stack:** Supabase (Postgres), Next.js, React, TypeScript, Tailwind CSS

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/005_add_username.sql`

- [ ] **Step 1: Write migration**

```sql
-- Add username field to profiles
ALTER TABLE profiles ADD COLUMN username TEXT UNIQUE;
ALTER TABLE profiles ADD CONSTRAINT username_format CHECK (username ~ '^[a-z0-9]{3,20}$');

-- Replace "Users can view own profile" with public SELECT for username lookups
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Anyone can read profiles"
  ON profiles FOR SELECT
  USING (TRUE);
```

- [ ] **Step 2: Run migration**

Run: `cd D:/rag/instance-tracker && npx supabase db query --linked -f supabase/migrations/005_add_username.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_add_username.sql
git commit -m "feat: add username column to profiles with unique constraint"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `src/lib/types.ts:3-10`

- [ ] **Step 1: Add username to Profile interface**

Add `username: string | null;` after `avatar_url` in the Profile interface.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add username to Profile type"
```

---

### Task 3: Username validation hook

**Files:**
- Create: `src/hooks/use-username-check.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const USERNAME_REGEX = /^[a-z0-9]{3,20}$/;

export type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function isValidUsername(value: string): boolean {
  return USERNAME_REGEX.test(value);
}

export function useUsernameCheck(username: string, currentUsername?: string | null) {
  const [status, setStatus] = useState<UsernameStatus>("idle");

  useEffect(() => {
    if (!username) {
      setStatus("idle");
      return;
    }

    if (!isValidUsername(username)) {
      setStatus("invalid");
      return;
    }

    // If editing and same as current, it's available
    if (currentUsername && username === currentUsername) {
      setStatus("available");
      return;
    }

    setStatus("checking");
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      setStatus(data ? "taken" : "available");
    }, 300);

    return () => clearTimeout(timer);
  }, [username, currentUsername]);

  return status;
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-username-check.ts
git commit -m "feat: add useUsernameCheck hook with debounced availability"
```

---

### Task 4: Onboarding step-username component

**Files:**
- Create: `src/components/onboarding/step-username.tsx`

- [ ] **Step 1: Create the component**

Username input with `@` prefix, auto-lowercase, live status feedback (green check / red X / spinner), "Próximo" disabled until available.

Uses `useUsernameCheck` hook. Calls `onNext(username)` when confirmed.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/step-username.tsx
git commit -m "feat: add step-username onboarding component"
```

---

### Task 5: Integrate username step into onboarding

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Update onboarding**

Changes:
- Import `StepUsername`
- Update `STEP_LABELS` to `["Username", "Personagens", "Instâncias", "Histórico"]`
- Add `username` state
- Add step 1 rendering for `StepUsername` (existing steps shift to 2/3/4)
- In `handleFinish`, save username to profiles before creating characters

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat: add username as onboarding step 1"
```

---

### Task 6: Profile page

**Files:**
- Create: `src/app/profile/page.tsx`

- [ ] **Step 1: Create profile page**

Page with:
- Fetch current profile (username, display_name, avatar_url)
- Username edit form with same validation (useUsernameCheck with currentUsername)
- Save button that updates profiles table
- "Voltar ao dashboard" link
- Same dark purple theme as rest of app

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat: add profile page with username editing"
```

---

### Task 7: Dashboard header @username

**Files:**
- Modify: `src/app/dashboard/page.tsx:17-20, 55-70, 249-265`

- [ ] **Step 1: Update Profile interface and display**

Changes:
- Add `username: string | null` to local Profile interface
- Fetch username in the profile query (already fetches from profiles, just add field)
- Show `@username` in header, linked to `/profile`

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: show @username in dashboard header with link to profile"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run tests**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: no errors

- [ ] **Step 3: Reset user and test onboarding flow**

Reset user via service role key, then test:
1. Login → onboarding starts at username step
2. Type username → see availability check
3. Continue through all 4 steps
4. Dashboard shows @username in header
5. Click username → profile page → edit username
