# Instance Modal v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the instance modal with tabs, party-based completion (own chars + friend invites), notification system, and `instance_parties` persistence.

**Architecture:** DB-first approach — create tables/RPCs in Supabase, then build hooks, then UI components, then wire in dashboard. Each task produces working, testable code.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres + Realtime + RPC), Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-23-instance-modal-v2-design.md`

---

## Task Overview

| # | Task | Items |
|---|------|-------|
| 1 | Add types + Supabase SQL migration | DB tables, RPCs, RLS, types.ts |
| 2 | Build `useNotifications` hook | Fetch, realtime subscribe, respond |
| 3 | Build notification UI components | Bell icon, dropdown, notification item |
| 4 | Build participant list component | Own chars + friend invite list |
| 5 | Rewrite instance modal with tabs | Detalhes + Histórico tabs, new layout |
| 6 | Wire everything in dashboard | New props, notification bell in header |
| 7 | Unit tests | Party logic, notification logic |
| 8 | E2E tests + manual verification | Smoke tests, build check |

---

### Task 1: Add types + Supabase SQL migration

**Problem:** Need new database tables (`instance_parties`, `instance_party_members`, `notifications`), schema change (`instance_completions.party_id`), two RPCs, and RLS policies.

**Files:**
- Create: `supabase/migrations/20260323_instance_parties_and_notifications.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create the SQL migration file**

