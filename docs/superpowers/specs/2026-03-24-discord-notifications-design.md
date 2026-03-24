# Discord DM Notifications for Hourly Instances — Design Spec

## Overview

Send Discord DMs to users when their hourly instance cooldowns expire. Users opt-in via a Discord OAuth flow on their profile page. A Supabase pg_cron job triggers an Edge Function every 5 minutes to check and send notifications.

## Scope

- **Only hourly instances** (4 total: Altar do Selo, Caverna do Polvo, Esgotos de Malangdo, Espaço Infinito)
- Global toggle per user (on/off), no per-instance configuration
- One consolidated DM per user per check cycle

## User Flow

1. On the profile page, a "Notificações" section shows a "Conectar Discord" button
2. Clicking opens Discord OAuth requesting `identify` + `dm_channels.messages.write` scopes
3. After authorization, a toggle "Notificar quando instâncias horárias ficarem disponíveis" appears and is enabled by default
4. User can disable/re-enable at any time on the profile page
5. User can disconnect Discord notifications entirely (removes stored tokens)

## Data Model

### `discord_notifications`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID, PK, FK | → `profiles.id` |
| `discord_user_id` | text, NOT NULL | Discord user ID from OAuth |
| `access_token` | text, NOT NULL | Discord OAuth access token (encrypted) |
| `refresh_token` | text, NOT NULL | Discord OAuth refresh token (encrypted) |
| `token_expires_at` | timestamptz, NOT NULL | When access_token expires |
| `enabled` | boolean, NOT NULL | Default `true` |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

RLS: `user_id = auth.uid()` for SELECT/UPDATE/DELETE. INSERT restricted to the auth callback Edge Function (service role).

### `notification_log`

Prevents duplicate notifications for the same cooldown expiry.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | Default `gen_random_uuid()` |
| `user_id` | UUID, FK | → `profiles.id` |
| `character_id` | UUID, FK | → `characters.id` |
| `instance_id` | int, FK | → `instances.id` |
| `notified_at` | timestamptz | Default `now()` |

Index: `(user_id, character_id, instance_id, notified_at DESC)` for dedup lookups.

RLS: user_id = auth.uid() for SELECT. INSERT restricted to Edge Function (service role).

Auto-cleanup: pg_cron job deletes rows older than 24 hours (hourly cooldowns are max 12h, so 24h is safe).

## Discord OAuth Setup

### Application

Reuse the existing Discord application from Supabase Auth, or create a dedicated one. Needs:
- OAuth2 redirect URI: `https://instanceiro.vercel.app/api/discord-notify-callback`
- Scopes: `identify`, `dm_channels.messages.write`

### OAuth Flow

1. Profile page generates authorization URL with state parameter (CSRF protection) and PKCE code_verifier
2. User authorizes on Discord
3. Discord redirects to `/api/discord-notify-callback` with code
4. Callback Edge Function exchanges code for tokens, fetches Discord user ID, stores in `discord_notifications`
5. Redirects back to profile page with success indicator

### Token Refresh

Discord access tokens expire after ~7 days. The `discord-notify` Edge Function checks `token_expires_at` before sending. If expired, uses `refresh_token` to get a new pair. If refresh fails (user revoked), sets `enabled = false` and skips.

## Edge Function: `discord-notify`

Triggered by pg_cron every 5 minutes.

### Algorithm

```
1. Fetch all rows from discord_notifications WHERE enabled = true
2. For each user:
   a. Fetch user's characters (active only)
   b. Fetch instance_completions for hourly instances (id IN [1,2,3,4])
   c. For each character + hourly instance combo:
      - Calculate cooldown expiry (same logic as frontend cooldown.ts)
      - If expired (available now):
        - Check notification_log: was this already notified after the last completion?
        - If not: add to pending notifications list
   d. If pending list is non-empty:
      - Refresh token if needed
      - Build consolidated message
      - Send DM via Discord API
      - Insert rows into notification_log
3. Return summary (sent count, errors)
```

### Dedup Logic

For each (user_id, character_id, instance_id):
- Find the latest `instance_completions.completed_at`
- Find the latest `notification_log.notified_at`
- If `notified_at > completed_at`: already notified for this cooldown cycle, skip
- If `notified_at < completed_at` or no log entry: cooldown expired after a new completion, notify

### DM Format

One message per user, listing all newly available instances grouped by character:

```
Instancias disponiveis:
• Espaco Infinito — spk.Detox
• Caverna do Polvo — spk.Detox, spk.Lust
```

### Error Handling

- Discord API 429 (rate limited): log and retry on next cron cycle
- Discord API 403 (user blocked DMs / revoked): set `enabled = false`, log
- Token refresh failure: set `enabled = false`, log
- Individual user failure doesn't block other users

## Profile Page Changes

### Notifications Section

Below existing profile content, add:

**When not connected:**
- Heading: "Notificacoes"
- Description: "Receba uma mensagem no Discord quando suas instancias horarias ficarem disponiveis."
- Button: "Conectar Discord"

**When connected:**
- Toggle: "Notificacoes de instancias horarias" (on/off, controls `enabled` column)
- Text: "Conectado como [discord username]"
- Link: "Desconectar" (deletes the `discord_notifications` row)

## pg_cron Configuration

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

Cleanup job:
```sql
SELECT cron.schedule(
  'cleanup-notification-log',
  '0 4 * * *',
  $$DELETE FROM notification_log WHERE notified_at < now() - interval '24 hours'$$
);
```

## Security

- Discord tokens encrypted at rest (pgsodium `crypto_aead_det_encrypt` or application-level encryption in the Edge Function before storing)
- Encryption key stored as Edge Function secret, not in code
- RLS prevents users from reading other users' tokens
- OAuth uses PKCE for code exchange
- State parameter for CSRF protection on OAuth flow

## Constraints

- Supabase Free Tier: 500k Edge Function invocations/month. Cron at 5min = ~8,640/month. Well within limits.
- Discord API rate limits: ~5 DMs/second. Negligible concern at expected scale.
- Only hourly instances (4 total). Daily/weekly/3-day not included.
