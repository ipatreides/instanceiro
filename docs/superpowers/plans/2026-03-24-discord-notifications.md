# Discord DM Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Discord DMs to users when hourly instance cooldowns expire, opt-in via profile page.

**Architecture:** Discord Bot sends DMs via bot token. Users must share a server with the bot (existing community server or new Instanceiro server). Supabase pg_cron triggers Edge Function every 5 minutes. Discord-login users get invite link; Google-login users auto-join via `guilds.join` OAuth scope.

**Tech Stack:** Next.js 16 (App Router), Supabase (Edge Functions, pg_cron, pg_net), Discord Bot API

**Spec:** `docs/superpowers/specs/2026-03-24-discord-notifications-design.md`

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

---

### Task 1: Environment Variables Setup

This must come first — other tasks depend on these values.

- [ ] **Step 1: Add env vars to `.env.local`**

```
NEXT_PUBLIC_DISCORD_CLIENT_ID=<discord-app-client-id>
DISCORD_CLIENT_SECRET=<discord-app-client-secret>
DISCORD_BOT_TOKEN=<bot-token>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-dashboard>
NEXT_PUBLIC_DISCORD_INVITE_URL=<permanent-invite-link-to-instanceiro-server>
NEXT_PUBLIC_DISCORD_GUILD_ID=<instanceiro-server-id>
```

- [ ] **Step 2: Add to Vercel (production)**

```bash
cd D:/rag/instance-tracker
vercel env add NEXT_PUBLIC_DISCORD_CLIENT_ID production
vercel env add DISCORD_CLIENT_SECRET production
vercel env add DISCORD_BOT_TOKEN production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXT_PUBLIC_DISCORD_INVITE_URL production
vercel env add NEXT_PUBLIC_DISCORD_GUILD_ID production
```

- [ ] **Step 3: Add Supabase Edge Function secrets**

```bash
npx supabase secrets set DISCORD_BOT_TOKEN=<bot-token> --project-ref swgnctajsbiyhqxstrnx
```

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in Edge Functions.

---

### Task 2: Discord Bot & Server Setup (Manual)

- [ ] **Step 1: Create/configure Discord bot**

1. Go to https://discord.com/developers/applications
2. Select existing Instanceiro app (or create new)
3. Go to "Bot" section → "Add Bot" (if not already a bot)
4. Copy bot token (used in Task 1)
5. Under "Privileged Gateway Intents", leave all OFF
6. Go to "OAuth2" section → Add redirect URI: `https://instanceiro.vercel.app/api/discord-notify-callback`

- [ ] **Step 2: Add bot to existing community server**

Generate a bot invite URL with `Send Messages` permission:
```
https://discord.com/api/oauth2/authorize?client_id=<CLIENT_ID>&permissions=2048&scope=bot
```

Open this URL and select the existing server (ID: `1457831662913061016`).

- [ ] **Step 3: Create Instanceiro server**

1. Create a new Discord server named "Instanceiro"
2. Create a `#bem-vindo` channel with message: "Este servidor existe para o bot do Instanceiro poder te enviar notificacoes de instancias. Voce nao precisa fazer nada aqui!"
3. Add the bot to this server using the same invite URL from Step 2
4. Create a permanent invite link (Server Settings → Invites → Create, set to never expire, unlimited uses)
5. Copy the server ID (right-click → Copy Server ID) and the invite URL — used in Task 1

---

### Task 3: Database Migration

**Files:**
- Create: `supabase/migrations/20260324100000_discord_notifications.sql`

- [ ] **Step 1: Write the migration**

