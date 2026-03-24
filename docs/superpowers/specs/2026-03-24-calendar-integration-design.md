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
| User joins schedule | Create event | Joining user |
| User leaves schedule | Delete event | Leaving user |
| Schedule time changes | Update event | All participants with calendar |
| Schedule title/message changes | Update event | All participants with calendar |
| New participant joins | Create event for new participant + update description for existing participants |
| Participant leaves | Delete their event + update description for remaining participants |
| Schedule cancelled/expired | Delete events | All participants |

## Architecture

### API Routes (Vercel)

- `POST /api/calendar/google/connect` — generates OAuth URL with state, redirects
- `GET /api/calendar/google/callback` — exchanges code for tokens, stores encrypted
- `POST /api/calendar/outlook/connect` — generates OAuth URL with state, redirects
- `GET /api/calendar/outlook/callback` — exchanges code for tokens, stores encrypted

### Calendar Library (`src/lib/calendar.ts`)

Core module with provider-agnostic interface:

```typescript
// Creates event for a user in their connected calendar(s)
async function createCalendarEvent(userId: string, scheduleData: ScheduleEventData): Promise<void>

// Updates event for a user (time, title, description changes)
async function updateCalendarEvent(userId: string, scheduleId: string, updates: Partial<ScheduleEventData>): Promise<void>

// Deletes event for a user
async function deleteCalendarEvent(userId: string, scheduleId: string): Promise<void>

// Updates description (participant list) for all participants of a schedule
async function updateParticipantList(scheduleId: string, participants: string[]): Promise<void>
```

Internally handles:
- Token decryption
- Token refresh (if expired, refresh and save new tokens)
- Provider-specific API calls (Google Calendar API v3 / Microsoft Graph API)
- Error handling: on failure, set `last_sync_error` on `calendar_connections`, never throw to caller

### Provider Implementations

**Google Calendar:**
- API: `https://www.googleapis.com/calendar/v3`
- Create: `POST /calendars/primary/events`
- Update: `PATCH /calendars/primary/events/{eventId}`
- Delete: `DELETE /calendars/primary/events/{eventId}`
- Token refresh: `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token`

**Microsoft Outlook:**
- API: `https://graph.microsoft.com/v1.0`
- Create: `POST /me/calendar/events`
- Update: `PATCH /me/calendar/events/{eventId}`
- Delete: `DELETE /me/calendar/events/{eventId}`
- Token refresh: `POST https://login.microsoftonline.com/common/oauth2/v2.0/token` with `grant_type=refresh_token`

### Integration Points

Calendar functions are called from existing schedule operations. These are **fire-and-forget** — wrapped in try/catch, errors logged but never block the main operation:

- `useSchedules.joinSchedule()` → `createCalendarEvent()`
- `useSchedules.leaveSchedule()` → `deleteCalendarEvent()`
- `useSchedules.updateScheduleTime()` → `updateCalendarEvent()` for all participants
- `useSchedules.completeSchedule()` → `deleteCalendarEvent()` for all participants
- `useSchedules.expireSchedule()` → `deleteCalendarEvent()` for all participants

Since these need server-side token access, the calendar operations happen via **Next.js API routes** that the client calls after the main Supabase operation succeeds.

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
- Encrypt before storing in database, decrypt when reading
- Same key available on Vercel (API routes) — no Supabase Edge Functions needed for calendar ops
- Key rotation: not in scope for v1, can be added later

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

- Tokens encrypted with AES-256-GCM before database storage
- `CALENDAR_ENCRYPTION_KEY` stored as env var, never in code
- RLS prevents users from reading other users' tokens
- OAuth flows use `state` parameter (HttpOnly cookie) for CSRF protection
- Calendar API calls happen server-side only (API routes), never from client

## Constraints

- Google Calendar API: 1M queries/day free (irrelevant at this scale)
- Microsoft Graph: ~10k requests/10min per app (irrelevant at this scale)
- Event duration fixed at 30 minutes
- Sync is Instanceiro → Calendar only (no reading from calendar)
- No support for Apple Calendar (iCloud) in v1
