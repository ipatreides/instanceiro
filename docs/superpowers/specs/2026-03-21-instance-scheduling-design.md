# Instance Scheduling

## Goal

Allow users to schedule instances and let friends sign up to do them together. Includes attendance confirmation that marks completion for all participants.

## Rules

- Only instances with `party_min > 1` can be scheduled
- Maximum 12 participants (including creator)
- Minimum scheduled date = when the creator's character cooldown expires
- Only friends can see and join schedules
- Participant must have the instance available (not on cooldown) on their character to sign up
- Creator confirms attendance list → marks completion for all confirmed participants
- Participants can leave a comment or suggest alternative time

## Schema

### `instance_schedules`

```sql
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
```

### `schedule_participants`

```sql
CREATE TABLE schedule_participants (
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (schedule_id, user_id)
);
```

### RLS

Both tables:
- SELECT: user is creator, participant, or friend of creator
- INSERT on schedules: `auth.uid() = created_by`
- INSERT on participants: user is friend of schedule creator + has instance available
- UPDATE on schedules: `auth.uid() = created_by` (for status changes)
- DELETE on participants: user can remove self, creator can remove anyone

## Status States

- **open** — scheduled, date not yet reached
- **late** — client-side: `scheduled_at < now` AND `status = 'open'` (no DB change needed)
- **completed** — creator confirmed attendance, completions recorded for all
- **expired** — creator manually cancelled/expired

## UI

### Dashboard — "Agendadas" Section

- Position: above "Disponíveis"
- Collapsible with badge count: "Agendadas (3)"
- Shows own schedules + schedules from friends
- Cards display: instance name, @creator, date/time, X/12 participants
- **Late style:** border pulsing red/orange animation for overdue schedules
- Click opens schedule detail modal

### Schedule Detail Modal

- Instance info (name, level, map, liga)
- Scheduled date/time
- Creator + message
- Participant list with avatars, @usernames, and messages
- **If viewer is not signed up:** "Participar" button (select character + optional message)
- **If viewer is signed up:** "Sair" button
- **If viewer is creator:** "Completar" button → opens attendance checklist

### Attendance Checklist (Creator only)

- List of all participants with checkboxes
- Uncheck anyone who didn't show up
- "Confirmar" button → creates instance_completions for all checked participants + creator
- Schedule status → 'completed'

### Instance Modal — "Agendar" Button

- Shown for instances with `party_min > 1`
- Opens form: datetime picker (min = cooldown expiry), optional message
- Creates the schedule

### Realtime

Subscribe to `instance_schedules` and `schedule_participants` for live updates.

## Files

- Migration: `supabase/migrations/009_instance_schedules.sql`
- Types: `src/lib/types.ts` — InstanceSchedule, ScheduleParticipant
- Hook: `src/hooks/use-schedules.ts`
- Components:
  - `src/components/schedules/schedule-section.tsx` — collapsible section
  - `src/components/schedules/schedule-card.tsx` — individual card
  - `src/components/schedules/schedule-modal.tsx` — detail + join/leave
  - `src/components/schedules/schedule-form.tsx` — create form
  - `src/components/schedules/attendance-checklist.tsx` — completion flow
- Modify: `src/app/dashboard/page.tsx` — add section + integrate
- Modify: `src/components/instances/instance-modal.tsx` — add "Agendar" button
