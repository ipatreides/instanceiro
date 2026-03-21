# Instance Scheduling Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule instances with friends, join/leave, confirm attendance, and auto-complete for all participants.

**Architecture:** Two new tables (`instance_schedules`, `schedule_participants`) with RLS. `useSchedules` hook with realtime subscription. New collapsible "Agendadas" section on dashboard with schedule cards, detail modal, create form, and attendance checklist. "Agendar" button in instance modal for non-solo instances.

**Tech Stack:** Supabase (Postgres + Realtime), Next.js, React, TypeScript, Tailwind CSS

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/009_instance_schedules.sql`

- [ ] **Step 1: Write migration**

```sql
-- Instance schedules
CREATE TABLE instance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id INT NOT NULL REFERENCES instances(id),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE instance_schedules ENABLE ROW LEVEL SECURITY;

-- Use SECURITY DEFINER function to check friendship (avoids RLS recursion)
CREATE OR REPLACE FUNCTION is_friend_of(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
    AND ((requester_id = auth.uid() AND addressee_id = target_user_id)
      OR (requester_id = target_user_id AND addressee_id = auth.uid()))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Creator or friends can view
CREATE POLICY "Users can view schedules"
  ON instance_schedules FOR SELECT
  USING (auth.uid() = created_by OR is_friend_of(created_by));

CREATE POLICY "Users can create schedules"
  ON instance_schedules FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can update schedules"
  ON instance_schedules FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete schedules"
  ON instance_schedules FOR DELETE
  USING (auth.uid() = created_by);

-- Schedule participants
CREATE TABLE schedule_participants (
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (schedule_id, user_id)
);

ALTER TABLE schedule_participants ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the schedule can see participants
CREATE POLICY "Users can view participants"
  ON schedule_participants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM instance_schedules
    WHERE instance_schedules.id = schedule_participants.schedule_id
    AND (instance_schedules.created_by = auth.uid() OR is_friend_of(instance_schedules.created_by))
  ));

-- Friends can join
CREATE POLICY "Users can join schedules"
  ON schedule_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Self or creator can remove
CREATE POLICY "Users can leave or be removed"
  ON schedule_participants FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM instance_schedules
      WHERE instance_schedules.id = schedule_participants.schedule_id
      AND instance_schedules.created_by = auth.uid()
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE instance_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_participants;
```

- [ ] **Step 2: Run migration**

Run: `npx supabase db query --linked -f supabase/migrations/009_instance_schedules.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_instance_schedules.sql
git commit -m "feat: add instance_schedules and schedule_participants tables"
```

---

### Task 2: Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add types**

```ts
export interface InstanceSchedule {
  id: string;
  instance_id: number;
  character_id: string;
  created_by: string;
  scheduled_at: string;
  status: 'open' | 'completed' | 'expired';
  message: string | null;
  created_at: string;
  // Joined
  instance?: Instance;
  creatorUsername?: string;
  creatorAvatar?: string | null;
  participantCount?: number;
  isLate?: boolean;
}

export interface ScheduleParticipant {
  schedule_id: string;
  character_id: string;
  user_id: string;
  message: string | null;
  created_at: string;
  // Joined
  username?: string;
  avatar_url?: string | null;
  characterName?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add InstanceSchedule and ScheduleParticipant types"
```

---

### Task 3: useSchedules hook

**Files:**
- Create: `src/hooks/use-schedules.ts`

- [ ] **Step 1: Create hook**

Fetches all visible schedules (own + friends'), enriched with instance data, creator profile, and participant count. Realtime subscription on both tables.

Actions:
- `createSchedule(instanceId, characterId, scheduledAt, message?)` — insert + return
- `joinSchedule(scheduleId, characterId, message?)` — insert participant
- `leaveSchedule(scheduleId)` — delete own participant row
- `completeSchedule(scheduleId, confirmedUserIds[])` — insert completions for all confirmed, update status to 'completed'
- `expireSchedule(scheduleId)` — update status to 'expired'
- `getParticipants(scheduleId)` — fetch participants with profiles

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-schedules.ts
git commit -m "feat: add useSchedules hook with realtime"
```

---

### Task 4: Schedule card + section

**Files:**
- Create: `src/components/schedules/schedule-card.tsx`
- Create: `src/components/schedules/schedule-section.tsx`

- [ ] **Step 1: Create schedule card**

Displays: instance name, @creator, date/time formatted, X/12 participants badge. Late schedules get `animate-pulse` border in red/orange.

- [ ] **Step 2: Create schedule section**

Collapsible section "Agendadas" with badge count. When collapsed, shows "Agendadas (3)" in header. Uses same collapsible pattern as "Inativas" group.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/schedules/schedule-card.tsx src/components/schedules/schedule-section.tsx
git commit -m "feat: add schedule card and collapsible section"
```

---

### Task 5: Schedule form + modal

**Files:**
- Create: `src/components/schedules/schedule-form.tsx`
- Create: `src/components/schedules/schedule-modal.tsx`

- [ ] **Step 1: Create schedule form**

Form with: datetime picker (min = cooldown expiry passed as prop), optional message textarea. "Agendar" button.

- [ ] **Step 2: Create schedule modal**

Detail modal showing: instance info badges, scheduled time, creator + message, participant list with avatars/@usernames/messages.

Conditional actions:
- Not signed up → "Participar" (character select dropdown + optional message)
- Signed up → "Sair"
- Creator → "Completar" button, "Cancelar agendamento" button

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/schedules/schedule-form.tsx src/components/schedules/schedule-modal.tsx
git commit -m "feat: add schedule form and detail modal"
```

---

### Task 6: Attendance checklist

**Files:**
- Create: `src/components/schedules/attendance-checklist.tsx`

- [ ] **Step 1: Create component**

List of all participants + creator with checkboxes (all checked by default). Uncheck anyone who didn't show. "Confirmar" button calls `completeSchedule` with checked user IDs. This creates instance_completions for each confirmed participant's character + the creator's character, and sets schedule status to 'completed'.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/schedules/attendance-checklist.tsx
git commit -m "feat: add attendance checklist for schedule completion"
```

---

### Task 7: Dashboard integration

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add schedule section to dashboard**

Import and render `ScheduleSection` above "Disponíveis". Pass schedules from `useSchedules` hook. Handle schedule modal open/close state.

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add Agendadas section to dashboard"
```

---

### Task 8: Instance modal "Agendar" button

**Files:**
- Modify: `src/components/instances/instance-modal.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add "Agendar" button**

In instance modal, for instances with `party_min > 1`, show "Agendar" button. Click opens schedule form in a nested modal or replaces the modal content. Pass cooldown expiry as min date.

- [ ] **Step 2: Wire up in dashboard**

Add `onSchedule` prop handling: creates schedule via hook, closes modal.

- [ ] **Step 3: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/instances/instance-modal.tsx src/app/dashboard/page.tsx
git commit -m "feat: add Agendar button to instance modal"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run tests**

Run: `npm test`

- [ ] **Step 2: Full build**

Run: `npm run build`

- [ ] **Step 3: Manual test**

1. User A opens instance modal → clicks "Agendar" → picks date/time → creates
2. "Agendadas" section appears with the new schedule
3. User B (friend) sees the schedule → clicks → "Participar" → selects character
4. User A sees participant count update in realtime
5. After scheduled time passes → card pulses red/orange (late)
6. User A clicks "Completar" → checklist → confirms → completions created for all
7. Schedule disappears from "Agendadas"
