# Placeholder Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the schedule organizer to assign/release characters to placeholder slots, manage own character removal, and display filled placeholder state.

**Architecture:** New SQL migration adds `unclaim_placeholder` and `get_eligible_for_placeholder` RPCs, updates `claim_placeholder` to allow creator assignment. Frontend enriches placeholder queries with joins, adds inline character picker for "Atribuir", filled placeholder rendering, and "Liberar" flow.

**Tech Stack:** Supabase (PostgreSQL RPCs), Next.js, React, TypeScript, Tailwind CSS

---

## Design Decisions

- **`claimed_by` stores the character owner's `user_id`**, not the caller's `auth.uid()`. When the creator assigns a friend's character, `claimed_by = v_char.user_id` (the friend), not the creator. This matches the semantic meaning: "who owns this slot".
- **Claimed placeholder characters appear in the completion checklist.** When the organizer completes a schedule, characters assigned to placeholders should be included in the attendance check alongside regular participants.
- **No cooldown filtering in `get_eligible_for_placeholder`.** The RPC returns any class-eligible, not-already-in-schedule character. Cooldown/conflict filtering is intentionally omitted — the organizer has full autonomy when assigning slots. This can be added later if needed.

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260326000000_placeholder_management.sql` | Create | New RPCs: `unclaim_placeholder`, `get_eligible_for_placeholder`, updated `claim_placeholder` |
| `src/lib/types.ts` | Modify | Add enriched fields to `SchedulePlaceholder` |
| `src/hooks/use-schedules.ts` | Modify | Enrich placeholder query, add `claimPlaceholder`/`unclaimPlaceholder`/`getEligibleForPlaceholder`, fix count |
| `src/components/schedules/schedule-modal.tsx` | Modify | Filled placeholder rendering, Atribuir/Liberar buttons, canRemove logic, completion checklist includes claimed placeholders |
| `src/app/dashboard/page.tsx` | Modify | Wire new hook methods as props to `<ScheduleModal>`, destructure from `useSchedules` |

---

### Task 1: Database migration — new and updated RPCs

**Files:**
- Create: `supabase/migrations/20260326000000_placeholder_management.sql`

- [ ] **Step 1: Create the migration file with `unclaim_placeholder` RPC**

```sql
-- ============================================================
-- Placeholder Management RPCs
-- ============================================================

-- RPC: unclaim_placeholder
-- Only the schedule creator can unclaim a filled placeholder
CREATE OR REPLACE FUNCTION unclaim_placeholder(p_placeholder_id UUID)
RETURNS JSON AS $$
DECLARE
  v_placeholder RECORD;
  v_schedule RECORD;
BEGIN
  SELECT sp.*, isch.created_by AS schedule_creator
  INTO v_placeholder
  FROM schedule_placeholders sp
  JOIN instance_schedules isch ON isch.id = sp.schedule_id
  WHERE sp.id = p_placeholder_id;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF v_placeholder.claimed_by IS NULL THEN
    RETURN json_build_object('status', 'not_claimed');
  END IF;

  IF v_placeholder.schedule_creator != auth.uid() THEN
    RETURN json_build_object('status', 'not_creator');
  END IF;

  UPDATE schedule_placeholders
  SET claimed_by = NULL, claimed_character_id = NULL
  WHERE id = p_placeholder_id;

  RETURN json_build_object('status', 'released');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Add `get_eligible_for_placeholder` RPC to the same file**

