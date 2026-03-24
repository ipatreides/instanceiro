# Discord DM Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Discord DMs to users when hourly instance cooldowns expire, opt-in via profile page.

**Architecture:** Discord Bot sends DMs using bot token. Supabase pg_cron triggers Edge Function every 5 minutes. Users who logged in via Discord are auto-detected; Google-login users can link Discord via OAuth `identify` scope. Profile page has toggle to enable/disable.

**Tech Stack:** Next.js 16 (App Router), Supabase (Edge Functions, pg_cron, pg_net), Discord Bot API

**Spec:** `docs/superpowers/specs/2026-03-24-discord-notifications-design.md`

## Review Corrections (apply during implementation)

The following corrections from the plan review MUST be applied:

1. **CSRF `state` parameter in OAuth flow** — The `DISCORD_OAUTH_URL` in `notifications-section.tsx` must include a random `state` parameter stored in a cookie. The callback route must validate `state` against the cookie. Generate state via `crypto.randomUUID()`, set as HttpOnly cookie before redirect, validate in callback.

2. **Query cooldown_hours from database** — The Edge Function must NOT hardcode `COOLDOWN_HOURS`. Instead, query `instances WHERE cooldown_type = 'hourly'` to get IDs and `cooldown_hours` dynamically.

3. **Edge Function auth check** — Replace `authHeader?.includes(serviceKey)` with strict equality: `authHeader !== \`Bearer ${serviceKey}\``.

4. **Move env vars setup (Task 10) before Task 4** — `NEXT_PUBLIC_DISCORD_CLIENT_ID` is needed at build time. Set it up before the UI component that references it.

5. **Move `DISCORD_BOT_TOKEN` inside handler** — In the test route (Task 7), read `process.env.DISCORD_BOT_TOKEN` inside the POST handler, not at module scope.

