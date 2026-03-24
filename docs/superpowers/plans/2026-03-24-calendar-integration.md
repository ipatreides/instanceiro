# Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-create/update/delete Google Calendar and Outlook events when users participate in instance schedules.

**Architecture:** OAuth flows for Google/Outlook store encrypted tokens. A sync API route (`POST /api/calendar/sync`) handles all calendar CRUD, called fire-and-forget from the schedule hook. Admin client (service-role) reads tokens across users for multi-participant sync.

**Tech Stack:** Next.js 16 (App Router), Supabase, Google Calendar API v3, Microsoft Graph API, AES-256-GCM encryption

**Spec:** `docs/superpowers/specs/2026-03-24-calendar-integration-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260324300000_calendar_integration.sql` | Create | Tables, RLS, indexes, triggers |
| `src/lib/supabase/admin.ts` | Create | Supabase service-role client |
| `src/lib/crypto.ts` | Create | AES-256-GCM encrypt/decrypt |
| `src/lib/calendar.ts` | Create | Provider-agnostic calendar operations |
| `src/lib/calendar-google.ts` | Create | Google Calendar API provider |
| `src/lib/calendar-outlook.ts` | Create | Microsoft Graph API provider |
| `src/app/api/calendar/google/connect/route.ts` | Create | Google OAuth initiation |
| `src/app/api/calendar/google/callback/route.ts` | Create | Google OAuth callback |
| `src/app/api/calendar/outlook/connect/route.ts` | Create | Outlook OAuth initiation |
| `src/app/api/calendar/outlook/callback/route.ts` | Create | Outlook OAuth callback |
| `src/app/api/calendar/sync/route.ts` | Create | Calendar sync endpoint |
| `src/hooks/use-calendar-connections.ts` | Create | Client hook for profile page |
| `src/components/profile/calendar-section.tsx` | Create | UI component for calendar toggle |
| `src/app/profile/page.tsx` | Modify | Add calendar section |
| `src/hooks/use-schedules.ts` | Modify | Add fire-and-forget sync calls |

---

## Phase 1: Foundation (Tasks 1-4)

### Task 1: Environment Variables Setup

- [ ] **Step 1: Generate encryption key**

```bash
openssl rand -hex 32
```

Copy the output.

- [ ] **Step 2: Add to `.env.local`**

```
CALENDAR_ENCRYPTION_KEY=<generated-hex>
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
```

Note: `OUTLOOK_CLIENT_ID` and `OUTLOOK_CLIENT_SECRET` are added later when Azure AD is set up. Google credentials may be the same as Supabase Auth or a new OAuth client.

- [ ] **Step 3: Add to Vercel**

```bash
cd D:/rag/instance-tracker
vercel env add CALENDAR_ENCRYPTION_KEY production
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
```

---

### Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260324300000_calendar_integration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- calendar_connections table
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- Auto-update updated_at
CREATE TRIGGER calendar_connections_updated_at
  BEFORE UPDATE ON calendar_connections
  FOR EACH ROW EXECUTE FUNCTION update_discord_notifications_updated_at();

-- RLS
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar connections" ON calendar_connections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own calendar connections" ON calendar_connections
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own calendar connections" ON calendar_connections
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own calendar connections" ON calendar_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- schedule_calendar_events table
CREATE TABLE schedule_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  external_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, user_id, provider)
);

ALTER TABLE schedule_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar events" ON schedule_calendar_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own calendar events" ON schedule_calendar_events
  FOR DELETE USING (auth.uid() = user_id);

-- Index for sync lookups
CREATE INDEX idx_schedule_calendar_events_schedule
  ON schedule_calendar_events (schedule_id);
CREATE INDEX idx_calendar_connections_user_enabled
  ON calendar_connections (user_id, enabled) WHERE enabled = true;
```

- [ ] **Step 2: Run migration**

```bash
cd D:/rag/instance-tracker
npx supabase db push --linked
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260324300000_calendar_integration.sql
git commit -m "feat: add calendar_connections and schedule_calendar_events tables"
```

---

### Task 3: Crypto Library

**Files:**
- Create: `src/lib/crypto.ts`

- [ ] **Step 1: Create the encryption module**

```typescript
// src/lib/crypto.ts

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 128; // bits

