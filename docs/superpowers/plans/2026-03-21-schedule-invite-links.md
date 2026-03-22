# Schedule Invite Links & External Placeholders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow schedule creators to share invite links and add placeholder characters for players not yet in the system, with automatic friendship creation on invite acceptance.

**Architecture:** New Supabase migration adds `schedule_invites` and `schedule_placeholders` tables with RLS + two SECURITY DEFINER RPCs (`accept_invite`, `resolve_invite`). Frontend adds `/invite/[code]` page, `useInvite` hook, and extends `useSchedules` + `ScheduleModal` for invite/placeholder management.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL + RLS + RPCs), React 19, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-21-schedule-invite-links-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/012_schedule_invites.sql` | Tables, RLS, RPCs, realtime |
| Create | `src/hooks/use-invite.ts` | `useInvite(code)` hook for invite page |
| Create | `src/app/invite/[code]/page.tsx` | Invite landing page |
| Modify | `src/lib/types.ts` | Add `ScheduleInvite`, `SchedulePlaceholder` types |
| Modify | `src/hooks/use-schedules.ts` | Add invite code + placeholder methods, update participant count |
| Modify | `src/components/schedules/schedule-modal.tsx` | Add invite link section + placeholder UI |
| Modify | `src/lib/supabase/middleware.ts` | Allow `/invite/*` for authenticated users, redirect unauthenticated to login |
| Modify | `src/app/auth/callback/route.ts` | Support `?redirect=` param after login |
| Modify | `src/components/auth/login-button.tsx` | Pass `redirectTo` from URL search params |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/012_schedule_invites.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Schedule invite links
CREATE TABLE schedule_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  code VARCHAR(8) NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schedule_id),
  UNIQUE(code)
);

ALTER TABLE schedule_invites ENABLE ROW LEVEL SECURITY;

-- RLS: only creator can see/manage their invite
CREATE POLICY "Creator can view own invites"
  ON schedule_invites FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can create invites"
  ON schedule_invites FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can delete invites"
  ON schedule_invites FOR DELETE
  USING (auth.uid() = created_by);

-- Schedule placeholders (external characters)
CREATE TABLE schedule_placeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  character_class TEXT NOT NULL,
  added_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  claimed_by UUID REFERENCES profiles(id),
  claimed_character_id UUID REFERENCES characters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE schedule_placeholders ENABLE ROW LEVEL SECURITY;

-- RLS: visible to schedule creator and friends of creator
CREATE POLICY "Users can view placeholders"
  ON schedule_placeholders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM instance_schedules
    WHERE instance_schedules.id = schedule_placeholders.schedule_id
    AND (instance_schedules.created_by = auth.uid() OR is_friend_of(instance_schedules.created_by))
  ));

CREATE POLICY "Creator can add placeholders"
  ON schedule_placeholders FOR INSERT
  WITH CHECK (auth.uid() = added_by);

CREATE POLICY "Creator can remove placeholders"
  ON schedule_placeholders FOR DELETE
  USING (auth.uid() = added_by);

-- No direct UPDATE policy — claiming happens via RPC only

-- Enable realtime for placeholders
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_placeholders;

-- RPC: resolve_invite (read-only, for invite page)
CREATE OR REPLACE FUNCTION resolve_invite(invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_schedule RECORD;
  v_instance RECORD;
  v_creator RECORD;
  v_participants JSON;
  v_placeholders JSON;
  v_user_in_schedule BOOLEAN;
BEGIN
  -- Resolve invite
  SELECT * INTO v_invite FROM schedule_invites WHERE code = invite_code;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invite_not_found');
  END IF;

  -- Load schedule
  SELECT * INTO v_schedule FROM instance_schedules WHERE id = v_invite.schedule_id;

  -- Load instance
  SELECT id, name, start_map, liga_tier, level_required INTO v_instance
  FROM instances WHERE id = v_schedule.instance_id;

  -- Load creator profile
  SELECT id, username, avatar_url INTO v_creator
  FROM profiles WHERE id = v_invite.created_by;

  -- Load participants (enriched)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_participants
  FROM (
    SELECT sp.character_id, sp.user_id, sp.message, sp.created_at,
           p.username, p.avatar_url,
           c.name AS character_name, c.class AS character_class, c.level AS character_level
    FROM schedule_participants sp
    JOIN profiles p ON p.id = sp.user_id
    JOIN characters c ON c.id = sp.character_id
    WHERE sp.schedule_id = v_invite.schedule_id
  ) t;

  -- Load unclaimed placeholders
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_placeholders
  FROM (
    SELECT id, character_name, character_class, claimed_by, claimed_character_id
    FROM schedule_placeholders
    WHERE schedule_id = v_invite.schedule_id AND claimed_by IS NULL
  ) t;

  -- Check if current user already in schedule
  SELECT EXISTS (
    SELECT 1 FROM schedule_participants
    WHERE schedule_id = v_invite.schedule_id AND user_id = auth.uid()
  ) OR v_schedule.created_by = auth.uid()
  INTO v_user_in_schedule;

  RETURN json_build_object(
    'schedule', json_build_object(
      'id', v_schedule.id,
      'instance_id', v_schedule.instance_id,
      'character_id', v_schedule.character_id,
      'created_by', v_schedule.created_by,
      'scheduled_at', v_schedule.scheduled_at,
      'status', v_schedule.status,
      'message', v_schedule.message
    ),
    'instance', json_build_object(
      'id', v_instance.id,
      'name', v_instance.name,
      'start_map', v_instance.start_map,
      'liga_tier', v_instance.liga_tier,
      'level_required', v_instance.level_required
    ),
    'creator', json_build_object(
      'id', v_creator.id,
      'username', v_creator.username,
      'avatar_url', v_creator.avatar_url
    ),
    'participants', v_participants,
    'placeholders', v_placeholders,
    'user_already_joined', v_user_in_schedule
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RPC: accept_invite (join schedule + claim placeholder + create friendship)
-- p_character_id can be NULL for non-open schedules (friendship-only)
CREATE OR REPLACE FUNCTION accept_invite(invite_code TEXT, p_character_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_schedule RECORD;
  v_char RECORD;
  v_participant_count INT;
  v_placeholder_count INT;
  v_total INT;
BEGIN
  -- 1. Resolve invite
  SELECT * INTO v_invite FROM schedule_invites WHERE code = invite_code;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'error', 'message', 'invite_not_found');
  END IF;

  -- Load schedule
  SELECT * INTO v_schedule FROM instance_schedules WHERE id = v_invite.schedule_id;

  -- 3. Check schedule status (before character validation — friendship-only doesn't need a char)
  IF v_schedule.status != 'open' THEN
    -- Create friendship only
    INSERT INTO friendships (requester_id, addressee_id, status)
    SELECT auth.uid(), v_invite.created_by, 'accepted'
    WHERE auth.uid() != v_invite.created_by
    AND NOT EXISTS (
      SELECT 1 FROM friendships
      WHERE (requester_id = auth.uid() AND addressee_id = v_invite.created_by)
         OR (requester_id = v_invite.created_by AND addressee_id = auth.uid())
    );
    RETURN json_build_object('status', 'friendship_only');
  END IF;

  -- 2. Validate character ownership (required for open schedules)
  IF p_character_id IS NULL THEN
    RETURN json_build_object('status', 'error', 'message', 'character_required');
  END IF;

  SELECT * INTO v_char FROM characters WHERE id = p_character_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'error', 'message', 'character_not_owned');
  END IF;

  -- 4. Count total slots
  SELECT COUNT(*) INTO v_participant_count
  FROM schedule_participants WHERE schedule_id = v_invite.schedule_id;

  SELECT COUNT(*) INTO v_placeholder_count
  FROM schedule_placeholders
  WHERE schedule_id = v_invite.schedule_id AND claimed_by IS NULL;

  v_total := v_participant_count + v_placeholder_count + 1; -- +1 for creator
  IF v_total >= 12 THEN
    RETURN json_build_object('status', 'full');
  END IF;

  -- 5. Check if user already in schedule
  IF EXISTS (
    SELECT 1 FROM schedule_participants
    WHERE schedule_id = v_invite.schedule_id AND user_id = auth.uid()
  ) OR v_schedule.created_by = auth.uid() THEN
    RETURN json_build_object('status', 'already_joined');
  END IF;

  -- 6. Insert participant
  INSERT INTO schedule_participants (schedule_id, character_id, user_id)
  VALUES (v_invite.schedule_id, p_character_id, auth.uid());

  -- 7. Try claim placeholder (with locking)
  WITH target AS (
    SELECT id FROM schedule_placeholders
    WHERE schedule_id = v_invite.schedule_id
      AND lower(character_name) = lower(v_char.name)
      AND claimed_by IS NULL
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE schedule_placeholders
  SET claimed_by = auth.uid(), claimed_character_id = p_character_id
  FROM target
  WHERE schedule_placeholders.id = target.id;

  -- 8. Create friendship (bidirectional check)
  INSERT INTO friendships (requester_id, addressee_id, status)
  SELECT auth.uid(), v_invite.created_by, 'accepted'
  WHERE auth.uid() != v_invite.created_by
  AND NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE (requester_id = auth.uid() AND addressee_id = v_invite.created_by)
       OR (requester_id = v_invite.created_by AND addressee_id = auth.uid())
  );

  -- 9. Return success
  RETURN json_build_object('status', 'joined');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: generate random alphanumeric code
CREATE OR REPLACE FUNCTION generate_invite_code(len INT DEFAULT 8)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..len LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor if using hosted Supabase)

Expected: Tables `schedule_invites` and `schedule_placeholders` created, RPCs available.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_schedule_invites.sql
git commit -m "feat: add schedule_invites + schedule_placeholders tables and RPCs"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts:74` (after `ScheduleParticipant` interface)

- [ ] **Step 1: Add new types**

Add after `ScheduleParticipant` interface (line 74):

```typescript
export interface ScheduleInvite {
  id: string;
  schedule_id: string;
  code: string;
  created_by: string;
  created_at: string;
}

export interface SchedulePlaceholder {
  id: string;
  schedule_id: string;
  character_name: string;
  character_class: string;
  added_by: string;
  claimed_by: string | null;
  claimed_character_id: string | null;
  created_at: string;
}

export interface InviteData {
  schedule: {
    id: string;
    instance_id: number;
    character_id: string;
    created_by: string;
    scheduled_at: string;
    status: 'open' | 'completed' | 'expired';
    message: string | null;
  };
  instance: {
    id: number;
    name: string;
    start_map: string | null;
    liga_tier: string | null;
    level_required: number;
  };
  creator: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  participants: ScheduleParticipant[];
  placeholders: SchedulePlaceholder[];
  user_already_joined: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add ScheduleInvite, SchedulePlaceholder, InviteData types"
```

---

### Task 3: Extend `useSchedules` Hook

**Files:**
- Modify: `src/hooks/use-schedules.ts`

- [ ] **Step 1: Add new imports and interface methods**

Add to the import line (line 5):
```typescript
import type { InstanceSchedule, ScheduleParticipant, SchedulePlaceholder } from "@/lib/types";
```

Add to `UseSchedulesReturn` interface (after line 30, before `}`):
```typescript
  generateInviteCode: (scheduleId: string) => Promise<string>;
  getInviteCode: (scheduleId: string) => Promise<string | null>;
  addPlaceholder: (scheduleId: string, characterName: string, characterClass: string) => Promise<void>;
  removePlaceholder: (placeholderId: string) => Promise<void>;
  getPlaceholders: (scheduleId: string) => Promise<SchedulePlaceholder[]>;
```

- [ ] **Step 2: Update `fetchAll` to include placeholder counts**

In `fetchAll` (around line 56), add a 4th parallel query to fetch placeholder counts:

```typescript
const [instancesRes, profilesRes, participantsRes, placeholdersRes] = await Promise.all([
  supabase.from("instances").select("id, name, start_map, liga_tier").in("id", instanceIds),
  supabase.from("profiles").select("id, username, avatar_url").in("id", creatorIds),
  supabase.from("schedule_participants").select("schedule_id").in("schedule_id", data.map((s) => s.id)),
  supabase.from("schedule_placeholders").select("schedule_id").in("schedule_id", data.map((s) => s.id)).is("claimed_by", null),
]);
```

Add a placeholder count map after the participant count map (after line 69):
```typescript
const placeholderCountMap = new Map<string, number>();
for (const p of (placeholdersRes.data ?? [])) {
  placeholderCountMap.set(p.schedule_id, (placeholderCountMap.get(p.schedule_id) ?? 0) + 1);
}
```

Update `participantCount` in the enrichment (line 81):
```typescript
participantCount: (countMap.get(s.id) ?? 0) + (placeholderCountMap.get(s.id) ?? 0) + 1, // participants + placeholders + creator
```

- [ ] **Step 3: Add `generateInviteCode` method**

After `getParticipants` (after line 258):

```typescript
const generateInviteCode = useCallback(async (scheduleId: string): Promise<string> => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if invite already exists
  const { data: existing } = await supabase
    .from("schedule_invites")
    .select("code")
    .eq("schedule_id", scheduleId)
    .single();

  if (existing) return existing.code;

  // Generate code via DB function and insert (handle race with re-fetch)
  const { data: codeData } = await supabase.rpc("generate_invite_code");
  const code = codeData as string;

  await supabase
    .from("schedule_invites")
    .insert({
      schedule_id: scheduleId,
      code,
      created_by: user.id,
    });

  // Re-fetch to handle race condition (another request may have inserted first)
  const { data: final } = await supabase
    .from("schedule_invites")
    .select("code")
    .eq("schedule_id", scheduleId)
    .single();

  return final!.code;
}, []);
```

- [ ] **Step 4: Add `getInviteCode` method**

```typescript
const getInviteCode = useCallback(async (scheduleId: string): Promise<string | null> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_invites")
    .select("code")
    .eq("schedule_id", scheduleId)
    .single();
  return data?.code ?? null;
}, []);
```

- [ ] **Step 5: Add placeholder methods**

```typescript
const addPlaceholder = useCallback(async (scheduleId: string, characterName: string, characterClass: string) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("schedule_placeholders")
    .insert({
      schedule_id: scheduleId,
      character_name: characterName,
      character_class: characterClass,
      added_by: user.id,
    });

  if (error) throw error;
}, []);

const removePlaceholder = useCallback(async (placeholderId: string) => {
  const supabase = createClient();
  await supabase.from("schedule_placeholders").delete().eq("id", placeholderId);
}, []);

const getPlaceholders = useCallback(async (scheduleId: string): Promise<SchedulePlaceholder[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_placeholders")
    .select("*")
    .eq("schedule_id", scheduleId)
    .order("created_at", { ascending: true });
  return (data ?? []) as SchedulePlaceholder[];
}, []);
```

- [ ] **Step 6: Add realtime subscription for placeholders**

In the `useEffect` (line 93-97), add a third subscription:

```typescript
.on("postgres_changes", { event: "*", schema: "public", table: "schedule_placeholders" }, () => fetchAll())
```

- [ ] **Step 7: Return new methods**

Add to the return statement (line 278-290):
```typescript
generateInviteCode,
getInviteCode,
addPlaceholder,
removePlaceholder,
getPlaceholders,
```

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-schedules.ts
git commit -m "feat: add invite code + placeholder methods to useSchedules"
```

---

### Task 4: Update ScheduleModal — Invite Link + Placeholders

**Files:**
- Modify: `src/components/schedules/schedule-modal.tsx`

- [ ] **Step 1: Add invite link + placeholder props**

Add to `ScheduleModalProps` interface (after line 22):
```typescript
onGenerateInviteCode: (scheduleId: string) => Promise<string>;
onGetInviteCode: (scheduleId: string) => Promise<string | null>;
onAddPlaceholder: (scheduleId: string, name: string, className: string) => Promise<void>;
onRemovePlaceholder: (placeholderId: string) => Promise<void>;
onGetPlaceholders: (scheduleId: string) => Promise<import("@/lib/types").SchedulePlaceholder[]>;
```

- [ ] **Step 2: Add state for invite and placeholders**

After the existing state declarations (around line 66):
```typescript
const [inviteCode, setInviteCode] = useState<string | null>(null);
const [inviteCopied, setInviteCopied] = useState(false);
const [placeholders, setPlaceholders] = useState<import("@/lib/types").SchedulePlaceholder[]>([]);
const [showPlaceholderForm, setShowPlaceholderForm] = useState(false);
const [placeholderName, setPlaceholderName] = useState("");
const [placeholderClass, setPlaceholderClass] = useState("");
```

- [ ] **Step 3: Load invite code and placeholders when modal opens**

Add a `useEffect` after the state declarations:
```typescript
useEffect(() => {
  if (!isOpen || !schedule) return;
  // Load invite code
  onGetInviteCode(schedule.id).then(setInviteCode);
  // Load placeholders
  onGetPlaceholders(schedule.id).then(setPlaceholders);
}, [isOpen, schedule?.id, onGetInviteCode, onGetPlaceholders]);
```

- [ ] **Step 4: Add invite link handler**

```typescript
const handleGenerateInvite = async () => {
  if (!schedule) return;
  setActionLoading(true);
  try {
    const code = await onGenerateInviteCode(schedule.id);
    setInviteCode(code);
    const url = `${window.location.origin}/invite/${code}`;
    await navigator.clipboard.writeText(url);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  } finally {
    setActionLoading(false);
  }
};

const handleCopyInvite = async () => {
  if (!inviteCode) return;
  const url = `${window.location.origin}/invite/${inviteCode}`;
  await navigator.clipboard.writeText(url);
  setInviteCopied(true);
  setTimeout(() => setInviteCopied(false), 2000);
};
```

- [ ] **Step 5: Add placeholder handlers**

```typescript
const handleAddPlaceholder = async () => {
  if (!schedule || !placeholderName.trim() || !placeholderClass.trim()) return;
  setActionLoading(true);
  try {
    await onAddPlaceholder(schedule.id, placeholderName.trim(), placeholderClass.trim());
    const updated = await onGetPlaceholders(schedule.id);
    setPlaceholders(updated);
    setPlaceholderName("");
    setPlaceholderClass("");
    setShowPlaceholderForm(false);
  } finally {
    setActionLoading(false);
  }
};

const handleRemovePlaceholder = async (id: string) => {
  setActionLoading(true);
  try {
    await onRemovePlaceholder(id);
    setPlaceholders((prev) => prev.filter((p) => p.id !== id));
  } finally {
    setActionLoading(false);
  }
};
```

- [ ] **Step 6: Update participant count header**

In the participant list header (line 362 of schedule-modal.tsx), update to include placeholders:

```tsx
<p className="text-xs text-[#6B5A8A] font-medium">
  Participantes ({participants.length + placeholders.filter((p) => !p.claimed_by).length})
</p>
```

- [ ] **Step 7: Add invite link UI section**

Inside the `view` mode section, after the participant list (after line 428), add placeholders (visible to all) and invite tools (creator only):

```tsx
{/* Placeholders (visible to all) */}
{placeholders.filter((p) => !p.claimed_by).map((p) => (
  <div
    key={p.id}
    className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2a1f40] border border-[#3D2A5C] opacity-50"
  >
    <div className="w-7 h-7 rounded-full bg-[#3D2A5C] flex items-center justify-center text-xs text-[#6B5A8A]">
      ?
    </div>
    <div className="flex flex-col flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-white font-medium truncate">{p.character_name}</span>
        <span className="text-xs text-[#6B5A8A]">{p.character_class}</span>
      </div>
      <span className="text-[10px] text-yellow-500 font-medium">Aguardando</span>
    </div>
    {isCreator && (
      <button
        onClick={() => handleRemovePlaceholder(p.id)}
        disabled={busy}
        className="text-xs text-red-400 hover:text-red-300 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
      >
        Remover
      </button>
    )}
  </div>
))}