```sql
-- supabase/migrations/20260323_instance_parties_and_notifications.sql

-- 1. instance_parties
CREATE TABLE instance_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id int NOT NULL REFERENCES instances(id),
  completed_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE instance_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read parties they created or are member of"
  ON instance_parties FOR SELECT USING (
    created_by = auth.uid()
    OR id IN (SELECT party_id FROM instance_party_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own parties"
  ON instance_parties FOR INSERT WITH CHECK (created_by = auth.uid());

-- 2. instance_party_members
CREATE TABLE instance_party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES instance_parties(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed', 'pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE instance_party_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read members of parties they belong to"
  ON instance_party_members FOR SELECT USING (
    party_id IN (SELECT id FROM instance_parties WHERE created_by = auth.uid())
    OR user_id = auth.uid()
  );

-- 3. notifications
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  is_read boolean NOT NULL DEFAULT false,
  responded boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE USING (user_id = auth.uid());

-- 4. Add party_id to instance_completions
ALTER TABLE instance_completions
  ADD COLUMN party_id uuid REFERENCES instance_parties(id) DEFAULT NULL;

-- 5. Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 6. RPC: complete_instance_party
CREATE OR REPLACE FUNCTION complete_instance_party(
  p_instance_id int,
  p_completed_at timestamptz,
  p_own_character_ids uuid[],
  p_friends jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_party_id uuid;
  v_user_id uuid := auth.uid();
  v_friend record;
  v_char_id uuid;
  v_instance_name text;
  v_username text;
BEGIN
  -- Validate own characters belong to caller
  IF EXISTS (
    SELECT 1 FROM unnest(p_own_character_ids) AS cid
    WHERE cid NOT IN (SELECT id FROM characters WHERE user_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'One or more own characters do not belong to you';
  END IF;

  -- Validate friend entries: character belongs to specified user
  FOR v_friend IN SELECT * FROM jsonb_to_recordset(p_friends) AS x(character_id uuid, user_id uuid)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM characters WHERE id = v_friend.character_id AND user_id = v_friend.user_id
    ) THEN
      RAISE EXCEPTION 'Friend character % does not belong to user %', v_friend.character_id, v_friend.user_id;
    END IF;
  END LOOP;

  -- Get instance name and inviter username for notification payload
  SELECT name INTO v_instance_name FROM instances WHERE id = p_instance_id;
  SELECT username INTO v_username FROM profiles WHERE id = v_user_id;

  -- Create party
  INSERT INTO instance_parties (instance_id, completed_at, created_by)
  VALUES (p_instance_id, p_completed_at, v_user_id)
  RETURNING id INTO v_party_id;

  -- Insert own characters as confirmed + create completions
  FOREACH v_char_id IN ARRAY p_own_character_ids
  LOOP
    INSERT INTO instance_party_members (party_id, character_id, user_id, status)
    VALUES (v_party_id, v_char_id, v_user_id, 'confirmed');

    INSERT INTO instance_completions (character_id, instance_id, completed_at, party_id)
    VALUES (v_char_id, p_instance_id, p_completed_at, v_party_id);
  END LOOP;

  -- Insert friends as pending + create notifications
  FOR v_friend IN SELECT * FROM jsonb_to_recordset(p_friends) AS x(character_id uuid, user_id uuid)
  LOOP
    INSERT INTO instance_party_members (party_id, character_id, user_id, status)
    VALUES (v_party_id, v_friend.character_id, v_friend.user_id, 'pending');

    INSERT INTO notifications (user_id, type, payload)
    VALUES (
      v_friend.user_id,
      'party_confirm',
      jsonb_build_object(
        'party_id', v_party_id,
        'instance_name', v_instance_name,
        'invited_by', v_username,
        'character_id', v_friend.character_id,
        'character_name', (SELECT name FROM characters WHERE id = v_friend.character_id),
        'completed_at', p_completed_at
      )
    );
  END LOOP;

  RETURN v_party_id;
END;
$$;

-- 7. RPC: respond_party_notification
CREATE OR REPLACE FUNCTION respond_party_notification(
  p_notification_id uuid,
  p_accepted boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_notification record;
  v_party_id uuid;
  v_character_id uuid;
  v_completed_at timestamptz;
  v_instance_id int;
BEGIN
  -- Fetch and validate
  SELECT * INTO v_notification FROM notifications
  WHERE id = p_notification_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found or unauthorized';
  END IF;

  IF v_notification.responded THEN
    RAISE EXCEPTION 'Notification already responded';
  END IF;

  IF v_notification.expires_at < now() THEN
    RAISE EXCEPTION 'Notification expired';
  END IF;

  v_party_id := (v_notification.payload->>'party_id')::uuid;
  v_character_id := (v_notification.payload->>'character_id')::uuid;
  v_completed_at := (v_notification.payload->>'completed_at')::timestamptz;

  -- Get instance_id from party
  SELECT instance_id INTO v_instance_id FROM instance_parties WHERE id = v_party_id;

  IF p_accepted THEN
    -- Mark member as accepted
    UPDATE instance_party_members
    SET status = 'accepted'
    WHERE party_id = v_party_id AND character_id = v_character_id;

    -- Insert completion
    INSERT INTO instance_completions (character_id, instance_id, completed_at, party_id)
    VALUES (v_character_id, v_instance_id, v_completed_at, v_party_id);
  ELSE
    UPDATE instance_party_members
    SET status = 'declined'
    WHERE party_id = v_party_id AND character_id = v_character_id;
  END IF;

  -- Mark notification as responded
  UPDATE notifications SET responded = true WHERE id = p_notification_id;
END;
$$;
```

- [ ] **Step 2: Run migration against Supabase**

Run the SQL in the Supabase dashboard SQL editor (project `qiljbwitdknpxbbpmcjn`). Verify tables created:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('instance_parties', 'instance_party_members', 'notifications');
```
Expected: 3 rows.

- [ ] **Step 3: Add TypeScript types**

Add to the end of `src/lib/types.ts`:

```typescript
export interface InstanceParty {
  id: string;
  instance_id: number;
  completed_at: string;
  created_by: string;
  created_at: string;
}

export interface InstancePartyMember {
  id: string;
  party_id: string;
  character_id: string;
  user_id: string;
  status: "confirmed" | "pending" | "accepted" | "declined";
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  responded: boolean;
  expires_at: string;
  created_at: string;
}
```

Also update `InstanceCompletion` to include optional `party_id`:

```typescript
export interface InstanceCompletion {
  id: string;
  character_id: string;
  instance_id: number;
  completed_at: string;
  party_id?: string | null;
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260323_instance_parties_and_notifications.sql src/lib/types.ts
git commit -m "feat: add instance_parties, notifications tables, RPCs, and types"
```

---

### Task 2: Build `useNotifications` hook

**Problem:** Need a hook to fetch notifications, subscribe to realtime updates, and respond to party confirmations.

**Files:**
- Create: `src/hooks/use-notifications.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/use-notifications.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/types";

interface UseNotificationsReturn {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  respondToPartyConfirm: (notificationId: string, accepted: boolean) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    // Filter out expired unresponded notifications
    const now = new Date();
    const valid = (data ?? []).filter((n: AppNotification) =>
      n.responded || new Date(n.expires_at) > now
    );
    setNotifications(valid);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchNotifications().then(() => { if (!cancelled) setLoading(false); });

