# Calendar Integration — Design Spec

## Overview

Automatically create, update, and delete events in users' connected Google Calendar or Outlook when they participate in instance schedules. Sync is bidirectional (Instanceiro → Calendar) and automatic.

## Scope

- Google Calendar and Microsoft Outlook support
- Create event when user joins a schedule
- Update event when schedule changes (time, title, message, participants)
- Delete event when user leaves, or schedule is cancelled/expired
- Toggle on/off per provider on the profile page
- Best-effort: calendar sync never blocks Instanceiro operations

## User Flow

### Connecting a Calendar

1. Profile page → "Calendario" section
2. Buttons: "Conectar Google Calendar" / "Conectar Outlook"
3. OAuth flow requests calendar scope
4. After authorization, provider appears as connected with a toggle
5. For Google-login users: re-auth dialog explains why calendar access is needed ("Voce ja esta logado com Google, mas precisamos de permissao extra para acessar seu calendario.")

### Automatic Sync

Once connected, any schedule participation creates a calendar event automatically. No user action needed.

### Disconnecting

- Toggle off: disables sync, keeps tokens (can re-enable without re-auth)
- "Desconectar": deletes tokens and all `schedule_calendar_events` mappings. Existing events in the calendar remain (user can delete manually).

## Data Model

### `calendar_connections`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | Default `gen_random_uuid()` |
| `user_id` | UUID, FK | → `profiles.id`, ON DELETE CASCADE |
| `provider` | text, NOT NULL | `'google'` or `'outlook'` |
| `access_token` | text, NOT NULL | Application-level encrypted |
| `refresh_token` | text, NOT NULL | Application-level encrypted |
| `token_expires_at` | timestamptz | When access_token expires |
| `enabled` | boolean, NOT NULL | Default `true` |
| `last_sync_error` | text | Last error message, null if ok |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

Unique constraint: `(user_id, provider)` — user can have both Google + Outlook.

RLS: `user_id = auth.uid()` for all operations.

### `schedule_calendar_events`

Maps Instanceiro schedules to external calendar event IDs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | Default `gen_random_uuid()` |
| `schedule_id` | UUID, FK | → `instance_schedules.id`, ON DELETE CASCADE |
| `user_id` | UUID, FK | → `profiles.id`, ON DELETE CASCADE |
| `provider` | text, NOT NULL | `'google'` or `'outlook'` |
| `external_event_id` | text, NOT NULL | Event ID in Google/Outlook |
| `created_at` | timestamptz | Default `now()` |

Unique constraint: `(schedule_id, user_id, provider)`

RLS: `user_id = auth.uid()` for SELECT/DELETE. INSERT via service role or auth callback.

## Calendar Event Format

```
Title: [Instance Name] — Instanceiro
       or: [Schedule Title] — [Instance Name] (if title exists)

Start: scheduled_at
Duration: 30 minutes

Description:
  Participantes: char1, char2, char3
  Mensagem: [schedule message, if any]
  ---
  Instanceiro — instanceiro.vercel.app
```

## Sync Triggers

| Instanceiro Action | Calendar Action | Affected Users |
|-------------------|-----------------|----------------|
| Schedule created | Create event | Creator |
| User joins schedule | Create event + update description for existing | Joining user + all existing participants |
| User leaves schedule | Delete event + update description for remaining | Leaving user + remaining participants |
| Creator removes participant | Delete event + update description for remaining | Removed user + remaining participants |
| Friend invited to schedule | Create event + update description for existing | Invited friend + all existing participants |
| Schedule time changes | Update event | All participants with calendar |
| Schedule title changes | Update event | All participants with calendar |
| Schedule cancelled/expired/completed | Delete events | All participants |

Note: Placeholders (non-real users) appear in the "Participantes" list in event descriptions but do not have calendar events.

## Architecture

### API Routes (Vercel)

**OAuth routes:**
- `POST /api/calendar/google/connect` — generates OAuth URL with state (server-side cookie), redirects
- `GET /api/calendar/google/callback` — exchanges code for tokens, stores encrypted
- `POST /api/calendar/outlook/connect` — generates OAuth URL with state (server-side cookie), redirects
- `GET /api/calendar/outlook/callback` — exchanges code for tokens, stores encrypted