6. **Remove redundant Supabase secrets** — `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are only needed on Vercel (for the callback route), not as Supabase secrets. Remove from Task 2 Step 3.

7. **Add `updated_at` trigger** — Add to the migration: `CREATE OR REPLACE FUNCTION update_updated_at() ... CREATE TRIGGER ...` on `discord_notifications`, or remove the `updated_at` column if not needed.

8. **Handle `?discord=connected` query param** — The profile page or `NotificationsSection` should read the query param and show a success toast after OAuth redirect.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260324100000_discord_notifications.sql` | Create | Tables, RLS, indexes |
| `supabase/functions/discord-notify/index.ts` | Create | Cron worker: check cooldowns, send DMs |
| `src/app/api/discord-notify-callback/route.ts` | Create | OAuth callback for Google-login users |
| `src/app/api/discord-notify-test/route.ts` | Create | Test notification endpoint |
| `src/hooks/use-discord-notifications.ts` | Create | Client hook for profile page |
| `src/components/profile/notifications-section.tsx` | Create | UI component for notifications toggle |
| `src/app/profile/page.tsx` | Modify | Add notifications section |
| `src/lib/cooldown.ts` | Reference only | Cooldown logic reused in Edge Function |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260324100000_discord_notifications.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- discord_notifications table
CREATE TABLE discord_notifications (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE discord_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON discord_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON discord_notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" ON discord_notifications
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications" ON discord_notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- notification_log table
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  instance_id INT NOT NULL REFERENCES instances(id),
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log" ON notification_log
  FOR SELECT USING (auth.uid() = user_id);

-- Index for dedup lookups
CREATE INDEX idx_notification_log_dedup
  ON notification_log (user_id, character_id, instance_id, notified_at DESC);
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Copy the SQL above and run it in the Supabase Dashboard SQL Editor at:
`https://supabase.com/dashboard/project/swgnctajsbiyhqxstrnx/sql/new`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260324100000_discord_notifications.sql
git commit -m "feat: add discord_notifications and notification_log tables"
```

---

### Task 2: Discord Bot Setup (Manual)

This task is done in the Discord Developer Portal. No code changes.

- [ ] **Step 1: Create Discord bot**

1. Go to https://discord.com/developers/applications
2. Select the existing Instanceiro application (or create new)
3. Go to "Bot" section → "Add Bot"
4. Copy the bot token
5. Under "Privileged Gateway Intents", leave all OFF (not needed)

- [ ] **Step 2: Add OAuth redirect URI**

1. Go to "OAuth2" section
2. Add redirect URI: `https://instanceiro.vercel.app/api/discord-notify-callback`
3. Save

- [ ] **Step 3: Store bot token as Edge Function secret**

```bash
cd D:/rag/instance-tracker
npx supabase secrets set DISCORD_BOT_TOKEN=<paste-bot-token-here> --project-ref swgnctajsbiyhqxstrnx
```

Also store the Discord application client ID and client secret for the OAuth flow:
```bash
npx supabase secrets set DISCORD_CLIENT_ID=<client-id> --project-ref swgnctajsbiyhqxstrnx
npx supabase secrets set DISCORD_CLIENT_SECRET=<client-secret> --project-ref swgnctajsbiyhqxstrnx
```

- [ ] **Step 4: Add Discord env vars to Vercel**

The OAuth callback runs on Vercel, so it needs the Discord app credentials:
```bash
vercel env add DISCORD_CLIENT_ID production
vercel env add DISCORD_CLIENT_SECRET production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

Note: The service role key is needed for the callback to insert into `discord_notifications`. Get it from Supabase Dashboard → Settings → API → `service_role` key.

---

### Task 3: Client Hook — `use-discord-notifications`

**Files:**
- Create: `src/hooks/use-discord-notifications.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface DiscordNotificationState {
  loading: boolean;
  discordUserId: string | null;    // null = not linked
  enabled: boolean;
  discordUsername: string | null;   // from auth metadata
  isDiscordLogin: boolean;         // auto-detected
}

export function useDiscordNotifications() {
  const [state, setState] = useState<DiscordNotificationState>({
    loading: true,
    discordUserId: null,
    enabled: false,
    discordUsername: null,
    isDiscordLogin: false,
  });

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      // Check if user logged in via Discord
      const provider = user.app_metadata?.provider;
      const isDiscordLogin = provider === "discord";
      const discordMeta = user.user_metadata;
      const discordUsername = isDiscordLogin
        ? (discordMeta?.full_name ?? discordMeta?.name ?? null)
        : null;
      const discordIdFromAuth = isDiscordLogin
        ? discordMeta?.provider_id ?? null
        : null;

      // Check existing notification settings
      const { data: notif } = await supabase
        .from("discord_notifications")
        .select("discord_user_id, enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      setState({
        loading: false,
        discordUserId: notif?.discord_user_id ?? discordIdFromAuth,
        enabled: notif?.enabled ?? false,
        discordUsername: discordUsername ?? (notif ? "Discord" : null),
        isDiscordLogin,
      });
    });
  }, []);

  const toggle = useCallback(async (enabled: boolean) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (enabled && !state.discordUserId) return;

    if (enabled) {
      // Upsert: insert or update
      await supabase
        .from("discord_notifications")
        .upsert({
          user_id: user.id,
          discord_user_id: state.discordUserId!,
          enabled: true,
        });
    } else {
      await supabase
        .from("discord_notifications")
        .update({ enabled: false })
        .eq("user_id", user.id);
    }

    setState((s) => ({ ...s, enabled }));
  }, [state.discordUserId]);

  const disconnect = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("discord_notifications")
      .delete()
      .eq("user_id", user.id);

    setState((s) => ({
      ...s,
      discordUserId: s.isDiscordLogin ? s.discordUserId : null,
      enabled: false,
    }));
  }, []);

  const sendTest = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch("/api/discord-notify-test", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error ?? "Erro ao enviar teste" };
    }
    return { ok: true };
  }, []);

  return { ...state, toggle, disconnect, sendTest };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-discord-notifications.ts
git commit -m "feat: add useDiscordNotifications hook"
```

---

### Task 4: Notifications Section UI Component

**Files:**
- Create: `src/components/profile/notifications-section.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useDiscordNotifications } from "@/hooks/use-discord-notifications";

