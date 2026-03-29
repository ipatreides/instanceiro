# Schedule Invite Links & External Placeholders

## Summary

Allow schedule creators to generate a shareable invite link (short code) for their schedule, and add placeholder characters for players not yet in the system. When someone opens the invite link, they create an account (or log in), create/select a character, and join the schedule. An accepted friendship is automatically created between the inviter and invitee.

## Database

### New table: `schedule_invites`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| schedule_id | uuid | FK → instance_schedules ON DELETE CASCADE, UNIQUE |
| code | varchar(8) | UNIQUE, NOT NULL |
| created_by | uuid | FK → auth.users |
| created_at | timestamptz | default now() |

One invite per schedule (UNIQUE on schedule_id). Code is 8 alphanumeric chars (a-z, A-Z, 0-9), case-sensitive, ~218 trillion combinations. Cascades on schedule deletion.

### New table: `schedule_placeholders`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| schedule_id | uuid | FK → instance_schedules ON DELETE CASCADE |
| character_name | text | NOT NULL |
| character_class | text | NOT NULL |
| added_by | uuid | FK → auth.users |
| claimed_by | uuid | nullable, FK → auth.users |
| claimed_character_id | uuid | nullable, FK → characters |
| created_at | timestamptz | default now() |

Cascades on schedule deletion. Add to `supabase_realtime` publication for live updates when placeholders are added/claimed.

### RLS Policies

**schedule_invites:**
- SELECT: creator only (`created_by = auth.uid()`). Invite resolution happens via `accept_invite` RPC (SECURITY DEFINER), bypassing RLS.
- INSERT/DELETE: only if `created_by = auth.uid()`

**schedule_placeholders:**
- SELECT: scoped to schedules the user can see (creator OR friend of creator, matching `schedule_participants` visibility)
- INSERT/DELETE: only if `added_by = auth.uid()`
- UPDATE: not allowed via direct client access. All claiming happens through `accept_invite` RPC (SECURITY DEFINER).

## Invite Link Flow

**URL format:** `/invite/{code}` (e.g., `/invite/k7Xm2pQn`)

### Flow:

1. User visits `/invite/{code}`
2. **No session** → redirect to login (Google/Discord) with `?redirect=/invite/{code}`
3. **With session** → page loads invite data (schedule, instance, participants, placeholders) via RPC
4. **Schedule is open:**
   - User has eligible character → select existing or create new
   - User has no character → inline form (name, class, class_path, level)
   - On confirm: join schedule + auto-friendship + claim placeholder (if match)
5. **Schedule expired/completed:**
   - Message: "Este agendamento já foi finalizado"
   - Auto-friendship still created
   - Button to dashboard
6. **Already in schedule:** message "Você já está neste agendamento"

### Placeholder matching

When a user joins via invite, the system attempts to match their character name (case-insensitive) to an unclaimed placeholder. If found, updates `claimed_by` and `claimed_character_id`. If not found, the user joins as a normal participant.

### Automatic friendship

On any invite access (open or expired schedule), an `accepted` friendship is created between the invitee and the invite's `created_by`. Checks both directions (requester/addressee) before inserting to avoid duplicates.

### Participant count

The `X/12` counter includes: creator (1) + `schedule_participants` rows + unclaimed placeholders. The existing `participantCount` in `useSchedules.fetchAll` must be updated to include unclaimed placeholders.

## RPC: `accept_invite`

**Parameters:** `invite_code text`, `character_id uuid`

**SECURITY DEFINER function**, executes in a single transaction:

1. Resolve invite → get `schedule_id`, `created_by`
2. **Validate character ownership:** verify `character_id` belongs to `auth.uid()` in `characters` table. If not → error.
3. Check schedule status:
   - If not `open` → create friendship only (step 8), return `friendship_only`