```sql
-- RPC: get_eligible_for_placeholder
-- Returns characters eligible to fill a specific placeholder slot
CREATE OR REPLACE FUNCTION get_eligible_for_placeholder(p_placeholder_id UUID)
RETURNS JSON AS $$
DECLARE
  v_placeholder RECORD;
  v_schedule_id UUID;
  v_creator_id UUID;
  v_result JSON;
BEGIN
  -- Look up placeholder + schedule
  SELECT sp.*, isch.id AS sched_id, isch.created_by AS schedule_creator
  INTO v_placeholder
  FROM schedule_placeholders sp
  JOIN instance_schedules isch ON isch.id = sp.schedule_id
  WHERE sp.id = p_placeholder_id;

  IF NOT FOUND THEN
    RETURN '[]'::JSON;
  END IF;

  v_schedule_id := v_placeholder.sched_id;
  v_creator_id := v_placeholder.schedule_creator;

  -- Only the schedule creator can query eligible characters
  IF v_creator_id != auth.uid() THEN
    RETURN '[]'::JSON;
  END IF;

  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      c.id AS character_id,
      c.name AS character_name,
      c.class AS character_class,
      c.level AS character_level,
      c.user_id,
      p.username,
      p.avatar_url
    FROM characters c
    JOIN profiles p ON p.id = c.user_id
    WHERE c.is_active = true
      -- Only creator's own chars + accepted friends' chars
      AND (
        c.user_id = v_creator_id
        OR c.user_id IN (
          SELECT CASE
            WHEN requester_id = v_creator_id THEN addressee_id
            ELSE requester_id
          END
          FROM friendships
          WHERE status = 'accepted'
            AND (requester_id = v_creator_id OR addressee_id = v_creator_id)
        )
      )
      -- Not already a participant in this schedule
      AND c.id NOT IN (
        SELECT character_id FROM schedule_participants WHERE schedule_id = v_schedule_id
      )
      -- Not the schedule's own creator character
      AND c.id NOT IN (
        SELECT character_id FROM instance_schedules WHERE id = v_schedule_id
      )
      -- Not already claimed in another placeholder for this schedule
      AND c.id NOT IN (
        SELECT claimed_character_id FROM schedule_placeholders
        WHERE schedule_id = v_schedule_id AND claimed_character_id IS NOT NULL
      )
      -- Class restriction
      AND (
        CASE
          WHEN v_placeholder.slot_type = 'class' THEN c.class = v_placeholder.slot_class
          WHEN v_placeholder.slot_type = 'artista' THEN c.class IN ('Trovador', 'Musa')
          ELSE true -- dps_fisico, dps_magico: no restriction
        END
      )
    ORDER BY
      CASE WHEN c.user_id = v_creator_id THEN 0 ELSE 1 END,
      c.name
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

- [ ] **Step 3: Add updated `claim_placeholder` RPC (replace existing)**

The updated version allows the schedule creator to assign friends' characters, and checks for duplicate participants.

```sql
-- RPC: claim_placeholder (updated)
-- Now allows schedule creator to assign any eligible character (own or friend's)
-- Also checks character is not already a participant
CREATE OR REPLACE FUNCTION claim_placeholder(p_placeholder_id UUID, p_character_id UUID)
RETURNS JSON AS $$
DECLARE
  v_placeholder RECORD;
  v_char RECORD;
  v_schedule_creator UUID;
  v_schedule_id UUID;
BEGIN
  -- Lock and fetch placeholder + schedule info
  SELECT sp.*, isch.created_by AS schedule_creator, isch.id AS sched_id
  INTO v_placeholder
  FROM schedule_placeholders sp
  JOIN instance_schedules isch ON isch.id = sp.schedule_id
  WHERE sp.id = p_placeholder_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF v_placeholder.claimed_by IS NOT NULL THEN
    RETURN json_build_object('status', 'already_claimed');
  END IF;

  v_schedule_creator := v_placeholder.schedule_creator;
  v_schedule_id := v_placeholder.sched_id;

  -- Validate character exists
  SELECT * INTO v_char FROM characters WHERE id = p_character_id;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_owner');
  END IF;

  -- Validate caller is character owner OR schedule creator
  IF v_char.user_id != auth.uid() AND v_schedule_creator != auth.uid() THEN
    RETURN json_build_object('status', 'not_owner');
  END IF;

  -- Check character is not already a participant in this schedule
  IF EXISTS (
    SELECT 1 FROM schedule_participants
    WHERE schedule_id = v_schedule_id AND character_id = p_character_id
  ) THEN
    RETURN json_build_object('status', 'already_participant');
  END IF;

  -- Check character is not the schedule's creator character
  IF EXISTS (
    SELECT 1 FROM instance_schedules
    WHERE id = v_schedule_id AND character_id = p_character_id
  ) THEN
    RETURN json_build_object('status', 'already_participant');
  END IF;

  -- Check character is not already claimed in another placeholder for this schedule
  IF EXISTS (
    SELECT 1 FROM schedule_placeholders
    WHERE schedule_id = v_schedule_id AND claimed_character_id = p_character_id
  ) THEN
    RETURN json_build_object('status', 'already_participant');
  END IF;

  -- Validate class restriction
  IF v_placeholder.slot_type = 'class' AND v_char.class != v_placeholder.slot_class THEN
    RETURN json_build_object('status', 'class_mismatch');
  END IF;

  IF v_placeholder.slot_type = 'artista' AND v_char.class NOT IN ('Trovador', 'Musa') THEN
    RETURN json_build_object('status', 'class_mismatch');
  END IF;

  -- Claim
  UPDATE schedule_placeholders
  SET claimed_by = v_char.user_id, claimed_character_id = p_character_id
  WHERE id = v_placeholder.id;

  RETURN json_build_object('status', 'claimed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260326000000_placeholder_management.sql
git commit -m "feat: add placeholder management RPCs (unclaim, get_eligible, updated claim)"
```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts:85-95`

- [ ] **Step 1: Add enriched fields to `SchedulePlaceholder`**

Add optional `characters` and `profiles` fields for joined data when placeholder is claimed:

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

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add enriched fields to SchedulePlaceholder type"
```

---

### Task 3: Update `use-schedules.ts` — enrich queries and add new methods

**Files:**
- Modify: `src/hooks/use-schedules.ts`

- [ ] **Step 1: Fix placeholder count query (remove `.is("claimed_by", null)` filter)**

In `fetchAll` (line 80), change the placeholders query from:
```typescript
supabase.from("schedule_placeholders").select("schedule_id").in("schedule_id", data.map((s) => s.id)).is("claimed_by", null),
```
to:
```typescript
supabase.from("schedule_placeholders").select("schedule_id").in("schedule_id", data.map((s) => s.id)),
```

This ensures `participantCount` reflects all slots (claimed + unclaimed).

- [ ] **Step 2: Enrich `getPlaceholders` query with joins**

Change `getPlaceholders` (line 358-366) from `select("*")` to a joined query:

```typescript
const getPlaceholders = useCallback(async (scheduleId: string): Promise<SchedulePlaceholder[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_placeholders")
    .select("*, characters!claimed_character_id(name, class, level), profiles!claimed_by(username, avatar_url)")
    .eq("schedule_id", scheduleId)
    .order("created_at", { ascending: true });
  return (data ?? []) as SchedulePlaceholder[];
}, []);
```

- [ ] **Step 3: Add `claimPlaceholder` method**

```typescript
const claimPlaceholder = useCallback(async (placeholderId: string, characterId: string) => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("claim_placeholder", {
    p_placeholder_id: placeholderId,
    p_character_id: characterId,
  });
  if (error) throw error;
  const result = data as { status: string };
  if (result.status !== "claimed") throw new Error(result.status);
}, []);
```

- [ ] **Step 4: Add `unclaimPlaceholder` method**

```typescript
const unclaimPlaceholder = useCallback(async (placeholderId: string) => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("unclaim_placeholder", {
    p_placeholder_id: placeholderId,
  });
  if (error) throw error;
  const result = data as { status: string };
  if (result.status !== "released") throw new Error(result.status);
}, []);
```

- [ ] **Step 5: Add `getEligibleForPlaceholder` method**

Define the return type alongside `EligibleFriend`:

```typescript
export interface EligibleCharacter {
  character_id: string;
  character_name: string;
  character_class: string;
  character_level: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
}
```

And the method:

```typescript
const getEligibleForPlaceholder = useCallback(async (placeholderId: string): Promise<EligibleCharacter[]> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_eligible_for_placeholder", {
    p_placeholder_id: placeholderId,
  });
  if (error) throw error;
  return (data ?? []) as EligibleCharacter[];
}, []);
```

- [ ] **Step 6: Update the `UseSchedulesReturn` interface and return object**

Add to the interface:
```typescript
claimPlaceholder: (placeholderId: string, characterId: string) => Promise<void>;
unclaimPlaceholder: (placeholderId: string) => Promise<void>;
getEligibleForPlaceholder: (placeholderId: string) => Promise<EligibleCharacter[]>;
```

Add to the return object:
```typescript
claimPlaceholder,
unclaimPlaceholder,
getEligibleForPlaceholder,
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-schedules.ts
git commit -m "feat: enrich placeholder queries, add claim/unclaim/eligible methods"
```

---

### Task 4: Update `schedule-modal.tsx` — props, canRemove logic, and filled placeholder rendering

**Files:**
- Modify: `src/components/schedules/schedule-modal.tsx`

- [ ] **Step 1: Update imports and props**

Add `EligibleCharacter` import:
```typescript
import type { EligibleFriend, EligibleCharacter } from "@/hooks/use-schedules";
```

Add new props to `ScheduleModalProps`:
```typescript
onClaimPlaceholder: (placeholderId: string, characterId: string) => Promise<void>;
onUnclaimPlaceholder: (placeholderId: string) => Promise<void>;
onGetEligibleForPlaceholder: (placeholderId: string) => Promise<EligibleCharacter[]>;
```

Destructure them in the component.

- [ ] **Step 2: Add state for the "Atribuir" inline picker**

```typescript
const [assigningPlaceholderId, setAssigningPlaceholderId] = useState<string | null>(null);
const [eligibleForSlot, setEligibleForSlot] = useState<EligibleCharacter[]>([]);
const [eligibleLoading, setEligibleLoading] = useState(false);
```

Reset `assigningPlaceholderId` in the scheduleId reset effect (add `setAssigningPlaceholderId(null)` to the effect at line 86).

Also update `isDirty` (line 176) to include the assignment picker state:

```typescript
const isDirty = mode !== "view" || showPlaceholderForm || confirmingCancel || editingTime || editingTitle || assigningPlaceholderId !== null;
```

- [ ] **Step 3: Update `canRemove` logic for organizer's own characters**

Compute `creatorCharCount` once **before** the `.map()` call (around line 555, after the `loading` ternary):

```typescript
const creatorCharCount = sortedParticipants.filter(p => p.user_id === schedule.created_by).length;
```

Then replace the existing canRemove logic inside the map (line 558):
```typescript
const canRemove = !isParticipantCreator && (isCreator || p.user_id === currentUserId);
```

With:
```typescript
const canRemove = isCreator
  ? (p.user_id !== schedule.created_by || creatorCharCount > 1)
  : p.user_id === currentUserId;
