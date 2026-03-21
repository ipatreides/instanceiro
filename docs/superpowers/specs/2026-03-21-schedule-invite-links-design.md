# Schedule Invite Links & External Placeholders

## Summary

Allow schedule creators to generate a shareable invite link (short code) for their schedule, and add placeholder characters for players not yet in the system. When someone opens the invite link, they create an account (or log in), create/select a character, and join the schedule. An accepted friendship is automatically created between the inviter and invitee.

## Database

### New table: `schedule_invites`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| schedule_id | uuid | FK → instance_schedules, UNIQUE |
| code | varchar(8) | UNIQUE, NOT NULL |
| created_by | uuid | FK → auth.users |
| created_at | timestamptz | default now() |

One invite per schedule (UNIQUE on schedule_id). Code is 8 alphanumeric chars (a-z, A-Z, 0-9), case-sensitive, ~218 trillion combinations.

### New table: `schedule_placeholders`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| schedule_id | uuid | FK → instance_schedules |
| character_name | text | NOT NULL |
| character_class | text | NOT NULL |
| added_by | uuid | FK → auth.users |
| claimed_by | uuid | nullable, FK → auth.users |
| claimed_character_id | uuid | nullable, FK → characters |
| created_at | timestamptz | default now() |

### RLS Policies

**schedule_invites:**
- SELECT: any authenticated user can select by code (resolving invite link)
- INSERT/DELETE: only if `created_by = auth.uid()`

**schedule_placeholders:**
- SELECT: any authenticated user (visible in participant list)
- INSERT/DELETE: only if `added_by = auth.uid()`
- UPDATE: only `claimed_by` and `claimed_character_id` fields, only when `claimed_by IS NULL` and updating to `auth.uid()`

## Invite Link Flow

**URL format:** `/invite/{code}` (e.g., `/invite/k7Xm2pQn`)

### Flow:

1. User visits `/invite/{code}`
2. **No session** → redirect to login (Google/Discord) with `?redirect=/invite/{code}`
3. **With session** → page loads invite data (schedule, instance, participants, placeholders)
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

On any invite access (open or expired schedule), an `accepted` friendship is created between the invitee and the invite's `created_by`. Skipped if friendship already exists.

### Participant count

The `X/12` counter includes unclaimed placeholders — they occupy slots.

## RPC: `accept_invite`

**Parameters:** `invite_code text`, `character_id uuid`

**SECURITY DEFINER function**, executes in a single transaction:

1. Resolve invite → get `schedule_id`, `created_by`
2. Check schedule status:
   - If not `open` → create friendship only, return `friendship_only`
3. Check participant count (participants + unclaimed placeholders) < 12
   - If full → return `full`
4. Check if user already in schedule → return `already_joined`
5. Insert into `schedule_participants` (schedule_id, character_id, user_id)
6. Try claim placeholder: `UPDATE schedule_placeholders SET claimed_by = auth.uid(), claimed_character_id = character_id WHERE schedule_id = X AND lower(character_name) = lower(char_name) AND claimed_by IS NULL LIMIT 1`
7. Create friendship (INSERT ... ON CONFLICT DO NOTHING) with status `accepted`
8. Return `joined`

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

### New hook: `useInvite(code)`

- Resolves invite by code → loads schedule + instance + participants + placeholders
- `acceptInvite(characterId)` → calls `accept_invite` RPC
- `acceptInviteWithNewChar(name, class, classPath, level)` → creates character first, then calls `accept_invite` RPC

## Security

- 8-char alphanumeric codes: 62^8 ≈ 218 trillion combinations, not brute-forceable
- No sensitive data in the link — code does not reveal schedule_id or user info
- RPC validates character ownership (character must belong to auth.uid())
- Placeholder claim uses `WHERE claimed_by IS NULL` to prevent race conditions
- Supabase built-in rate limiting on API calls