4. Count total slots: `schedule_participants` rows + unclaimed `schedule_placeholders` + 1 (creator). If >= 12 → return `full`
5. Check if user already in schedule (any character) → return `already_joined`
6. Insert into `schedule_participants` (schedule_id, character_id, user_id)
7. Try claim placeholder using `FOR UPDATE` lock:
   ```sql
   WITH target AS (
     SELECT id FROM schedule_placeholders
     WHERE schedule_id = X AND lower(character_name) = lower(char_name)
       AND claimed_by IS NULL
     LIMIT 1
     FOR UPDATE SKIP LOCKED
   )
   UPDATE schedule_placeholders SET claimed_by = auth.uid(), claimed_character_id = character_id
   FROM target WHERE schedule_placeholders.id = target.id
   ```
8. Create friendship — check both directions first:
   ```sql
   INSERT INTO friendships (requester_id, addressee_id, status)
   SELECT auth.uid(), created_by, 'accepted'
   WHERE NOT EXISTS (
     SELECT 1 FROM friendships
     WHERE (requester_id = auth.uid() AND addressee_id = created_by)
        OR (requester_id = created_by AND addressee_id = auth.uid())
   )
   ```
9. Return `joined`

## RPC: `resolve_invite`

**Parameters:** `invite_code text`

**SECURITY DEFINER function** for the invite page to load data without RLS issues:

1. Resolve invite by code → get schedule_id, created_by
2. Load schedule + instance info (name, scheduled_at, status, start_map)
3. Load participants (enriched with profile + character info)
4. Load unclaimed placeholders
5. Load creator profile (username, avatar)
6. Return all data

This is read-only and safe for any authenticated user.

## UI Changes

### ScheduleModal (creator view)

New section in the invite/participant area:

- **Invite link:** "Gerar link" button (or display existing link with copy button). On click: generates code via `schedule_invites` INSERT, copies `{origin}/invite/{code}` to clipboard
- **Add placeholder:** "+" button opens inline form with name + class fields. Placeholders appear in participant list with distinct styling

### Participant list

- **Real participants:** avatar + char name + class + level (unchanged)
- **Unclaimed placeholders:** 50% opacity, no avatar, yellow "Aguardando" badge
- **Claimed placeholders:** render as normal participants

### `/invite/{code}` page

- Centered card, dark theme matching landing page
- Shows: instance name, scheduled time, creator name, participant count
- If open: character creation form (name, class, class_path, level) or character selector + "Entrar" button
- If expired: message + dashboard button
- If already joined: message with link to dashboard

## Hooks

### `useSchedules` — new methods

- `generateInviteCode(scheduleId)` → INSERT into schedule_invites, return code
- `getInviteCode(scheduleId)` → SELECT existing code or null
- `addPlaceholder(scheduleId, characterName, characterClass)` → INSERT into schedule_placeholders
- `removePlaceholder(placeholderId)` → DELETE
- `getPlaceholders(scheduleId)` → list with claimed status
- `fetchAll` updated: participantCount includes unclaimed placeholders

### New hook: `useInvite(code)`

- Resolves invite via `resolve_invite` RPC → loads schedule + instance + participants + placeholders
- `acceptInvite(characterId)` → calls `accept_invite` RPC
- `acceptInviteWithNewChar(name, class, classPath, level)` → creates character first, then calls `accept_invite` RPC. Note: if the RPC fails after char creation (e.g., schedule full), the character persists — this is acceptable since the user now has an account and can use the character elsewhere.

## Security

- 8-char alphanumeric codes: 62^8 ≈ 218 trillion combinations, not brute-forceable
- No sensitive data in the link — code does not reveal schedule_id or user info
- RPC validates character ownership (step 2: character must belong to auth.uid())
- Invite resolution only via SECURITY DEFINER RPCs — no direct table SELECT for unauthenticated/unauthorized users
- Placeholder SELECT scoped to visible schedules (friend/creator) via RLS
- Placeholder claim uses `FOR UPDATE SKIP LOCKED` to prevent race conditions
- Friendship insert checks both directions to prevent duplicates
- Both new tables cascade on schedule deletion — no orphaned rows
- Supabase built-in rate limiting on API calls