```

This allows the organizer to remove any participant, and to remove own characters when count > 1.

- [ ] **Step 4: Add handler functions for Atribuir and Liberar**

```typescript
const handleAssignClick = async (placeholderId: string) => {
  setAssigningPlaceholderId(placeholderId);
  setEligibleLoading(true);
  try {
    const eligible = await onGetEligibleForPlaceholder(placeholderId);
    setEligibleForSlot(eligible);
  } finally {
    setEligibleLoading(false);
  }
};

const handleClaimPlaceholder = async (placeholderId: string, characterId: string) => {
  setActionLoading(true);
  try {
    await onClaimPlaceholder(placeholderId, characterId);
    setAssigningPlaceholderId(null);
    const updated = await onGetPlaceholders(schedule.id);
    setPlaceholders(updated);
  } finally {
    setActionLoading(false);
  }
};

const handleUnclaimPlaceholder = async (placeholderId: string) => {
  setActionLoading(true);
  try {
    await onUnclaimPlaceholder(placeholderId);
    const updated = await onGetPlaceholders(schedule.id);
    setPlaceholders(updated);
  } finally {
    setActionLoading(false);
  }
};
```

- [ ] **Step 5: Render ALL placeholders (open + filled) replacing the current filter**

Replace the current placeholder rendering block (lines 610-639) which only renders unclaimed placeholders. The new block renders all placeholders with two states:

**Filled placeholder** (`p.claimed_by && p.characters`):
```tsx
<div key={p.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border">
  {p.profiles?.avatar_url ? (
    <img src={p.profiles.avatar_url} alt="" className="w-7 h-7 rounded-full" />
  ) : (
    <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-xs text-text-secondary">?</div>
  )}
  <div className="flex flex-col flex-1 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-sm text-text-primary font-medium truncate">{p.characters!.name}</span>
      <span className="text-xs text-text-secondary">{p.characters!.class} Lv.{p.characters!.level}</span>
    </div>
    <span className="text-xs text-text-secondary">@{p.profiles?.username ?? "???"}</span>
  </div>
  <span
    className="text-[11px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)]"
    style={{
      background: `color-mix(in srgb, ${SLOT_TYPE_COLORS[p.slot_type]} 15%, transparent)`,
      color: SLOT_TYPE_COLORS[p.slot_type],
    }}
  >
    {p.slot_label}
  </span>
  {isCreator && schedule.status === "open" && (
    <>
      <button
        onClick={() => handleUnclaimPlaceholder(p.id)}
        disabled={busy}
        className="text-xs text-primary-secondary hover:text-text-primary cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
      >
        Liberar
      </button>
      <button
        onClick={() => handleRemovePlaceholder(p.id)}
        disabled={busy}
        className="text-xs text-status-error hover:text-status-error-text cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
      >
        Remover
      </button>
    </>
  )}
</div>
```

**Open placeholder** (same as current, but with "Atribuir" button added):
```tsx
<div key={p.id} className="flex flex-col">
  <div className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border">
    <SlotTypeIcon type={p.slot_type} size={28} />
    <div className="flex flex-col flex-1 min-w-0">
      <span className="text-sm text-text-secondary italic">Vaga aberta</span>
      <span className="text-[10px] text-text-secondary">{SLOT_TYPE_DESCRIPTIONS[p.slot_type]}</span>
    </div>
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)]"
      style={{
        background: `color-mix(in srgb, ${SLOT_TYPE_COLORS[p.slot_type]} 15%, transparent)`,
        color: SLOT_TYPE_COLORS[p.slot_type],
      }}
    >
      {p.slot_label}
    </span>
    {isCreator && schedule.status === "open" && (
      <>
        <button
          onClick={() => handleAssignClick(p.id)}
          disabled={busy}
          className="text-xs text-primary hover:text-text-primary cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
        >
          Atribuir
        </button>
        <button
          onClick={() => handleRemovePlaceholder(p.id)}
          disabled={busy}
          className="text-xs text-status-error hover:text-status-error-text cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
        >
          Remover
        </button>
      </>
    )}
  </div>
  {/* Inline picker when assigning */}
  {assigningPlaceholderId === p.id && (
    <div className="flex flex-col gap-1 mt-1 p-2 rounded-lg bg-bg border border-border max-h-40 overflow-y-auto">
      {eligibleLoading ? (
        <div className="flex items-center justify-center py-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : eligibleForSlot.length === 0 ? (
        <p className="text-xs text-text-secondary italic px-2 py-1">Nenhum personagem elegível</p>
      ) : (
        eligibleForSlot.map((c) => (
          <button
            key={c.character_id}
            type="button"
            onClick={() => handleClaimPlaceholder(p.id, c.character_id)}
            disabled={busy}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface transition-colors cursor-pointer disabled:opacity-50"
          >
            {c.avatar_url ? (
              <img src={c.avatar_url} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-border flex items-center justify-center text-[10px] text-text-secondary flex-shrink-0">?</span>
            )}
            <span className="text-text-primary truncate">{c.character_name}</span>
            <span className="text-text-secondary">{c.character_class} Lv.{c.character_level}</span>
            <span className="text-text-secondary">@{c.username}</span>
          </button>
        ))
      )}
      <button
        type="button"
        onClick={() => setAssigningPlaceholderId(null)}
        className="text-xs text-text-secondary hover:text-text-primary cursor-pointer mt-1 text-center"
      >
        Cancelar
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 6: Include claimed placeholder characters in the completion checklist**

The completing mode (lines 491-541) only iterates `sortedParticipants`. Characters assigned to placeholders are not included, so they won't get a completion record.

Add claimed placeholders to the checklist. In `handleCompleteClick`, initialize checks for claimed placeholders too:

```typescript
const handleCompleteClick = () => {
  const initial: Record<string, boolean> = {};
  for (const p of participants) {
    initial[p.character_id] = true;
  }
  // Include claimed placeholder characters
  for (const p of placeholders) {
    if (p.claimed_character_id) {
      initial[p.claimed_character_id] = true;
    }
  }
  setCheckedParticipants(initial);
  setMode("completing");
};
```

In the completing mode JSX, render claimed placeholders after the participant list:

```tsx
{/* Claimed placeholder characters */}
{placeholders.filter(p => p.claimed_by && p.characters).map((p) => (
  <label
    key={p.claimed_character_id}
    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border cursor-pointer hover:border-primary transition-colors"
  >
    <input
      type="checkbox"
      checked={checkedParticipants[p.claimed_character_id!] ?? false}
      onChange={() => toggleParticipant(p.claimed_character_id!)}
      className="accent-primary w-4 h-4"
    />
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {p.profiles?.avatar_url && (
        <img src={p.profiles.avatar_url} alt="" className="w-6 h-6 rounded-full" />
      )}
      <span className="text-sm text-text-primary font-medium truncate">
        {p.characters!.name}
      </span>
      <span className="text-xs text-text-secondary">
        {p.characters!.class} Lv.{p.characters!.level}
      </span>
      <span className="text-xs text-text-secondary">
        @{p.profiles?.username ?? "???"}
      </span>
      <span className="text-[10px] text-primary-secondary font-medium">(vaga)</span>
    </div>
  </label>
))}
```

Also update `handleConfirmComplete` to include checked placeholder characters in the confirmed list:

```typescript
const handleConfirmComplete = async () => {
  const confirmed = participants
    .filter((p) => checkedParticipants[p.character_id])
    .map((p) => ({ userId: p.user_id, characterId: p.character_id }));

  // Include claimed placeholder characters that are checked
  for (const p of placeholders) {
    if (p.claimed_character_id && p.claimed_by && checkedParticipants[p.claimed_character_id]) {
      confirmed.push({ userId: p.claimed_by, characterId: p.claimed_character_id });
    }
  }

  setActionLoading(true);
  try {
    await onComplete(confirmed);
    setMode("view");
  } finally {
    setActionLoading(false);
  }
};
```

- [ ] **Step 7: Update participant count display**

The participant count label (line 547) currently only counts unclaimed placeholders:
```typescript
Participantes {!loading && `(${participants.length + placeholders.filter((p) => !p.claimed_by).length})`}
```

Change to count all placeholders:
```typescript
Participantes {!loading && `(${participants.length + placeholders.length})`}
```

- [ ] **Step 8: Commit**

```bash
git add src/components/schedules/schedule-modal.tsx
git commit -m "feat: placeholder assign/release UI with filled state rendering and completion"
```

---

### Task 5: Wire up new props in `dashboard/page.tsx`

**Files:**
- Modify: `src/app/dashboard/page.tsx:745-803`

- [ ] **Step 1: Destructure new methods from `useSchedules` hook**

Find the existing destructure of `useSchedules()` in `dashboard/page.tsx` and add the new methods:

```typescript
const {
  schedules,
  loading: schedulesLoading,
  // ... existing methods ...
  claimPlaceholder,
  unclaimPlaceholder,
  getEligibleForPlaceholder,
} = useSchedules();
```

- [ ] **Step 2: Pass new props to `<ScheduleModal>`**

Add these three props to the `<ScheduleModal>` JSX (after `onGetPlaceholders={getPlaceholders}` at line 801):

```tsx
onClaimPlaceholder={claimPlaceholder}
onUnclaimPlaceholder={unclaimPlaceholder}
onGetEligibleForPlaceholder={getEligibleForPlaceholder}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: wire placeholder management props to schedule modal"
```

---

### Task 6: Verify build and test

- [ ] **Step 1: Run build to verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Manual verification checklist**

- Open placeholder shows "Atribuir" + "Remover" buttons
- Clicking "Atribuir" shows inline dropdown with eligible characters
- Selecting a character claims the placeholder and shows filled state
- Filled placeholder shows avatar, character name, class, level, username
- "Liberar" button on filled placeholder returns it to open state
- "Remover" button deletes placeholder even when filled
- Creator can remove own characters when they have 2+ in the schedule
- Creator cannot remove their last character from the schedule
- Participant count stays correct through claim/unclaim cycles
- Claimed placeholder characters appear in the completion checklist
- Completing with claimed placeholders checked creates completion records for those characters
- Closing modal while "Atribuir" picker is open shows dirty warning
- Class restrictions are enforced: wrong class characters don't appear in eligible list