{/* Invite link + Add placeholder (creator only) */}
{isCreator && schedule.status === "open" && (
  <div className="flex flex-col gap-3 pt-2 border-t border-[#3D2A5C]">
    {/* Invite link */}
    <div className="flex items-center gap-2">
      {inviteCode ? (
        <>
          <input
            readOnly
            value={`${window.location.origin}/invite/${inviteCode}`}
            className="flex-1 bg-[#1a1230] border border-[#3D2A5C] rounded-lg px-3 py-2 text-xs text-[#A89BC2] truncate"
          />
          <button
            onClick={handleCopyInvite}
            className="px-3 py-2 text-xs text-[#D4A843] bg-[#2a1f40] border border-[#D4A843]/30 rounded-lg hover:border-[#D4A843] transition-colors cursor-pointer whitespace-nowrap"
          >
            {inviteCopied ? "Copiado!" : "Copiar"}
          </button>
        </>
      ) : (
        <button
          onClick={handleGenerateInvite}
          disabled={busy}
          className="px-4 py-2 text-xs text-[#D4A843] bg-[#2a1f40] border border-[#D4A843]/30 rounded-lg hover:border-[#D4A843] transition-colors cursor-pointer disabled:opacity-50"
        >
          {busy ? "Gerando..." : "Gerar link de convite"}
        </button>
      )}
    </div>

    {/* Add placeholder form */}
    {showPlaceholderForm ? (
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-[#0f0a1a] border border-[#3D2A5C]">
        <input
          type="text"
          value={placeholderName}
          onChange={(e) => setPlaceholderName(e.target.value)}
          placeholder="Nome do personagem"
          maxLength={24}
          className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED]"
        />
        <input
          type="text"
          value={placeholderClass}
          onChange={(e) => setPlaceholderClass(e.target.value)}
          placeholder="Classe (ex: Arcano)"
          maxLength={30}
          className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED]"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => { setShowPlaceholderForm(false); setPlaceholderName(""); setPlaceholderClass(""); }}
            className="px-3 py-1.5 text-xs text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleAddPlaceholder}
            disabled={busy || !placeholderName.trim() || !placeholderClass.trim()}
            className="px-3 py-1.5 text-xs text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      </div>
    ) : (
      <button
        onClick={() => setShowPlaceholderForm(true)}
        className="text-xs text-[#7C3AED] hover:text-white transition-colors cursor-pointer self-start"
      >
        + Adicionar personagem externo
      </button>
    )}
  </div>
)}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/schedules/schedule-modal.tsx
git commit -m "feat: add invite link + placeholder UI to ScheduleModal"
```

---

### Task 5: Wire ScheduleModal Props in Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Read the current dashboard page to find where ScheduleModal is used**

Read `src/app/dashboard/page.tsx` and find the `<ScheduleModal>` usage.

- [ ] **Step 2: Add new methods to useSchedules destructuring**

At lines 66-77 in `dashboard/page.tsx`, add the new methods to the destructuring:

```typescript
const {
  schedules,
  createSchedule,
  joinSchedule,
  leaveSchedule,
  removeParticipant,
  inviteFriend,
  getEligibleFriends,
  completeSchedule,
  expireSchedule,
  getParticipants,
  generateInviteCode,
  getInviteCode,
  addPlaceholder,
  removePlaceholder,
  getPlaceholders,
} = useSchedules();
```

- [ ] **Step 3: Pass new props to ScheduleModal**

Add the new props where `<ScheduleModal>` is rendered (line 630):

```tsx
onGenerateInviteCode={generateInviteCode}
onGetInviteCode={getInviteCode}
onAddPlaceholder={addPlaceholder}
onRemovePlaceholder={removePlaceholder}
onGetPlaceholders={getPlaceholders}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: wire invite + placeholder props to ScheduleModal"
```

---

### Task 6: Auth Redirect Support

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/components/auth/login-button.tsx`

