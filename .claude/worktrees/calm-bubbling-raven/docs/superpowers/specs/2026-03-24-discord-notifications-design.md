# Discord DM Notifications for Hourly Instances — Design Spec

## Overview

Send Discord DMs to users when their hourly instance cooldowns expire. Uses a Discord Bot to send messages. Users opt-in on their profile page. A Supabase pg_cron job triggers an Edge Function every 5 minutes to check and send notifications.

## Scope

- **Only hourly instances** (4 total: Altar do Selo, Caverna do Polvo, Esgotos de Malangdo, Espaço Infinito)
- Global toggle per user (on/off), no per-instance configuration
- One consolidated DM per user per check cycle
- Only instances with at least one prior completion trigger notifications (never-completed = don't notify)

## Architecture

Two components:
- **Next.js API route** (`/api/discord-notify-callback`) on Vercel — handles Discord OAuth callback for users who didn't log in via Discord
- **Supabase Edge Function** (`discord-notify`) — cron worker that checks cooldowns and sends DMs via bot token

## Discord Bot & Server Setup

### Bot
Create a Discord bot in the Discord Developer Portal:
1. Create application (or reuse existing Instanceiro Discord app)
2. Enable the Bot section, create bot, copy bot token
3. Store bot token as Supabase Edge Function secret (`DISCORD_BOT_TOKEN`) and Vercel env var

No `MESSAGE_CONTENT` or other privileged intents needed — the bot only sends messages, never reads.

### Servers
Discord bots can only DM users who share at least one server with the bot. The bot must be added to both servers:

1. **Existing server** (ID: `1457831662913061016`) — current community. Members already here can receive DMs immediately.
2. **Instanceiro server** (new, minimalista) — for users who aren't in the existing server. One text channel (e.g. `#bem-vindo`) with a welcome message. Google-login users are auto-joined via `guilds.join` scope. Discord-login users get an invite link.

Bot needs `Send Messages` permission in both servers. Create a permanent invite link for the new Instanceiro server (never expires, unlimited uses).

The Edge Function env var `DISCORD_GUILD_ID` references the **new Instanceiro server** (used for `guilds.join` auto-add). The existing server is not used for auto-add — its members already have access.

## User Flow

### Users who logged in via Discord (auto-detect)

1. On the profile page, a "Notificacoes" section detects that the user logged in with Discord
2. The `discord_user_id` is extracted from `auth.users.raw_user_meta_data`
3. User sees: "Para receber notificacoes, entre no servidor do Instanceiro:" + invite link button
4. After joining the server, user enables the toggle "Notificar quando instancias horarias ficarem disponiveis"
5. Enabling the toggle inserts a row in `discord_notifications` with the Discord user ID

### Users who logged in via Google (optional Discord link)

1. Profile page shows a "Conectar Discord" button
2. Clicking opens Discord OAuth with `identify` + `guilds.join` scopes
3. After authorization, the callback auto-adds the user to the Instanceiro server via `PUT /guilds/{guild_id}/members/{user_id}`
4. Stores `discord_user_id` in `discord_notifications` and redirects back to profile
5. Toggle appears as above, already enabled

### Disabling / Disconnecting

- Toggle off: sets `enabled = false` (keeps the row, user stays in server)
- "Desconectar": deletes the `discord_notifications` row (user may leave server manually if desired)

## Data Model

### `discord_notifications`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID, PK, FK | → `profiles.id` |
| `discord_user_id` | text, NOT NULL | Discord user ID |
| `enabled` | boolean, NOT NULL | Default `true` |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

No tokens stored — the bot token is a single Edge Function secret. This is simpler and more secure than storing per-user OAuth tokens.

RLS: `user_id = auth.uid()` for SELECT/UPDATE/DELETE. INSERT via service role or auth callback.

### `notification_log`

Prevents duplicate notifications for the same cooldown expiry.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | Default `gen_random_uuid()` |
| `user_id` | UUID, FK | → `profiles.id` |
| `character_id` | UUID, FK | → `characters.id` |
| `instance_id` | int, FK | → `instances.id` |
| `type` | text, NOT NULL | `'warning'` or `'available'` |
| `notified_at` | timestamptz | Default `now()` |

Index: `(user_id, character_id, instance_id, type, notified_at DESC)` for dedup lookups.

RLS: `user_id = auth.uid()` for SELECT. INSERT via service role (Edge Function).

Auto-cleanup: pg_cron job deletes rows older than 24 hours.

## Edge Function: `discord-notify`

Triggered by pg_cron every 5 minutes. Uses service role key for Supabase queries and bot token for Discord API.

### Algorithm

```
1. Fetch all rows from discord_notifications WHERE enabled = true
2. For each user:
   a. Fetch user's active characters
   b. Fetch instance_completions for hourly instances (cooldown_type = 'hourly')
   c. For each character + hourly instance combo:
      - Skip if no prior completions exist (never completed = don't notify)
      - Calculate cooldown expiry
      - If cooldown expires in ≤5 minutes AND not yet expired:
        - Check notification_log for type='warning' after last completion
        - If not notified: add to warning list
      - If cooldown expired (available now):
        - Check notification_log for type='available' after last completion
        - If not notified: add to available list
   d. Send warning DM if warning list is non-empty
   e. Send available DM if available list is non-empty
   f. Insert rows into notification_log with appropriate type
3. Return summary (sent count, errors)
```

### Dedup Logic

For each (user_id, character_id, instance_id, type):
- Find the latest `instance_completions.completed_at`
- Find the latest `notification_log.notified_at` WHERE `type` matches
- If `notified_at > completed_at`: already notified for this cooldown cycle, skip
- If `notified_at < completed_at` or no log entry: notify

### DM Format

Two notifications per cooldown cycle:

**Warning (≤5 minutes before available):**
```
Em breve:
• Espaco Infinito — spk.Detox (em ~3min)
• Caverna do Polvo — spk.Lust (em ~5min)
```

**Available (cooldown expired):**
```
Instancias disponiveis:
• Espaco Infinito — spk.Detox
• Caverna do Polvo — spk.Detox, spk.Lust
```

Each type is sent at most once per cooldown cycle per instance per character.

### Error Handling

- Discord API 429 (rate limited): log and retry on next cron cycle
- Discord API 403 (user blocked bot DMs): set `enabled = false`, log
- Discord API 50007 (cannot send to user): set `enabled = false`, log
- Individual user failure does not block other users

## Discord OAuth Flow (Google-login users only)

### Setup

- Use the same Discord application as the bot
- Add redirect URI: `https://instanceiro.vercel.app/api/discord-notify-callback`
- Scopes: `identify` + `guilds.join`

### Callback (`/api/discord-notify-callback`)

This is a **Next.js API route** on Vercel (not a Supabase Edge Function), because it needs to redirect the user's browser.

1. Receives `code` and `state` params
2. Validates `state` against cookie (CSRF protection)
3. Exchanges code for token via Discord API
4. Fetches user info (`GET /users/@me`) to get Discord user ID
5. Auto-adds user to Instanceiro server: `PUT /guilds/{GUILD_ID}/members/{user_id}` with the OAuth access token
6. Inserts into `discord_notifications` using authenticated Supabase client
7. Redirects to `/profile?discord=connected`
8. Discards the Discord OAuth token (not stored — only needed for user ID and guild join)

## Profile Page Changes

### Notifications Section

**When not connected (Google login, no Discord link):**
- Heading: "Notificacoes"
- Description: "Receba uma mensagem no Discord quando suas instancias horarias ficarem disponiveis."
- Button: "Conectar Discord" (opens OAuth flow with `identify` + `guilds.join`)

**When Discord detected but not in server (Discord login, first time):**
- Heading: "Notificacoes"
- Description: "Para receber notificacoes, entre no servidor do Instanceiro no Discord."
- Button: invite link to Instanceiro server (opens in new tab)
- Toggle: "Notificacoes de instancias horarias" (on/off, user enables after joining)

**When connected and in server (toggle active):**
- Toggle: "Notificacoes de instancias horarias" (on/off)
- Text: "Conectado como [discord username]"
- Link: "Desconectar" (for manually linked users only — Discord login users can only toggle)
- Button: "Enviar notificacao teste" — sends a test DM to verify it works

## pg_cron Configuration

```sql
-- Enable pg_net extension (required for HTTP calls from pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Notify cron: every 5 minutes
SELECT cron.schedule(
  'discord-hourly-notify',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://swgnctajsbiyhqxstrnx.supabase.co/functions/v1/discord-notify',
    headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
  )$$
);

-- Cleanup: daily at 4 AM BRT (7 AM UTC)
SELECT cron.schedule(
  'cleanup-notification-log',
  '0 7 * * *',
  $$DELETE FROM notification_log WHERE notified_at < now() - interval '24 hours'$$
);
```

## Security

- **No user tokens stored** — bot token is a single secret in Edge Function environment
- Bot token stored as Supabase Edge Function secret (`DISCORD_BOT_TOKEN`), never in code
- Service role key in pg_cron SQL is standard Supabase pattern (stored in database, not exposed to clients)
- RLS prevents users from reading other users' notification settings
- OAuth flow uses `state` parameter (stored in HttpOnly cookie) for CSRF protection
- Callback extracts Discord user ID, joins user to server, then discards the OAuth token
- `guilds.join` scope only used to add user to the Instanceiro server, nothing else

## Constraints

- Supabase Free Tier: 500k Edge Function invocations/month. Cron at 5min = ~8,640/month.
- Discord Bot API rate limits: ~5 DMs/second. Negligible at expected scale.
- Only hourly instances (4 total). Daily/weekly/3-day not included.
- Bot requires shared server to DM users. The Instanceiro Discord server serves this purpose.
- If a user leaves the server, DMs will fail (error 50007) and notifications will be auto-disabled.
- Users who have "Allow DMs from server members" disabled for the Instanceiro server will not receive DMs.
