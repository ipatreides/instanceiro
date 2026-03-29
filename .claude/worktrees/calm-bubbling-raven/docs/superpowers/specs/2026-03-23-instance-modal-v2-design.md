# Instance Modal v2 — Design Spec

**Date:** 2026-03-23
**Status:** Approved
**Goal:** Redesign the instance modal to support party-based completion with own characters + friend invites, notifications, and a cleaner layout with tabs.

---

## Overview

The current instance modal grew organically and has too many sections stacked vertically without clear hierarchy. The redesign:

1. Adds tabs (Detalhes | Histórico) to split content
2. Replaces the separate "Agendar com amigos" + "Amigos" sections with a unified **Participantes** list
3. Allows adding own characters and inviting friends directly in the modal
4. On "Marcar agora", marks own characters and sends notifications to friends
5. Persists party composition in `instance_parties` for future analytics
6. Adds a notification system (bell icon + dropdown) for friend confirmations

---

## Tab: Detalhes

### 1. Header

- Instance name (h2)
- Eye icon toggle (active/inactive) — existing
- Close button (×)

### 2. Badges (all inline)

All as small rounded pills in a flex-wrap row:

- Nível (e.g., "Nv. 50+")
- Dificuldade (colored: easy/normal/hard/extreme)
- Solo / Party (e.g., "2+ jogadores")
- Mapa (e.g., "Alberta") — gold text
- Cooldown compartilhado — purple, only if `mutual_exclusion_group`
- Liga tier + coins — amber, only if `liga_tier`
- Recompensa — **new as badge**, e.g., "Batalha contra MVPs" (was a paragraph)
- bROWiki link — blue, external link

### 3. Participantes (ephemeral list)

The list starts empty each time the modal opens. User builds it by adding own characters and/or inviting friends.

#### Own characters section

- Shows characters already added to the list with ✕ remove button
- Button: **"+ Adicionar personagem"** — opens a dropdown/popover listing own characters that have this instance (active or not, available or cooldown — all eligible to be added). Characters already in the list are excluded.
- Each character row shows: name, class, level

#### Friends section

- Input field: **"Convidar amigo..."** — filters friends who have this instance registered (active or not, regardless of status). Uses existing `getEligibleFriends` RPC.
- **Available friends** appear first — clickable, adds to participant list
- **Friends on cooldown** appear below with orange dot indicator — still clickable (the notification will ask them to confirm, which is the whole point: "did you also do this?")
- Once invited (added to list), friend appears in the participant list with ✕ remove button
- Each friend row shows: avatar, character name, class, level, @username

### 4. Footer (sticky, Modal footer prop)

Three actions:

- **"Marcar agora"** (primary green button) — executes the completion flow for all participants
- **Clock icon button** — opens datetime-local input for choosing a past custom time
- **"Agendar"** button — opens ScheduleForm modal (existing flow, schedules for future)

"Marcar agora" is disabled when participant list is empty (no own characters added).

---

## Tab: Histórico

Moved from the main tab. Shows history for **all own characters** that have completions for this instance.

- List of `instance_completions` for all own characters on this instance, ordered by date desc
- Each row: character name label + formatted date (clickable to edit via datetime-local inline)
- If completion has `party_id`, show a small group icon to indicate party completion
- Most recent completion per character has a "Remover" button
- Shows "Nenhuma conclusão registrada." when empty

---

## "Marcar agora" Flow

When user clicks "Marcar agora":

1. **Create `instance_party`** — insert row with `instance_id`, `completed_at` (now or custom time), `created_by` (current user)

2. **For each own character in the list:**
   - Insert `instance_party_members` with `status: 'confirmed'`
   - Insert `instance_completions` (marks cooldown immediately)

3. **For each friend character in the list:**
   - Insert `instance_party_members` with `status: 'pending'`
   - Insert `notifications` for the friend's `user_id` with type `party_confirm` and payload containing party_id, instance_name, invited_by username, character_id

4. **Close modal**

All inserts happen in a single RPC call (`complete_instance_party`) for atomicity.

---

## Notification System

### Database: `notifications` table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid FK → auth.users | recipient |
| type | text | notification type, e.g., `party_confirm` |
| payload | jsonb | type-specific data |
| is_read | boolean | default false |
| responded | boolean | default false |
| expires_at | timestamptz | default now() + interval '7 days' |
| created_at | timestamptz | default now() |

> `is_read` instead of `read` to avoid SQL reserved word. Notifications expire after 7 days — expired unresponded notifications are treated as implicitly declined.

**`party_confirm` payload:**
```json
{
  "party_id": "uuid",
  "instance_name": "Torre sem Fim",
  "invited_by": "ceceu",
  "character_id": "uuid",
  "character_name": "Teste1",
  "completed_at": "2026-03-23T21:00:00-03:00"
}
```

### UI: Bell icon + dropdown

- **Location:** Dashboard header, between friend icon and "Sair" button
- **Bell icon** with red badge showing count of unread notifications
- **Click** opens a dropdown (similar to friends sidebar but lighter — no overlay on desktop, overlay on mobile)
- **Each notification row:**
  - Avatar of inviter
  - Text: "@ceceu perguntou se você fez **Torre sem Fim** com **CharName**"
  - Two buttons: **"Sim"** (green) / **"Não"** (gray)
  - After responding, row shows result ("Confirmado" / "Recusado") and fades

