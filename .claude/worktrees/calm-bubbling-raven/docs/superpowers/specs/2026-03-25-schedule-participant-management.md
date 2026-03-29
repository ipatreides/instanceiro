# Schedule Participant & Placeholder Management

## Summary

Allow the schedule organizer to manage participants and placeholders more flexibly:

1. **Multiple own characters**: Organizer can add/remove own characters from the schedule, keeping at least 1.
2. **Assign characters to placeholders**: Organizer can assign eligible characters (own or friends') to open placeholder slots, respecting class restrictions.
3. **Release assigned characters**: Organizer can unassign a character from a placeholder, returning it to "open" state.

## Rules

### Organizer's characters

- Organizer must always have **at least 1 character** in the schedule.
- If they have 2+, they can remove extras via "Desinscrever" button (same as today for non-creators, but now allowed for creator when count > 1).
- Organizer adds own characters via the existing search/add flow — their characters appear in the eligible list.

### Assigning characters to placeholders

- Only characters **not already in the schedule** can be assigned to a placeholder. This prevents duplication.
- Class restrictions are enforced:
  - `class` slot → character.class must match `slot_class`
  - `artista` slot → character.class must be 'Trovador' or 'Musa'
  - `dps_fisico` / `dps_magico` → any class
- Assignment uses the existing `claim_placeholder` RPC (already validates ownership and class).
- The organizer can assign **their own characters** or **friends' characters** to a slot.

### Releasing characters from placeholders

- Organizer clicks "Liberar" on a filled placeholder.
- The placeholder returns to "open" state (`claimed_by = NULL`, `claimed_character_id = NULL`).
- New RPC: `unclaim_placeholder(p_placeholder_id UUID)` — only the schedule creator can unclaim.

---

## Database

### New RPC: `unclaim_placeholder(p_placeholder_id UUID)`

```sql
-- Only the schedule creator can unclaim
{ "status": "released" }
{ "status": "not_found" }
{ "status": "not_claimed" }
{ "status": "not_creator" }
```

**Logic:**
1. Look up placeholder by id, join to `instance_schedules` to get `created_by`
2. If not found → `not_found`
3. If `claimed_by IS NULL` → `not_claimed`
4. If schedule's `created_by != auth.uid()` → `not_creator`
5. `UPDATE schedule_placeholders SET claimed_by = NULL, claimed_character_id = NULL`
6. Return `released`

**SECURITY DEFINER**.

### Update `claim_placeholder` RPC

Current RPC validates character ownership (`user_id = auth.uid()`). The organizer needs to assign **friends' characters** too. Change:

- Allow claim if `auth.uid()` owns the character **OR** if `auth.uid()` is the schedule creator.
- Add check: character must not already be a participant in the schedule.

Updated logic:
1. Look up placeholder by id, **join `schedule_placeholders → instance_schedules`** to get `schedule.created_by`
2. Verify placeholder exists and `claimed_by IS NULL`
3. Look up character by id, verify exists
4. Verify caller is character owner (`characters.user_id = auth.uid()`) **OR** schedule creator (`instance_schedules.created_by = auth.uid()`)
5. Verify character not already in `schedule_participants` for this schedule
6. Validate class restriction (unchanged)
7. Claim

### New RPC: `get_eligible_for_placeholder(p_placeholder_id UUID)`

Returns characters eligible to fill a specific placeholder slot. Used by the "Atribuir" dropdown.

```sql
-- Returns array of eligible characters:
[{ "character_id", "character_name", "character_class", "character_level", "user_id", "username", "avatar_url" }, ...]
```

**Logic:**
1. Look up placeholder by id, join to `instance_schedules` to get `schedule_id` and `created_by`
2. Verify caller is the schedule creator (`created_by = auth.uid()`)
3. Get all characters from:
   - The organizer's own characters
   - Characters of accepted friends (via `friendships` table)
4. Filter OUT characters already in `schedule_participants` for this schedule
5. Filter OUT characters already claimed in another placeholder for this schedule
6. Apply class restriction based on `slot_type`:
   - `class` → `characters.class = placeholder.slot_class`
   - `artista` → `characters.class IN ('Trovador', 'Musa')`
   - `dps_fisico` / `dps_magico` → no filter
7. Join with `profiles` for `username` and `avatar_url`
8. Return result set

**SECURITY DEFINER**, **STABLE**.

---

## Participant count fix

Current count logic in `use-schedules.ts:109`:
```typescript
participantCount: (countMap.get(s.id) ?? 0) + (placeholderCountMap.get(s.id) ?? 0) + 1
```

`placeholderCountMap` only counts **unclaimed** placeholders (query filters `.is("claimed_by", null)`). When a placeholder gets claimed, it drops from the count — but the slot is still occupied, so the count decreases erroneously.

**Fix:** count **all** placeholders (claimed + unclaimed):
```typescript
// Change the placeholders query from:
supabase.from("schedule_placeholders").select("schedule_id").in("schedule_id", ids).is("claimed_by", null)
// To:
supabase.from("schedule_placeholders").select("schedule_id").in("schedule_id", ids)
```

This way `participantCount = real_participants + all_placeholders + 1` always reflects the total slots.

---

## Frontend

### Enriched placeholder data for filled state

The `getPlaceholders` query in `use-schedules.ts` currently does `select("*")`. For filled placeholders we need character + user info. Change to a joined query:

```typescript
const { data } = await supabase
  .from("schedule_placeholders")
  .select("*, characters(name, class, level), profiles!claimed_by(username, avatar_url)")
  .eq("schedule_id", scheduleId)
  .order("created_at", { ascending: true });
```

Update the `SchedulePlaceholder` type in `types.ts` to include optional enriched fields:

```typescript
export interface SchedulePlaceholder {
  id: string;
  schedule_id: string;
  slot_type: 'class' | 'dps_fisico' | 'dps_magico' | 'artista';
  slot_label: string;
  slot_class: string | null;
  added_by: string;
  claimed_by: string | null;
  claimed_character_id: string | null;
  created_at: string;
  // Enriched fields (from joins, present when claimed)
  characters?: { name: string; class: string; level: number } | null;
  profiles?: { username: string; avatar_url: string | null } | null;
}
```

The modal renders filled state when `p.claimed_by && p.characters` is truthy.

### Participant list — organizer removal

Current code (`schedule-modal.tsx:558`):
```typescript
const canRemove = !isParticipantCreator && (isCreator || p.user_id === currentUserId);
```

Change to:
```typescript
const creatorCharCount = sortedParticipants.filter(p => p.user_id === schedule.created_by).length;
const canRemove = isCreator
  ? (p.user_id !== schedule.created_by || creatorCharCount > 1)  // creator can remove own if >1
  : p.user_id === currentUserId;  // non-creator can only remove self
```

This allows the organizer to remove:
- Any participant (friend or own), except own last character.

### Placeholder — open state (unchanged visual)

```
[SlotTypeIcon] Vaga aberta        [DPS Físico]  [Atribuir] [Remover]
               Qualquer classe
```

New **"Atribuir"** button next to "Remover" on open placeholders.

### Placeholder — filled state (new visual)

When `claimed_by IS NOT NULL`:

```
[Avatar]  Super Potato              [DPS Físico]  [Liberar] [Remover]
          Shura Lv.200 — @potato
```

- Avatar replaces SlotTypeIcon
- Character name, class, level, and username shown
- Slot type badge remains (to show what kind of slot it was)
- **"Liberar"** — unassigns the character, placeholder returns to open state
- **"Remover"** — deletes the placeholder entirely (even with someone assigned), no need to liberar first

### "Atribuir" flow

1. Organizer clicks "Atribuir" on an open placeholder
2. Calls `get_eligible_for_placeholder(placeholder_id)` RPC
3. Inline dropdown appears below the placeholder row, showing eligible characters:
   - Already filtered by class restriction and not-in-schedule by the RPC
   - Each row: `[Avatar] CharName — ClassName Lv.X — @username`
   - Empty state: "Nenhum personagem elegível"
4. Organizer clicks a character → calls `claim_placeholder(placeholder_id, character_id)`
5. Dropdown closes, placeholder updates to filled state

### "Liberar" flow

1. Organizer clicks "Liberar" on a filled placeholder
2. Calls `unclaim_placeholder(placeholder_id)`
3. Placeholder returns to open state

---

## Files to modify

### Database
- New migration: `supabase/migrations/014_placeholder_management.sql`
  - Create `unclaim_placeholder` RPC
  - Create `get_eligible_for_placeholder` RPC
  - Update `claim_placeholder` RPC (allow creator to assign friends' characters + check not already participant)

### Frontend
- `src/lib/types.ts` — add optional `characters` and `profiles` fields to `SchedulePlaceholder`
- `src/components/schedules/schedule-modal.tsx` — update `canRemove` logic, add filled placeholder rendering, add "Atribuir"/"Liberar"/"Remover" buttons with inline character picker
- `src/hooks/use-schedules.ts` — enrich `getPlaceholders` query with joins, add `claimPlaceholder`, `unclaimPlaceholder`, and `getEligibleForPlaceholder` methods, fix placeholder count query (remove `.is("claimed_by", null)` filter)

---

## Out of scope

- Non-creator users claiming placeholders themselves (future: self-service join via placeholder)
- Drag-and-drop assignment
- Notification to friend when their character is assigned to a slot