**Sync route:**
- `POST /api/calendar/sync` — single endpoint for all calendar operations

Request body:
```typescript
{
  action: "create" | "update" | "delete" | "delete_all";
  scheduleId: string;
  userId?: string;        // specific user (for join/leave). Omit for all participants.
  data?: {                // for create/update
    instanceName: string;
    title?: string;
    scheduledAt: string;
    participants: string[];  // character names
    message?: string;
  };
}
```

This route uses a **Supabase service-role client** (`src/lib/supabase/admin.ts`) to read tokens across users. Authenticated by the caller's Supabase session.

### Supabase Admin Client (`src/lib/supabase/admin.ts`)

New helper for server-side operations that need cross-user access:

```typescript
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

### Calendar Library (`src/lib/calendar.ts`)

Core module with provider-agnostic interface:

```typescript
interface ScheduleEventData {
  instanceName: string;
  title?: string;
  scheduledAt: string;     // ISO string
  participants: string[];  // character names
  message?: string;
}

// Creates event for a user in their connected calendar(s)
async function createCalendarEvent(userId: string, scheduleId: string, data: ScheduleEventData): Promise<void>

// Updates event for a user (time, title, description changes)
async function updateCalendarEvent(userId: string, scheduleId: string, data: Partial<ScheduleEventData>): Promise<void>

// Deletes event for a user
async function deleteCalendarEvent(userId: string, scheduleId: string): Promise<void>

// Syncs all participants of a schedule (create/update/delete)
// Uses Promise.allSettled to parallelize and stay within Vercel's 10s timeout
async function syncAllParticipants(scheduleId: string, action: "update" | "delete", data?: Partial<ScheduleEventData>): Promise<void>
```

Internally handles:
- Token decryption (AES-256-GCM)
- Token refresh (if expired, refresh and save new tokens; on race condition, accept failure and retry on next operation)
- Provider-specific API calls (Google Calendar API v3 / Microsoft Graph API)
- If external event was manually deleted (404 on update), recreate it
- Error handling: on failure, set `last_sync_error` on `calendar_connections`, never throw to caller
- **All cross-user queries use the admin client** (service-role, bypasses RLS)
- **Multi-user operations use `Promise.allSettled`** to parallelize and avoid Vercel 10s timeout

### Provider Implementations

**Google Calendar:**
- API: `https://www.googleapis.com/calendar/v3`
- Create: `POST /calendars/primary/events`
- Update: `PATCH /calendars/primary/events/{eventId}` (404 → recreate)
- Delete: `DELETE /calendars/primary/events/{eventId}` (404 → ignore)
- Token refresh: `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token`

**Microsoft Outlook:**
- API: `https://graph.microsoft.com/v1.0`
- Create: `POST /me/calendar/events`
- Update: `PATCH /me/calendar/events/{eventId}` (404 → recreate)
- Delete: `DELETE /me/calendar/events/{eventId}` (404 → ignore)
- Token refresh: `POST https://login.microsoftonline.com/common/oauth2/v2.0/token` with `grant_type=refresh_token`

### Integration Points

Calendar sync is triggered from `useSchedules` hook functions via `fetch("/api/calendar/sync", ...)`. These are **fire-and-forget** — wrapped in try/catch, errors logged but never block the main operation:

- `useSchedules.createSchedule()` → sync create (creator)
- `useSchedules.joinSchedule()` → sync create (joining user) + sync update (all participants)
- `useSchedules.leaveSchedule()` → sync delete (leaving user) + sync update (all participants)
- `useSchedules.removeParticipant()` → sync delete (removed user) + sync update (all participants)
- `useSchedules.inviteFriend()` → sync create (invited user) + sync update (all participants)
- `useSchedules.updateScheduleTime()` → sync update (all participants)
- `useSchedules.updateScheduleTitle()` → sync update (all participants)
- `useSchedules.completeSchedule()` → sync delete_all
- `useSchedules.expireSchedule()` → sync delete_all

## OAuth Setup

### Google

