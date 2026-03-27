# Discord Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Discord config into a single progressive card on the profile page with bot OAuth, channel selection, and alert timing.

**Architecture:** New columns on `discord_notifications` for bot config. New API routes for bot OAuth callback and channel listing. New `DiscordSection` component replaces `NotificationsSection` + bot card. Alert trigger updated to read from owner's profile.

**Tech Stack:** Next.js 16, Supabase, Discord API v10, OAuth2

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260327300000_discord_profile_config.sql` | Create | Add bot columns to discord_notifications, update alert trigger |
| `src/app/api/discord-bot-callback/route.ts` | Create | Bot OAuth callback — save guild_id |
| `src/app/api/discord-channels/route.ts` | Create | List guild text channels |
| `src/hooks/use-discord-notifications.ts` | Modify | Add bot_guild_id, bot_channel_id, alert_minutes state + methods |
| `src/components/profile/discord-section.tsx` | Create | Unified Discord config card |
| `src/app/profile/page.tsx` | Modify | Replace NotificationsSection + bot card with DiscordSection |
| `src/app/api/mvp-alerts/process/route.ts` | Modify | Read channel from owner's profile |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260327300000_discord_profile_config.sql`

- [ ] **Step 1: Create migration**

```sql
-- Add bot config columns to discord_notifications
ALTER TABLE discord_notifications
  ADD COLUMN IF NOT EXISTS bot_guild_id TEXT,
  ADD COLUMN IF NOT EXISTS bot_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS alert_minutes INT DEFAULT 5 CHECK (alert_minutes IN (5, 10, 15));

-- Update alert trigger to read from owner's profile instead of mvp_groups
CREATE OR REPLACE FUNCTION queue_mvp_alerts()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_config RECORD;
  v_mvp RECORD;
  v_spawn_at TIMESTAMPTZ;
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get group owner
  SELECT created_by INTO v_owner_id FROM mvp_groups WHERE id = NEW.group_id;
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get owner's Discord config
  SELECT bot_channel_id, alert_minutes INTO v_config
  FROM discord_notifications WHERE user_id = v_owner_id;

  IF v_config.bot_channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get MVP respawn time
  SELECT respawn_ms INTO v_mvp FROM mvps WHERE id = NEW.mvp_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_spawn_at := NEW.killed_at + (v_mvp.respawn_ms || ' milliseconds')::interval;

  -- Queue pre-spawn alert
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at - (v_config.alert_minutes || ' minutes')::interval, 'pre_spawn');

  -- Queue spawn alert
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at, 'spawn');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260327300000_discord_profile_config.sql
git commit -m "feat: add bot config columns and update alert trigger to read from profile"
```

---

### Task 2: Bot OAuth callback route

**Files:**
- Create: `src/app/api/discord-bot-callback/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const guildId = searchParams.get("guild_id");
  const state = searchParams.get("state");

  // CSRF validation
  const cookieStore = await cookies();
  const storedState = cookieStore.get("discord_bot_oauth_state")?.value;
  cookieStore.delete("discord_bot_oauth_state");

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/profile?bot=error`);
  }

  try {
    // Exchange code for token (validates the OAuth flow)
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/discord-bot-callback`,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${origin}/profile?bot=error`);
    }

    const tokenData = await tokenRes.json();

    // guild_id comes from query params or token response
    const resolvedGuildId = guildId || tokenData.guild?.id;
    if (!resolvedGuildId) {
      return NextResponse.redirect(`${origin}/profile?bot=error`);
    }

    // Save to database
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${origin}/profile?bot=error`);
    }

    await supabase
      .from("discord_notifications")
      .update({ bot_guild_id: resolvedGuildId })
      .eq("user_id", user.id);

    return NextResponse.redirect(`${origin}/profile?bot=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/profile?bot=error`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/discord-bot-callback/route.ts
git commit -m "feat: add Discord bot OAuth callback route"
```

---

### Task 3: Channel listing route

**Files:**
- Create: `src/app/api/discord-channels/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";

// In-memory cache: guild_id -> { channels, fetchedAt }
const channelCache = new Map<string, { channels: { id: string; name: string }[]; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's bot_guild_id
  const { data: notif } = await supabase
    .from("discord_notifications")
    .select("bot_guild_id")
    .eq("user_id", user.id)
    .single();

  if (!notif?.bot_guild_id) {
    return NextResponse.json({ error: "no_guild" }, { status: 400 });
  }

  const guildId = notif.bot_guild_id;

  // Check cache
  const cached = channelCache.get(guildId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.channels);
  }

  // Fetch from Discord
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      return NextResponse.json({ error: "bot_not_in_guild" }, { status: 404 });
    }
    return NextResponse.json({ error: "Discord API error" }, { status: 502 });
  }

  const allChannels = await res.json();

  // Filter to text channels only (type 0)
  const textChannels = allChannels
    .filter((c: { type: number }) => c.type === 0)
    .map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

  // Cache
  channelCache.set(guildId, { channels: textChannels, fetchedAt: Date.now() });

  return NextResponse.json(textChannels);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/discord-channels/route.ts
git commit -m "feat: add Discord channel listing API with 5min cache"
```