### Response flow

**"Sim":**
1. Update `instance_party_members` set `status = 'accepted'`
2. Insert `instance_completions` for the character with the party's `completed_at`
3. Mark notification as `responded = true`

**"Não":**
1. Update `instance_party_members` set `status = 'declined'`
2. Mark notification as `responded = true`

### Realtime

Subscribe to `notifications` table filtered by `user_id` for live updates (new notifications appear without refresh).

### Hook: `useNotifications`

```typescript
interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  respondToPartyConfirm: (notificationId: string, accepted: boolean) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
}
```

---

## Database: Party tables

### `instance_parties`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | default gen_random_uuid() |
| instance_id | int FK → instances | which instance |
| completed_at | timestamptz | when the party did it |
| created_by | uuid FK → auth.users | who initiated |
| created_at | timestamptz | default now() |

### `instance_party_members`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | default gen_random_uuid() |
| party_id | uuid FK → instance_parties | parent party |
| character_id | uuid FK → characters | which character |
| user_id | uuid FK → auth.users | owner of character |
| status | text | `confirmed`, `pending`, `accepted`, `declined` |
| created_at | timestamptz | default now() |

### Schema change: `instance_completions`

Add optional column to existing table:

| Column | Type | Description |
|--------|------|-------------|
| party_id | uuid FK → instance_parties NULL | links completion to party (NULL for solo) |

This enables future analytics (which completions came from parties vs solo).

### RLS policies

- `instance_parties`: users can read parties they created or are a member of
- `instance_party_members`: users can read members of parties they belong to
- `notifications`: users can only read/update their own notifications

### RPC: `complete_instance_party`

Security definer function that atomically:
1. Validates ownership: all `p_own_character_ids` must belong to `auth.uid()`, all friend entries must have matching `character_id → user_id` in the `characters` table
2. Creates the party
3. Inserts party members
4. Inserts completions for confirmed members (with `party_id` reference)
5. Creates notifications for pending members
6. Raises exception on any validation failure

Parameters:
```sql
p_instance_id int,
p_completed_at timestamptz,
p_own_character_ids uuid[],   -- validated as auth.uid() owned, marked confirmed
p_friends jsonb               -- [{"character_id": "...", "user_id": "..."}, ...]
```

> Uses JSONB array for friends instead of parallel arrays to prevent ordering bugs.

### RPC: `respond_party_notification`

Security definer function that:
1. Validates notification belongs to `auth.uid()` and is not expired
2. Updates party member status
3. If accepted, inserts instance_completion (with `party_id` reference)
4. Marks notification as responded
5. Raises exception if notification not found or unauthorized

Parameters:
```sql
p_notification_id uuid,
p_accepted boolean
```

---

## Component Structure

### Modified components

- **`instance-modal.tsx`** — complete rewrite with tabs, participant list, new footer
- **`dashboard/page.tsx`** — add notification bell, pass new props to modal

### New components

- **`src/components/instances/instance-modal-details.tsx`** — Detalhes tab content
- **`src/components/instances/instance-modal-history.tsx`** — Histórico tab content
- **`src/components/instances/participant-list.tsx`** — Participant list with add/invite/remove
- **`src/components/notifications/notification-bell.tsx`** — Bell icon + dropdown
- **`src/components/notifications/notification-item.tsx`** — Single notification row

### New hooks

- **`src/hooks/use-notifications.ts`** — fetch, subscribe, respond

### New lib

- **`src/lib/format-date.ts`** — already exists, no changes needed

---

## Type Definitions

Add to `src/lib/types.ts`:

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

---

## Testing

### Unit tests

**`src/lib/__tests__/instance-party-logic.test.ts`:**
- Participant list: add own char, add friend, remove, prevent duplicate adds
- "Marcar agora" disabled when no own characters in list
- Friends on cooldown ARE addable (they receive notification)
- isDirty computation for the new modal states (participants added, tab changed)
- Validate that own chars cannot be added if already in list
- Validate that friend entries require both character_id and user_id

**`src/lib/__tests__/notifications-logic.test.ts`:**
- Notification response flow: accept → confirmed status
- Notification response flow: decline → declined status
- Unread count computation (excludes responded and expired)
- Expired notification treated as implicitly declined
- Payload structure validation for `party_confirm` type
- Error handling: respond to already-responded notification

### E2E tests

**`e2e/instance-modal.spec.ts`:**
- Cannot test full flow without auth, but can test:
  - Modal structure renders with tabs (requires auth — test what's accessible)
  - Notification bell is visible in dashboard header

**`e2e/notifications.spec.ts`:**
- Similar auth constraints — test what's accessible without login

> Note: Full integration tests for the party completion + notification flow require authenticated sessions. These should be tested manually or with a seeded test user in a future CI setup. RPC validation logic (ownership checks, expiration) should be tested via Supabase SQL tests or manual verification.

---

## Migration path

1. Create DB tables + RPCs first (Supabase SQL)
2. Build `useNotifications` hook
3. Build notification UI components
4. Rewrite instance modal with tabs + participant list
5. Wire everything in dashboard
6. Write tests
7. Manual testing of full flow

---

## Out of scope (future)

- Auto-suggest frequent party members based on `instance_parties` history
- Statistics/analytics from party data
- Push notifications (browser/mobile)
- Notification preferences (mute, schedule)
