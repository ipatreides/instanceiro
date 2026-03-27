# MVP Timer Phase 4 — Discord Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Discord channel notifications when MVP spawn is approaching, using a queue + pg_cron + API route architecture.

**Architecture:** SQL trigger on `mvp_kills` INSERT populates `mvp_alert_queue` with scheduled alert times. pg_cron calls `/api/mvp-alerts/process` every minute. The API route processes pending alerts, sends Discord messages, and marks them sent.

**Tech Stack:** Supabase (pg_cron, SQL triggers), Next.js API routes, Discord Bot API

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260327200000_mvp_alert_trigger.sql` | Create | SQL trigger to populate alert queue on kill insert; pg_cron job |
| `src/app/api/mvp-alerts/process/route.ts` | Create | API route: process pending alerts, send Discord messages |
| `src/components/mvp/mvp-tab.tsx` | Modify | Add Discord channel config in group hub |

---

### Task 1: SQL trigger + pg_cron setup

**Files:**
- Create: `supabase/migrations/20260327200000_mvp_alert_trigger.sql`

- [ ] **Step 1: Create the migration**

```sql
-- ============================================================
-- MVP Alert Queue: trigger + pg_cron
-- ============================================================

-- Trigger function: on mvp_kills INSERT, calculate alert times and queue them
CREATE OR REPLACE FUNCTION queue_mvp_alerts()
RETURNS TRIGGER AS $$
DECLARE
  v_group RECORD;
  v_mvp RECORD;
  v_spawn_at TIMESTAMPTZ;
BEGIN
  -- Only queue alerts for group kills with a configured discord channel
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT alert_minutes, discord_channel_id INTO v_group
  FROM mvp_groups WHERE id = NEW.group_id;

  IF v_group.discord_channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get MVP respawn time
  SELECT respawn_ms INTO v_mvp FROM mvps WHERE id = NEW.mvp_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_spawn_at := NEW.killed_at + (v_mvp.respawn_ms || ' milliseconds')::interval;

  -- Queue pre-spawn alert (X minutes before)
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at - (v_group.alert_minutes || ' minutes')::interval, 'pre_spawn');

  -- Queue spawn alert (at spawn time)
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at, 'spawn');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to mvp_kills
DROP TRIGGER IF EXISTS trg_queue_mvp_alerts ON mvp_kills;
CREATE TRIGGER trg_queue_mvp_alerts
  AFTER INSERT ON mvp_kills
  FOR EACH ROW
  EXECUTE FUNCTION queue_mvp_alerts();

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule: call the alert processing endpoint every minute
-- Uses pg_net to make HTTP request to the app
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cron job: every minute, call the process endpoint
SELECT cron.schedule(
  'process-mvp-alerts',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.site_url', true) || '/api/mvp-alerts/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260327200000_mvp_alert_trigger.sql
git commit -m "feat: add MVP alert queue trigger and pg_cron job"
```

---

### Task 2: Alert processing API route

**Files:**
- Create: `src/app/api/mvp-alerts/process/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DISCORD_API = "https://discord.com/api/v10";

async function sendChannelMessage(botToken: string, channelId: string, content: string): Promise<boolean> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  return res.ok;
}