```sql
-- discord_notifications table
CREATE TABLE discord_notifications (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_discord_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discord_notifications_updated_at
  BEFORE UPDATE ON discord_notifications
  FOR EACH ROW EXECUTE FUNCTION update_discord_notifications_updated_at();

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

-- notification_log table (inserts via service role only, reads by user)
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

- [ ] **Step 2: Run in Supabase SQL Editor**

Go to `https://supabase.com/dashboard/project/swgnctajsbiyhqxstrnx/sql/new` and run the SQL.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260324100000_discord_notifications.sql
git commit -m "feat: add discord_notifications and notification_log tables"
```

---

### Task 4: Client Hook — `use-discord-notifications`

**Files:**
- Create: `src/hooks/use-discord-notifications.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface DiscordNotificationState {
  loading: boolean;
  discordUserId: string | null;
  enabled: boolean;
  discordUsername: string | null;
  isDiscordLogin: boolean;
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
      const meta = user.user_metadata;
      const discordUsername = isDiscordLogin
        ? (meta?.full_name ?? meta?.name ?? null)
        : null;
      const discordIdFromAuth = isDiscordLogin
        ? (meta?.provider_id ?? null)
        : null;

      // Check existing notification row
      const { data: notif } = await supabase
        .from("discord_notifications")
        .select("discord_user_id, enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      setState({
        loading: false,
        discordUserId: notif?.discord_user_id ?? discordIdFromAuth,
        enabled: notif?.enabled ?? false,
        discordUsername: notif ? (discordUsername ?? "Discord") : discordUsername,
        isDiscordLogin,
      });
    });
  }, []);

  const toggle = useCallback(async (enabled: boolean) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !state.discordUserId) return;

    if (enabled) {
      await supabase.from("discord_notifications").upsert({
        user_id: user.id,
        discord_user_id: state.discordUserId,
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
      discordUsername: s.isDiscordLogin ? s.discordUsername : null,
    }));
  }, []);

  const sendTest = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch("/api/discord-notify-test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
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

### Task 5: Notifications Section UI Component

**Files:**
- Create: `src/components/profile/notifications-section.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useDiscordNotifications } from "@/hooks/use-discord-notifications";

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "";

function getDiscordOAuthURL(): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "";
  const redirectUri = encodeURIComponent(
    `${window.location.origin}/api/discord-notify-callback`
  );
  // Generate CSRF state, store in cookie
  const state = crypto.randomUUID();
  document.cookie = `discord_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`;
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join&state=${state}`;
}

