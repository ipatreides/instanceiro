# Instanceiro Usability Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix usability bugs and improve UX across the Instanceiro app — covering auth redirect, performance, stale data, layout unification, mobile accessibility, and modal workflows.

**Architecture:** Incremental improvements across existing components. No new pages or major structural changes. Each task is self-contained and can be shipped independently.

**Tech Stack:** Next.js 16, React 19, Supabase, Tailwind CSS 4

---

## Task Overview

| # | Task | Priority | Items |
|---|------|----------|-------|
| 1 | Fix auth redirect after login | Critical | #1 |
| 2 | Unify instance layout into single column set | High | #27 |
| 3 | Fix stale data flash in modals | High | #25 |
| 4 | Performance: reduce redundant Supabase queries | High | #24 |
| 5 | Streamline "Mark Done" flow | Medium | #6 |
| 6 | Always show scheduling in instance modal | Medium | #26 |
| 7 | Mobile tab empty states + result count | Medium | #9, #10 |
| 8 | Fix mobile-inaccessible hover actions | Medium | #12, #13 |
| 9 | Add loading spinners | Low | #4 |
| 10 | Character bar edit affordance | Low | #5 |
| 11 | Friend request badge on mobile header | Low | #11 |
| 12 | Confirm before canceling schedule | Low | #15 |
| 13 | Extract shared utility functions | Low | #21 |
| 14 | Misc small fixes | Low | #2, #7, #8, #18 |

Items NOT included (low value or design-only): #3 (login page redundancy — product decision), #16 (class grid — works OK), #17 (profile page — feature, not fix), #19 (invite page details — minor), #20 (border-radius — cosmetic), #22 (haptic — nice-to-have), #23 (empty schedules — minor).

---

### Task 1: Fix auth redirect after login

**Problem:** After OAuth login, user lands on landing page instead of dashboard. The middleware handles the redirect, but Next.js caching or cookie timing can cause it to miss.

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add client-side auth check to landing page**

Convert the landing page to include a client-side redirect fallback. Wrap the current content in a component that checks for an active session on mount:

```tsx
// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoginButton } from "@/components/auth/login-button";

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-[#1a1230] border border-[#3D2A5C] rounded-xl p-5 text-left">
      <div className="text-[#D4A843] mb-3">{icon}</div>
      <h3 className="text-white font-semibold text-sm mb-1">{title}</h3>
      <p className="text-[#A89BC2] text-sm leading-relaxed">{description}</p>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setChecked(true);
      }
    });
  }, [router]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    // ... existing landing page JSX unchanged
  );
}
```

- [ ] **Step 2: Verify locally**

1. Log in via Google
2. Navigate to `http://localhost:3000/`
3. Should redirect to `/dashboard` instead of showing landing

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix: add client-side auth redirect fallback on landing page"
```

---

### Task 2: Unify instance layout into single column set

**Problem:** Currently there are 3 separate groups (Disponíveis, Em Cooldown, Inativas), each with their own 4 columns. User wants a single set of 4 columns (Semanal/3 Dias/Diário/Horário) with instances grouped by status within each column.

**Files:**
- Modify: `src/components/instances/instance-column.tsx`
- Modify: `src/components/instances/instance-card.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Delete: `src/components/instances/instance-group.tsx` (functionality absorbed into dashboard)

- [ ] **Step 1: Update InstanceColumn to accept mixed-status states and render them grouped**

The column should receive all states for a cooldown type and render them in order: available first, then cooldown, then inactive (collapsed by default).

