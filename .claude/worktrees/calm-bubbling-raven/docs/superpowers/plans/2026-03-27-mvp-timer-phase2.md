# MVP Timer Phase 2 — Core Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add kill registration modal with map, coordinates, killer selection, and wire action buttons into the existing MVP timer list so users can start tracking MVP respawn timers.

**Architecture:** New kill modal component with map image click-to-plot, bidirectional coordinate inputs, killer badge selection. Hook method `registerKill` added to `useMvpTimers`. Active timer rows and inactive chips get click handlers to open the modal. Edit and delete flows use the same modal.

**Tech Stack:** Next.js 16, React 19, Supabase, Tailwind CSS v4

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/mvp/mvp-kill-modal.tsx` | Create | Kill registration/edit modal with map, time, coords, killer, loot |
| `src/components/mvp/mvp-map-picker.tsx` | Create | Square map image with click-to-plot, bidirectional with X/Y |
| `src/hooks/use-mvp-timers.ts` | Modify | Add `registerKill`, `editKill`, `deleteKill` methods |
| `src/components/mvp/mvp-timer-row.tsx` | Modify | Add action buttons (⚔ kill now, 🕐 set time, edit) |
| `src/components/mvp/mvp-timer-list.tsx` | Modify | Wire inactive chip clicks + pass callbacks |
| `src/components/mvp/mvp-tab.tsx` | Modify | Manage modal state, pass callbacks down |

---

### Task 1: Map picker component

**Files:**
- Create: `src/components/mvp/mvp-map-picker.tsx`

- [ ] **Step 1: Create the map picker component**

```typescript
"use client";

import { useRef, useCallback } from "react";
import type { MvpMapMeta } from "@/lib/types";

interface MvpMapPickerProps {
  mapName: string;
  mapMeta: MvpMapMeta | undefined;
  tombX: number | null;
  tombY: number | null;
  onCoordsChange: (x: number | null, y: number | null) => void;
}

export function MvpMapPicker({ mapName, mapMeta, tombX, tombY, onCoordsChange }: MvpMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapMeta || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const renderedSize = rect.width; // Square map
    const gameX = Math.round(clickX * (mapMeta.width / renderedSize));
    const gameY = Math.round((renderedSize - clickY) * (mapMeta.height / renderedSize)); // Y inverted
    onCoordsChange(
      Math.max(0, Math.min(gameX, mapMeta.width - 1)),
      Math.max(0, Math.min(gameY, mapMeta.height - 1))
    );
  }, [mapMeta, onCoordsChange]);

  // Convert game coords to CSS position (percentage)
  const dotStyle = tombX != null && tombY != null && mapMeta ? {
    left: `${(tombX / mapMeta.width) * 100}%`,
    top: `${((mapMeta.height - tombY) / mapMeta.height) * 100}%`, // Y inverted
  } : null;

  return (
    <div
      ref={containerRef}
      onClick={handleMapClick}
      className="relative aspect-square w-full rounded-lg border border-border overflow-hidden cursor-crosshair bg-bg"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/maps/${mapName}.png`}
        alt={mapName}
        className="w-full h-full object-cover"
        draggable={false}
      />
      {dotStyle && (
        <div
          className="absolute w-3 h-3 rounded-full border-2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            ...dotStyle,
            backgroundColor: "var(--primary)",
            borderColor: "var(--primary-secondary)",
            boxShadow: "0 0 8px color-mix(in srgb, var(--primary) 50%, transparent)",
          }}
        />
      )}
      <span className="absolute bottom-1 left-2 text-[9px] text-text-secondary pointer-events-none">
        {mapName}
      </span>
      {!tombX && !tombY && (
        <span className="absolute bottom-1 right-2 text-[9px] text-text-secondary pointer-events-none">
          Clique para marcar
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-map-picker.tsx
git commit -m "feat: add MvpMapPicker component with click-to-plot coordinates"
```

---

### Task 2: Kill modal component

**Files:**
- Create: `src/components/mvp/mvp-kill-modal.tsx`

- [ ] **Step 1: Create the kill modal**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Mvp, MvpActiveKill, MvpDrop, MvpMapMeta, MvpGroupMember, Character } from "@/lib/types";
import { MvpMapPicker } from "./mvp-map-picker";