function getKey(): Buffer {
  const hex = process.env.CALENDAR_ENCRYPTION_KEY;
  if (!hex) throw new Error("CALENDAR_ENCRYPTION_KEY not set");
  return Buffer.from(hex, "hex");
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: ALGORITHM }, false, ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    cryptoKey,
    data
  );

  // Combine iv + ciphertext (includes auth tag) into one buffer
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return Buffer.from(combined).toString("base64");
}

export async function decrypt(encoded: string): Promise<string> {
  const key = getKey();
  const combined = Buffer.from(encoded, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: ALGORITHM }, false, ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/crypto.ts
git commit -m "feat: add AES-256-GCM encryption module for calendar tokens"
```

---

### Task 4: Supabase Admin Client

**Files:**
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1: Create the admin client**

```typescript
// src/lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/admin.ts
git commit -m "feat: add Supabase admin client for service-role access"
```

---

## Phase 2: Google Calendar OAuth (Tasks 5-6)

### Task 5: Google OAuth Connect + Callback

**Files:**
- Create: `src/app/api/calendar/google/connect/route.ts`
- Create: `src/app/api/calendar/google/callback/route.ts`

- [ ] **Step 1: Create the connect route**

```typescript
// src/app/api/calendar/google/connect/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  // Generate CSRF state, store as HttpOnly cookie
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("calendar_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/calendar/google/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);
}
```

- [ ] **Step 2: Create the callback route**

```typescript
// src/app/api/calendar/google/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // CSRF validation
  const cookieStore = await cookies();
  const storedState = cookieStore.get("calendar_oauth_state")?.value;
  cookieStore.delete("calendar_oauth_state");

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/profile?calendar=error`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/calendar/google/callback`,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${origin}/profile?calendar=error`);
    }

    const tokens = await tokenRes.json();

    // Get authenticated Supabase user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/profile?calendar=error`);
    }

    // Encrypt tokens and store
    const encryptedAccess = await encrypt(tokens.access_token);
    const encryptedRefresh = await encrypt(tokens.refresh_token);
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    await supabase.from("calendar_connections").upsert({
      user_id: user.id,
      provider: "google",
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: expiresAt,
      enabled: true,
      last_sync_error: null,
    }, { onConflict: "user_id,provider" });

    return NextResponse.redirect(`${origin}/profile?calendar=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/profile?calendar=error`);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/calendar/google/
git commit -m "feat: add Google Calendar OAuth connect and callback routes"
```

---

### Task 6: Outlook OAuth Connect + Callback

**Files:**
- Create: `src/app/api/calendar/outlook/connect/route.ts`
- Create: `src/app/api/calendar/outlook/callback/route.ts`

- [ ] **Step 1: Create the connect route**

```typescript
// src/app/api/calendar/outlook/connect/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("calendar_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID!,
    redirect_uri: `${origin}/api/calendar/outlook/callback`,
    response_type: "code",
    scope: "Calendars.ReadWrite offline_access",
    state,
  });

  return NextResponse.redirect(`${MS_AUTH_URL}?${params}`);
}
```

- [ ] **Step 2: Create the callback route**

```typescript
// src/app/api/calendar/outlook/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("calendar_oauth_state")?.value;
  cookieStore.delete("calendar_oauth_state");

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/profile?calendar=error`);
  }

  try {
    const tokenRes = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID!,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/calendar/outlook/callback`,
        scope: "Calendars.ReadWrite offline_access",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${origin}/profile?calendar=error`);
    }

    const tokens = await tokenRes.json();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/profile?calendar=error`);
    }

    const encryptedAccess = await encrypt(tokens.access_token);
    const encryptedRefresh = await encrypt(tokens.refresh_token);
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    await supabase.from("calendar_connections").upsert({
      user_id: user.id,
      provider: "outlook",
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: expiresAt,
      enabled: true,
      last_sync_error: null,
    }, { onConflict: "user_id,provider" });

    return NextResponse.redirect(`${origin}/profile?calendar=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/profile?calendar=error`);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/calendar/outlook/