```tsx
// src/components/instances/instance-column.tsx
"use client";

import { useState, useMemo } from "react";
import type { InstanceState, CooldownType } from "@/lib/types";
import { InstanceCard } from "./instance-card";
import { EMPTY_MESSAGES } from "@/lib/empty-messages";

interface InstanceColumnProps {
  cooldownType: CooldownType;
  states: InstanceState[];
  now?: Date;
  onCardClick?: (state: InstanceState) => void;
}

const COOLDOWN_LABELS: Record<CooldownType, string> = {
  weekly: "Semanal",
  three_day: "3 Dias",
  daily: "Diário",
  hourly: "Horário",
};

const STATUS_ORDER: InstanceState["status"][] = ["available", "cooldown", "inactive"];

function sortStates(states: InstanceState[]): InstanceState[] {
  return [...states].sort((a, b) => {
    const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (statusDiff !== 0) return statusDiff;
    // Within same status: most completions first, then alphabetical
    const countDiff = b.completionCount - a.completionCount;
    if (countDiff !== 0) return countDiff;
    return a.instance.name.localeCompare(b.instance.name, "pt-BR");
  });
}

export function InstanceColumn({ cooldownType, states, now, onCardClick }: InstanceColumnProps) {
  const emptyMsg = useMemo(
    () => EMPTY_MESSAGES[Math.floor(Math.random() * EMPTY_MESSAGES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cooldownType]
  );

  const sorted = sortStates(states);
  const available = sorted.filter((s) => s.status === "available");
  const cooldown = sorted.filter((s) => s.status === "cooldown");
  const inactive = sorted.filter((s) => s.status === "inactive");
  const [showInactive, setShowInactive] = useState(false);

  const activeStates = [...available, ...cooldown];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-[#A89BC2] uppercase tracking-wider">
          {COOLDOWN_LABELS[cooldownType]}
        </h3>
        <span className="text-xs text-[#6B5A8A]">
          {available.length}/{states.length}
        </span>
      </div>
      {states.length === 0 ? (
        <p className="text-xs text-[#6B5A8A] italic px-1 py-4">{emptyMsg}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {activeStates.map((state) => (
            <InstanceCard
              key={state.instance.id}
              state={state}
              now={now ?? new Date()}
              onClick={() => onCardClick?.(state)}
            />
          ))}
          {inactive.length > 0 && (
            <>
              <button
                onClick={() => setShowInactive((v) => !v)}
                className="text-xs text-[#6B5A8A] hover:text-[#A89BC2] transition-colors cursor-pointer flex items-center gap-1 px-1 py-1"
              >
                <span className={`transition-transform ${showInactive ? "rotate-180" : ""}`}>▾</span>
                {inactive.length} inativa{inactive.length > 1 ? "s" : ""}
              </button>
              {showInactive && inactive.map((state) => (
                <InstanceCard
                  key={state.instance.id}
                  state={state}
                  now={now ?? new Date()}
                  onClick={() => onCardClick?.(state)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update dashboard to use a single set of columns instead of 3 InstanceGroups**

Replace the 3 `<InstanceGroup>` components with a single layout that passes all states (filtered by search) to 4 columns:

```tsx
// In dashboard/page.tsx, replace the instance groups section with:

// (after computing filteredStates, remove availableStates/cooldownStates/inactiveStates)

const COOLDOWN_ORDER: CooldownType[] = ["weekly", "three_day", "daily", "hourly"];

// Group by cooldown type
const statesByType = new Map<CooldownType, InstanceState[]>();
for (const type of COOLDOWN_ORDER) {
  statesByType.set(type, filteredStates.filter((s) => s.instance.cooldown_type === type));
}
```

Then in the JSX, replace the 3 `<InstanceGroup>` with:

```tsx
{/* Instance columns — single unified layout */}
<div className="flex flex-col gap-3">
  {/* Mobile: tabs */}
  <MobileInstanceTabs
    statesByType={statesByType}
    cooldownOrder={COOLDOWN_ORDER}
    now={now}
    onCardClick={handleCardClick}
  />

  {/* Tablet: 2 columns */}
  <div className="hidden md:grid lg:hidden grid-cols-2 gap-4">
    {COOLDOWN_ORDER.map((type) => (
      <InstanceColumn
        key={type}
        cooldownType={type}
        states={statesByType.get(type) ?? []}
        now={now}
        onCardClick={handleCardClick}
      />
    ))}
  </div>

  {/* Desktop: 4 columns */}
  <div className="hidden lg:grid grid-cols-4 gap-4">
    {COOLDOWN_ORDER.map((type) => (
      <InstanceColumn
        key={type}
        cooldownType={type}
        states={statesByType.get(type) ?? []}
        now={now}
        onCardClick={handleCardClick}
      />
    ))}
  </div>
