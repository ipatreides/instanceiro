# Character Sharing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to share characters via @username so both can mark instances as done.

**Architecture:** New `character_shares` table with RLS. Update existing policies on characters/character_instances/instance_completions to allow shared users. New hook for managing shares, updated useCharacters to fetch shared chars. Character bar shows shared chars with gold styling. Edit modal gets tabs for data + sharing.

**Tech Stack:** Supabase (Postgres), Next.js, React, TypeScript, Tailwind CSS

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/006_character_shares.sql`

- [ ] **Step 1: Write migration**

```sql
-- Character sharing table
CREATE TABLE character_shares (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, shared_with_user_id)
);

ALTER TABLE character_shares ENABLE ROW LEVEL SECURITY;

-- Owner can manage shares
CREATE POLICY "Owners can manage shares"
  ON character_shares FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_shares.character_id
      AND characters.user_id = auth.uid()
    )
  );

-- Shared users can see their shares
CREATE POLICY "Shared users can see their shares"
  ON character_shares FOR SELECT
  USING (shared_with_user_id = auth.uid());

-- Update characters SELECT to include shared
DROP POLICY IF EXISTS "Users can view own characters" ON characters;
CREATE POLICY "Users can view own or shared characters"
  ON characters FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM character_shares
      WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    )
  );

-- Update character_instances policies to include shared users
DROP POLICY IF EXISTS "Users can view own character_instances" ON character_instances;
CREATE POLICY "Users can view own or shared character_instances"
  ON character_instances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_instances.character_id
      AND (characters.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM character_shares
        WHERE character_shares.character_id = characters.id
        AND character_shares.shared_with_user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can insert own character_instances" ON character_instances;
CREATE POLICY "Users can insert own or shared character_instances"
  ON character_instances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_instances.character_id
      AND (characters.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM character_shares
        WHERE character_shares.character_id = characters.id
        AND character_shares.shared_with_user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can update own character_instances" ON character_instances;
CREATE POLICY "Users can update own or shared character_instances"
  ON character_instances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_instances.character_id
      AND (characters.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM character_shares
        WHERE character_shares.character_id = characters.id
        AND character_shares.shared_with_user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can delete own character_instances" ON character_instances;
CREATE POLICY "Users can delete own or shared character_instances"
  ON character_instances FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_instances.character_id
      AND (characters.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM character_shares
        WHERE character_shares.character_id = characters.id
        AND character_shares.shared_with_user_id = auth.uid()
      ))
    )
  );

-- Update instance_completions policies to include shared users
DROP POLICY IF EXISTS "Users can view own completions" ON instance_completions;
CREATE POLICY "Users can view own or shared completions"
  ON instance_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = instance_completions.character_id
      AND (characters.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM character_shares
        WHERE character_shares.character_id = characters.id
        AND character_shares.shared_with_user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can insert own completions" ON instance_completions;
CREATE POLICY "Users can insert own or shared completions"
  ON instance_completions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = instance_completions.character_id
      AND (characters.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM character_shares
        WHERE character_shares.character_id = characters.id
        AND character_shares.shared_with_user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can update own completions" ON instance_completions;
CREATE POLICY "Users can update own or shared completions"
  ON instance_completions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = instance_completions.character_id
      AND (characters.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM character_shares
        WHERE character_shares.character_id = characters.id
        AND character_shares.shared_with_user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can delete own completions" ON instance_completions;
CREATE POLICY "Users can delete own or shared completions"
  ON instance_completions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = instance_completions.character_id
      AND (characters.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM character_shares
        WHERE character_shares.character_id = characters.id
        AND character_shares.shared_with_user_id = auth.uid()
      ))
    )
  );
```

- [ ] **Step 2: Run migration**

Run: `cd D:/rag/instance-tracker && npx supabase db query --linked -f supabase/migrations/006_character_shares.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_character_shares.sql
git commit -m "feat: add character_shares table and update RLS for sharing"
```

---

### Task 2: Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add types**

Add `CharacterShare` interface and extend `Character`:

```ts
export interface CharacterShare {
  character_id: string;
  shared_with_user_id: string;
  created_at: string;
  username?: string; // joined from profiles
}
```

Add to `Character` interface:
```ts
  isShared?: boolean;
  ownerUsername?: string | null;
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add CharacterShare type and shared fields to Character"
```

---

### Task 3: useCharacterShares hook

**Files:**
- Create: `src/hooks/use-character-shares.ts`

- [ ] **Step 1: Create hook**

Hook that fetches shares for a character, allows adding by username, and removing by user_id. Lookup username → user_id via profiles table.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-character-shares.ts
git commit -m "feat: add useCharacterShares hook for managing shares"
```

---

### Task 4: Update useCharacters to fetch shared characters

**Files:**
- Modify: `src/hooks/use-characters.ts`

- [ ] **Step 1: Fetch shared characters**

After fetching own characters, also fetch shared characters via:
```sql
character_shares.shared_with_user_id = auth.uid()
→ join characters
→ join profiles (for owner username)
```

Mark shared characters with `isShared: true` and `ownerUsername`.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-characters.ts
git commit -m "feat: fetch shared characters in useCharacters hook"
```

---

### Task 5: Character share tab component

**Files:**
- Create: `src/components/characters/character-share-tab.tsx`

- [ ] **Step 1: Create component**

Tab content with:
- Input `@username` with search/validation
- Add button
- List of shared users with remove button
- Loading/error states
- Empty state "Nenhum compartilhamento"

Uses `useCharacterShares` hook.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/characters/character-share-tab.tsx
git commit -m "feat: add character share tab component"
```

---

### Task 6: Character bar gold styling for shared

**Files:**
- Modify: `src/components/characters/character-bar.tsx`

- [ ] **Step 1: Add gold styling**

For characters where `isShared === true`:
- Border: `#D4A843` (gold)
- Selected bg: `#D4A843` with darker text
- Show `@ownerUsername` below level
- Click on selected shared char does NOT open edit modal (only owner can edit)

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/characters/character-bar.tsx
git commit -m "feat: gold styling for shared characters in character bar"
```

---

### Task 7: Dashboard edit modal with tabs

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add tabs to edit modal**

When editing an owned character:
- Tab bar: "Dados" | "Compartilhamento"
- Dados tab: existing CharacterForm
- Compartilhamento tab: CharacterShareTab

When clicking a selected shared character: no edit modal (just selects).

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: edit modal with tabs for data and sharing"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run tests**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 2: Full build**

Run: `npm run build`

- [ ] **Step 3: Manual test**

1. Login as user A, create a character, go to edit → Compartilhamento tab
2. Add @username of user B
3. Login as user B — shared character appears in gold in character bar
4. User B can mark instances as done on shared character
5. User A sees the completions
6. User A removes share — character disappears from user B