const DISCORD_OAUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent("https://instanceiro.vercel.app/api/discord-notify-callback")}&response_type=code&scope=identify`;

export function NotificationsSection() {
  const {
    loading,
    discordUserId,
    enabled,
    discordUsername,
    isDiscordLogin,
    toggle,
    disconnect,
    sendTest,
  } = useDiscordNotifications();

  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (loading) return null;

  async function handleTest() {
    setTestSending(true);
    setTestResult(null);
    const result = await sendTest();
    setTestResult(result.ok ? "Notificacao enviada!" : (result.error ?? "Erro"));
    setTestSending(false);
    if (result.ok) setTimeout(() => setTestResult(null), 3000);
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-text-primary">Notificacoes</h2>
      <p className="text-xs text-text-secondary">
        Receba uma mensagem no Discord quando suas instancias horarias ficarem disponiveis.
      </p>

      {!discordUserId ? (
        /* Not connected — show connect button */
        <a
          href={DISCORD_OAUTH_URL}
          className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-[#5865F2] text-white font-semibold text-sm hover:bg-[#4752C4] transition-colors cursor-pointer"
        >
          <svg width="20" height="15" viewBox="0 0 71 55" fill="currentColor">
            <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A38 38 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 5a.2.2 0 00-.1 0A60 60 0 00.4 45a.2.2 0 000 .2 58.7 58.7 0 0017.7 9 .2.2 0 00.3-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.7 38.7 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 41.9 41.9 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.3 36.3 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.2 0A58.5 58.5 0 0070.3 45a.2.2 0 000-.2A59.7 59.7 0 0060.2 5a.2.2 0 00-.1 0zM23.7 36.9c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1 6.5 3.2 6.4 7.1c0 3.9-2.8 7.1-6.4 7.1zm23.7 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1 6.5 3.2 6.4 7.1c0 3.9-2.9 7.1-6.4 7.1z" />
          </svg>
          Conectar Discord
        </a>
      ) : (
        /* Connected — show toggle and options */
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm text-text-primary">Instancias horarias</span>
              <span className="text-xs text-text-secondary">
                Conectado como {discordUsername ?? "Discord"}
              </span>
            </div>
            <button
              onClick={() => toggle(!enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {enabled && (
            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={testSending}
                className="text-xs text-primary hover:text-primary-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                {testSending ? "Enviando..." : "Enviar notificacao teste"}
              </button>
            </div>
          )}

          {testResult && (
            <p className={`text-xs ${testResult.includes("Erro") ? "text-status-error" : "text-status-available"}`}>
              {testResult}
            </p>
          )}

          {!isDiscordLogin && (
            <button
              onClick={disconnect}
              className="text-xs text-text-secondary hover:text-status-error transition-colors cursor-pointer self-start"
            >
              Desconectar Discord
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

Note: `NEXT_PUBLIC_DISCORD_CLIENT_ID` needs to be added to Vercel env vars and `.env.local`.

- [ ] **Step 2: Commit**

```bash
git add src/components/profile/notifications-section.tsx
git commit -m "feat: add NotificationsSection component for profile page"
```

---

### Task 5: Add Notifications Section to Profile Page

**Files:**
- Modify: `src/app/profile/page.tsx`

- [ ] **Step 1: Import and add the component**

Add import at the top:
```typescript
import { NotificationsSection } from "@/components/profile/notifications-section";
```

Add after the closing `</div>` of the existing profile card (after line 144), before `</main>`:
```tsx
        <div className="mt-6">
          <NotificationsSection />
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat: add notifications section to profile page"
```

---

### Task 6: Discord OAuth Callback API Route

**Files:**
- Create: `src/app/api/discord-notify-callback/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/profile?discord=error`);
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/discord-notify-callback`,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${origin}/profile?discord=error`);
    }

    const tokenData = await tokenRes.json();

    // Fetch Discord user info
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${origin}/profile?discord=error`);
    }

    const discordUser = await userRes.json();

    // Get current Supabase user
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${origin}/profile?discord=error`);
    }

    // Insert using service role (bypasses RLS for initial insert)
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    await serviceClient
      .from("discord_notifications")
      .upsert({
        user_id: user.id,
        discord_user_id: discordUser.id,
        enabled: true,
      });

    return NextResponse.redirect(`${origin}/profile?discord=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/profile?discord=error`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/discord-notify-callback/route.ts
git commit -m "feat: add Discord OAuth callback API route"
```

---

### Task 7: Test Notification API Route

**Files:**
- Create: `src/app/api/discord-notify-test/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;

async function sendDiscordDM(discordUserId: string, content: string): Promise<boolean> {
  // Create DM channel
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) return false;
  const channel = await channelRes.json();

  // Send message
  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  return msgRes.ok;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { data: notif } = await supabase
    .from("discord_notifications")
    .select("discord_user_id, enabled")
    .eq("user_id", user.id)
    .single();

  if (!notif) {
    return NextResponse.json({ error: "Discord nao conectado" }, { status: 400 });
  }

  const ok = await sendDiscordDM(
    notif.discord_user_id,
    "Teste do Instanceiro! Se voce recebeu esta mensagem, as notificacoes estao funcionando."
  );

  if (!ok) {
    return NextResponse.json({ error: "Nao foi possivel enviar DM. Verifique se as DMs do bot estao permitidas." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add DISCORD_BOT_TOKEN to Vercel env vars**

```bash
vercel env add DISCORD_BOT_TOKEN production
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/discord-notify-test/route.ts
git commit -m "feat: add test notification API route"
```

---

### Task 8: Supabase Edge Function — `discord-notify`

**Files:**
- Create: `supabase/functions/discord-notify/index.ts`

- [ ] **Step 1: Create the Edge Function**

```bash
mkdir -p supabase/functions/discord-notify
```

```typescript
// supabase/functions/discord-notify/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const DISCORD_API = "https://discord.com/api/v10";
const HOURLY_INSTANCE_IDS = [1, 2, 3, 4];