export function NotificationsSection() {
  const {
    loading, discordUserId, enabled, discordUsername,
    isDiscordLogin, toggle, disconnect, sendTest,
  } = useDiscordNotifications();

  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (loading) return null;

  async function handleTest() {
    setTestSending(true);
    setTestResult(null);
    const result = await sendTest();
    if (result.ok) {
      setTestResult("Notificacao enviada! Verifique seu Discord.");
    } else if (result.error?.includes("servidor")) {
      setTestResult(result.error);
    } else {
      setTestResult(result.error ?? "Erro ao enviar. Verifique se voce esta no servidor e com DMs ativadas.");
    }
    setTestSending(false);
    if (result.ok) setTimeout(() => setTestResult(null), 5000);
  }

  // State: Google login, no Discord linked
  if (!discordUserId) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-text-primary">Notificacoes</h2>
        <p className="text-xs text-text-secondary">
          Receba uma mensagem no Discord quando suas instancias horarias ficarem disponiveis.
        </p>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.location.href = getDiscordOAuthURL(); }}
          className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-[#5865F2] text-white font-semibold text-sm hover:bg-[#4752C4] transition-colors cursor-pointer"
        >
          Conectar Discord
        </a>
      </div>
    );
  }

  // State: Discord detected (login or linked)
  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-text-primary">Notificacoes</h2>
      <p className="text-xs text-text-secondary">
        Receba uma mensagem no Discord quando suas instancias horarias ficarem disponiveis.
      </p>

      {/* Server invite (always visible for Discord-login users who might not be in server) */}
      {isDiscordLogin && !enabled && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-secondary">
            Para receber notificacoes, entre no servidor do Instanceiro:
          </p>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-md bg-[#5865F2] text-white font-semibold text-sm hover:bg-[#4752C4] transition-colors cursor-pointer"
          >
            Entrar no servidor
          </a>
        </div>
      )}

      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm text-text-primary">Instancias horarias</span>
          {discordUsername && (
            <span className="text-xs text-text-secondary">
              Conectado como {discordUsername}
            </span>
          )}
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

      {/* Test button + result */}
      {enabled && (
        <button
          onClick={handleTest}
          disabled={testSending}
          className="text-xs text-primary hover:text-primary-hover transition-colors cursor-pointer disabled:opacity-50 self-start"
        >
          {testSending ? "Enviando..." : "Enviar notificacao teste"}
        </button>
      )}

      {testResult && (
        <p className={`text-xs ${testResult.includes("enviada") ? "text-status-available" : "text-status-error"}`}>
          {testResult}
        </p>
      )}

      {/* Disconnect (Google-linked users only) */}
      {!isDiscordLogin && (
        <button
          onClick={disconnect}
          className="text-xs text-text-secondary hover:text-status-error transition-colors cursor-pointer self-start"
        >
          Desconectar Discord
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/profile/notifications-section.tsx
git commit -m "feat: add NotificationsSection component"
```

---

### Task 6: Add Notifications Section to Profile Page

**Files:**
- Modify: `src/app/profile/page.tsx`

- [ ] **Step 1: Add import and component**

Add import at top:
```typescript
import { NotificationsSection } from "@/components/profile/notifications-section";
```

Add after the existing profile card's closing `</div>` (line 144), before `</main>`:
```tsx
        <div className="mt-6">
          <NotificationsSection />
        </div>
```

- [ ] **Step 2: Handle `?discord=connected` query param**

Add to the profile page's `useEffect` (after the existing data fetch):
```typescript
// Show success message if redirected from Discord OAuth
const params = new URLSearchParams(window.location.search);
if (params.get("discord") === "connected") {
  // Clean URL
  window.history.replaceState({}, "", "/profile");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat: add notifications section to profile page"
```

---

### Task 7: Discord OAuth Callback API Route

**Files:**
- Create: `src/app/api/discord-notify-callback/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // CSRF validation
  const cookieStore = await cookies();
  const storedState = cookieStore.get("discord_oauth_state")?.value;
  cookieStore.delete("discord_oauth_state");

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/profile?discord=error`);
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
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

    // Auto-join user to Instanceiro server
    const guildId = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID!;
    const botToken = process.env.DISCORD_BOT_TOKEN!;

    await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordUser.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: tokenData.access_token }),
    });
    // Note: 204 = already in server, 201 = added. Both are fine. Errors are non-fatal.

    // Get current Supabase user and insert notification row
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${origin}/profile?discord=error`);
    }

    await supabase.from("discord_notifications").upsert({
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
git commit -m "feat: add Discord OAuth callback with CSRF and guilds.join"
```

---

### Task 8: Test Notification API Route

**Files:**
- Create: `src/app/api/discord-notify-test/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";

async function sendDiscordDM(botToken: string, discordUserId: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    return { ok: false, error: "Nao foi possivel criar canal DM. Verifique se voce esta no servidor do Instanceiro." };
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
    return { ok: false, error: "Nao foi possivel enviar DM. Verifique se as DMs estao ativadas para o servidor." };
  }

  return { ok: true };
}

export async function POST() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot nao configurado" }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { data: notif } = await supabase
    .from("discord_notifications")
    .select("discord_user_id")
    .eq("user_id", user.id)
    .single();

  if (!notif) {
    return NextResponse.json({ error: "Discord nao conectado" }, { status: 400 });
  }

  const result = await sendDiscordDM(
    botToken,
    notif.discord_user_id,
    "Teste do Instanceiro! Se voce recebeu esta mensagem, as notificacoes estao funcionando."
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/discord-notify-test/route.ts
git commit -m "feat: add test notification API route"
```

---

### Task 9: Supabase Edge Function — `discord-notify`

**Files:**
- Create: `supabase/functions/discord-notify/index.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p supabase/functions/discord-notify
```

- [ ] **Step 2: Create the Edge Function**

```typescript
// supabase/functions/discord-notify/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_API = "https://discord.com/api/v10";

interface InstanceRow {
  id: number;
  name: string;
  cooldown_hours: number;
}

function calculateHourlyCooldownExpiry(completedAt: Date, cooldownHours: number): Date {
  return new Date(completedAt.getTime() + cooldownHours * 60 * 60 * 1000);
}

async function sendDiscordDM(
  botToken: string,
  discordUserId: string,
  content: string
): Promise<{ ok: boolean; code?: number }> {
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
  // Auth check
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN")!;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  let sent = 0;
  let errors = 0;

  // Fetch hourly instances from database (dynamic, not hardcoded)
  const { data: hourlyInstances } = await supabase
    .from("instances")
    .select("id, name, cooldown_hours")
    .eq("cooldown_type", "hourly");

  if (!hourlyInstances?.length) {
    return Response.json({ sent: 0, errors: 0, message: "no hourly instances" });
  }

  const instanceIds = hourlyInstances.map((i: InstanceRow) => i.id);
  const instanceMap = new Map(hourlyInstances.map((i: InstanceRow) => [i.id, i]));

  // Fetch enabled notification users
  const { data: users } = await supabase
    .from("discord_notifications")
    .select("user_id, discord_user_id")
    .eq("enabled", true);

  if (!users?.length) {
    return Response.json({ sent: 0, errors: 0, message: "no enabled users" });
  }

  for (const user of users) {
    try {
      // Fetch active characters
      const { data: characters } = await supabase
        .from("characters")
        .select("id, name")
        .eq("user_id", user.user_id)
        .eq("is_active", true);

      if (!characters?.length) continue;

      const charIds = characters.map((c: { id: string }) => c.id);

      // Fetch completions + notification log in parallel
      const [completionsRes, logRes] = await Promise.all([
        supabase
          .from("instance_completions")
          .select("character_id, instance_id, completed_at")
          .in("character_id", charIds)
          .in("instance_id", instanceIds)
          .order("completed_at", { ascending: false }),
        supabase
          .from("notification_log")
          .select("character_id, instance_id, notified_at")
          .eq("user_id", user.user_id)
          .in("instance_id", instanceIds),
      ]);

      const completions = completionsRes.data ?? [];
      const logEntries = logRes.data ?? [];

      if (!completions.length) continue;

      // Build lookup: latest completion per (char, instance)
      const latestCompletion = new Map<string, string>();
      for (const c of completions) {
        const key = `${c.character_id}:${c.instance_id}`;
        if (!latestCompletion.has(key)) {
          latestCompletion.set(key, c.completed_at);
        }
      }

      // Build lookup: latest notification per (char, instance)
      const latestNotification = new Map<string, string>();
      for (const l of logEntries) {
        const key = `${l.character_id}:${l.instance_id}`;
        const existing = latestNotification.get(key);
        if (!existing || l.notified_at > existing) {
          latestNotification.set(key, l.notified_at);
        }
      }

      // Find newly available instances
      const pending: { instanceId: number; characterId: string; characterName: string }[] = [];

      for (const char of characters) {
        for (const instanceId of instanceIds) {
          const key = `${char.id}:${instanceId}`;
          const completedAt = latestCompletion.get(key);
          if (!completedAt) continue; // Never completed, skip

          const instance = instanceMap.get(instanceId);
          if (!instance?.cooldown_hours) continue;

          const expiry = calculateHourlyCooldownExpiry(new Date(completedAt), instance.cooldown_hours);
          if (expiry > now) continue; // Still on cooldown

          // Dedup: already notified for this completion?
          const lastNotified = latestNotification.get(key);
          if (lastNotified && lastNotified > completedAt) continue;

          pending.push({ instanceId, characterId: char.id, characterName: char.name });
        }
      }

      if (!pending.length) continue;

      // Build consolidated message
      const grouped = new Map<number, string[]>();
      for (const p of pending) {
        const list = grouped.get(p.instanceId) ?? [];
        list.push(p.characterName);
        grouped.set(p.instanceId, list);
      }

      let message = "Instancias disponiveis:\n";
      for (const [instanceId, charNames] of grouped) {
        const name = instanceMap.get(instanceId)?.name ?? `#${instanceId}`;
        message += `• ${name} — ${charNames.join(", ")}\n`;
      }

      // Send DM
      const result = await sendDiscordDM(botToken, user.discord_user_id, message.trim());

      if (result.ok) {
        sent++;
        await supabase.from("notification_log").insert(
          pending.map((p) => ({
            user_id: user.user_id,
            character_id: p.characterId,
            instance_id: p.instanceId,
          }))
        );
      } else {
        errors++;
        // Auto-disable on permanent failures
        if (result.code === 403 || result.code === 50007) {
          await supabase
            .from("discord_notifications")
            .update({ enabled: false })
            .eq("user_id", user.user_id);
        }
      }
    } catch (e) {
      errors++;
      console.error(`Error for user ${user.user_id}:`, e);
    }
  }

  return Response.json({ sent, errors, checked: users.length });
});
```

- [ ] **Step 3: Deploy**

```bash
npx supabase functions deploy discord-notify --project-ref swgnctajsbiyhqxstrnx
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/discord-notify/index.ts
git commit -m "feat: add discord-notify Edge Function"
```

---

### Task 10: pg_cron Setup (Manual — Supabase SQL Editor)

- [ ] **Step 1: Enable pg_net**

```sql
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

- [ ] **Step 2: Schedule notification cron (every 5 minutes)**

Replace `<service_role_key>` with actual key:
```sql
SELECT cron.schedule(
  'discord-hourly-notify',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://swgnctajsbiyhqxstrnx.supabase.co/functions/v1/discord-notify',
    headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
  )$$
);
```

- [ ] **Step 3: Schedule cleanup cron (daily at 4 AM BRT / 7 AM UTC)**

```sql
SELECT cron.schedule(
  'cleanup-notification-log',
  '0 7 * * *',
  $$DELETE FROM notification_log WHERE notified_at < now() - interval '24 hours'$$
);
```

- [ ] **Step 4: Verify**

```sql
SELECT * FROM cron.job;
```

Expected: 2 rows.

---

### Task 11: Build, Push, Deploy

- [ ] **Step 1: Build locally**

```bash
cd D:/rag/instance-tracker
npm run build
```

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Update Vercel alias after deploy**

Wait for Vercel auto-deploy, then:
```bash
vercel alias set <latest-deploy-url> instanceiro.vercel.app
```

---

### Task 12: End-to-End Testing

- [ ] **Step 1: Test Discord-login user**

1. Log in with Discord → go to `/profile`
2. See "Notificacoes" section with server invite link
3. Join the Instanceiro server via the link
4. Enable the toggle
5. Click "Enviar notificacao teste"
6. Verify DM received on Discord

- [ ] **Step 2: Test Google-login user**

1. Log in with Google → go to `/profile`
2. Click "Conectar Discord"
3. Authorize on Discord (grants `identify` + `guilds.join`)
4. Verify redirect back to `/profile` with toggle visible and enabled
5. Verify auto-joined to Instanceiro server
6. Click "Enviar notificacao teste"
7. Verify DM received

- [ ] **Step 3: Test cron notification cycle**

1. Complete Esgotos de Malangdo (1h cooldown)
2. Wait for cooldown to expire + next 5-min cron cycle
3. Verify DM received with "Instancias disponiveis: • Esgotos de Malangdo — [char name]"
4. Wait for next cron cycle → verify NO duplicate DM

- [ ] **Step 4: Test disable/disconnect**

1. Toggle off → wait for cron → verify no DM
2. Toggle on → complete instance → wait → verify DM resumes
3. Disconnect (Google user) → verify "Conectar Discord" button returns

- [ ] **Step 5: Test error handling**

1. Leave the Instanceiro server → wait for cron → verify `enabled` is set to `false`
2. Re-join server → re-enable toggle → verify DMs work again
