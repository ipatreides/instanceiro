# EXP Tracking Design

## Goal

Real-time EXP tracking per character for users with an active Claudinho sniffer. Shows leveling speed (EXP/min), progress bar, estimated time to next level, and a 2-hour history chart.

## Architecture

### Pipeline

```
Game Client → 0x0ACB packet → Sniffer (accumulates per PID)
    → POST /telemetry/exp-snapshot (every 60s)
        → exp_snapshots table (2h TTL, cleanup inline)
            → Supabase Realtime (notify frontend)
                → Frontend renders cards per character
```

### Sniffer

- Parse `0x0ACB` (ZC_PAR_CHANGE, 12 bytes) only. Stat types: 1 (base_exp), 2 (job_exp), 11 (base_level), 55 (job_level)
- Store latest values per client (PID) in memory
- Every 60s, send `POST /telemetry/exp-snapshot` with current values for each identified client
- Payload:
  ```json
  {
    "clients": [
      {
        "character_id": 283783,
        "account_id": 1466460,
        "base_level": 191,
        "job_level": 60,
        "base_exp": 1347848351,
        "job_exp": 5999995491,
        "map": "tur_dun04"
      }
    ]
  }
  ```

### Backend

#### `POST /telemetry/exp-snapshot`

- Validates telemetry context (token, user, group)
- Inserts one row per client into `exp_snapshots`
- Inline cleanup: `DELETE FROM exp_snapshots WHERE user_id = $1 AND created_at < now() - interval '2 hours'`
- Returns `{ status: 'ok' }`

#### `GET /api/telemetry/exp-tracking`

- Authenticated endpoint (Supabase auth, not telemetry token)
- Returns pre-aggregated data per character:
  ```json
  {
    "characters": [
      {
        "character_id": 283783,
        "name": "spk.Abby OMG",
        "base_level": 191,
        "job_level": 60,
        "base_exp": 1347848351,
        "job_exp": 5999995491,
        "map": "tur_dun04",
        "base_exp_per_min": 28000000,
        "job_exp_per_min": 20000000,
        "active": true,
        "timeline": [
          { "t": "2026-04-05T21:30:00Z", "base_exp": 1263835542, "job_exp": 5940228244 },
          { "t": "2026-04-05T21:31:00Z", "base_exp": 1291835542, "job_exp": 5960228244 }
        ]
      }
    ]
  }
  ```

#### EXP/min Calculation

- **Weighted moving average** over last 10 minutes of snapshots
- More recent snapshots have higher weight (exponential decay)
- Prevents spikes from MVP kills or burst EXP from inflating the rate
- Formula: `weighted_sum(delta_exp * weight) / weighted_sum(delta_time * weight)` where weight decays 50% every 5 minutes

#### AFK Detection

- If EXP delta = 0 for more than 2 consecutive snapshots (2+ minutes), character is marked as `active: false`
- Frontend shows idle message: "Cansou foi? Assim tu não vai upar nunca 😴"
- ETA is hidden when inactive
- EXP/min shows 0 but chart continues (flat line visible)

#### Level Up Detection

- When `base_level` or `job_level` changes between consecutive snapshots for the same `character_id`, that delta is excluded from EXP/min calculation
- The snapshot with the new level becomes the new baseline
- Prevents negative/absurd EXP/min from level reset

#### Character Switch Safety

- All calculations are scoped by `character_id`
- When character_id changes for the same token, it's a different character — no cross-contamination of deltas

#### Table: `exp_snapshots`

```sql
CREATE TABLE exp_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    uuid NOT NULL,
  user_id     uuid NOT NULL,
  character_id bigint NOT NULL,
  account_id  bigint NOT NULL DEFAULT 0,
  base_level  smallint NOT NULL,
  job_level   smallint NOT NULL,
  base_exp    bigint NOT NULL,
  job_exp     bigint NOT NULL,
  map         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exp_snapshots_user_time ON exp_snapshots (user_id, created_at DESC);
```

No RLS — accessed via admin client (telemetry endpoint) and authenticated user endpoint.

### Frontend

#### Tab: "EXP Tracking"

- **Visibility**: Only shown when user has active sniffer (telemetry session with recent heartbeat) AND has exp snapshots in the last 2 hours
- **Position**: Main tab alongside "Instâncias" / "MVP Timer"
- **Layout**: Vertical list of cards, one per character with recent EXP data

#### Character Card

Each card contains:
- **Header**: Character name + base level + job level + class + map
- **Progress bars**: Base EXP (% of current level) + Job EXP (% of current level)
  - Percentage calculated using hardcoded EXP table in `lib/exp-table.ts`
- **Metrics**: Base EXP/min + Job EXP/min + ETA to next base level + ETA to next job level
  - ETA hidden when character is inactive (AFK)
  - Idle message shown when `active: false`: "Cansou foi? Assim tu não vai upar nunca 😴"
- **Chart**: Recharts LineChart showing EXP/min over last 2 hours (1 point per minute, dual axis for base/job)

#### Realtime Updates

- Frontend subscribes to Supabase Realtime on `exp_snapshots` table filtered by `user_id`
- On INSERT event, frontend updates the relevant character card in-place
- No polling — purely event-driven
- Falls back to `GET /api/telemetry/exp-tracking` on initial load and reconnection

#### EXP Table

- Hardcoded in `src/lib/exp-table.ts`
- Object mapping `level → required_exp` for base and job
- Source: bRO Renewal EXP table (provided by user)
- Used to calculate: `percentage = current_exp / required_exp[level] * 100`
- Used to calculate: `eta_minutes = (required_exp[level] - current_exp) / exp_per_min`

### Design System

All components follow the Instanceiro design system:
- Card: `bg-surface border-border rounded-md`
- Progress bar: `bg-primary` fill with `bg-bg` background
- Text: `text-text-primary` for values, `text-text-secondary` for labels
- Chart: Design tokens for line colors (CSS variables)
- Font: Outfit, consistent with rest of app

## Out of Scope

- Historical data beyond 2 hours
- EXP tracking without sniffer (manual input)
- Level up notifications/toasts
- Comparison between group members
- Breakdown by mapa (which map gives most EXP)
- `0x00B1` (ZC_LONGPAR_CHANGE) fallback — focus is bRO LATAM which uses `0x0ACB`