// Cooldown hours per instance (must match frontend cooldown.ts)
const COOLDOWN_HOURS: Record<number, number> = {
  1: 12,  // Altar do Selo
  2: 3,   // Caverna do Polvo
  3: 1,   // Esgotos de Malangdo
  4: 3,   // Espaço Infinito
};

function calculateHourlyCooldownExpiry(completedAt: Date, instanceId: number): Date {
  const hours = COOLDOWN_HOURS[instanceId] ?? 3;
  return new Date(completedAt.getTime() + hours * 60 * 60 * 1000);
}

async function sendDiscordDM(botToken: string, discordUserId: string, content: string): Promise<{ ok: boolean; code?: number }> {
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    return { ok: false, code: channelRes.status };
  }

  const channel = await channelRes.json();

  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!msgRes.ok) {
    const err = await msgRes.json().catch(() => ({}));
    return { ok: false, code: err.code ?? msgRes.status };
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  // Verify authorization
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader?.includes(serviceKey ?? "NONE")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN")!;

  const supabase = createClient(supabaseUrl, serviceKey!, {
    auth: { persistSession: false },
  });

  const now = new Date();
  let sent = 0;
  let errors = 0;

  // 1. Fetch all enabled notification users
  const { data: users, error: usersError } = await supabase
    .from("discord_notifications")
    .select("user_id, discord_user_id")
    .eq("enabled", true);

  if (usersError || !users?.length) {
    return Response.json({ sent: 0, errors: 0, message: usersError?.message ?? "no users" });
  }

  for (const user of users) {
    try {
      // 2. Fetch user's active characters
      const { data: characters } = await supabase
        .from("characters")
        .select("id, name, user_id")
        .eq("user_id", user.user_id)
        .eq("is_active", true);

      if (!characters?.length) continue;

      const charIds = characters.map((c) => c.id);

      // 3. Fetch completions for hourly instances
      const { data: completions } = await supabase
        .from("instance_completions")
        .select("character_id, instance_id, completed_at")
        .in("character_id", charIds)
        .in("instance_id", HOURLY_INSTANCE_IDS)
        .order("completed_at", { ascending: false });

      if (!completions?.length) continue;

      // 4. Fetch existing notification log entries
      const { data: logEntries } = await supabase
        .from("notification_log")
        .select("character_id, instance_id, notified_at")
        .eq("user_id", user.user_id)
        .in("character_id", charIds)
        .in("instance_id", HOURLY_INSTANCE_IDS);

      // Build lookup maps
      const latestCompletion = new Map<string, { completed_at: string }>();
      for (const c of completions) {
        const key = `${c.character_id}:${c.instance_id}`;
        if (!latestCompletion.has(key)) {
          latestCompletion.set(key, { completed_at: c.completed_at });
        }
      }

      const latestNotification = new Map<string, string>();
      for (const l of (logEntries ?? [])) {
        const key = `${l.character_id}:${l.instance_id}`;
        const existing = latestNotification.get(key);
        if (!existing || l.notified_at > existing) {
          latestNotification.set(key, l.notified_at);
        }
      }

      // 5. Find newly available instances
      const pending: { instanceId: number; characterId: string; characterName: string }[] = [];

      for (const char of characters) {
        for (const instanceId of HOURLY_INSTANCE_IDS) {
          const key = `${char.id}:${instanceId}`;
          const completion = latestCompletion.get(key);
          if (!completion) continue; // Never completed, skip

          const expiry = calculateHourlyCooldownExpiry(new Date(completion.completed_at), instanceId);
          if (expiry > now) continue; // Still on cooldown

          // Check if already notified
          const lastNotified = latestNotification.get(key);
          if (lastNotified && lastNotified > completion.completed_at) continue; // Already notified

          pending.push({ instanceId, characterId: char.id, characterName: char.name });
        }
      }

      if (!pending.length) continue;

      // 6. Build message
      // Fetch instance names
      const { data: instances } = await supabase
        .from("instances")
        .select("id, name")
        .in("id", HOURLY_INSTANCE_IDS);

      const nameMap = new Map((instances ?? []).map((i) => [i.id, i.name]));

      // Group by instance, list character names
      const grouped = new Map<number, string[]>();
      for (const p of pending) {
        const list = grouped.get(p.instanceId) ?? [];
        list.push(p.characterName);
        grouped.set(p.instanceId, list);
      }

      let message = "Instancias disponiveis:\n";
      for (const [instanceId, charNames] of grouped) {
        message += `• ${nameMap.get(instanceId) ?? `#${instanceId}`} — ${charNames.join(", ")}\n`;
      }

      // 7. Send DM
      const result = await sendDiscordDM(botToken, user.discord_user_id, message.trim());

      if (result.ok) {
        sent++;
        // Insert notification log entries
        const logRows = pending.map((p) => ({
          user_id: user.user_id,
          character_id: p.characterId,
          instance_id: p.instanceId,
        }));
        await supabase.from("notification_log").insert(logRows);
      } else {
        errors++;
        // Disable on permanent failures
        if (result.code === 403 || result.code === 50007) {
          await supabase
            .from("discord_notifications")
            .update({ enabled: false })
            .eq("user_id", user.user_id);
        }
      }
    } catch (e) {
      errors++;
      console.error(`Error processing user ${user.user_id}:`, e);
    }
  }

  return Response.json({ sent, errors, checked: users.length });
});
```

- [ ] **Step 2: Deploy the Edge Function**

```bash
cd D:/rag/instance-tracker
npx supabase functions deploy discord-notify --project-ref swgnctajsbiyhqxstrnx
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/discord-notify/index.ts
git commit -m "feat: add discord-notify Edge Function for hourly instance DMs"
```

---

### Task 9: pg_cron Setup (Manual)

- [ ] **Step 1: Enable pg_net extension**

Run in Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

- [ ] **Step 2: Schedule the notification cron**

Run in Supabase SQL Editor (replace `<service_role_key>` with the actual key):
```sql
SELECT cron.schedule(
  'discord-hourly-notify',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://swgnctajsbiyhqxstrnx.supabase.co/functions/v1/discord-notify',
    headers := jsonb_build_object('Authorization', 'Bearer <service_role_key>')
  )$$
);
```

- [ ] **Step 3: Schedule the cleanup cron**

Run in Supabase SQL Editor:
```sql
SELECT cron.schedule(
  'cleanup-notification-log',
  '0 7 * * *',
  $$DELETE FROM notification_log WHERE notified_at < now() - interval '24 hours'$$
);
```

- [ ] **Step 4: Verify crons are registered**

```sql
SELECT * FROM cron.job;
```

Expected: 2 rows — `discord-hourly-notify` and `cleanup-notification-log`.

---

### Task 10: Add NEXT_PUBLIC_DISCORD_CLIENT_ID to env

- [ ] **Step 1: Add to `.env.local`**

```
NEXT_PUBLIC_DISCORD_CLIENT_ID=<your-discord-app-client-id>
```

- [ ] **Step 2: Add to Vercel**

```bash
vercel env add NEXT_PUBLIC_DISCORD_CLIENT_ID production
```

- [ ] **Step 3: Build and push**

```bash
cd D:/rag/instance-tracker
npm run build
git add -A
git commit -m "feat: discord notifications - complete implementation"
git push
```

---

### Task 11: End-to-End Testing

- [ ] **Step 1: Test profile page (Discord login user)**

1. Log in with Discord
2. Go to `/profile`
3. Verify "Notificacoes" section appears with toggle (auto-detected Discord)
4. Enable the toggle
5. Click "Enviar notificacao teste"
6. Verify DM received on Discord

- [ ] **Step 2: Test profile page (Google login user)**

1. Log in with Google
2. Go to `/profile`
3. Click "Conectar Discord"
4. Authorize on Discord
5. Verify redirect back to profile with toggle visible
6. Enable and test

- [ ] **Step 3: Test cron cycle**

1. Complete an hourly instance (e.g., Esgotos de Malangdo, 1h cooldown)
2. Wait for cooldown to expire + next cron cycle (~5 min after expiry)
3. Verify DM received
4. Verify no duplicate DM on next cycle

- [ ] **Step 4: Test disable/disconnect**

1. Toggle off → verify no more DMs
2. Toggle on → verify DMs resume
3. Disconnect (Google user) → verify "Conectar Discord" button returns