interface MvpKillModalProps {
  mvp: Mvp;
  mapMeta: MvpMapMeta | undefined;
  drops: MvpDrop[];
  existingKill: MvpActiveKill | null; // null = new kill, non-null = edit
  groupMembers: MvpGroupMember[];
  characters: Character[];
  selectedCharId: string | null;
  isGroupMode: boolean;
  initialTime: string | null; // null = empty (user fills), "now" = current time
  onConfirm: (data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    selectedLoots: { itemId: number; itemName: string }[];
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatRespawn(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `${h}h${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export function MvpKillModal({
  mvp,
  mapMeta,
  drops,
  existingKill,
  groupMembers,
  characters,
  selectedCharId,
  isGroupMode,
  initialTime,
  onConfirm,
  onDelete,
  onClose,
}: MvpKillModalProps) {
  const isEdit = !!existingKill;

  // Time state
  const [timeStr, setTimeStr] = useState(() => {
    if (existingKill) return formatTimeInput(new Date(existingKill.killed_at));
    if (initialTime === "now") return formatTimeInput(new Date());
    return "";
  });

  // Coordinates
  const [tombX, setTombX] = useState<number | null>(existingKill?.tomb_x ?? null);
  const [tombY, setTombY] = useState<number | null>(existingKill?.tomb_y ?? null);

  // Killer (toggle: click to select, click again to deselect)
  const [killerId, setKillerId] = useState<string | null>(
    existingKill?.killer_character_id ?? (isGroupMode ? null : selectedCharId)
  );

  // Loots
  const mvpDrops = drops.filter((d) => d.mvp_monster_id === mvp.monster_id);
  const [selectedLoots, setSelectedLoots] = useState<Set<number>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [showConflict, setShowConflict] = useState(false);

  // Check for active timer conflict (only for new kills)
  useEffect(() => {
    if (!existingKill && existingKill === null) {
      // Parent should pass conflict info - for now just show if existingKill was passed as conflict
    }
  }, [existingKill]);

  const handleCoordsChange = useCallback((x: number | null, y: number | null) => {
    setTombX(x);
    setTombY(y);
  }, []);

  const toggleLoot = (itemId: number) => {
    setSelectedLoots((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!timeStr) return;

    // Build killed_at timestamp from time string
    const [hours, minutes] = timeStr.split(":").map(Number);
    const killedAt = new Date();
    killedAt.setHours(hours, minutes, 0, 0);
    // If time is in the future, assume yesterday
    if (killedAt.getTime() > Date.now()) {
      killedAt.setDate(killedAt.getDate() - 1);
    }

    setSubmitting(true);
    try {
      await onConfirm({
        killedAt: killedAt.toISOString(),
        tombX,
        tombY,
        killerCharacterId: killerId,
        selectedLoots: [...selectedLoots].map((itemId) => {
          const drop = mvpDrops.find((d) => d.item_id === itemId);
          return { itemId, itemName: drop?.item_name ?? `Item #${itemId}` };
        }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Resolve character names for group members
  const charMap = new Map(characters.map((c) => [c.id, c]));

  // Killer candidates: in group mode, all group member characters. In solo, just the selected char.
  const killerCandidates = isGroupMode
    ? groupMembers.map((m) => {
        const char = charMap.get(m.character_id);
        return char ? { id: char.id, name: char.name, username: m.user_id } : null;
      }).filter(Boolean) as { id: string; name: string; username: string }[]
    : selectedCharId
      ? [{ id: selectedCharId, name: charMap.get(selectedCharId)?.name ?? "?", username: "" }]
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg w-full max-w-[420px] max-h-[90vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-[15px] font-semibold text-text-primary">{mvp.name}</h3>
              <p className="text-[11px] text-text-secondary">
                {mvp.map_name} · Respawn: {formatRespawn(mvp.respawn_ms)}
              </p>
            </div>
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-lg cursor-pointer">×</button>
          </div>

          {/* Map */}
          <MvpMapPicker
            mapName={mvp.map_name}
            mapMeta={mapMeta}
            tombX={tombX}
            tombY={tombY}
            onCoordsChange={handleCoordsChange}
          />

          {/* Time / X / Y — tab navigable row */}
          <div className="flex gap-2 mt-3 mb-4">
            <div className="flex-1">
              <label className="text-[9px] text-text-secondary font-semibold">HORA</label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                tabIndex={1}
                className="w-full bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="w-[70px]">
              <label className="text-[9px] text-text-secondary font-semibold">X</label>
              <input
                type="number"
                value={tombX ?? ""}
                onChange={(e) => setTombX(e.target.value ? Number(e.target.value) : null)}
                tabIndex={2}
                className="w-full bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="w-[70px]">
              <label className="text-[9px] text-text-secondary font-semibold">Y</label>
              <input
                type="number"
                value={tombY ?? ""}
                onChange={(e) => setTombY(e.target.value ? Number(e.target.value) : null)}
                tabIndex={3}
                className="w-full bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Killer */}
          <div className="mb-3">
            <p className="text-[10px] text-text-secondary font-semibold mb-1">
              {isGroupMode ? "KILLER" : "EU MATEI"}
            </p>
            <div className="flex flex-wrap gap-1">
              {killerCandidates.map((c) => {
                const isSelected = killerId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setKillerId(isSelected ? null : c.id)}
                    className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] border border-primary text-text-primary"
                        : "bg-surface border border-border text-text-secondary hover:border-primary"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loot */}
          {mvpDrops.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-text-secondary font-semibold mb-1">LOOT <span className="font-normal">(opcional)</span></p>
              <div className="flex flex-wrap gap-1">
                {mvpDrops.map((drop) => {
                  const isSelected = selectedLoots.has(drop.item_id);
                  return (
                    <button
                      key={drop.item_id}
                      type="button"
                      onClick={() => toggleLoot(drop.item_id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] border border-status-available text-status-available-text"
                          : "bg-surface border border-border text-text-secondary hover:border-primary"
                      }`}
                    >
                      {drop.item_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between items-center pt-3 border-t border-border">
            <div>
              {isEdit && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={submitting}
                  className="text-xs text-status-error-text hover:opacity-80 cursor-pointer disabled:opacity-50"
                >
                  Excluir
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-text-secondary border border-border rounded-md hover:text-text-primary cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!timeStr || submitting}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEdit ? "Salvar" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-kill-modal.tsx
git commit -m "feat: add MvpKillModal with map, time, coords, killer, loot"
```

---

### Task 3: Add kill CRUD methods to useMvpTimers

**Files:**
- Modify: `src/hooks/use-mvp-timers.ts`

- [ ] **Step 1: Add registerKill, editKill, deleteKill methods**

Add these methods inside `useMvpTimers`, before the return statement. Also update the return type interface and return object.

Update the interface at the top:
```typescript
interface UseMvpTimersReturn {
  activeKills: MvpActiveKill[];
  loading: boolean;
  refetch: () => Promise<void>;
  registerKill: (data: {
    mvpId: number;
    groupId: string | null;
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    registeredBy: string;
    loots: { itemId: number; itemName: string }[];
  }) => Promise<void>;
  editKill: (killId: string, data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    editedBy: string;
  }) => Promise<void>;
  deleteKill: (killId: string) => Promise<void>;
}
```

Add the methods before the return:
```typescript
  const registerKill = useCallback(async (data: {
    mvpId: number;
    groupId: string | null;
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    registeredBy: string;
    loots: { itemId: number; itemName: string }[];
  }) => {
    const supabase = createClient();
    const { data: kill, error } = await supabase
      .from("mvp_kills")
      .insert({
        mvp_id: data.mvpId,
        group_id: data.groupId,
        killed_at: data.killedAt,
        tomb_x: data.tombX,
        tomb_y: data.tombY,
        killer_character_id: data.killerCharacterId,
        registered_by: data.registeredBy,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Insert loots
    if (data.loots.length > 0) {
      await supabase.from("mvp_kill_loots").insert(
        data.loots.map((l) => ({
          kill_id: kill.id,
          item_id: l.itemId,
          item_name: l.itemName,
        }))
      );
    }

    await fetchKills();
  }, [fetchKills]);

  const editKill = useCallback(async (killId: string, data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    editedBy: string;
  }) => {
    const supabase = createClient();
    await supabase.from("mvp_kills").update({
      killed_at: data.killedAt,
      tomb_x: data.tombX,
      tomb_y: data.tombY,
      killer_character_id: data.killerCharacterId,
      edited_by: data.editedBy,
      updated_at: new Date().toISOString(),
    }).eq("id", killId);
    await fetchKills();
  }, [fetchKills]);

  const deleteKill = useCallback(async (killId: string) => {
    const supabase = createClient();
    await supabase.from("mvp_kills").delete().eq("id", killId);
    await fetchKills();
  }, [fetchKills]);
```

Update the return:
```typescript
  return { activeKills, loading, refetch: fetchKills, registerKill, editKill, deleteKill };
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-mvp-timers.ts
git commit -m "feat: add registerKill, editKill, deleteKill to useMvpTimers"
```

---

### Task 4: Add action buttons to timer row

**Files:**
- Modify: `src/components/mvp/mvp-timer-row.tsx`

- [ ] **Step 1: Add onEdit callback prop and edit button**

Update the props interface:
```typescript
interface MvpTimerRowProps {
  mvp: Mvp;
  kill: MvpActiveKill | null;
  onEdit?: (mvp: Mvp, kill: MvpActiveKill) => void;
}
```

Update the function signature:
```typescript
export function MvpTimerRow({ mvp, kill, onEdit }: MvpTimerRowProps)
```

Add an edit button after the countdown span, before the closing `</div>` of the outer container:
```tsx
      {onEdit && kill && (
        <button
          onClick={() => onEdit(mvp, kill)}
          className="text-[10px] text-text-secondary hover:text-primary cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          title="Editar"
        >
          ✎
        </button>
      )}
```

Also add `group` to the outer div className:
```tsx
      className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border"
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-timer-row.tsx
git commit -m "feat: add edit button to MvpTimerRow"
```

---

### Task 5: Wire kill actions into timer list

**Files:**
- Modify: `src/components/mvp/mvp-timer-list.tsx`

- [ ] **Step 1: Add callback props and wire them**

Update the props interface:
```typescript
interface MvpTimerListProps {
  mvps: Mvp[];
  activeKills: MvpActiveKill[];
  search: string;
  loading: boolean;
  onKillNow?: (mvp: Mvp) => void;
  onKillSetTime?: (mvp: Mvp) => void;
  onEdit?: (mvp: Mvp, kill: MvpActiveKill) => void;
}
```

Update the function signature to destructure new props:
```typescript
export function MvpTimerList({ mvps, activeKills, search, loading, onKillNow, onKillSetTime, onEdit }: MvpTimerListProps)
```

Pass `onEdit` to `MvpTimerRow`:
```tsx
<MvpTimerRow key={mvp.id} mvp={mvp} kill={kill} onEdit={onEdit} />
```

Add action icons to inactive MVP chips. Replace the existing inactive button with:
```tsx
{inactive.map((mvp) => (
  <div key={mvp.id} className="group/chip inline-flex items-center gap-0.5">
    <button
      onClick={() => onKillNow?.(mvp)}
      className="pl-2 py-1 text-[10px] bg-surface border border-border border-r-0 rounded-l text-text-secondary hover:border-primary hover:text-text-primary transition-colors cursor-pointer"
      title="Matei agora"
    >
      ⚔
    </button>
    <button
      onClick={() => onKillSetTime?.(mvp)}
      className="pr-2 py-1 text-[10px] bg-surface border border-border rounded-r text-text-secondary hover:border-primary hover:text-text-primary transition-colors cursor-pointer"
      title="Informar horário"
    >
      {mvp.name} ({mvp.map_name})
    </button>
  </div>
))}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-timer-list.tsx
git commit -m "feat: wire kill action callbacks into MvpTimerList"
```

---

### Task 6: Wire everything together in MvpTab

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx`

- [ ] **Step 1: Add modal state and handlers**

Update imports:
```typescript
import { useState, useCallback } from "react";
import type { Account, Character, Mvp, MvpActiveKill } from "@/lib/types";
import { useMvpData } from "@/hooks/use-mvp-data";
import { useMvpGroups } from "@/hooks/use-mvp-groups";
import { useMvpTimers } from "@/hooks/use-mvp-timers";
import { MvpTimerList } from "./mvp-timer-list";
import { MvpKillModal } from "./mvp-kill-modal";
```

Add state after the existing state declarations:
```typescript
  const [modalMvp, setModalMvp] = useState<Mvp | null>(null);
  const [modalKill, setModalKill] = useState<MvpActiveKill | null>(null);
  const [modalInitialTime, setModalInitialTime] = useState<string | null>(null);
```

Add handlers:
```typescript
  const handleKillNow = useCallback((mvp: Mvp) => {
    // Check for conflict
    const existing = activeKills.find((k) => k.mvp_id === mvp.id);
    if (existing) {
      const spawnStart = new Date(existing.killed_at).getTime() + mvp.respawn_ms;
      if (Date.now() < spawnStart + 30 * 60 * 1000) {
        if (!window.confirm(`Este MVP já tem timer ativo. Substituir?`)) return;
      }
    }
    setModalMvp(mvp);
    setModalKill(null);
    setModalInitialTime("now");
  }, [activeKills]);

  const handleKillSetTime = useCallback((mvp: Mvp) => {
    const existing = activeKills.find((k) => k.mvp_id === mvp.id);
    if (existing) {
      const spawnStart = new Date(existing.killed_at).getTime() + mvp.respawn_ms;
      if (Date.now() < spawnStart + 30 * 60 * 1000) {
        if (!window.confirm(`Este MVP já tem timer ativo. Substituir?`)) return;
      }
    }
    setModalMvp(mvp);
    setModalKill(null);
    setModalInitialTime(null);
  }, [activeKills]);

  const handleEdit = useCallback((mvp: Mvp, kill: MvpActiveKill) => {
    setModalMvp(mvp);
    setModalKill(kill);
    setModalInitialTime(null);
  }, []);

  const handleConfirmKill = useCallback(async (data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    selectedLoots: { itemId: number; itemName: string }[];
  }) => {
    if (!modalMvp || !selectedCharId) return;

    if (modalKill) {
      // Edit
      await editKill(modalKill.kill_id, {
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        editedBy: selectedCharId,
      });
    } else {
      // New kill
      await registerKill({
        mvpId: modalMvp.id,
        groupId: group?.id ?? null,
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        registeredBy: selectedCharId,
        loots: data.selectedLoots,
      });
    }
    setModalMvp(null);
  }, [modalMvp, modalKill, selectedCharId, group, registerKill, editKill]);

  const handleDeleteKill = useCallback(async () => {
    if (!modalKill) return;
    await deleteKill(modalKill.kill_id);
    setModalMvp(null);
  }, [modalKill, deleteKill]);
```

Destructure new methods from hooks:
```typescript
  const { activeKills, loading: killsLoading, registerKill, editKill, deleteKill } = useMvpTimers(group?.id ?? null, serverId);
  const { mvps, mapMeta, drops, loading: mvpLoading } = useMvpData(serverId);
```

Update the MvpTimerList usage to pass callbacks:
```tsx
      <MvpTimerList
        mvps={mvps}
        activeKills={activeKills}
        search={search}
        loading={loading}
        onKillNow={handleKillNow}
        onKillSetTime={handleKillSetTime}
        onEdit={handleEdit}
      />
```

Add the modal at the end, before the closing `</div>`:
```tsx
      {/* Kill modal */}
      {modalMvp && (
        <MvpKillModal
          mvp={modalMvp}
          mapMeta={mapMeta.get(modalMvp.map_name)}
          drops={drops}
          existingKill={modalKill}
          groupMembers={members}
          characters={characters}
          selectedCharId={selectedCharId}
          isGroupMode={!!group}
          initialTime={modalInitialTime}
          onConfirm={handleConfirmKill}
          onDelete={modalKill ? handleDeleteKill : undefined}
          onClose={() => setModalMvp(null)}
        />
      )}
```

Also need to get `members` from `useMvpGroups`:
```typescript
  const { group, members, loading: groupLoading } = useMvpGroups(selectedCharId);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: wire kill modal into MvpTab with register/edit/delete"
```

---

### Task 7: Build verification

- [ ] **Step 1: Run build**

```bash
npm run build
```

- [ ] **Step 2: Push to production**

```bash
git push origin main
```

- [ ] **Step 3: Manual verification checklist**

- Clicking "MVPs" tab shows timer list
- Inactive MVP chips show ⚔ icon on the left
- Clicking ⚔ opens kill modal with current time pre-filled
- Clicking MVP name opens modal with empty time
- Modal shows map image for the MVP's map
- Clicking on map plots a dot and fills X/Y inputs
- Typing X/Y updates the dot on the map
- Killer badges: click to select, click again to deselect
- Loot chips: click to toggle
- "Confirmar" creates the kill and timer appears in ATIVOS
- Edit button (✎) on active timer rows opens pre-filled modal
- "Excluir" in edit mode deletes the kill
- Conflict warning when registering kill on MVP with active timer