- Reuse existing Google Cloud project (from Supabase Auth)
- Add scope: `https://www.googleapis.com/auth/calendar.events`
- Add redirect URI: `https://instanceiro.vercel.app/api/calendar/google/callback`
- Credentials: same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` as Supabase Auth, or create separate OAuth client

### Microsoft

- Register app in Azure AD (Microsoft Entra ID)
- Scope: `Calendars.ReadWrite offline_access`
- Redirect URI: `https://instanceiro.vercel.app/api/calendar/outlook/callback`
- Credentials: `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET`

## Token Encryption

Application-level encryption using AES-256-GCM:
- Encryption key stored as env var `CALENDAR_ENCRYPTION_KEY` (32-byte random, hex-encoded)
- **IV/nonce strategy**: generate random 12-byte IV per encryption. Store as `base64(iv + ciphertext + auth_tag)` in the `text` column.
- Encrypt before storing in database, decrypt when reading
- Same key available on Vercel (API routes) — no Supabase Edge Functions needed for calendar ops
- Key rotation: not in scope for v1, can be added later

## Environment Variables

| Variable | Where | New/Reuse | Notes |
|----------|-------|-----------|-------|
| `CALENDAR_ENCRYPTION_KEY` | Vercel | New | 32-byte random, hex-encoded. Generate with `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Vercel | Reuse from Supabase Auth or new | For calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | Vercel | Reuse from Supabase Auth or new | For calendar OAuth |
| `OUTLOOK_CLIENT_ID` | Vercel | New | Azure AD app registration |
| `OUTLOOK_CLIENT_SECRET` | Vercel | New | Azure AD app registration |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Already set | For admin client (cross-user reads) |

## Profile Page Changes

### Calendar Section (below Notifications section)

**When no calendar connected:**
- Heading: "Calendario"
- Description: "Sincronize agendamentos com seu calendario. Eventos sao criados automaticamente quando voce participa de um agendamento."
- Buttons: "Conectar Google Calendar" / "Conectar Outlook"

**When Google-login user clicks connect:**
- Extra text: "Voce ja esta logado com Google, mas precisamos de permissao extra para acessar seu calendario."

**When connected:**
- Toggle per provider: "Google Calendar" (on/off) / "Outlook" (on/off)
- Status: "Conectado" or "Erro no ultimo sync" (if `last_sync_error` is set)
- "Desconectar" link per provider

## Error Handling

- All calendar operations are **best-effort**. Failures are logged to `calendar_connections.last_sync_error` but never block Instanceiro operations.
- Token refresh failure: set `enabled = false`, set `last_sync_error = "Token expirado. Reconecte seu calendario."`
- API errors (rate limit, server error): set `last_sync_error` with message, retry on next operation
- Profile page shows sync error status so user knows to reconnect if needed

## Security

- Tokens encrypted with AES-256-GCM (random 12-byte IV per encryption) before database storage
- `CALENDAR_ENCRYPTION_KEY` stored as env var, never in code
- RLS prevents users from reading other users' tokens via client. Server-side admin client (service-role) bypasses RLS for cross-user calendar sync.
- OAuth `state` parameter set as **server-side HttpOnly cookie** in the `/connect` route (not client-side JS, unlike the existing Discord pattern)
- Calendar API calls happen server-side only (API routes), never from client
- Token refresh race condition: if two operations refresh the same token simultaneously, one may fail. Accepted — the failing operation logs `last_sync_error` and retries on the next calendar operation.

## Risks

- **Google OAuth verification**: adding `calendar.events` scope may require Google's verification review (days to weeks) if the app has 100+ users or is not in "testing" mode. Plan for this.
- **Outlook token expiry**: Microsoft refresh tokens expire after 90 days of inactivity. Users who don't participate in schedules for 90 days will need to reconnect.
- **Vercel 10s timeout**: multi-participant sync uses `Promise.allSettled` to parallelize. For very large groups (12+ participants all with calendars), some may time out. Accepted — best-effort.

## Constraints

- Google Calendar API: 1M queries/day free (irrelevant at this scale)
- Microsoft Graph: ~10k requests/10min per app (irrelevant at this scale)
- Event duration fixed at 30 minutes
- Sync is Instanceiro → Calendar only (no reading from calendar)
- No support for Apple Calendar (iCloud) in v1