- [ ] **Step 1: Update middleware to handle `/invite/*` routes**

In `src/lib/supabase/middleware.ts`, update the protected route check (line 39-40) to include `/invite`:

```typescript
const isProtectedRoute =
  pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding") || pathname.startsWith("/invite");
```

For unauthenticated users on `/invite/*`, redirect to landing page with redirect param (replace lines 43-46):

```typescript
if (!user && isProtectedRoute) {
  const url = request.nextUrl.clone();
  if (pathname.startsWith("/invite")) {
    url.pathname = "/";
    url.searchParams.set("redirect", pathname);
  } else {
    url.pathname = "/";
  }
  return NextResponse.redirect(url);
}
```

For authenticated users on `/` with a redirect param, redirect there instead of dashboard (update lines 61-64):

```typescript
if (pathname === "/") {
  const url = request.nextUrl.clone();
  const redirect = request.nextUrl.searchParams.get("redirect");
  if (redirect && redirect.startsWith("/invite/")) {
    url.pathname = redirect;
    url.searchParams.delete("redirect");
  } else {
    url.pathname = onboardingCompleted ? "/dashboard" : "/onboarding";
  }
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Update auth callback to preserve redirect**

In `src/app/auth/callback/route.ts`, update the success redirect (line 12):

```typescript
if (!error) {
  const redirect = searchParams.get("redirect");
  const target = redirect && redirect.startsWith("/invite/") ? redirect : "/dashboard";
  return NextResponse.redirect(`${origin}${target}`);
}
```

- [ ] **Step 3: Update LoginButton to pass redirect to OAuth**

In `src/components/auth/login-button.tsx`, update the `handleLogin` function to include redirect:

```typescript
const handleLogin = async (provider: Provider) => {
  const supabase = createClient();
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  const callbackUrl = redirect
    ? `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
    : `${window.location.origin}/auth/callback`;

  await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl,
    },
  });
};
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts src/app/auth/callback/route.ts src/components/auth/login-button.tsx
git commit -m "feat: support redirect param for invite flow auth"
```

---

### Task 7: Create `useInvite` Hook

**Files:**
- Create: `src/hooks/use-invite.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InviteData } from "@/lib/types";

interface UseInviteReturn {
  data: InviteData | null;
  loading: boolean;
  error: string | null;
  acceptInvite: (characterId: string) => Promise<"joined" | "friendship_only" | "already_joined" | "full" | "error">;
  acceptInviteWithNewChar: (charData: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => Promise<"joined" | "friendship_only" | "already_joined" | "full" | "error">;
  createFriendshipOnly: () => Promise<"friendship_only" | "error">;
}

export function useInvite(code: string): UseInviteReturn {
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: result, error: rpcError } = await supabase.rpc("resolve_invite", {
        invite_code: code,
      });

      if (rpcError) {
        setError("Erro ao carregar convite");
        setLoading(false);
        return;
      }

      const parsed = result as InviteData & { error?: string };
      if (parsed.error === "invite_not_found") {
        setError("Convite não encontrado");
        setLoading(false);
        return;
      }

      setData(parsed);
      setLoading(false);
    };

    load();
  }, [code]);

  const acceptInvite = useCallback(async (characterId: string) => {
    const supabase = createClient();
    const { data: result, error: rpcError } = await supabase.rpc("accept_invite", {
      invite_code: code,
      p_character_id: characterId,
    });

    if (rpcError) return "error" as const;
    return (result as { status: string }).status as "joined" | "friendship_only" | "already_joined" | "full" | "error";
  }, [code]);

  const acceptInviteWithNewChar = useCallback(async (charData: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "error" as const;

    // Create character first
    const { data: newChar, error: charError } = await supabase
      .from("characters")
      .insert({
        user_id: user.id,
        name: charData.name,
        class: charData.class_name,
        class_path: charData.class_path,
        level: charData.level,
      })
      .select("id")
      .single();

    if (charError || !newChar) return "error" as const;

    // Then accept invite
    return acceptInvite(newChar.id);
  }, [acceptInvite]);

  const createFriendshipOnly = useCallback(async () => {
    const supabase = createClient();
    const { data: result, error: rpcError } = await supabase.rpc("accept_invite", {
      invite_code: code,
    });

    if (rpcError) return "error" as const;
    return (result as { status: string }).status as "friendship_only" | "error";
  }, [code]);

  return { data, loading, error, acceptInvite, acceptInviteWithNewChar, createFriendshipOnly };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-invite.ts
git commit -m "feat: add useInvite hook for invite page"
```

---

### Task 8: Create `/invite/[code]` Page

**Files:**
- Create: `src/app/invite/[code]/page.tsx`

- [ ] **Step 1: Create the invite page**

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useInvite } from "@/hooks/use-invite";
import { useCharacters } from "@/hooks/use-characters";
import { CharacterForm } from "@/components/characters/character-form";

function formatBrtDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data, loading, error, acceptInvite, acceptInviteWithNewChar, createFriendshipOnly } = useInvite(code);
  const { characters, loading: charsLoading } = useCharacters();

  const [mode, setMode] = useState<"choose" | "new_char">("choose");
  const [selectedCharId, setSelectedCharId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (loading || charsLoading) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center">
        <p className="text-[#A89BC2]">Carregando convite...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">Convite inválido</h1>
          <p className="text-[#A89BC2]">{error ?? "Convite não encontrado"}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer"
          >
            Ir para o dashboard
          </button>
        </div>
      </div>
    );
  }

  // Already joined
  if (data.user_already_joined) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">{data.instance.name}</h1>
          <p className="text-[#A89BC2]">Você já está neste agendamento.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer"
          >
            Ir para o dashboard
          </button>
        </div>
      </div>
    );
  }

  // Schedule not open — still create friendship via RPC (no character needed)
  const [expiredHandled, setExpiredHandled] = useState(false);
  useEffect(() => {
    if (!data || data.schedule.status === "open" || data.user_already_joined || expiredHandled) return;
    createFriendshipOnly().then(() => setExpiredHandled(true));
  }, [data, expiredHandled]);

  if (data && data.schedule.status !== "open" && !data.user_already_joined) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">{data.instance.name}</h1>
          <p className="text-[#A89BC2]">Este agendamento já foi finalizado.</p>
          <p className="text-xs text-[#6B5A8A]">Você foi adicionado como amigo de @{data.creator.username}.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer"
          >
            Ir para o dashboard
          </button>
        </div>
      </div>
    );
  }

  // Result after action
  if (result) {
    const messages: Record<string, string> = {
      joined: "Você entrou no agendamento!",
      friendship_only: "Agendamento finalizado. Você foi adicionado como amigo.",
      already_joined: "Você já está neste agendamento.",
      full: "O agendamento está cheio (12/12).",
      error: "Erro ao aceitar o convite.",
    };
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">{data.instance.name}</h1>
          <p className="text-[#A89BC2]">{messages[result] ?? result}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer"
          >
            Ir para o dashboard
          </button>
        </div>
      </div>
    );
  }

  const participantCount = data.participants.length + data.placeholders.length + 1; // +1 creator
  const ownChars = characters.filter((c) => !c.isShared);

  const handleJoinWithExisting = async () => {
    if (!selectedCharId) return;
    setActionLoading(true);
    const status = await acceptInvite(selectedCharId);
    setResult(status);
    setActionLoading(false);
  };

  const handleJoinWithNew = async (charData: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => {
    setActionLoading(true);
    const status = await acceptInviteWithNewChar(charData);
    setResult(status);
    setActionLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4 py-8">
      <div className="max-w-lg w-full space-y-6">
        {/* Header card */}
        <div className="bg-[#1a1230] border border-[#3D2A5C] rounded-xl p-6 text-center space-y-3">
          <h1 className="text-2xl font-bold text-white">{data.instance.name}</h1>
          <div className="flex flex-wrap gap-2 justify-center">
            <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C]">
              {formatBrtDateTime(data.schedule.scheduled_at)}
            </span>
            {data.instance.start_map && (
              <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#D4A843] border border-[#3D2A5C]">
                {data.instance.start_map}
              </span>
            )}
            <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C]">
              {participantCount}/12
            </span>
          </div>
          <p className="text-sm text-[#A89BC2]">
            Convite de <span className="text-white font-medium">@{data.creator.username}</span>
          </p>
          {data.schedule.message && (
            <p className="text-sm text-[#A89BC2] italic">&ldquo;{data.schedule.message}&rdquo;</p>
          )}
        </div>

        {/* Join section */}
        <div className="bg-[#1a1230] border border-[#3D2A5C] rounded-xl p-6 space-y-4">
          {mode === "choose" ? (
            <>
              <h2 className="text-lg font-semibold text-white">Entrar no agendamento</h2>

              {ownChars.length > 0 && (
                <div className="flex flex-col gap-3">
                  <label className="text-sm text-[#A89BC2]">Escolha um personagem existente:</label>
                  <select
                    value={selectedCharId}
                    onChange={(e) => setSelectedCharId(e.target.value)}
                    className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-[#A89BC2] focus:outline-none focus:border-[#7C3AED]"
                    style={{ colorScheme: "dark" }}
                  >
                    <option value="">Selecionar...</option>
                    {ownChars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.class} Lv.{c.level}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleJoinWithExisting}
                    disabled={actionLoading || !selectedCharId}
                    className="px-4 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? "Entrando..." : "Entrar"}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#3D2A5C]" />
                <span className="text-xs text-[#6B5A8A]">ou</span>
                <div className="flex-1 h-px bg-[#3D2A5C]" />
              </div>

              <button
                onClick={() => setMode("new_char")}
                className="w-full px-4 py-2 text-sm text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer"
              >
                Criar novo personagem
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Novo personagem</h2>
                <button
                  onClick={() => setMode("choose")}
                  className="text-xs text-[#A89BC2] hover:text-white transition-colors cursor-pointer"
                >
                  ← Voltar
                </button>
              </div>
              <CharacterForm
                onSubmit={handleJoinWithNew}
                submitLabel={actionLoading ? "Entrando..." : "Criar e Entrar"}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/invite/[code]/page.tsx
git commit -m "feat: add /invite/[code] page for accepting schedule invites"
```

---

### Task 9: Integration Test

**Files:** None (manual testing)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test invite code generation**

1. Open dashboard, create a schedule
2. Open the schedule modal
3. Click "Gerar link de convite" → verify code is generated and copied to clipboard
4. Close and reopen modal → verify code persists

- [ ] **Step 3: Test placeholder creation**

1. In the schedule modal, click "+ Adicionar personagem externo"
2. Fill name + class, click "Adicionar"
3. Verify placeholder shows with "Aguardando" badge and 50% opacity
4. Verify participant count updated in schedule card

- [ ] **Step 4: Test invite link flow**

1. Open the invite link in an incognito browser (not logged in)
2. Verify redirect to landing page
3. Log in with Google/Discord
4. Verify redirect back to invite page
5. Create a character or select existing
6. Click "Entrar"
7. Verify success message and friendship created

- [ ] **Step 5: Test edge cases**

1. Open invite for expired schedule → verify "finalizado" message + friendship created
2. Open invite when already in schedule → verify "já está" message
3. Open invite with full schedule (12 participants) → verify "cheio" message

- [ ] **Step 6: Commit any fixes found during testing**