</div>
```

- [ ] **Step 3: Create MobileInstanceTabs as `src/components/instances/mobile-instance-tabs.tsx`**

Create the file described in Task 7 now (Task 7 will enhance it with count badges). It should receive the `statesByType` map and render tabs that switch between `InstanceColumn` content. See Task 7, Step 1 for the full implementation — use a basic version here without the count badges, then Task 7 adds them.

- [ ] **Step 4: Delete instance-group.tsx**

```bash
git rm src/components/instances/instance-group.tsx
```

- [ ] **Step 5: Test all breakpoints**

1. Desktop (>1024px): 4 columns side by side, instances grouped by status within each
2. Tablet (768-1024px): 2x2 grid of columns
3. Mobile (<768px): tabs for Semanal/3 Dias/Diário/Horário, content shows grouped instances
4. Search filtering works across all breakpoints
5. Inactive instances are collapsed by default within each column

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: unify instance layout into single column set with status grouping"
```

---

### Task 3: Fix stale data flash in modals

**Problem:** When switching between instances/schedules/characters, the modal shows the previous item's data until the new data loads.

**Files:**
- Modify: `src/components/instances/instance-modal.tsx`
- Modify: `src/components/schedules/schedule-modal.tsx`

- [ ] **Step 1: Reset instance modal state when instance changes**

Add a `useEffect` that resets internal modal state when the `instance` prop changes:

```tsx
// instance-modal.tsx — add after the existing reset-on-close effect:
const instanceId = stateObj?.instance.id ?? null;

useEffect(() => {
  // Reset states when switching between instances
  setConfirmingMarkDone(false);
  setMarkDoneTime("");
  setEditingId(null);
  setEditingTime("");
}, [instanceId]);
```

- [ ] **Step 2: Reset schedule modal state when schedule changes**

```tsx
// schedule-modal.tsx — add after the existing useEffect:
const scheduleId = schedule?.id ?? null;

useEffect(() => {
  setMode("view");
  setSelectedCharacterId("");
  setJoinMessage("");
  setCheckedParticipants({});
  setInviteSearch("");
  setShowPlaceholderForm(false);
  setPlaceholderName("");
  setPlaceholderClass("");
}, [scheduleId]);
```

- [ ] **Step 3: In dashboard, clear modal data eagerly when switching**

In `dashboard/page.tsx`, when `modalInstanceId` changes, the `getHistory` call should not show stale data. The history already uses the current `modalInstanceId`, but the modal opens instantly with old data. Ensure `handleCardClick` clears error state (already does) and the modal component handles the transition.

- [ ] **Step 4: Test**

1. Open instance A modal → see its data
2. Close, open instance B → should NOT flash A's data
3. Same for schedule modals

- [ ] **Step 5: Commit**

```bash
git add src/components/instances/instance-modal.tsx src/components/schedules/schedule-modal.tsx
git commit -m "fix: reset modal state when switching between entities"
```

---

### Task 4: Performance — reduce redundant Supabase queries

**Problem:** Everything feels slow. Root causes: (1) `useCharacters` calls `getUser()` + 2 queries on mount, (2) `useInstances` makes 3 queries every time character changes, (3) realtime subscriptions trigger full `fetchAll()` on every event regardless of relevance, (4) `useSchedules` makes 5 queries on mount.

**Files:**
- Modify: `src/hooks/use-instances.ts`
- Modify: `src/hooks/use-schedules.ts`
- Modify: `src/hooks/use-characters.ts`

- [ ] **Step 1: Filter realtime events by character_id in use-instances**

Instead of refetching everything on any `instance_completions` or `character_instances` change, filter by `character_id`:

```tsx
// use-instances.ts — update the channel subscription:
const channel = supabase
  .channel(`instances-${characterId}`)
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "instance_completions",
    filter: `character_id=eq.${characterId}`,
  }, () => fetchAll())
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "character_instances",
    filter: `character_id=eq.${characterId}`,
  }, () => fetchAll())
  .subscribe();
```

- [ ] **Step 2: Debounce realtime refetches in use-schedules**

The schedule subscription triggers on participants, placeholders, and schedules — multiple rapid events cause multiple `fetchAll()`. Add a debounce:

