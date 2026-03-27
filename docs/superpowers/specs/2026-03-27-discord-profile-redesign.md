# Discord Profile Redesign — Design Spec

## Summary

Consolidate all Discord configuration into a single card on the profile page. Replace the current scattered setup (notifications section + bot invite + group hub channel config) with a unified progressive flow.

## Current State

- `NotificationsSection` component — handles Discord OAuth for DMs, toggle hourly/schedule notifications
- Separate "Bot do Instanceiro" card — static link to add bot
- Group hub — had Discord channel ID input (removed in recent refactor)
- `discord_notifications` table — stores `discord_user_id`, `enabled`, `hourly_enabled`, `schedule_enabled`
- `mvp_groups.discord_channel_id` — currently unused after hub refactor

## New Design

### Single Card: "Discord"

One card in the profile page with progressive steps. Each step only shows when the previous is complete.

**Step 1 — Conectar Discord**
- Shows when: `discord_user_id` is null
- Action: OAuth button → existing `discord-notify-callback` flow
- Result: `discord_user_id` saved to `discord_notifications`

**After connected, two parallel sections:**

**Section A — Notificações por DM** (existing functionality)
- Shows when: connected
- "Entrar no servidor Instanceiro" link (optional, needed for DMs)
- Toggle: notificações horárias
- Toggle: notificações de agendamento
- Botão "Enviar teste"

**Section B — Bot MVP Timer** (new)
- Shows when: connected
- **Step B1 — Adicionar bot ao servidor**
  - Button: "Adicionar bot" → Discord OAuth with `bot` scope + `guilds` scope
  - OAuth callback saves `guild_id` to `discord_notifications.bot_guild_id`
  - After added: shows server name (fetched from Discord API)
- **Step B2 — Selecionar canal**
  - Shows when: `bot_guild_id` is set
  - Dropdown: text channels of the guild (fetched via `GET /guilds/{guild_id}/channels` with bot token)
  - Saves to `discord_notifications.bot_channel_id`
- **Step B3 — Config alertas**
  - Shows when: `bot_channel_id` is set
  - Buttons: 5min / 10min / 15min (select one)
  - Saves to `discord_notifications.alert_minutes`

### Database Changes

Add columns to `discord_notifications`:
```sql
ALTER TABLE discord_notifications
  ADD COLUMN bot_guild_id TEXT,
  ADD COLUMN bot_channel_id TEXT,
  ADD COLUMN alert_minutes INT DEFAULT 5 CHECK (alert_minutes IN (5, 10, 15));
```

Remove `discord_channel_id` and `alert_minutes` from `mvp_groups` (no longer used there).

### API Changes

**New route: `POST /api/discord-bot-callback`**
- OAuth callback for bot addition
- Receives `guild_id` from Discord OAuth response
- Saves to `discord_notifications.bot_guild_id`

**New route: `GET /api/discord-channels`**
- Requires authentication
- Reads `bot_guild_id` from user's `discord_notifications`
- Calls `GET /guilds/{guild_id}/channels` with bot token
- Returns text channels only (type 0)
- Response: `[{ id, name }]`

### Alert Queue Changes

The alert trigger (`queue_mvp_alerts`) currently reads `discord_channel_id` from `mvp_groups`. Update to read from the **group owner's** `discord_notifications.bot_channel_id` instead.

Updated trigger logic:
1. On kill insert, get `group_id`
2. Get group owner: `SELECT created_by FROM mvp_groups WHERE id = group_id`
3. Get owner's Discord config: `SELECT bot_channel_id, alert_minutes FROM discord_notifications WHERE user_id = owner_id`
4. If `bot_channel_id` is set, queue alerts using owner's `alert_minutes`

### Alert Processing Changes

The API route `/api/mvp-alerts/process` currently reads `discord_channel_id` from `mvp_groups`. Update to join through group owner → `discord_notifications.bot_channel_id`.

### UI Component

Replace `NotificationsSection` + separate "Bot do Instanceiro" card with a single `DiscordSection` component.

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Discord                                      │
│                                              │
│ Conectado como @username                     │
│                                              │
│ ── Notificações por DM ──────────────────── │
│ Entrar no servidor Instanceiro    [link]     │
│ Notificações horárias         [toggle]       │
│ Notificações de agendamento   [toggle]       │
│ [Enviar teste]                               │
│                                              │
│ ── Bot MVP Timer ────────────────────────── │
│ Servidor: Team Eclipse Discord   [Alterar]   │
│ Canal: #mvp-alerts              [dropdown]   │
│ Alerta antes do spawn:  [5] [10] [15] min   │
│                                              │
│ [Desconectar Discord]                        │
└─────────────────────────────────────────────┘
```

If not connected:
```
┌─────────────────────────────────────────────┐
│ Discord                                      │
│                                              │
│ Conecte seu Discord para receber notificações│
│ de instâncias e alertas de MVP.              │
│                                              │
│ [Conectar Discord]                           │
└─────────────────────────────────────────────┘
```

### Files to Modify/Create

| File | Action |
|------|--------|
| `supabase/migrations/20260327300000_discord_profile_config.sql` | Create — add columns to discord_notifications |
| `src/app/api/discord-bot-callback/route.ts` | Create — OAuth callback for bot addition |
| `src/app/api/discord-channels/route.ts` | Create — list guild text channels |
| `src/components/profile/discord-section.tsx` | Create — unified Discord config component |
| `src/hooks/use-discord-notifications.ts` | Modify — add bot_guild_id, bot_channel_id, alert_minutes |
| `src/app/profile/page.tsx` | Modify — replace NotificationsSection + bot card with DiscordSection |
| `supabase/migrations/20260327200000_mvp_alert_trigger.sql` | Modify — update trigger to read from profile |
| `src/app/api/mvp-alerts/process/route.ts` | Modify — read channel from owner's profile |

### Out of Scope

- Multiple servers per user (one bot_guild_id per user)
- Channel permissions validation (trust that bot has send permission)
- Server name display (future nice-to-have, requires caching guild info)