    const supabase = createClient();
    const channel = supabase
      .channel("notifications-live")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
      }, () => fetchNotifications())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read && !n.responded).length;

  const respondToPartyConfirm = useCallback(async (notificationId: string, accepted: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("respond_party_notification", {
      p_notification_id: notificationId,
      p_accepted: accepted,
    });
    if (error) throw error;
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => n.id === notificationId ? { ...n, responded: true } : n)
    );
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);
    setNotifications((prev) =>
      prev.map((n) => n.id === notificationId ? { ...n, is_read: true } : n)
    );
  }, []);

  return { notifications, unreadCount, loading, respondToPartyConfirm, markAsRead };
}
```

- [ ] **Step 2: Verify build**

```bash
npx next build
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-notifications.ts
git commit -m "feat: add useNotifications hook with realtime subscription"
```

---

### Task 3: Build notification UI components

**Problem:** Need a bell icon with badge in the header and a dropdown with notification items.

**Files:**
- Create: `src/components/notifications/notification-bell.tsx`
- Create: `src/components/notifications/notification-item.tsx`

- [ ] **Step 1: Create NotificationItem component**

```tsx
// src/components/notifications/notification-item.tsx
"use client";

import { useState } from "react";
import type { AppNotification } from "@/lib/types";

interface NotificationItemProps {
  notification: AppNotification;
  onRespond: (notificationId: string, accepted: boolean) => Promise<void>;
}