---

### Task 4: Update hook

**Files:**
- Modify: `src/hooks/use-discord-notifications.ts`

- [ ] **Step 1: Add bot fields to state and fetch, add methods**

Rewrite the hook to include `botGuildId`, `botChannelId`, `alertMinutes`, and methods `setBotChannel`, `setAlertMinutes`, `fetchChannels`, `getBotOAuthURL`.

The full updated hook:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface DiscordNotificationState {
  loading: boolean;
  discordUserId: string | null;
  hourlyEnabled: boolean;
  scheduleEnabled: boolean;
  discordUsername: string | null;
  isDiscordLogin: boolean;
  botGuildId: string | null;
  botChannelId: string | null;
  alertMinutes: number;
}

export function useDiscordNotifications() {
  const [state, setState] = useState<DiscordNotificationState>({
    loading: true,
    discordUserId: null,
    hourlyEnabled: false,
    scheduleEnabled: false,
    discordUsername: null,
    isDiscordLogin: false,
    botGuildId: null,
    botChannelId: null,
    alertMinutes: 5,
  });

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      const provider = user.app_metadata?.provider;
      const isDiscordLogin = provider === "discord";
      const meta = user.user_metadata;
      const discordUsername = isDiscordLogin
        ? (meta?.full_name ?? meta?.name ?? null)
        : null;
      const discordIdFromAuth = isDiscordLogin
        ? (meta?.provider_id ?? null)
        : null;

      const { data: notif } = await supabase
        .from("discord_notifications")
        .select("discord_user_id, hourly_enabled, schedule_enabled, bot_guild_id, bot_channel_id, alert_minutes")
        .eq("user_id", user.id)
        .maybeSingle();

      setState({
        loading: false,
        discordUserId: notif?.discord_user_id ?? discordIdFromAuth,
        hourlyEnabled: notif?.hourly_enabled ?? false,
        scheduleEnabled: notif?.schedule_enabled ?? false,
        discordUsername: notif ? (discordUsername ?? "Discord") : discordUsername,
        isDiscordLogin,
        botGuildId: notif?.bot_guild_id ?? null,
        botChannelId: notif?.bot_channel_id ?? null,
        alertMinutes: notif?.alert_minutes ?? 5,
      });
    });
  }, []);

  const toggleHourly = useCallback(async (enabled: boolean) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !state.discordUserId) return;

    if (enabled) {
      await supabase.from("discord_notifications").upsert({
        user_id: user.id,
        discord_user_id: state.discordUserId,
        hourly_enabled: true,
      });
    } else {
      await supabase
        .from("discord_notifications")
        .update({ hourly_enabled: false })
        .eq("user_id", user.id);
    }

    setState((s) => ({ ...s, hourlyEnabled: enabled }));
  }, [state.discordUserId]);

  const toggleSchedule = useCallback(async (enabled: boolean) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !state.discordUserId) return;

    if (enabled) {
      await supabase.from("discord_notifications").upsert({
        user_id: user.id,
        discord_user_id: state.discordUserId,
        schedule_enabled: true,
      });
    } else {
      await supabase
        .from("discord_notifications")
        .update({ schedule_enabled: false })
        .eq("user_id", user.id);
    }

    setState((s) => ({ ...s, scheduleEnabled: enabled }));
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
      hourlyEnabled: false,
      scheduleEnabled: false,
      discordUsername: s.isDiscordLogin ? s.discordUsername : null,
      botGuildId: null,
      botChannelId: null,
      alertMinutes: 5,
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

  const setBotChannel = useCallback(async (channelId: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("discord_notifications").update({ bot_channel_id: channelId }).eq("user_id", user.id);
    setState((s) => ({ ...s, botChannelId: channelId }));
  }, []);

  const setAlertMinutes = useCallback(async (mins: number) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("discord_notifications").update({ alert_minutes: mins }).eq("user_id", user.id);
    setState((s) => ({ ...s, alertMinutes: mins }));
  }, []);

  const fetchChannels = useCallback(async (): Promise<{ id: string; name: string }[] | { error: string }> => {
    const res = await fetch("/api/discord-channels");
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Erro ao buscar canais" };
    return data;
  }, []);

  const getBotOAuthURL = useCallback((): string => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "";
    const state = crypto.randomUUID();
    document.cookie = `discord_bot_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`;
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/discord-bot-callback`);
    return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=3072&scope=bot%20identify&redirect_uri=${redirectUri}&response_type=code&state=${state}`;
  }, []);

  return {
    ...state,
    toggleHourly, toggleSchedule, disconnect, sendTest,
    setBotChannel, setAlertMinutes, fetchChannels, getBotOAuthURL,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-discord-notifications.ts
git commit -m "feat: add bot guild/channel/alert config to useDiscordNotifications"
```

---

### Task 5: DiscordSection component

**Files:**
- Create: `src/components/profile/discord-section.tsx`

- [ ] **Step 1: Create the unified Discord card**

```typescript
"use client";

import { useState } from "react";
import { useDiscordNotifications } from "@/hooks/use-discord-notifications";

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "";

function getDiscordOAuthURL(): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "";
  const redirectUri = encodeURIComponent(
    `${window.location.origin}/api/discord-notify-callback`
  );
  const state = crypto.randomUUID();
  document.cookie = `discord_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`;
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join&state=${state}`;
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
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
  );
}

export function DiscordSection() {
  const {
    loading, discordUserId, discordUsername, isDiscordLogin,
    hourlyEnabled, scheduleEnabled,
    botGuildId, botChannelId, alertMinutes,
    toggleHourly, toggleSchedule, disconnect, sendTest,
    setBotChannel, setAlertMinutes, fetchChannels, getBotOAuthURL,
  } = useDiscordNotifications();

  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // Not connected
  if (!discordUserId) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-[22px] font-semibold text-text-primary">Discord</h2>
        <p className="text-sm text-text-secondary">
          Conecte seu Discord para receber notificações de instâncias e alertas de MVP.
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

  const loadChannels = async () => {
    setChannelsLoading(true);
    setChannelsError(null);
    const result = await fetchChannels();
    if ("error" in result) {
      setChannelsError(result.error === "bot_not_in_guild" ? "Bot não encontrado no servidor. Adicione novamente." : result.error);
      setChannels(null);
    } else {
      setChannels(result);
    }
    setChannelsLoading(false);
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-semibold text-text-primary">Discord</h2>
        {discordUsername && (
          <span className="text-sm text-text-secondary">
            Conectado como {discordUsername}
          </span>
        )}
      </div>

      {/* Section A: DM Notifications */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Notificações por DM</h3>

        {isDiscordLogin && DISCORD_INVITE_URL && (
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-text-primary transition-colors"
          >
            Entrar no servidor Instanceiro →
          </a>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">Instâncias horárias</span>
          <Toggle enabled={hourlyEnabled} onToggle={() => toggleHourly(!hourlyEnabled)} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">Agendamentos</span>
          <Toggle enabled={scheduleEnabled} onToggle={() => toggleSchedule(!scheduleEnabled)} />
        </div>
        <button
          onClick={async () => {
            setTestStatus("Enviando...");
            const result = await sendTest();
            setTestStatus(result.ok ? "Enviado!" : result.error ?? "Erro");
            setTimeout(() => setTestStatus(null), 3000);
          }}
          className="self-start text-xs text-primary hover:text-text-primary cursor-pointer transition-colors"
        >
          {testStatus ?? "Enviar teste"}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Section B: Bot MVP Timer */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Bot MVP Timer</h3>

        {/* Step B1: Add bot */}
        {!botGuildId ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-secondary">
              Adicione o bot do Instanceiro ao seu servidor para receber alertas de MVP.
            </p>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); window.location.href = getBotOAuthURL(); }}
              className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-md bg-[#5865F2] text-white font-semibold text-sm hover:bg-[#4752C4] transition-colors cursor-pointer"
            >
              Adicionar bot ao servidor
            </a>
          </div>
        ) : (
          <>
            {/* Step B2: Select channel */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-primary">Canal</span>
                <button
                  onClick={() => { window.location.href = getBotOAuthURL(); }}
                  className="text-[10px] text-text-secondary hover:text-primary cursor-pointer"
                >
                  Alterar servidor
                </button>
              </div>

              {!channels && !channelsError && (
                <button
                  onClick={loadChannels}
                  disabled={channelsLoading}
                  className="self-start text-xs text-primary hover:text-text-primary cursor-pointer transition-colors disabled:opacity-50"
                >
                  {channelsLoading ? "Carregando..." : "Selecionar canal"}
                </button>
              )}

              {channelsError && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-status-error-text">{channelsError}</span>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); window.location.href = getBotOAuthURL(); }}
                    className="text-xs text-primary cursor-pointer"
                  >
                    Adicionar bot novamente
                  </a>
                </div>
              )}

              {channels && (
                <select
                  value={botChannelId ?? ""}
                  onChange={(e) => { if (e.target.value) setBotChannel(e.target.value); }}
                  className="bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition-colors"
                >
                  <option value="">Selecione um canal</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              )}

              {botChannelId && !channels && (
                <span className="text-xs text-text-secondary">
                  Canal configurado: {botChannelId}
                  <button onClick={loadChannels} className="text-primary ml-2 cursor-pointer">Alterar</button>
                </span>
              )}
            </div>

            {/* Step B3: Alert timing */}
            {botChannelId && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary">Alerta antes do spawn:</span>
                <div className="flex gap-1">
                  {([5, 10, 15] as const).map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setAlertMinutes(mins)}
                      className={`px-2.5 py-1 text-xs rounded-md cursor-pointer transition-colors ${
                        alertMinutes === mins
                          ? "bg-primary text-white"
                          : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {mins}min
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Disconnect */}
      <div className="border-t border-border pt-3">
        <button
          onClick={disconnect}
          className="text-xs text-status-error-text hover:opacity-80 cursor-pointer"
        >
          Desconectar Discord
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/profile/discord-section.tsx
git commit -m "feat: add unified DiscordSection component for profile page"
```

---

### Task 6: Update profile page

**Files:**
- Modify: `src/app/profile/page.tsx`

- [ ] **Step 1: Replace NotificationsSection + bot card with DiscordSection**

Replace the import:
```typescript
import { NotificationsSection } from "@/components/profile/notifications-section";
```
With:
```typescript
import { DiscordSection } from "@/components/profile/discord-section";
```

Replace the notifications section + bot card:
```tsx
        <div className="mt-6">
          <NotificationsSection />
        </div>
        {/* Bot invite — for MVP Timer Discord notifications */}
        {isTestUser && (
          <div className="mt-6">
            <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
              ...bot card...
            </div>
          </div>
        )}
```

With:
```tsx
        <div className="mt-6">
          <DiscordSection />
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat: replace NotificationsSection + bot card with unified DiscordSection"
```

---

### Task 7: Update alert processing

**Files:**
- Modify: `src/app/api/mvp-alerts/process/route.ts`

- [ ] **Step 1: Read channel from owner's profile instead of mvp_groups**

Replace the group query in the batched fetch section. Change:
```typescript
    supabase.from("mvp_groups").select("id, discord_channel_id, alert_minutes").in("id", groupIds),
```
To:
```typescript
    supabase.from("mvp_groups").select("id, created_by").in("id", groupIds),
```

After fetching groups, batch-fetch the owners' discord configs:
```typescript
  const ownerIds = [...new Set((groupsRes.data ?? []).map((g: Record<string, unknown>) => g.created_by as string))];
  const { data: discordConfigs } = await supabase
    .from("discord_notifications")
    .select("user_id, bot_channel_id, alert_minutes")
    .in("user_id", ownerIds);
  const discordMap = new Map((discordConfigs ?? []).map((d: Record<string, unknown>) => [d.user_id as string, d]));
```

Then in the loop, change how `group` data is used:
```typescript
    const group = groupMap.get(alert.group_id) as { created_by: string } | undefined;
    if (!group) continue;
    const discordConfig = discordMap.get(group.created_by) as { bot_channel_id: string | null; alert_minutes: number } | undefined;
    if (!discordConfig?.bot_channel_id) continue;
```

And use `discordConfig.bot_channel_id` and `discordConfig.alert_minutes` instead of `group.discord_channel_id` and `group.alert_minutes`.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/mvp-alerts/process/route.ts
git commit -m "feat: read Discord channel from owner profile instead of mvp_groups"
```

---

### Task 8: Build and push

- [ ] **Step 1: Build**
```bash
npm run build
```

- [ ] **Step 2: Run migration on Supabase SQL Editor**

- [ ] **Step 3: Register redirect URI in Discord Developer Portal**
Add `https://instanceiro.vercel.app/api/discord-bot-callback` as an OAuth2 redirect URI.

- [ ] **Step 4: Push**
```bash
git push origin main
```