```tsx
// use-schedules.ts — add debounce to fetchAll in realtime handler:
useEffect(() => {
  let cancelled = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  fetchAll().then(() => { if (!cancelled) setLoading(false); });

  const debouncedFetch = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchAll(), 300);
  };

  const supabase = createClient();
  const channel = supabase
    .channel("schedules-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "instance_schedules" }, debouncedFetch)
    .on("postgres_changes", { event: "*", schema: "public", table: "schedule_participants" }, debouncedFetch)
    .on("postgres_changes", { event: "*", schema: "public", table: "schedule_placeholders" }, debouncedFetch)
    .subscribe();

  return () => {
    cancelled = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}, [fetchAll]);
```

- [ ] **Step 3: Cache instances list in use-instances**

The `instances` table (global game data) never changes. Cache it so switching characters doesn't re-fetch it:

```tsx
// use-instances.ts — add a module-level cache:
let cachedInstances: Instance[] | null = null;

// In fetchAll:
const fetchAll = useCallback(async () => {
  if (!characterId) { /* ... clear state */ return; }
  const supabase = createClient();

  const instancesPromise = cachedInstances
    ? Promise.resolve({ data: cachedInstances, error: null })
    : supabase.from("instances").select("*").order("name", { ascending: true });

  const [instancesRes, ciRes, completionsRes] = await Promise.all([
    instancesPromise,
    supabase.from("character_instances").select("*").eq("character_id", characterId),
    supabase.from("instance_completions").select("*").eq("character_id", characterId).order("completed_at", { ascending: false }),
  ]);

  if (!cachedInstances && instancesRes.data) {
    cachedInstances = instancesRes.data;
  }

  // ... rest unchanged
}, [characterId]);
```

- [ ] **Step 4: Test performance**

1. Switch between characters — should feel noticeably faster (1 query instead of 3)
2. Realtime updates should still work (mark an instance done in another tab)
3. Schedules should update without duplicate fetches

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-instances.ts src/hooks/use-schedules.ts
git commit -m "perf: cache instances, filter realtime events, debounce schedule updates"
```

---

### Task 5: Streamline "Mark Done" flow

**Problem:** Marking an instance as done requires 2 clicks + date picker interaction. The most common case is "I just did it now".

**Files:**
- Modify: `src/components/instances/instance-modal.tsx`

- [ ] **Step 1: Add "Marcar agora" quick action alongside "Escolher horário"**

Replace the single "Marcar como feita" button with two options:

```tsx
// instance-modal.tsx — replace the mark done section:
{(isAvailable || isInactive) && !confirmingMarkDone && (
  <div className="flex gap-2">
    <button
      onClick={() => onMarkDone()}
      disabled={actionLoading}
      className="flex-1 py-2.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Marcar agora
    </button>
    <button
      onClick={() => setConfirmingMarkDone(true)}
      disabled={actionLoading}
      className="py-2.5 px-3 rounded-md bg-[#2a1f40] border border-[#3D2A5C] text-[#A89BC2] text-sm transition-colors cursor-pointer hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
      title="Escolher horário"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    </button>
  </div>
)}
```

- [ ] **Step 2: Test**

1. Click "Marcar agora" → instance marked immediately, modal closes
2. Click clock icon → shows date picker like before
3. Both paths work for available AND inactive instances

- [ ] **Step 3: Commit**

```bash
git add src/components/instances/instance-modal.tsx
git commit -m "feat: add 'mark now' quick action to instance modal"
```

---

### Task 6: Always show scheduling in instance modal

**Problem:** The schedule button only shows for non-solo instances. User wants it always visible — even without publishing, they want to set cooldown for multiple characters from different accounts.

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Always pass `onSchedule` to InstanceModal**

Remove the `!modalState.instance.is_solo` condition:

```tsx
// dashboard/page.tsx — in InstanceModal props, change:
onSchedule={modalState ? () => {
  setSchedulingInstanceId(modalState.instance.id);
  setModalInstanceId(null);
} : undefined}
```

(Remove the `&& !modalState.instance.is_solo` check)

- [ ] **Step 2: Test**

1. Open a solo instance → schedule button should appear
2. Open a party instance → schedule button still appears
3. Create a schedule from a solo instance → works

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: show schedule option for all instances including solo"
```

---

### Task 7: Mobile tab empty states + result count

**Problem:** (a) Mobile tabs show all 4 cooldown types even when some are empty. (b) No indication of how many results match filters.