git commit -m "feat: add Outlook OAuth connect and callback routes"
```

---

## Phase 3: Calendar Library (Tasks 7-9)

### Task 7: Google Calendar Provider

**Files:**
- Create: `src/lib/calendar-google.ts`

- [ ] **Step 1: Create the Google provider**

```typescript
// src/lib/calendar-google.ts

const API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface CalendarEventPayload {
  summary: string;
  description: string;
  start: string; // ISO
  end: string;   // ISO
}

export async function createGoogleEvent(
  accessToken: string,
  payload: CalendarEventPayload
): Promise<{ eventId: string }> {
  const res = await fetch(`${API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: payload.summary,
      description: payload.description,
      start: { dateTime: payload.start, timeZone: "America/Sao_Paulo" },
      end: { dateTime: payload.end, timeZone: "America/Sao_Paulo" },
    }),
  });

  if (!res.ok) throw new Error(`Google create failed: ${res.status}`);
  const data = await res.json();
  return { eventId: data.id };
}

export async function updateGoogleEvent(
  accessToken: string,
  eventId: string,
  payload: Partial<CalendarEventPayload>
): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (payload.summary) body.summary = payload.summary;
  if (payload.description) body.description = payload.description;
  if (payload.start) body.start = { dateTime: payload.start, timeZone: "America/Sao_Paulo" };
  if (payload.end) body.end = { dateTime: payload.end, timeZone: "America/Sao_Paulo" };

  const res = await fetch(`${API}/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 404) return false; // Event deleted externally
  if (!res.ok) throw new Error(`Google update failed: ${res.status}`);
  return true;
}

export async function deleteGoogleEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${API}/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) return; // Already deleted
  if (!res.ok) throw new Error(`Google delete failed: ${res.status}`);
}

export async function refreshGoogleToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`Google refresh failed: ${res.status}`);
  return await res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/calendar-google.ts
git commit -m "feat: add Google Calendar API provider"
```

---

### Task 8: Outlook Calendar Provider

**Files:**
- Create: `src/lib/calendar-outlook.ts`

- [ ] **Step 1: Create the Outlook provider**

```typescript
// src/lib/calendar-outlook.ts

const API = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export interface CalendarEventPayload {
  summary: string;
  description: string;
  start: string;
  end: string;
}

