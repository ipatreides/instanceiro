# Character Sharing

## Goal

Allow users to share their characters with other users via @username. Shared users can do everything the owner can (mark done, edit times, activate/deactivate). Shared characters appear in the recipient's character bar with distinct styling.

## Schema

New table `character_shares`:

```sql
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
```

## RLS Changes

Current RLS on `character_instances` and `instance_completions` only allows the character owner. Need to extend to also allow shared users.

For each table that checks `characters.user_id = auth.uid()`, the policy needs to also accept users who have a row in `character_shares`:

```sql
-- Pattern: owner OR shared user
(characters.user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM character_shares
  WHERE character_shares.character_id = characters.id
  AND character_shares.shared_with_user_id = auth.uid()
))
```

Tables to update policies on:
- `characters` (SELECT only — shared user needs to read character data)
- `character_instances` (SELECT, INSERT, UPDATE, DELETE)
- `instance_completions` (SELECT, INSERT, UPDATE, DELETE)

## Character Bar

Shared characters appear in the same bar with different styling:
- Border color: `#D4A843` (gold) instead of `#3D2A5C` (purple)
- Selected state: `#D4A843` background instead of `#7C3AED`
- Small text showing `@ownerUsername` below the level

## Edit Modal — Tabs

When editing a character the user owns, the modal has two tabs:

**Tab 1: Dados** — existing form (name, class, level, delete)

**Tab 2: Compartilhamento** — sharing management:
- Input `@username` with availability check (must exist, can't share with self, can't share twice)
- List of current shares with username and remove button
- Empty state: "Nenhum compartilhamento"

When editing a shared character (not owner), no edit modal — just view the instances. Or optionally show a read-only info view.

## Hook Changes

**useCharacters** — fetch both:
1. Own characters: `characters.user_id = auth.uid()`
2. Shared characters: join `character_shares` → `characters` where `shared_with_user_id = auth.uid()`

Return type adds:
```ts
isShared: boolean;
ownerUsername: string | null;
```

Need a new hook or extend existing: **useCharacterShares(characterId)** — fetch/add/remove shares for a character.

## Files

- Migration: `supabase/migrations/006_character_shares.sql`
- Types: `src/lib/types.ts` — add CharacterShare interface, extend Character with isShared/ownerUsername
- Hook: `src/hooks/use-character-shares.ts` — CRUD for shares
- Hook: `src/hooks/use-characters.ts` — fetch shared characters too
- Component: `src/components/characters/character-share-tab.tsx` — sharing tab UI
- Modify: `src/components/characters/character-bar.tsx` — gold styling for shared
- Modify: `src/app/dashboard/page.tsx` — edit modal with tabs, handle shared chars