**Files:**
- Modify: `src/app/dashboard/page.tsx` (for mobile tabs and result count)
- Create: `src/components/instances/mobile-instance-tabs.tsx`

- [ ] **Step 1: Create MobileInstanceTabs with count badges and non-empty indicator**

```tsx
// src/components/instances/mobile-instance-tabs.tsx
"use client";

import { useState, useMemo } from "react";
import type { InstanceState, CooldownType } from "@/lib/types";
import { InstanceColumn } from "./instance-column";

const COOLDOWN_ORDER: CooldownType[] = ["weekly", "three_day", "daily", "hourly"];

const COOLDOWN_LABELS: Record<CooldownType, string> = {
  weekly: "Semanal",
  three_day: "3 Dias",
  daily: "Diário",
  hourly: "Horário",
};

interface MobileInstanceTabsProps {
  statesByType: Map<CooldownType, InstanceState[]>;
  now: Date;
  onCardClick: (state: InstanceState) => void;
}

export function MobileInstanceTabs({ statesByType, now, onCardClick }: MobileInstanceTabsProps) {
  const [activeTab, setActiveTab] = useState<CooldownType>(COOLDOWN_ORDER[0]);

  return (
    <div className="md:hidden flex flex-col gap-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {COOLDOWN_ORDER.map((type) => {
          const states = statesByType.get(type) ?? [];
          const availableCount = states.filter((s) => s.status === "available").length;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === type
                  ? "bg-[#7C3AED] text-white"
                  : "bg-[#2a1f40] text-[#A89BC2] hover:text-white"
              }`}
            >
              {COOLDOWN_LABELS[type]}
              {availableCount > 0 && (
                <span className={`text-[10px] px-1 py-0.5 rounded-full leading-none ${
                  activeTab === type ? "bg-white/20" : "bg-green-500/20 text-green-400"
                }`}>
                  {availableCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <InstanceColumn
        cooldownType={activeTab}
        states={statesByType.get(activeTab) ?? []}
        now={now}
        onCardClick={onCardClick}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add filtered result count below search bar**

In dashboard, after the `<InstanceSearch>` component, add a small counter:

```tsx
{(searchText.trim().length > 0 || searchFilters.length > 0) && (
  <p className="text-xs text-[#6B5A8A]">
    {filteredStates.length} de {allStates.length} instâncias
  </p>
)}
```

- [ ] **Step 3: Test**

1. Mobile: tabs show available count badge
2. Filter by map → see "X de Y instâncias" below search
3. Clear filters → counter disappears

- [ ] **Step 4: Commit**

```bash
git add src/components/instances/mobile-instance-tabs.tsx src/app/dashboard/page.tsx
git commit -m "feat: add count badges to mobile tabs and filter result count"
```

---

### Task 8: Fix mobile-inaccessible hover actions

**Problem:** "Remove friend" button and "Remove participant" button use `opacity-0 group-hover:opacity-100` which doesn't work on touch devices.

**Files:**
- Modify: `src/components/friends/friends-sidebar.tsx`
- Modify: `src/components/schedules/schedule-modal.tsx`

- [ ] **Step 1: Replace hover-only with always-visible but subtle buttons**

In `friends-sidebar.tsx:134`, change:
```
opacity-0 group-hover:opacity-100
```
to:
```
opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100
```

This makes them always visible (at reduced opacity) on mobile, hover-reveal on desktop.

- [ ] **Step 2: Same fix for schedule-modal.tsx**

In `schedule-modal.tsx`, find ALL occurrences of `opacity-0 group-hover:opacity-100` (there are multiple — participant remove buttons and placeholder remove buttons) and apply the same pattern:
```
opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100
```

- [ ] **Step 3: Test on mobile viewport**

1. Friends sidebar: remove button visible without hover
2. Schedule modal: remove/unsubscribe buttons visible without hover
3. Desktop: still hover-reveal behavior

- [ ] **Step 4: Commit**

```bash
git add src/components/friends/friends-sidebar.tsx src/components/schedules/schedule-modal.tsx
git commit -m "fix: make hover-only actions accessible on touch devices"
```

---

### Task 9: Add loading spinners

**Problem:** All loading states show plain "Carregando..." text.

**Files:**
- Create: `src/components/ui/spinner.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/invite/[code]/page.tsx`

- [ ] **Step 1: Create a reusable Spinner component**

```tsx
// src/components/ui/spinner.tsx
export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-8 h-8" }[size];
  return (
    <div className={`${sizeClass} border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin`} />
  );
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#0f0a1a] flex flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      {label && <p className="text-[#A89BC2] text-sm">{label}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Replace loading states**

In `dashboard/page.tsx:252-258`:
```tsx
if (isLoading) return <FullPageSpinner />;
```

In `profile/page.tsx:73-78`:
```tsx
if (loading) return <FullPageSpinner />;
```

In `invite/[code]/page.tsx:53-59`:
```tsx
if (!authChecked || loading || charsLoading) return <FullPageSpinner label="Carregando convite..." />;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/spinner.tsx src/app/dashboard/page.tsx src/app/profile/page.tsx src/app/invite/\\[code\\]/page.tsx
git commit -m "feat: add loading spinners replacing plain text"
```

---

### Task 10: Character bar edit affordance

**Problem:** Clicking the selected character opens edit, but there's no visual hint.

**Files:**
- Modify: `src/components/characters/character-bar.tsx`

- [ ] **Step 1: Add a subtle pencil icon on the selected character**

```tsx
// character-bar.tsx — add inside the button, after the level span, for own (non-shared) selected chars:
{isSelected && !isShared && onEdit && (
  <span className="text-xs opacity-50 mt-0.5">toque para editar</span>
)}
```

Alternative: add a small pencil SVG instead of text. Choose whichever fits the design better.

- [ ] **Step 2: Commit**

```bash
git add src/components/characters/character-bar.tsx
git commit -m "feat: add edit hint on selected character card"
```

---

### Task 11: Friend request badge on mobile header

**Problem:** No indicator of pending friend requests on the mobile header icon.

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/hooks/use-friendships.ts` (need to expose pending count)

- [ ] **Step 1: Expose pendingReceivedCount from useFriendships**

The hook is already used in `FriendsSidebar`. We need to also call it (or pass data down) in the dashboard. The simplest approach: use the hook in dashboard and pass the count to the header.

Add to dashboard:
```tsx
const { pendingReceived } = useFriendships();
```

Then in the header friend icon button, add a badge:
```tsx
<button
  onClick={() => setShowFriends(true)}
  className="lg:hidden text-sm text-[#A89BC2] hover:text-white transition-colors cursor-pointer relative"
  aria-label="Amigos"
>
  {/* existing SVG icon */}
  {pendingReceived.length > 0 && (
    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
      {pendingReceived.length}
    </span>
  )}
</button>
```

- [ ] **Step 2: Check that useFriendships doesn't duplicate queries**

`useFriendships` is called in both `FriendsSidebar` and now in `dashboard`. This means 2 instances of the hook = 2 separate subscriptions. To avoid this, lift the hook to dashboard and pass the data to FriendsSidebar as props. This is a larger refactor — for now, the duplication is acceptable since both subscribe to the same realtime channel and Supabase handles this efficiently.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: show friend request badge on mobile header icon"
```

---

### Task 12: Confirm before canceling schedule

**Problem:** "Cancelar" (expire) button on schedule executes immediately without confirmation.

**Files:**
- Modify: `src/components/schedules/schedule-modal.tsx`

- [ ] **Step 1: Add confirmation state**

```tsx
// schedule-modal.tsx — add state:
const [confirmingCancel, setConfirmingCancel] = useState(false);

// Reset on schedule change:
useEffect(() => { setConfirmingCancel(false); }, [scheduleId]);
```

Replace the cancel button with:
```tsx
{!confirmingCancel ? (
  <button
    type="button"
    onClick={() => setConfirmingCancel(true)}
    disabled={busy}
    className="px-4 py-2 text-sm text-red-400 bg-[#2a1f40] border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors cursor-pointer disabled:opacity-50"
  >
    Cancelar
  </button>
) : (
  <button
    type="button"
    onClick={handleExpire}
    disabled={busy}
    className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
  >
    {busy ? "Cancelando..." : "Confirmar cancelamento"}
  </button>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedules/schedule-modal.tsx
git commit -m "feat: add confirmation step before canceling schedule"
```

---

### Task 13: Extract shared utility functions

**Problem:** `formatBrtDateTime`, `toBrtDatetimeLocal`, `fromBrtDatetimeLocal` are duplicated across files.

**Files:**
- Create: `src/lib/format-date.ts`
- Modify: `src/components/instances/instance-modal.tsx`
- Modify: `src/components/schedules/schedule-modal.tsx`
- Modify: `src/components/schedules/schedule-form.tsx`
- Modify: `src/app/invite/[code]/page.tsx`

- [ ] **Step 1: Create shared date formatting module**

```tsx
// src/lib/format-date.ts
export function toBrtDatetimeLocal(date: Date): string {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 16);
}

export function fromBrtDatetimeLocal(value: string): string {
  return `${value}:00-03:00`;
}

export function formatBrtDateTime(dateStr: string): string {
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

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nowBrtMax(): string {
  return toBrtDatetimeLocal(new Date());
}
```

- [ ] **Step 2: Update imports in all consuming files**

Remove the local definitions and import from `@/lib/format-date` in:
- `instance-modal.tsx` (remove `toBrtDatetimeLocal`, `fromBrtDatetimeLocal`, `formatDateTime`, `nowBrtMax`)
- `schedule-modal.tsx` (remove `formatBrtDateTime`)
- `schedule-form.tsx` (remove `toBrtDatetimeLocal`, `fromBrtDatetimeLocal`, `getMinBrt`)
- `invite/[code]/page.tsx` (remove `formatBrtDateTime`)

- [ ] **Step 3: Run tests to ensure nothing broke**

```bash
cd D:/rag/instance-tracker && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/format-date.ts src/components/instances/instance-modal.tsx src/components/schedules/schedule-modal.tsx src/components/schedules/schedule-form.tsx src/app/invite/\\[code\\]/page.tsx
git commit -m "refactor: extract shared date formatting utilities"
```

---

### Task 14: Misc small fixes

**Files:**
- Modify: `src/app/signup/page.tsx` (#2 — Google OAuth from signup doesn't preserve username)
- Modify: `src/components/instances/instance-modal.tsx` (#7 — missing Activate button)
- Modify: `src/app/reset-password/page.tsx` (#18 — premature error state)

- [ ] **Step 1: Fix signup Google OAuth redirect to preserve username**

The signup page already saves `pending_username` to localStorage for email/password signups (line 75), and the dashboard already reads it (line 143). The bug is that `handleGoogleLogin` (line 85) doesn't save the username to localStorage before redirecting to OAuth. Add the localStorage save:

```tsx
// signup/page.tsx — handleGoogleLogin:
const handleGoogleLogin = async () => {
  // Save username to localStorage so dashboard can apply it after OAuth callback
  if (username && isValidUsername(username) && usernameStatus === "available") {
    localStorage.setItem("pending_username", username);
  }
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
};
```

Note: The dashboard's existing logic at line 143 already checks for `pending_username` in localStorage and applies it. The only missing piece is that the Google OAuth path in signup wasn't saving it before redirect.

- [ ] **Step 2: Add Activate button for inactive instances**

In `instance-modal.tsx`, after the deactivate section, add:
```tsx
{/* Activate — only for inactive instances */}
{isInactive && (
  <div className="border-t border-[#3D2A5C] pt-4">
    <button
      onClick={onActivate}
      disabled={actionLoading}
      className="text-sm text-green-400 hover:text-green-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Ativar instância
    </button>
  </div>
)}
```

- [ ] **Step 3: Fix reset password premature error**

In `reset-password/page.tsx`, replace the immediate `canReset=false` error with a loading state:

```tsx
const [checking, setChecking] = useState(true);

useEffect(() => {
  const supabase = createClient();
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      setCanReset(true);
    }
    setChecking(false);
  });

  // Timeout fallback — if no event after 3s, show error
  const timer = setTimeout(() => setChecking(false), 3000);

  return () => {
    subscription.unsubscribe();
    clearTimeout(timer);
  };
}, []);

// Then change the guard:
if (checking) {
  return <FullPageSpinner label="Verificando link..." />;
}
if (!canReset) {
  // ... existing error UI
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/signup/page.tsx src/components/instances/instance-modal.tsx src/app/reset-password/page.tsx
git commit -m "fix: signup OAuth username, activate button, reset password timing"
```