function formatRespawn(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `${h}h${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

function formatBrt(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export async function POST(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get("authorization");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!serviceRoleKey || !botToken) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  // Fetch pending alerts
  const { data: alerts, error } = await supabase
    .from("mvp_alert_queue")
    .select(`
      id,
      group_id,
      mvp_kill_id,
      alert_at,
      alert_type,
      mvp_kills!inner(
        killed_at,
        tomb_x,
        tomb_y,
        mvp_id,
        killer:characters!killer_character_id(name),
        mvps!inner(name, map_name, respawn_ms, delay_ms)
      ),
      mvp_groups!inner(discord_channel_id, alert_minutes)
    `)
    .eq("sent", false)
    .lte("alert_at", new Date().toISOString())
    .limit(50);

  if (error) {
    console.error("Error fetching alerts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;

  for (const alert of alerts) {
    const kill = alert.mvp_kills as Record<string, unknown>;
    const mvp = kill.mvps as { name: string; map_name: string; respawn_ms: number; delay_ms: number };
    const group = alert.mvp_groups as { discord_channel_id: string | null; alert_minutes: number };
    const killer = kill.killer as { name: string } | null;

    if (!group.discord_channel_id) continue;

    const killedAt = new Date(kill.killed_at as string);
    const spawnAt = new Date(killedAt.getTime() + mvp.respawn_ms);
    const spawnEnd = new Date(spawnAt.getTime() + mvp.delay_ms);

    let message: string;

    if (alert.alert_type === "pre_spawn") {
      const mins = group.alert_minutes;
      message = [
        `🔴 **${mvp.name}** (${mvp.map_name})`,
        `⏰ Spawn em ${mins} minutos (${formatBrt(spawnAt)} ~ ${formatBrt(spawnEnd)} BRT)`,
        kill.tomb_x != null ? `📍 Tumba: ${kill.tomb_x}, ${kill.tomb_y}` : null,
        killer ? `🗡️ Killer: ${killer.name}` : null,
      ].filter(Boolean).join("\n");
    } else {
      message = [
        `🟢 **${mvp.name}** (${mvp.map_name}) pode ter nascido!`,
        kill.tomb_x != null ? `📍 Última tumba: ${kill.tomb_x}, ${kill.tomb_y}` : null,
      ].filter(Boolean).join("\n");
    }

    const sent = await sendChannelMessage(botToken, group.discord_channel_id, message);

    if (sent) {
      await supabase
        .from("mvp_alert_queue")
        .update({ sent: true })
        .eq("id", alert.id);
      processed++;
    }
  }

  return NextResponse.json({ processed });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/mvp-alerts/process/route.ts
git commit -m "feat: add MVP alert processing API route with Discord integration"
```

---

### Task 3: Discord channel config in group hub

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx`

- [ ] **Step 1: Add Discord channel config UI in group hub**

In the group hub (right panel when no MVP selected), after the parties section and before the closing of the `{group && (` block, add a settings section:

```tsx
            {/* Group settings */}
            <div className="mt-2">
              <p className="text-[10px] text-text-secondary font-semibold mb-2">CONFIGURAÇÕES</p>
              <div className="bg-surface border border-border rounded-md p-3 flex flex-col gap-3">
                {/* Alert timing */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">Alerta antes do spawn:</span>
                  <div className="flex gap-1">
                    {([5, 10, 15] as const).map((mins) => (
                      <button
                        key={mins}
                        onClick={() => updateGroup(group.id, { alert_minutes: mins })}
                        className={`px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
                          group.alert_minutes === mins
                            ? "bg-primary text-white"
                            : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {mins}min
                      </button>
                    ))}
                  </div>
                </div>
                {/* Discord channel */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Canal Discord (ID):</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={group.discord_channel_id ?? ""}
                      placeholder="Cole o ID do canal"
                      onBlur={(e) => {
                        const val = e.target.value.trim() || null;
                        if (val !== group.discord_channel_id) {
                          updateGroup(group.id, { discord_channel_id: val });
                        }
                      }}
                      className="flex-1 bg-bg border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <span className="text-[9px] text-text-secondary">
                    Clique direito no canal do Discord → Copiar ID do canal
                  </span>
                </div>
              </div>
            </div>
```

Also need to destructure `updateGroup` from the hook. Change:
```typescript
const { group, members, loading: groupLoading, createGroup } = useMvpGroups(selectedCharId);
```
To:
```typescript
const { group, members, loading: groupLoading, createGroup, updateGroup } = useMvpGroups(selectedCharId);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: add Discord channel and alert timing config in group hub"
```

---

### Task 4: Build, migrate, push

- [ ] **Step 1: Build**
```bash
npm run build
```

- [ ] **Step 2: Run migration on Supabase SQL Editor**

Copy and run `supabase/migrations/20260327200000_mvp_alert_trigger.sql`.

Note: pg_cron needs `app.settings.site_url` and `app.settings.service_role_key` set in Supabase. These need to be configured in Database → Settings → Database Settings → `app.settings` custom config, or the cron job adjusted to use hardcoded values.

- [ ] **Step 3: Push**
```bash
git push origin main
```