export async function createOutlookEvent(
  accessToken: string,
  payload: CalendarEventPayload
): Promise<{ eventId: string }> {
  const res = await fetch(`${API}/me/calendar/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: payload.summary,
      body: { contentType: "text", content: payload.description },
      start: { dateTime: payload.start, timeZone: "America/Sao_Paulo" },
      end: { dateTime: payload.end, timeZone: "America/Sao_Paulo" },
    }),
  });

  if (!res.ok) throw new Error(`Outlook create failed: ${res.status}`);
  const data = await res.json();
  return { eventId: data.id };
}

export async function updateOutlookEvent(
  accessToken: string,
  eventId: string,
  payload: Partial<CalendarEventPayload>
): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (payload.summary) body.subject = payload.summary;
  if (payload.description) body.body = { contentType: "text", content: payload.description };
  if (payload.start) body.start = { dateTime: payload.start, timeZone: "America/Sao_Paulo" };
  if (payload.end) body.end = { dateTime: payload.end, timeZone: "America/Sao_Paulo" };

  const res = await fetch(`${API}/me/calendar/events/${eventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Outlook update failed: ${res.status}`);
  return true;
}

export async function deleteOutlookEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${API}/me/calendar/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) return;
  if (!res.ok) throw new Error(`Outlook delete failed: ${res.status}`);
}

export async function refreshOutlookToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "Calendars.ReadWrite offline_access",
    }),
  });

  if (!res.ok) throw new Error(`Outlook refresh failed: ${res.status}`);
  return await res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/calendar-outlook.ts
git commit -m "feat: add Outlook Calendar API provider"
```

---

### Task 9: Calendar Core Library

**Files:**
- Create: `src/lib/calendar.ts`

- [ ] **Step 1: Create the core calendar module**

This is the main module that orchestrates everything. It handles token refresh, encryption, provider dispatch, and error handling.

```typescript
// src/lib/calendar.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, refreshGoogleToken,
  type CalendarEventPayload,
} from "@/lib/calendar-google";
import {
  createOutlookEvent, updateOutlookEvent, deleteOutlookEvent, refreshOutlookToken,
} from "@/lib/calendar-outlook";

export interface ScheduleEventData {
  instanceName: string;
  title?: string;
  scheduledAt: string;
  participants: string[];
  message?: string;
}

function buildPayload(data: ScheduleEventData): CalendarEventPayload {
  const summary = data.title
    ? `${data.title} — ${data.instanceName}`
    : `${data.instanceName} — Instanceiro`;

  const lines = [`Participantes: ${data.participants.join(", ")}`];
  if (data.message) lines.push(`Mensagem: ${data.message}`);
  lines.push("---", "Instanceiro — instanceiro.vercel.app");

  const start = data.scheduledAt;
  const end = new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();

  return { summary, description: lines.join("\n"), start, end };
}

interface ConnectionRow {
  id: string;
  user_id: string;
  provider: "google" | "outlook";
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
}

async function getValidToken(conn: ConnectionRow): Promise<string | null> {
  const admin = createAdminClient();

  try {
    let accessToken = await decrypt(conn.access_token);
    const refreshToken = await decrypt(conn.refresh_token);

    // Check if token is expired (with 5 min buffer)
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
    const isExpired = expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (isExpired) {
      try {
        const refreshFn = conn.provider === "google" ? refreshGoogleToken : refreshOutlookToken;
        const result = await refreshFn(refreshToken);

        accessToken = result.access_token;
        const newExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
        const encryptedAccess = await encrypt(accessToken);

        await admin.from("calendar_connections")
          .update({ access_token: encryptedAccess, token_expires_at: newExpiresAt, last_sync_error: null })
          .eq("id", conn.id);
      } catch {
        // Refresh failed — disable connection
        await admin.from("calendar_connections")
          .update({ enabled: false, last_sync_error: "Token expirado. Reconecte seu calendario." })
          .eq("id", conn.id);
        return null;
      }
    }

    return accessToken;
  } catch {
    return null;
  }
}

async function getEnabledConnections(userId: string): Promise<ConnectionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendar_connections")
    .select("id, user_id, provider, access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("enabled", true);
  return (data ?? []) as ConnectionRow[];
}

export async function createCalendarEvent(
  userId: string,
  scheduleId: string,
  data: ScheduleEventData
): Promise<void> {
  const connections = await getEnabledConnections(userId);
  const payload = buildPayload(data);
  const admin = createAdminClient();

  for (const conn of connections) {
    try {
      const token = await getValidToken(conn);
      if (!token) continue;

      const createFn = conn.provider === "google" ? createGoogleEvent : createOutlookEvent;
      const { eventId } = await createFn(token, payload);

      await admin.from("schedule_calendar_events").upsert({
        schedule_id: scheduleId,
        user_id: userId,
        provider: conn.provider,
        external_event_id: eventId,
      }, { onConflict: "schedule_id,user_id,provider" });

      await admin.from("calendar_connections")
        .update({ last_sync_error: null })
        .eq("id", conn.id);
    } catch (e) {
      await admin.from("calendar_connections")
        .update({ last_sync_error: String(e) })
        .eq("id", conn.id);
    }
  }
}

export async function updateCalendarEvent(
  userId: string,
  scheduleId: string,
  data: Partial<ScheduleEventData>
): Promise<void> {
  const admin = createAdminClient();

  const { data: mappings } = await admin
    .from("schedule_calendar_events")
    .select("provider, external_event_id")
    .eq("schedule_id", scheduleId)
    .eq("user_id", userId);

  if (!mappings?.length) return;

  const connections = await getEnabledConnections(userId);
  const payload = data.scheduledAt ? buildPayload(data as ScheduleEventData) : undefined;

  for (const mapping of mappings) {
    const conn = connections.find((c) => c.provider === mapping.provider);
    if (!conn) continue;

    try {
      const token = await getValidToken(conn);
      if (!token) continue;

      const updateFn = conn.provider === "google" ? updateGoogleEvent : updateOutlookEvent;
      const updated = await updateFn(token, mapping.external_event_id, payload ?? {});

      if (!updated && data.scheduledAt) {
        // Event was deleted externally, recreate
        const createFn = conn.provider === "google" ? createGoogleEvent : createOutlookEvent;
        const { eventId } = await createFn(token, buildPayload(data as ScheduleEventData));

        await admin.from("schedule_calendar_events")
          .update({ external_event_id: eventId })
          .eq("schedule_id", scheduleId)
          .eq("user_id", userId)
          .eq("provider", conn.provider);
      }

      await admin.from("calendar_connections")
        .update({ last_sync_error: null })
        .eq("id", conn.id);
    } catch (e) {
      await admin.from("calendar_connections")
        .update({ last_sync_error: String(e) })
        .eq("id", conn.id);
    }
  }
}

export async function deleteCalendarEvent(
  userId: string,
  scheduleId: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: mappings } = await admin
    .from("schedule_calendar_events")
    .select("id, provider, external_event_id")
    .eq("schedule_id", scheduleId)
    .eq("user_id", userId);

  if (!mappings?.length) return;

  const connections = await getEnabledConnections(userId);

  for (const mapping of mappings) {
    const conn = connections.find((c) => c.provider === mapping.provider);
    if (!conn) continue;

    try {
      const token = await getValidToken(conn);
      if (!token) continue;

      const deleteFn = conn.provider === "google" ? deleteGoogleEvent : deleteOutlookEvent;
      await deleteFn(token, mapping.external_event_id);
    } catch {
      // Ignore delete errors
    }

    await admin.from("schedule_calendar_events").delete().eq("id", mapping.id);
  }
}

export async function syncAllParticipants(
  scheduleId: string,
  action: "update" | "delete",
  data?: Partial<ScheduleEventData>
): Promise<void> {
  const admin = createAdminClient();

  const { data: mappings } = await admin
    .from("schedule_calendar_events")
    .select("user_id")
    .eq("schedule_id", scheduleId);

  if (!mappings?.length) return;

  const uniqueUserIds = [...new Set(mappings.map((m) => m.user_id))];

  await Promise.allSettled(
    uniqueUserIds.map((userId) =>
      action === "delete"
        ? deleteCalendarEvent(userId, scheduleId)
        : updateCalendarEvent(userId, scheduleId, data ?? {})
    )
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/calendar.ts
git commit -m "feat: add core calendar library with provider dispatch and token management"
```

---

## Phase 4: Sync API Route (Task 10)

### Task 10: Calendar Sync Endpoint

**Files:**
- Create: `src/app/api/calendar/sync/route.ts`

- [ ] **Step 1: Create the sync route**

```typescript
// src/app/api/calendar/sync/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  syncAllParticipants,
  type ScheduleEventData,
} from "@/lib/calendar";

interface SyncRequest {
  action: "create" | "update" | "delete" | "delete_all";
  scheduleId: string;
  userId?: string;
  data?: ScheduleEventData;
}

export async function POST(request: Request) {
  // Verify caller is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SyncRequest;
  const { action, scheduleId, userId, data } = body;

  if (!scheduleId || !action) {
    return NextResponse.json({ error: "Missing scheduleId or action" }, { status: 400 });
  }

  try {
    switch (action) {
      case "create": {
        if (!data || !userId) {
          return NextResponse.json({ error: "Missing data or userId for create" }, { status: 400 });
        }
        await createCalendarEvent(userId, scheduleId, data);
        break;
      }
      case "update": {
        if (userId) {
          await updateCalendarEvent(userId, scheduleId, data ?? {});
        } else {
          await syncAllParticipants(scheduleId, "update", data);
        }
        break;
      }
      case "delete": {
        if (!userId) {
          return NextResponse.json({ error: "Missing userId for delete" }, { status: 400 });
        }
        await deleteCalendarEvent(userId, scheduleId);
        break;
      }
      case "delete_all": {
        await syncAllParticipants(scheduleId, "delete");
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Calendar sync error:", e);
    return NextResponse.json({ ok: true }); // Best-effort: never return error to client
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/calendar/sync/route.ts
git commit -m "feat: add calendar sync API route"
```

---

## Phase 5: Profile UI (Tasks 11-13)

### Task 11: Calendar Connections Hook

**Files:**
- Create: `src/hooks/use-calendar-connections.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/use-calendar-connections.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface CalendarConnection {
  provider: "google" | "outlook";
  enabled: boolean;
  lastSyncError: string | null;
}

interface UseCalendarConnectionsReturn {
  loading: boolean;
  connections: CalendarConnection[];
  isGoogleLogin: boolean;
  toggle: (provider: "google" | "outlook", enabled: boolean) => Promise<void>;
  disconnect: (provider: "google" | "outlook") => Promise<void>;
}

export function useCalendarConnections(): UseCalendarConnectionsReturn {
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGoogleLogin, setIsGoogleLogin] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }

      setIsGoogleLogin(user.app_metadata?.provider === "google");

      const { data } = await supabase
        .from("calendar_connections")
        .select("provider, enabled, last_sync_error")
        .eq("user_id", user.id);

      setConnections(
        (data ?? []).map((c) => ({
          provider: c.provider as "google" | "outlook",
          enabled: c.enabled,
          lastSyncError: c.last_sync_error,
        }))
      );
      setLoading(false);
    });
  }, []);

  const toggle = useCallback(async (provider: "google" | "outlook", enabled: boolean) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("calendar_connections")
      .update({ enabled })
      .eq("user_id", user.id)
      .eq("provider", provider);

    setConnections((prev) =>
      prev.map((c) => c.provider === provider ? { ...c, enabled } : c)
    );
  }, []);

  const disconnect = useCallback(async (provider: "google" | "outlook") => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("calendar_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", provider);

    setConnections((prev) => prev.filter((c) => c.provider !== provider));
  }, []);

  return { loading, connections, isGoogleLogin, toggle, disconnect };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-calendar-connections.ts
git commit -m "feat: add useCalendarConnections hook"
```

---

### Task 12: Calendar Section UI Component

**Files:**
- Create: `src/components/profile/calendar-section.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/profile/calendar-section.tsx
"use client";

import { useCalendarConnections } from "@/hooks/use-calendar-connections";

export function CalendarSection() {
  const { loading, connections, isGoogleLogin, toggle, disconnect } = useCalendarConnections();

  if (loading) return null;

  const google = connections.find((c) => c.provider === "google");
  const outlook = connections.find((c) => c.provider === "outlook");

  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-text-primary">Calendario</h2>
      <p className="text-xs text-text-secondary">
        Sincronize agendamentos com seu calendario. Eventos sao criados automaticamente quando voce participa de um agendamento.
      </p>

      {/* Google Calendar */}
      {google ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm text-text-primary">Google Calendar</span>
              {google.lastSyncError && (
                <span className="text-xs text-status-error">{google.lastSyncError}</span>
              )}
            </div>
            <button
              onClick={() => toggle("google", !google.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                google.enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                google.enabled ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          </div>
          <button
            onClick={() => disconnect("google")}
            className="text-xs text-text-secondary hover:text-status-error transition-colors cursor-pointer self-start"
          >
            Desconectar Google Calendar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {isGoogleLogin && (
            <p className="text-xs text-text-secondary italic">
              Voce ja esta logado com Google, mas precisamos de permissao extra para acessar seu calendario.
            </p>
          )}
          <a
            href="/api/calendar/google/connect"
            className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-md bg-surface border border-border text-text-primary font-semibold text-sm hover:border-primary transition-colors cursor-pointer"
          >
            Conectar Google Calendar
          </a>
        </div>
      )}

      {/* Outlook */}
      {outlook ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm text-text-primary">Outlook</span>
              {outlook.lastSyncError && (
                <span className="text-xs text-status-error">{outlook.lastSyncError}</span>
              )}
            </div>
            <button
              onClick={() => toggle("outlook", !outlook.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                outlook.enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                outlook.enabled ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          </div>
          <button
            onClick={() => disconnect("outlook")}
            className="text-xs text-text-secondary hover:text-status-error transition-colors cursor-pointer self-start"
          >
            Desconectar Outlook
          </button>
        </div>
      ) : (
        <a
          href="/api/calendar/outlook/connect"
          className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-md bg-surface border border-border text-text-primary font-semibold text-sm hover:border-primary transition-colors cursor-pointer"
        >
          Conectar Outlook
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/profile/calendar-section.tsx
git commit -m "feat: add CalendarSection component for profile page"
```

---

### Task 13: Add Calendar Section to Profile Page

**Files:**
- Modify: `src/app/profile/page.tsx`

- [ ] **Step 1: Import and add component**

Add import at top:
```typescript
import { CalendarSection } from "@/components/profile/calendar-section";
```

Add after the `NotificationsSection` div (inside `<main>`, after the notifications section):
```tsx
        <div className="mt-6">
          <CalendarSection />
        </div>
```

Also handle `?calendar=connected` and `?calendar=error` query params (same pattern as discord):
```typescript
if (params.get("calendar") === "connected") {
  window.history.replaceState({}, "", "/profile");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat: add calendar section to profile page"
```

---

## Phase 6: Schedule Hook Integration (Task 14)

### Task 14: Add Calendar Sync to Schedule Operations

**Files:**
- Modify: `src/hooks/use-schedules.ts`

- [ ] **Step 1: Add fire-and-forget sync helper**

Add at the top of the file, after imports:

```typescript
// Fire-and-forget calendar sync — never blocks schedule operations
function fireCalendarSync(body: {
  action: "create" | "update" | "delete" | "delete_all";
  scheduleId: string;
  userId?: string;
  data?: {
    instanceName: string;
    title?: string;
    scheduledAt: string;
    participants: string[];
    message?: string;
  };
}) {
  fetch("/api/calendar/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {}); // Swallow errors — best-effort
}
```

- [ ] **Step 2: Add sync calls to each operation**

In `createSchedule` (after `await fetchAll()`, before `return data.id`):
```typescript
// Calendar sync: create event for creator
fireCalendarSync({
  action: "create",
  scheduleId: data.id,
  userId: user.id,
  data: { instanceName: "", title: title, scheduledAt, participants: [], message },
});
```

Note: `instanceName` and `participants` will need to be resolved. The simplest approach is to pass the schedule ID and let the sync route fetch the full data. However, the spec defines the sync route to accept data directly. For the initial implementation, the caller passes what it knows. The sync route can be enhanced later to fetch missing data.

In `joinSchedule` (after the insert):
```typescript
fireCalendarSync({ action: "create", scheduleId, userId: user.id, data: undefined });
fireCalendarSync({ action: "update", scheduleId }); // Update all participants' descriptions
```

In `leaveSchedule` (after the delete):
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (user) {
  fireCalendarSync({ action: "delete", scheduleId, userId: user.id });
  fireCalendarSync({ action: "update", scheduleId });
}
```

In `removeParticipant`: need the userId of the removed participant. The current function only takes characterId. Look up the userId from participants or pass it through.

In `completeSchedule` and `expireSchedule`:
```typescript
fireCalendarSync({ action: "delete_all", scheduleId });
```

In `updateScheduleTime`:
```typescript
fireCalendarSync({ action: "update", scheduleId, data: { instanceName: "", scheduledAt, participants: [], title: undefined } });
```

In `updateScheduleTitle`:
```typescript
fireCalendarSync({ action: "update", scheduleId, data: { instanceName: "", title, scheduledAt: "", participants: [] } });
```

**Important:** The sync route should be enhanced to fetch missing schedule data (instance name, participants, message) from the database when `data` fields are empty/missing. This avoids the caller needing to know all the context. Add this logic to the sync route in a follow-up step.

- [ ] **Step 3: Enhance sync route to auto-fetch schedule data**

In `src/app/api/calendar/sync/route.ts`, add a helper that fetches full schedule context:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

async function getScheduleContext(scheduleId: string): Promise<ScheduleEventData | null> {
  const admin = createAdminClient();

  const { data: schedule } = await admin
    .from("instance_schedules")
    .select("instance_id, character_id, created_by, scheduled_at, title, message")
    .eq("id", scheduleId)
    .single();

  if (!schedule) return null;

  const { data: instance } = await admin
    .from("instances")
    .select("name")
    .eq("id", schedule.instance_id)
    .single();

  // Get all participants (creator + joined)
  const { data: participants } = await admin
    .from("schedule_participants")
    .select("character_id")
    .eq("schedule_id", scheduleId);

  const allCharIds = [schedule.character_id, ...(participants ?? []).map((p) => p.character_id)];

  const { data: chars } = await admin
    .from("characters")
    .select("id, name")
    .in("id", allCharIds);

  const charNames = (chars ?? []).map((c) => c.name);

  // Also include placeholders
  const { data: placeholders } = await admin
    .from("schedule_placeholders")
    .select("character_name")
    .eq("schedule_id", scheduleId);

  const allNames = [...charNames, ...(placeholders ?? []).map((p) => p.character_name)];

  return {
    instanceName: instance?.name ?? "Instancia",
    title: schedule.title ?? undefined,
    scheduledAt: schedule.scheduled_at,
    participants: allNames,
    message: schedule.message ?? undefined,
  };
}
```

Then in the sync route handler, merge caller data with fetched context:
```typescript
const context = await getScheduleContext(scheduleId);
const mergedData = { ...context, ...data };
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-schedules.ts src/app/api/calendar/sync/route.ts
git commit -m "feat: integrate calendar sync into schedule operations"
```

---

## Phase 7: Build & Deploy (Task 15)

### Task 15: Build, Push, Deploy

- [ ] **Step 1: Build locally**

```bash
cd D:/rag/instance-tracker
npm run build
```

Fix any TypeScript errors.

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Configure Google Cloud Console**

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Add redirect URI: `https://instanceiro.vercel.app/api/calendar/google/callback`
3. Enable Google Calendar API if not already enabled

- [ ] **Step 4: Configure Azure AD (for Outlook)**

1. Go to Azure Portal → Microsoft Entra ID → App Registrations → New
2. Name: "Instanceiro"
3. Redirect URI: `https://instanceiro.vercel.app/api/calendar/outlook/callback` (Web)
4. Add API permissions: Microsoft Graph → Delegated → `Calendars.ReadWrite`, `offline_access`
5. Create client secret
6. Add env vars:
```bash
vercel env add OUTLOOK_CLIENT_ID production
vercel env add OUTLOOK_CLIENT_SECRET production
```
Also add to `.env.local`.

- [ ] **Step 5: Update Vercel alias**

```bash
vercel alias set <latest-deploy-url> instanceiro.vercel.app
```

---

## Phase 8: Testing (Task 16)

### Task 16: End-to-End Testing

- [ ] **Step 1: Test Google Calendar connection**

1. Go to `/profile`
2. Click "Conectar Google Calendar"
3. Authorize on Google
4. Verify redirect to `/profile` with Google Calendar toggle visible

- [ ] **Step 2: Test event creation**

1. Create a schedule for an instance
2. Check Google Calendar — event should appear with correct title, time (30 min), participants

- [ ] **Step 3: Test event update**

1. Change the schedule time
2. Verify Google Calendar event updated

- [ ] **Step 4: Test event deletion**

1. Leave the schedule
2. Verify Google Calendar event deleted

- [ ] **Step 5: Test schedule completion**

1. Complete a schedule
2. Verify all participants' calendar events deleted

- [ ] **Step 6: Test Outlook (when Azure AD is configured)**

Repeat steps 1-5 with Outlook.

- [ ] **Step 7: Test disconnect**

1. Disconnect Google Calendar from profile
2. Verify no more events are created for new schedules
