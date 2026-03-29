# MVP Timer Phase 3 — Party & Loot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pre-configured party management, party member selection during kill registration, and loot recording to the MVP Timer.

**Architecture:** New `useMvpParties` hook for party CRUD. Kill modal gets a party section with toggle badges (pre-loaded from configured party). Loot selection already exists in the modal — needs to be saved with the kill. `registerKill` in `useMvpTimers` gets extended to insert party members. Kill history shows party + loot info.

**Tech Stack:** Next.js 16, React 19, Supabase, Tailwind CSS v4

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/use-mvp-parties.ts` | Create | Party CRUD: create, edit, delete parties; manage members |
| `src/hooks/use-mvp-timers.ts` | Modify | Extend `registerKill` to save party members; extend `editKill` to update party |
| `src/components/mvp/mvp-kill-modal.tsx` | Modify | Add party section with toggle badges |
| `src/components/mvp/mvp-tab.tsx` | Modify | Pass parties data to modal; show party/loot in detail panel and history |
| `src/lib/types.ts` | Modify | Add `MvpParty`, `MvpPartyMember` types |

---

### Task 1: Add Party types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add types at the end of the file (after MvpTimerStatus)**

```typescript
export interface MvpParty {
  id: string;
  group_id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface MvpPartyMember {
  party_id: string;
  character_id: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add MvpParty and MvpPartyMember types"
```

---

### Task 2: Create useMvpParties hook

**Files:**
- Create: `src/hooks/use-mvp-parties.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MvpParty, MvpPartyMember } from "@/lib/types";

interface UseMvpPartiesReturn {
  parties: MvpParty[];
  partyMembers: Map<string, string[]>; // party_id -> character_ids
  loading: boolean;
  createParty: (groupId: string, name: string, characterIds: string[]) => Promise<void>;
  updatePartyMembers: (partyId: string, characterIds: string[]) => Promise<void>;
  deleteParty: (partyId: string) => Promise<void>;
}

export function useMvpParties(groupId: string | null): UseMvpPartiesReturn {
  const [parties, setParties] = useState<MvpParty[]>([]);
  const [partyMembers, setPartyMembers] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchParties = useCallback(async () => {
    if (!groupId) {
      setParties([]);
      setPartyMembers(new Map());
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [partiesRes, membersRes] = await Promise.all([
      supabase
        .from("mvp_parties")
        .select("id, group_id, name, created_by, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false }),
      supabase
        .from("mvp_party_members")
        .select("party_id, character_id")
        .in("party_id",
          // Need party IDs first — use a subquery approach
          // Fetch all then filter client-side
          []
        ),
    ]);

    const fetchedParties = (partiesRes.data ?? []) as MvpParty[];
    setParties(fetchedParties);

    // Fetch members for all parties
    if (fetchedParties.length > 0) {
      const { data: membersData } = await supabase
        .from("mvp_party_members")
        .select("party_id, character_id")
        .in("party_id", fetchedParties.map((p) => p.id));

      const map = new Map<string, string[]>();
      for (const m of (membersData ?? []) as MvpPartyMember[]) {
        const list = map.get(m.party_id) ?? [];
        list.push(m.character_id);
        map.set(m.party_id, list);
      }
      setPartyMembers(map);
    } else {
      setPartyMembers(new Map());
    }

    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    fetchParties();
  }, [fetchParties]);

  const createParty = useCallback(async (gId: string, name: string, characterIds: string[]) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("mvp_parties")
      .insert({ group_id: gId, name, created_by: user.id })
      .select("id")
      .single();
    if (error) throw error;

    if (characterIds.length > 0) {
      await supabase.from("mvp_party_members").insert(
        characterIds.map((cId) => ({ party_id: data.id, character_id: cId }))
      );
    }

    await fetchParties();
  }, [fetchParties]);

  const updatePartyMembers = useCallback(async (partyId: string, characterIds: string[]) => {
    const supabase = createClient();
    // Delete all existing members and re-insert
    await supabase.from("mvp_party_members").delete().eq("party_id", partyId);
    if (characterIds.length > 0) {
      await supabase.from("mvp_party_members").insert(
        characterIds.map((cId) => ({ party_id: partyId, character_id: cId }))
      );
    }
    await fetchParties();
  }, [fetchParties]);

  const deleteParty = useCallback(async (partyId: string) => {
    const supabase = createClient();
    await supabase.from("mvp_parties").delete().eq("id", partyId);
    await fetchParties();
  }, [fetchParties]);

  return { parties, partyMembers, loading, createParty, updatePartyMembers, deleteParty };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-mvp-parties.ts
git commit -m "feat: add useMvpParties hook for party CRUD"
```

---

### Task 3: Extend registerKill to save party members

**Files:**
- Modify: `src/hooks/use-mvp-timers.ts`

- [ ] **Step 1: Add `partyMemberIds` to registerKill data param**

Update the `registerKill` method signature in the interface to include `partyMemberIds`:

```typescript
  registerKill: (data: {
    mvpId: number;
    groupId: string | null;
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    registeredBy: string;
    loots: { itemId: number; itemName: string }[];
    partyMemberIds: string[];
  }) => Promise<void>;
```

- [ ] **Step 2: Update registerKill implementation to insert party members**

After the loots insert, add:

```typescript
    // Insert party members
    if (data.partyMemberIds.length > 0) {
      await supabase.from("mvp_kill_party").insert(
        data.partyMemberIds.map((cId) => ({ kill_id: kill.id, character_id: cId }))
      );
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-mvp-timers.ts
git commit -m "feat: save party members with kill registration"
```

---

### Task 4: Add party section to kill modal

**Files:**
- Modify: `src/components/mvp/mvp-kill-modal.tsx`

- [ ] **Step 1: Add party props and state**

Add to `MvpKillModalProps`:
```typescript
  parties: { id: string; name: string; memberIds: string[] }[];
```

Add state:
```typescript
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [partyMemberIds, setPartyMemberIds] = useState<Set<string>>(new Set());
```

When a party is selected, pre-fill the member toggles:
```typescript
  const handleSelectParty = (party: { id: string; name: string; memberIds: string[] }) => {
    if (selectedPartyId === party.id) {
      setSelectedPartyId(null);
      setPartyMemberIds(new Set());
    } else {
      setSelectedPartyId(party.id);
      setPartyMemberIds(new Set(party.memberIds));
    }
  };

  const togglePartyMember = (charId: string) => {
    setPartyMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  };
```

- [ ] **Step 2: Add party UI between killer and loot sections (only in group mode)**

```tsx
          {/* Party */}
          {isGroupMode && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] text-text-secondary font-semibold">PARTY</p>
                {parties.length > 0 && (
                  <div className="flex gap-1">
                    {parties.map((party) => (
                      <button
                        key={party.id}
                        type="button"
                        onClick={() => handleSelectParty(party)}
                        className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                          selectedPartyId === party.id
                            ? "bg-primary text-white"
                            : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {party.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {killerCandidates.map((c) => {
                  const isInParty = partyMemberIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => togglePartyMember(c.id)}
                      className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors ${
                        isInParty
                          ? "bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] border border-status-available text-text-primary"
                          : "bg-surface border border-border text-text-secondary hover:border-primary"
                      }`}
                    >
                      {c.name} {isInParty ? "✓" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
```

- [ ] **Step 3: Pass partyMemberIds in onConfirm callback**

Update `handleSubmit` to include partyMemberIds in the data:

Add `partyMemberIds: [...partyMemberIds]` to the `onConfirm` call data.

Update the `onConfirm` prop type to include `partyMemberIds: string[]`.

- [ ] **Step 4: Commit**

```bash
git add src/components/mvp/mvp-kill-modal.tsx
git commit -m "feat: add party selection to kill modal"
```

---

### Task 5: Wire parties into MvpTab

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx`

- [ ] **Step 1: Import and use useMvpParties**

Add import:
```typescript
import { useMvpParties } from "@/hooks/use-mvp-parties";
```

Add hook call:
```typescript
  const { parties, partyMembers } = useMvpParties(group?.id ?? null);
```

Build party data for modal:
```typescript
  const partiesForModal = parties.map((p) => ({
    id: p.id,
    name: p.name,
    memberIds: partyMembers.get(p.id) ?? [],
  }));
```

- [ ] **Step 2: Pass parties to modal and update onConfirm to include partyMemberIds**

Add `parties={partiesForModal}` to `<MvpKillModal>` props.

Update `handleConfirmKill` to pass `partyMemberIds`:

```typescript
  const handleConfirmKill = useCallback(async (data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    selectedLoots: { itemId: number; itemName: string }[];
    partyMemberIds: string[];
  }) => {
    if (!selectedMvp || !selectedCharId) return;

    if (modalKill) {
      await editKill(modalKill.kill_id, {
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        editedBy: selectedCharId,
      });
    } else {
      await registerKill({
        mvpId: selectedMvp.id,
        groupId: group?.id ?? null,
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        registeredBy: selectedCharId,
        loots: data.selectedLoots,
        partyMemberIds: data.partyMemberIds,
      });
    }
    setShowKillModal(false);
  }, [selectedMvp, modalKill, selectedCharId, group, registerKill, editKill]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: wire party data into MVP kill flow"
```

---

### Task 6: Build and push

- [ ] **Step 1: Build**

```bash
npm run build
```

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Manual verification**

- Open kill modal in group mode → party section visible with member badges
- Select a pre-configured party → members auto-toggled
- Toggle individual members on/off
- Confirm kill → party members saved to mvp_kill_party
- Solo mode → no party section shown
- Loot chips toggle and save correctly