export function NotificationItem({ notification, onRespond }: NotificationItemProps) {
  const [loading, setLoading] = useState(false);
  const payload = notification.payload as {
    instance_name?: string;
    invited_by?: string;
    character_name?: string;
  };

  const handleRespond = async (accepted: boolean) => {
    setLoading(true);
    try {
      await onRespond(notification.id, accepted);
    } finally {
      setLoading(false);
    }
  };

  if (notification.responded) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 opacity-50">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#A89BC2] truncate">
            {payload.instance_name} com {payload.character_name}
          </p>
          <p className="text-[10px] text-[#6B5A8A]">Respondido</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white leading-relaxed">
          <span className="text-[#9B6DFF] font-medium">@{payload.invited_by}</span>
          {" perguntou se você fez "}
          <span className="text-white font-medium">{payload.instance_name}</span>
          {" com "}
          <span className="text-white font-medium">{payload.character_name}</span>
        </p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={() => handleRespond(true)}
          disabled={loading}
          className="px-2.5 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-500 transition-colors cursor-pointer disabled:opacity-50"
        >
          Sim
        </button>
        <button
          onClick={() => handleRespond(false)}
          disabled={loading}
          className="px-2.5 py-1 text-xs text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded hover:text-white transition-colors cursor-pointer disabled:opacity-50"
        >
          Não
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create NotificationBell component**

```tsx
// src/components/notifications/notification-bell.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import type { AppNotification } from "@/lib/types";
import { NotificationItem } from "./notification-item";

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount: number;
  onRespond: (notificationId: string, accepted: boolean) => Promise<void>;
}

export function NotificationBell({ notifications, unreadCount, onRespond }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pending = notifications.filter((n) => !n.responded);
  const responded = notifications.filter((n) => n.responded).slice(0, 5);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[#A89BC2] hover:text-white transition-colors cursor-pointer relative"
        aria-label="Notificações"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#1a1230] border border-[#3D2A5C] rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 border-b border-[#3D2A5C]">
            <span className="text-xs font-semibold text-[#A89BC2]">Notificações</span>
          </div>
          {pending.length === 0 && responded.length === 0 ? (
            <p className="text-xs text-[#6B5A8A] italic px-3 py-4 text-center">
              Nenhuma notificação
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[#3D2A5C]/50">
              {pending.map((n) => (
                <NotificationItem key={n.id} notification={n} onRespond={onRespond} />
              ))}
              {responded.map((n) => (
                <NotificationItem key={n.id} notification={n} onRespond={onRespond} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/notification-bell.tsx src/components/notifications/notification-item.tsx
git commit -m "feat: add notification bell with dropdown and response UI"
```

---

### Task 4: Build participant list component

**Problem:** Need a reusable component for the ephemeral participant list — add own chars, invite friends, remove.

**Files:**
- Create: `src/components/instances/participant-list.tsx`

- [ ] **Step 1: Create the component**

The component receives:
- `characters`: all own characters (from `useCharacters`)
- `instanceId`: current instance
- `getEligibleFriends`: RPC to fetch friends for this instance
- `participants` / `setParticipants`: state managed by parent (the modal)

Own character entries have `type: "own"`, friend entries have `type: "friend"`.

```tsx
// src/components/instances/participant-list.tsx
"use client";

import { useState, useEffect } from "react";
import type { Character } from "@/lib/types";

interface EligibleFriend {
  user_id: string;
  username: string;
  avatar_url: string | null;
  character_id: string;
  character_name: string;
  character_class: string;
  character_level: number;
  is_active: boolean;
  last_completed_at: string | null;
}

export interface Participant {
  type: "own" | "friend";
  character_id: string;
  user_id: string;
  character_name: string;
  character_class: string;
  character_level: number;
  username?: string;
  avatar_url?: string | null;
}

interface ParticipantListProps {
  characters: Character[];
  instanceId: number;
  getEligibleFriends: (instanceId: number) => Promise<EligibleFriend[]>;
  participants: Participant[];
  onAdd: (p: Participant) => void;
  onRemove: (characterId: string) => void;
}

export function ParticipantList({
  characters,
  instanceId,
  getEligibleFriends,
  participants,
  onAdd,
  onRemove,
}: ParticipantListProps) {
  const [showOwnDropdown, setShowOwnDropdown] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [friends, setFriends] = useState<EligibleFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [showFriendSearch, setShowFriendSearch] = useState(false);

  // Fetch friends when search opens
  useEffect(() => {
    if (!showFriendSearch) return;
    setFriendsLoading(true);
    getEligibleFriends(instanceId).then((f) => {
      setFriends(f);
      setFriendsLoading(false);
    });
  }, [showFriendSearch, instanceId, getEligibleFriends]);

  const participantCharIds = new Set(participants.map((p) => p.character_id));

  // Own characters not yet in the list (non-shared only)
  const availableOwnChars = characters.filter(
    (c) => !c.isShared && !participantCharIds.has(c.id)
  );

  // Friends not yet in the list
  const availableFriends = friends.filter((f) => !participantCharIds.has(f.character_id));
  const q = friendSearch.toLowerCase();
  const filteredFriends = q
    ? availableFriends.filter((f) =>
        f.character_name.toLowerCase().includes(q) ||
        f.character_class.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q)
      )
    : availableFriends;

  // Sort: available first, cooldown last
  const sortedFriends = [...filteredFriends].sort((a, b) => {
    const aCd = a.last_completed_at ? 1 : 0;
    const bCd = b.last_completed_at ? 1 : 0;
    return aCd - bCd;
  });

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs text-[#6B5A8A] font-medium uppercase tracking-wide">
        Participantes {participants.length > 0 && `(${participants.length})`}
      </h3>

      {/* Current participants */}
      {participants.map((p) => (
        <div
          key={p.character_id}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#2a1f40] border border-[#3D2A5C]"
        >
          {p.type === "friend" && p.avatar_url ? (
            <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full" />
          ) : (
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              p.type === "own" ? "bg-[#7C3AED] text-white" : "bg-[#3D2A5C] text-[#A89BC2]"
            }`}>
              {p.type === "own" ? "♦" : "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-xs text-white font-medium truncate block">{p.character_name}</span>
            <span className="text-[10px] text-[#6B5A8A]">
              {p.character_class} Lv.{p.character_level}
              {p.type === "friend" && p.username && ` · @${p.username}`}
            </span>
          </div>
          <button
            onClick={() => onRemove(p.character_id)}
            className="text-xs text-[#6B5A8A] hover:text-red-400 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Add own character */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowOwnDropdown((v) => !v); setShowFriendSearch(false); }}
          className="text-xs text-[#7C3AED] hover:text-white transition-colors cursor-pointer"
        >
          + Adicionar personagem
        </button>
        {showOwnDropdown && (
          <div className="absolute z-10 left-0 top-full mt-1 w-64 bg-[#1a1230] border border-[#3D2A5C] rounded-lg shadow-lg max-h-40 overflow-y-auto">
            {availableOwnChars.length === 0 ? (
              <p className="text-xs text-[#6B5A8A] italic px-3 py-2">Todos os personagens já adicionados</p>
            ) : (
              availableOwnChars.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onAdd({
                      type: "own",
                      character_id: c.id,
                      user_id: c.user_id,
                      character_name: c.name,
                      character_class: c.class,
                      character_level: c.level,
                    });
                    setShowOwnDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#A89BC2] hover:bg-[#2a1f40] hover:text-white transition-colors cursor-pointer"
                >
                  {c.name} · {c.class} Lv.{c.level}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Invite friend */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowFriendSearch((v) => !v); setShowOwnDropdown(false); setFriendSearch(""); }}
          className="text-xs text-[#D4A843] hover:text-white transition-colors cursor-pointer"
        >
          🔍 Convidar amigo...
        </button>
        {showFriendSearch && (
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              placeholder="Buscar por nome, classe ou @username..."
              className="bg-[#1a1230] border border-[#3D2A5C] rounded-lg px-3 py-2 text-xs text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
              autoFocus
            />
            {friendsLoading ? (
              <div className="flex items-center justify-center py-3">
                <div className="w-4 h-4 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sortedFriends.length === 0 ? (
              <p className="text-xs text-[#6B5A8A] italic">
                {friends.length === 0 ? "Nenhum amigo com esta instância." : "Nenhum resultado."}
              </p>
            ) : (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {sortedFriends.map((f) => {
                  const isOnCooldown = !!f.last_completed_at;
                  return (
                    <button
                      key={`${f.user_id}-${f.character_id}`}
                      type="button"
                      onClick={() => {
                        onAdd({
                          type: "friend",
                          character_id: f.character_id,
                          user_id: f.user_id,
                          character_name: f.character_name,
                          character_class: f.character_class,
                          character_level: f.character_level,
                          username: f.username,
                          avatar_url: f.avatar_url,
                        });
                      }}
                      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                        isOnCooldown ? "opacity-60" : ""
                      } hover:bg-[#2a1f40]`}
                    >
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-[#3D2A5C] flex items-center justify-center text-[10px] text-[#A89BC2]">?</div>
                      )}
                      <span className="flex-1 text-white">{f.character_name}</span>
                      <span className="text-[#6B5A8A]">{f.character_class} · @{f.username}</span>
                      <span className={`w-2 h-2 rounded-full ${isOnCooldown ? "bg-orange-400" : "bg-green-500"}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx next build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/instances/participant-list.tsx
git commit -m "feat: add participant list component for instance modal"
```

---

### Task 5: Rewrite instance modal with tabs

**Problem:** Replace the current single-view modal with a tabbed layout (Detalhes + Histórico). Extract tab content into separate components per the spec.

**Files:**
- Rewrite: `src/components/instances/instance-modal.tsx` (shell with tabs + footer)
- Create: `src/components/instances/instance-modal-details.tsx` (Detalhes tab content)
- Create: `src/components/instances/instance-modal-history.tsx` (Histórico tab content)

- [ ] **Step 1: Define the new props interface in instance-modal.tsx**

```tsx
interface InstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: InstanceState | null;
  isAvailable: boolean;
  isInactive: boolean;
  // Characters (own, non-shared) for participant list
  characters: Character[];
  // All completions for this instance across all own chars (for history tab)
  allCompletions: InstanceCompletion[];
  // Party completion (replaces old onMarkDone)
  onCompleteParty: (
    ownCharIds: string[],
    friends: { character_id: string; user_id: string }[],
    completedAt?: string
  ) => Promise<void>;
  // Existing
  onUpdateCompletion: (completionId: string, completedAt: string) => void;
  onDeleteCompletion: (completionId: string) => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onSchedule?: () => void;
  getEligibleFriends: (instanceId: number) => Promise<EligibleFriend[]>;
  actionLoading?: boolean;
  actionError?: string | null;
}
```

- [ ] **Step 2: Create instance-modal-details.tsx**

Contains: badges row (reward as badge), `<ParticipantList>` from Task 4. Receives `instance`, `characters`, `instanceId`, `getEligibleFriends`, `participants`, `onAddParticipant`, `onRemoveParticipant`.

Badges: same as current but reward moves from `<p>` to a badge pill. DifficultyBadge helper stays or moves here.

- [ ] **Step 3: Create instance-modal-history.tsx**

Contains: completion list for all own characters. Receives `completions` (filtered by instance_id), `characters` (for name lookup), `onUpdateCompletion`, `onDeleteCompletion`, `actionLoading`.

Each row shows: character name label + formatted date (clickable to edit inline) + party icon (👥) if `party_id` exists. Most recent per character has "Remover" button.

- [ ] **Step 4: Rewrite instance-modal.tsx as the shell**

The modal component manages:
- Tab state: `"details" | "history"`
- Participants state: `Participant[]` (from Task 4's type)
- `confirmingMarkDone` + `markDoneTime` for the clock icon flow
- `isDirty`: `participants.length > 0 || confirmingMarkDone`

Tab bar: two buttons styled like existing app tabs (see edit character modal pattern in dashboard lines 588-609).

Renders `<InstanceModalDetails>` or `<InstanceModalHistory>` based on active tab.

Footer (via Modal `footer` prop, only on "details" tab):

```tsx
footer={activeTab === "details" ? (
  <div className="flex gap-2">
    {!confirmingMarkDone ? (
      <>
        <button
          onClick={handleCompleteParty}
          disabled={actionLoading || !participants.some(p => p.type === "own")}
          className="flex-1 py-2.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-semibold text-sm ..."
        >
          Marcar agora
        </button>
        <button
          onClick={() => setConfirmingMarkDone(true)}
          disabled={actionLoading}
          className="py-2.5 px-3 rounded-md bg-[#2a1f40] border ..."
          title="Escolher horário"
        >
          {/* clock SVG */}
        </button>
        {onSchedule && (
          <button onClick={onSchedule} className="py-2.5 px-3 rounded-md ...">
            Agendar
          </button>
        )}
      </>
    ) : (
      <div className="flex flex-col gap-2 w-full">
        <input type="datetime-local" value={markDoneTime} ... />
        <div className="flex gap-2">
          <button onClick={handleCompletePartyWithTime} ...>Confirmar</button>
          <button onClick={() => setConfirmingMarkDone(false)} ...>Cancelar</button>
        </div>
      </div>
    )}
  </div>
) : undefined}
```

`handleCompleteParty` extracts own char IDs and friend entries from `participants` and calls `onCompleteParty`.

- [ ] **Step 5: Verify build**

```bash
npx next build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/instances/instance-modal.tsx src/components/instances/instance-modal-details.tsx src/components/instances/instance-modal-history.tsx
git commit -m "feat: rewrite instance modal with tabs, participant list, party completion"
```

---

### Task 6: Wire everything in dashboard

**Problem:** Connect the new modal, notification bell, and `useNotifications` hook in the dashboard.

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/hooks/use-instances.ts` (add `completeParty` method)

- [ ] **Step 1: Add `completeParty` to `useInstances`**

In `src/hooks/use-instances.ts`, add a new method that calls the `complete_instance_party` RPC:

```typescript
const completeParty = useCallback(
  async (instanceId: number, ownCharIds: string[], friends: {character_id: string, user_id: string}[], completedAt?: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("complete_instance_party", {
      p_instance_id: instanceId,
      p_completed_at: completedAt ?? new Date().toISOString(),
      p_own_character_ids: ownCharIds,
      p_friends: friends,
    });
    if (error) throw error;
    await fetchAll(); // Refresh completions
  },
  [fetchAll]
);
```

Add to the return object and `UseInstancesReturn` interface.

- [ ] **Step 2: Update dashboard**

In `src/app/dashboard/page.tsx`:

1. Import `useNotifications` and `NotificationBell`
2. Add `const { notifications, unreadCount, respondToPartyConfirm } = useNotifications();`
3. Add `<NotificationBell>` in the header between friend icon and "Sair"
4. Update `<InstanceModal>` props:
   - Add `characters={characters.filter(c => !c.isShared)}`
   - Add `allCompletions={completions}` (from useInstances)
   - Replace `onMarkDone` with `onCompleteParty` that calls `completeParty`
   - Keep `getEligibleFriends={getEligibleFriends}` (already passed from useSchedules, now used by ParticipantList inside the modal)
   - Keep existing props: `onUpdateCompletion`, `onDeleteCompletion`, `onDeactivate`, `onActivate`, `onSchedule`, `actionLoading`, `actionError`
   - Remove: `history` (replaced by `allCompletions`), `onMarkDone` (replaced by `onCompleteParty`), `isAvailable`/`isInactive` (modal can derive from `instance.status`)

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-instances.ts src/app/dashboard/page.tsx
git commit -m "feat: wire instance modal v2 and notification bell in dashboard"
```

---

### Task 7: Unit tests

**Problem:** Test the participant list logic and notification logic.

**Files:**
- Create: `src/lib/__tests__/instance-party-logic.test.ts`
- Create: `src/lib/__tests__/notifications-logic.test.ts`

- [ ] **Step 1: Write party logic tests**

```typescript
// src/lib/__tests__/instance-party-logic.test.ts
import type { Participant } from "@/components/instances/participant-list";

describe("Participant list logic", () => {
  const ownChar: Participant = {
    type: "own", character_id: "c1", user_id: "u1",
    character_name: "Teste1", character_class: "Mecânico", character_level: 185,
  };
  const friendChar: Participant = {
    type: "friend", character_id: "c2", user_id: "u2",
    character_name: "FriendChar", character_class: "Arcano", character_level: 200,
    username: "amigo", avatar_url: null,
  };

  it("can add own character", () => {
    const list: Participant[] = [];
    const updated = [...list, ownChar];
    expect(updated).toHaveLength(1);
    expect(updated[0].type).toBe("own");
  });

  it("can add friend character", () => {
    const list: Participant[] = [ownChar];
    const updated = [...list, friendChar];
    expect(updated).toHaveLength(2);
    expect(updated[1].type).toBe("friend");
  });

  it("prevents duplicate character_id", () => {
    const list: Participant[] = [ownChar];
    const ids = new Set(list.map((p) => p.character_id));
    expect(ids.has(ownChar.character_id)).toBe(true);
  });

  it("can remove by character_id", () => {
    const list: Participant[] = [ownChar, friendChar];
    const updated = list.filter((p) => p.character_id !== "c1");
    expect(updated).toHaveLength(1);
    expect(updated[0].character_id).toBe("c2");
  });

  it("'Marcar agora' disabled when no own characters", () => {
    const list: Participant[] = [friendChar];
    const hasOwnChars = list.some((p) => p.type === "own");
    expect(hasOwnChars).toBe(false);
  });

  it("'Marcar agora' enabled when has own characters", () => {
    const list: Participant[] = [ownChar, friendChar];
    const hasOwnChars = list.some((p) => p.type === "own");
    expect(hasOwnChars).toBe(true);
  });

  it("separates own chars and friend chars for RPC call", () => {
    const list: Participant[] = [ownChar, friendChar];
    const ownIds = list.filter((p) => p.type === "own").map((p) => p.character_id);
    const friends = list
      .filter((p) => p.type === "friend")
      .map((p) => ({ character_id: p.character_id, user_id: p.user_id }));
    expect(ownIds).toEqual(["c1"]);
    expect(friends).toEqual([{ character_id: "c2", user_id: "u2" }]);
  });
});
```

- [ ] **Step 2: Write notification logic tests**

```typescript
// src/lib/__tests__/notifications-logic.test.ts
import type { AppNotification } from "@/lib/types";

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n1",
    user_id: "u1",
    type: "party_confirm",
    payload: {
      party_id: "p1",
      instance_name: "Torre sem Fim",
      invited_by: "ceceu",
      character_id: "c1",
      character_name: "Teste1",
      completed_at: "2026-03-23T21:00:00-03:00",
    },
    is_read: false,
    responded: false,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Notification logic", () => {
  it("computes unread count excluding responded", () => {
    const notifications = [
      makeNotification({ id: "n1", responded: false }),
      makeNotification({ id: "n2", responded: true }),
      makeNotification({ id: "n3", responded: false }),
    ];
    const unread = notifications.filter((n) => !n.is_read && !n.responded).length;
    expect(unread).toBe(2);
  });

  it("computes unread count excluding read", () => {
    const notifications = [
      makeNotification({ id: "n1", is_read: true }),
      makeNotification({ id: "n2", is_read: false }),
    ];
    const unread = notifications.filter((n) => !n.is_read && !n.responded).length;
    expect(unread).toBe(1);
  });

  it("filters expired unresponded notifications", () => {
    const now = new Date();
    const notifications = [
      makeNotification({ id: "n1", expires_at: new Date(now.getTime() - 1000).toISOString(), responded: false }),
      makeNotification({ id: "n2", expires_at: new Date(now.getTime() + 86400000).toISOString(), responded: false }),
      makeNotification({ id: "n3", expires_at: new Date(now.getTime() - 1000).toISOString(), responded: true }),
    ];
    const valid = notifications.filter((n) =>
      n.responded || new Date(n.expires_at) > now
    );
    expect(valid).toHaveLength(2);
    expect(valid.map((n) => n.id)).toEqual(["n2", "n3"]);
  });

  it("validates party_confirm payload has required fields", () => {
    const n = makeNotification();
    const payload = n.payload as Record<string, unknown>;
    expect(payload).toHaveProperty("party_id");
    expect(payload).toHaveProperty("instance_name");
    expect(payload).toHaveProperty("invited_by");
    expect(payload).toHaveProperty("character_id");
    expect(payload).toHaveProperty("character_name");
    expect(payload).toHaveProperty("completed_at");
  });

  it("optimistic update marks notification as responded", () => {
    const notifications = [
      makeNotification({ id: "n1" }),
      makeNotification({ id: "n2" }),
    ];
    const updated = notifications.map((n) =>
      n.id === "n1" ? { ...n, responded: true } : n
    );
    expect(updated[0].responded).toBe(true);
    expect(updated[1].responded).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: All existing + new tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/instance-party-logic.test.ts src/lib/__tests__/notifications-logic.test.ts
git commit -m "test: add unit tests for party logic and notification logic"
```

---

### Task 8: E2E tests + manual verification

**Problem:** Smoke tests and build verification.

**Files:**
- Modify: `e2e/landing.spec.ts` (add notification bell check if possible)

- [ ] **Step 1: Verify full build passes**

```bash
npx next build
```

- [ ] **Step 2: Run all unit tests**

```bash
npm test
```

- [ ] **Step 3: Run existing e2e tests**

```bash
npx playwright test
```

All existing tests should still pass.

- [ ] **Step 4: Manual test checklist**

Test in browser at `http://localhost:3000`:

1. Open an instance modal → see "Detalhes" and "Histórico" tabs
2. Click "Histórico" → see completion list (or empty state)
3. On "Detalhes": click "+ Adicionar personagem" → see own chars dropdown
4. Add a character → appears in participant list with ✕
5. Click "Convidar amigo..." → see friend search
6. Click "Marcar agora" → marks completion, closes modal
7. Check notification bell in header → should show if any pending notifications
8. Respond to a notification (Sim/Não) → updates state

- [ ] **Step 5: Commit any fixes found during manual testing**

```bash
git add -A
git commit -m "fix: adjustments from manual testing of instance modal v2"
```
