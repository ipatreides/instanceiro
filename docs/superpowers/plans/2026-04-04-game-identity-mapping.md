# Game Identity Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map game char_id/account_id to Instanceiro characters/accounts, with auto-match by name and manual resolution for unmatched.

**Architecture:** SQL migration adds columns + unresolved table. New `report-characters` endpoint does name matching. Config endpoint returns resolved/unresolved lists. Sniffer caches and reports on CharacterList. Frontend shows unresolved with resolution UI.

**Tech Stack:** PostgreSQL, TypeScript (Next.js API routes), Rust (sniffer), React (frontend)

**Spec:** `docs/superpowers/specs/2026-04-04-game-identity-mapping-design.md`

---

### Task 0: SQL Migration — schema changes

**Files:**
- Create: `supabase/migrations/20260404500000_game_identity_mapping.sql`

- [ ] **Step 1: Write migration**

```sql
-- Game Identity Mapping: link game char_id/account_id to Instanceiro characters/accounts

-- Add game IDs to existing tables
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS game_account_id INT UNIQUE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS game_char_id INT UNIQUE;

-- Unresolved game characters (pending manual resolution)
CREATE TABLE IF NOT EXISTS unresolved_game_characters (
  game_char_id    INT PRIMARY KEY,
  game_account_id INT,
  char_name       TEXT NOT NULL,
  char_level      INT,
  char_class      TEXT,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unresolved_game_chars_user ON unresolved_game_characters(user_id);

ALTER TABLE unresolved_game_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unresolved_select_own" ON unresolved_game_characters FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "unresolved_delete_own" ON unresolved_game_characters FOR DELETE USING (user_id = auth.uid());
```

- [ ] **Step 2: Apply migration**

```bash
cd D:/rag/instance-tracker
npx supabase db query --linked < supabase/migrations/20260404500000_game_identity_mapping.sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260404500000_game_identity_mapping.sql
git commit -m "feat: migration for game identity mapping (game_char_id, game_account_id, unresolved table)"
```

---

### Task 1: SQL tests for resolution logic

**Files:**
- Create: `supabase/tests/test_game_identity.sql`

- [ ] **Step 1: Write SQL tests**

```sql
BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_group_id UUID;
  v_account_id UUID;
  v_char_id UUID;
  v_count INT;
BEGIN
  -- Setup: get real user, group, account, character
  SELECT g.id, g.created_by INTO v_group_id, v_user_id FROM mvp_groups g LIMIT 1;
  SELECT a.id INTO v_account_id FROM accounts a WHERE a.user_id = v_user_id LIMIT 1;
  SELECT c.id INTO v_char_id FROM characters c WHERE c.user_id = v_user_id AND c.account_id = v_account_id LIMIT 1;

  IF v_user_id IS NULL OR v_char_id IS NULL THEN
    RAISE EXCEPTION 'No test data: need user with group, account, character';
  END IF;

  -- Clean slate
  UPDATE characters SET game_char_id = NULL WHERE user_id = v_user_id;
  UPDATE accounts SET game_account_id = NULL WHERE user_id = v_user_id;
  DELETE FROM unresolved_game_characters WHERE user_id = v_user_id;

  -- TEST 1: Set game_char_id on character
  UPDATE characters SET game_char_id = 333489 WHERE id = v_char_id;
  SELECT count(*) INTO v_count FROM characters WHERE id = v_char_id AND game_char_id = 333489;
  ASSERT v_count = 1, 'T1: game_char_id should be set';
  RAISE NOTICE 'TEST 1 PASSED: game_char_id set on character';

  -- TEST 2: Set game_account_id on account
  UPDATE accounts SET game_account_id = 1595739 WHERE id = v_account_id;
  SELECT count(*) INTO v_count FROM accounts WHERE id = v_account_id AND game_account_id = 1595739;
  ASSERT v_count = 1, 'T2: game_account_id should be set';
  RAISE NOTICE 'TEST 2 PASSED: game_account_id set on account';

  -- TEST 3: UNIQUE constraint on game_char_id
  BEGIN
    UPDATE characters SET game_char_id = 333489 WHERE id != v_char_id AND user_id = v_user_id;
    RAISE EXCEPTION 'T3: Should have failed with unique violation';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'TEST 3 PASSED: game_char_id UNIQUE enforced';
  END;

  -- TEST 4: Insert unresolved
  INSERT INTO unresolved_game_characters (game_char_id, game_account_id, char_name, user_id, group_id)
  VALUES (999999, 888888, 'UnknownChar', v_user_id, v_group_id);
  SELECT count(*) INTO v_count FROM unresolved_game_characters WHERE game_char_id = 999999;
  ASSERT v_count = 1, 'T4: unresolved should exist';
  RAISE NOTICE 'TEST 4 PASSED: unresolved created';

  -- TEST 5: Resolve unresolved (delete + set game_char_id)
  DELETE FROM unresolved_game_characters WHERE game_char_id = 999999;
  SELECT count(*) INTO v_count FROM unresolved_game_characters WHERE game_char_id = 999999;
  ASSERT v_count = 0, 'T5: unresolved should be deleted';
  RAISE NOTICE 'TEST 5 PASSED: unresolved resolved (deleted)';

  -- TEST 6: Idempotent insert (upsert)
  INSERT INTO unresolved_game_characters (game_char_id, game_account_id, char_name, user_id, group_id)
  VALUES (777777, 666666, 'TestChar', v_user_id, v_group_id);
  INSERT INTO unresolved_game_characters (game_char_id, game_account_id, char_name, user_id, group_id)
  VALUES (777777, 666666, 'TestChar', v_user_id, v_group_id)
  ON CONFLICT (game_char_id) DO UPDATE SET updated_at = now();
  SELECT count(*) INTO v_count FROM unresolved_game_characters WHERE game_char_id = 777777;
  ASSERT v_count = 1, 'T6: idempotent upsert should have 1 row';
  RAISE NOTICE 'TEST 6 PASSED: idempotent upsert';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ALL 6 TESTS PASSED';
  RAISE NOTICE '========================================';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run tests**

```bash
npx supabase db query --linked < supabase/tests/test_game_identity.sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/test_game_identity.sql
git commit -m "test: SQL tests for game identity mapping schema"
```

---

### Task 2: Backend — report-characters endpoint

**Files:**
- Create: `src/app/api/telemetry/report-characters/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

interface ReportChar {
  char_id: number
  name: string
  level?: number
  class_id?: number
}

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { account_id, characters } = body as { account_id?: number; characters?: ReportChar[] }

  if (!characters || !Array.isArray(characters) || characters.length === 0) {
    return NextResponse.json({ error: 'Missing characters array' }, { status: 400 })
  }

  const resolved: any[] = []
  const unresolved: any[] = []

  for (const char of characters) {
    if (!char.char_id || !char.name) continue

    // Check if already resolved
    const { data: existingChar } = await supabase
      .from('characters')
      .select('id, name, account_id, game_char_id')
      .eq('game_char_id', char.char_id)
      .maybeSingle()

    if (existingChar) {
      // Already resolved
      const { data: account } = await supabase
        .from('accounts')
        .select('game_account_id')
        .eq('id', existingChar.account_id)
        .maybeSingle()

      resolved.push({
        game_char_id: char.char_id,
        character_id: existingChar.id,
        name: existingChar.name,
        game_account_id: account?.game_account_id ?? account_id ?? 0,
      })
      continue
    }

    // Try match by name (case-insensitive, scoped to user)
    const { data: matchedChar } = await supabase
      .from('characters')
      .select('id, name, account_id')
      .eq('user_id', ctx.userId)
      .ilike('name', char.name)
      .is('game_char_id', null)
      .maybeSingle()

    if (matchedChar) {
      // Name match — resolve
      await supabase
        .from('characters')
        .update({ game_char_id: char.char_id })
        .eq('id', matchedChar.id)

      // Link account if we have account_id
      if (account_id && account_id !== 0) {
        const { error: accErr } = await supabase
          .from('accounts')
          .update({ game_account_id: account_id })
          .eq('id', matchedChar.account_id)
          .is('game_account_id', null)

        if (accErr && accErr.code === '23505') {
          // UNIQUE violation — account already linked to another user
          logTelemetryEvent(supabase, {
            endpoint: 'report-characters',
            tokenId: ctx.tokenId,
            characterId: ctx.characterUuid,
            payloadSummary: { char_name: char.name, account_id, conflict: true },
            result: 'error',
            reason: 'account_already_linked',
          })
        }
      }

      const { data: account } = await supabase
        .from('accounts')
        .select('game_account_id')
        .eq('id', matchedChar.account_id)
        .maybeSingle()

      resolved.push({
        game_char_id: char.char_id,
        character_id: matchedChar.id,
        name: matchedChar.name,
        game_account_id: account?.game_account_id ?? account_id ?? 0,
      })

      // Remove from unresolved if was there
      await supabase
        .from('unresolved_game_characters')
        .delete()
        .eq('game_char_id', char.char_id)

      continue
    }

    // No match — create/update unresolved
    await supabase
      .from('unresolved_game_characters')
      .upsert({
        game_char_id: char.char_id,
        game_account_id: account_id && account_id !== 0 ? account_id : null,
        char_name: char.name,
        char_level: char.level ?? null,
        char_class: char.class_id?.toString() ?? null,
        user_id: ctx.userId,
        group_id: ctx.groupId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'game_char_id' })

    unresolved.push({
      game_char_id: char.char_id,
      char_name: char.name,
      game_account_id: account_id && account_id !== 0 ? account_id : null,
    })
  }

  logTelemetryEvent(supabase, {
    endpoint: 'report-characters',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { account_id, char_count: characters.length, resolved: resolved.length, unresolved: unresolved.length },
    result: 'ok',
  })

  return NextResponse.json({ resolved, unresolved })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/report-characters/route.ts
git commit -m "feat: report-characters endpoint with auto name matching"
```

---

### Task 3: Backend — expand config endpoint

**Files:**
- Modify: `src/app/api/telemetry/config/route.ts`

- [ ] **Step 1: Add resolved + unresolved to config response**

Read the existing file first. After the existing response object is built, add queries for resolved characters and unresolved. Add to the response JSON:

```typescript
  // Resolved game characters (linked to Instanceiro characters)
  const { data: resolvedChars } = await supabase
    .from('characters')
    .select('game_char_id, name, id, accounts!inner(game_account_id)')
    .eq('user_id', ctx.userId)
    .not('game_char_id', 'is', null)

  const resolved_characters = (resolvedChars ?? []).map((c: any) => ({
    game_char_id: c.game_char_id,
    game_account_id: c.accounts?.game_account_id ?? 0,
    character_id: c.id,
    name: c.name,
  }))

  // Unresolved game characters
  const { data: unresolvedChars } = await supabase
    .from('unresolved_game_characters')
    .select('game_char_id, game_account_id, char_name')
    .eq('user_id', ctx.userId)

  const unresolved_characters = (unresolvedChars ?? []).map((c: any) => ({
    game_char_id: c.game_char_id,
    game_account_id: c.game_account_id ?? 0,
    char_name: c.char_name,
  }))
```

Add `resolved_characters` and `unresolved_characters` to the response JSON object.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/config/route.ts
git commit -m "feat: config endpoint returns resolved + unresolved game characters"
```

---

### Task 4: Sniffer — cache struct and config parsing

**Files:**
- Modify: `D:\rag\rustrosniffer\src\telemetry\config.rs`
- Modify: `D:\rag\rustrosniffer\src\telemetry\actions.rs`

- [ ] **Step 1: Add CachedCharInfo and parse from config**

In `src/telemetry/config.rs`, add to the `TelemetryConfig` struct:

```rust
pub struct CachedCharInfo {
    pub game_account_id: u32,
    pub name: String,
    pub character_id: Option<String>,
}
```

Add field to `TelemetryConfig`:
```rust
pub resolved_characters: HashMap<u32, CachedCharInfo>,  // keyed by game_char_id
```

In `parse_from_response`, parse the new fields:

```rust
let resolved_characters = json.get("resolved_characters")
    .and_then(|v| v.as_array())
    .map(|arr| {
        arr.iter().filter_map(|v| {
            let char_id = v.get("game_char_id")?.as_u64()? as u32;
            Some((char_id, CachedCharInfo {
                game_account_id: v.get("game_account_id").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                name: v.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                character_id: v.get("character_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }))
        }).collect()
    })
    .unwrap_or_default();
```

- [ ] **Step 2: Add ReportCharacters action**

In `src/telemetry/actions.rs`, add:

```rust
pub struct GameCharSummary {
    pub char_id: u32,
    pub name: String,
    pub level: u16,
    pub class_id: u16,
}

// Add to TelemetryAction enum:
ReportCharacters {
    account_id: u32,
    characters: Vec<GameCharSummary>,
},
```

- [ ] **Step 3: Update TelemetryConfig Default impl**

Add `resolved_characters: HashMap::new()` to the `Default` impl in config.rs. Also update `test_config()` in `tests/event_processor.rs` and `tests/integration.rs` if they construct TelemetryConfig directly.

- [ ] **Step 4: Run all Rust tests to verify nothing broke**

```bash
cd D:/rag/rustrosniffer && cargo test
```

- [ ] **Step 5: Commit**

```bash
cd D:/rag/rustrosniffer
git add src/telemetry/config.rs src/telemetry/actions.rs
git commit -m "feat: cache struct for resolved chars + ReportCharacters action"
```

---

### Task 5: Sniffer — CharacterList triggers report + 30s timeout

**Files:**
- Modify: `D:\rag\rustrosniffer\src\state\processor.rs`

- [ ] **Step 1: Add pending report state**

Add to `EventProcessor` struct:
```rust
/// Pending CharacterList waiting for account_id (30s timeout)
pending_char_reports: HashMap<u32, (Vec<CharSummary>, Instant)>,  // PID → (chars, received_at)
```

Initialize in `new()`:
```rust
pending_char_reports: HashMap::new(),
```

- [ ] **Step 2: Store CharacterList and check for account_id**

In the `CharacterList` handler, after storing `known_characters`, add:

```rust
// Store for pending report (wait for account_id)
self.pending_char_reports.insert(pid, (characters.clone(), Instant::now()));
```

In the `CharIdentity` handler, after setting `account_id`, check if there's a pending report:

```rust
// Check if we have a pending char report waiting for account_id
if account_id != 0 {
    if let Some((chars, _)) = self.pending_char_reports.remove(&pid) {
        let game_chars: Vec<_> = chars.iter().map(|c| crate::telemetry::actions::GameCharSummary {
            char_id: c.char_id,
            name: c.name.clone(),
            level: c.level,
            class_id: c.job_id,
        }).collect();
        self.send_action(TelemetryAction::ReportCharacters {
            account_id,
            characters: game_chars,
        }).await;
    }
}
```

- [ ] **Step 3: Add timeout check in tick()**

In the `tick()` method, check for expired pending reports:

```rust
// Flush pending char reports older than 30s (report without account_id)
let expired: Vec<u32> = self.pending_char_reports.iter()
    .filter(|(_, (_, at))| at.elapsed().as_secs() >= 30)
    .map(|(pid, _)| *pid)
    .collect();
for pid in expired {
    if let Some((chars, _)) = self.pending_char_reports.remove(&pid) {
        let game_chars: Vec<_> = chars.iter().map(|c| crate::telemetry::actions::GameCharSummary {
            char_id: c.char_id,
            name: c.name.clone(),
            level: c.level,
            class_id: c.job_id,
        }).collect();
        self.send_action(TelemetryAction::ReportCharacters {
            account_id: 0,
            characters: game_chars,
        }).await;
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/state/processor.rs
git commit -m "feat: CharacterList triggers report-characters with 30s timeout for account_id"
```

---

### Task 6: Sniffer — telemetry client sends report + updates cache

**Files:**
- Modify: `D:\rag\rustrosniffer\src\telemetry\client.rs`

- [ ] **Step 1: Handle ReportCharacters action**

In `process_action`, add the new variant:

```rust
TelemetryAction::ReportCharacters { account_id, characters } => {
    let chars_json: Vec<_> = characters.iter().map(|c| {
        serde_json::json!({
            "char_id": c.char_id,
            "name": c.name,
            "level": c.level,
            "class_id": c.class_id,
        })
    }).collect();
    let body = serde_json::json!({
        "account_id": account_id,
        "characters": chars_json,
    });
    debug!("[TELEMETRY] >> POST telemetry/report-characters body={}", body);
    let result = self.sender
        .send_request("POST", "telemetry/report-characters", body, &self.headers())
        .await;
    // Parse response and update cache with resolved characters
    if let HttpResult::Ok(ref resp) = result {
        if let Some(resolved) = resp.get("resolved").and_then(|v| v.as_array()) {
            for r in resolved {
                let char_id = r.get("game_char_id").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                if char_id != 0 {
                    self.config.resolved_characters.insert(char_id, CachedCharInfo {
                        game_account_id: r.get("game_account_id").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                        name: r.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        character_id: r.get("character_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    });
                }
            }
        }
        info!("Characters reported: {} resolved", 
            resp.get("resolved").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0));
    }
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/rag/rustrosniffer
git add src/telemetry/client.rs
git commit -m "feat: telemetry client sends report-characters and handles response"
```

---

### Task 7: Sniffer — heartbeat enrichment from cache

**Files:**
- Modify: `D:\rag\rustrosniffer\src\state\processor.rs`

- [ ] **Step 1: Use resolved_characters cache in heartbeat**

In `build_heartbeat_clients`, after building the HeartbeatClient, enrich from config cache:

```rust
.map(|c| {
    let char_id = c.char_id.unwrap_or(0);
    let cached = self.state.config.resolved_characters.get(&char_id);
    HeartbeatClient {
        character_id: char_id,
        account_id: if let Some(ci) = cached {
            ci.game_account_id
        } else {
            c.account_id.unwrap_or(0)
        },
        map: c.map.clone(),
        name: if let Some(ci) = cached {
            ci.name.clone()
        } else {
            c.char_name.clone().unwrap_or_default()
        },
        in_instance: c.in_instance.is_some(),
        instance_name: c.in_instance.as_ref().map(|i| i.name.clone()).unwrap_or_default(),
    }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/state/processor.rs
git commit -m "feat: heartbeat enriched from resolved_characters cache"
```

---

### Task 8: Rust unit tests for cache and enrichment

**Files:**
- Modify: `D:\rag\rustrosniffer\tests\event_processor.rs`
- Modify: `D:\rag\rustrosniffer\tests\telemetry_queue.rs`

- [ ] **Step 1: Test config parsing with resolved_characters**

In `tests/telemetry_queue.rs`, add:

```rust
#[test]
fn test_config_parse_resolved_characters() {
    let json = serde_json::json!({
        "config_version": 1,
        "server_id": 1,
        "group_id": "test",
        "resolved_characters": [
            { "game_char_id": 333489, "game_account_id": 1595739, "character_id": "uuid-123", "name": "spk.Detox" },
            { "game_char_id": 283783, "game_account_id": 1466460, "character_id": "uuid-456", "name": "spk.Abby OMG" }
        ],
        "unresolved_characters": [
            { "game_char_id": 646186, "game_account_id": 1595739, "char_name": "spk.Methyd" }
        ]
    });
    let config = TelemetryConfig::parse_from_response(&json).unwrap();
    assert_eq!(config.resolved_characters.len(), 2);
    let detox = config.resolved_characters.get(&333489).unwrap();
    assert_eq!(detox.name, "spk.Detox");
    assert_eq!(detox.game_account_id, 1595739);
    assert_eq!(detox.character_id, Some("uuid-123".to_string()));
}

#[test]
fn test_config_parse_no_resolved_characters() {
    let json = serde_json::json!({
        "config_version": 1,
        "server_id": 1,
        "group_id": "test"
    });
    let config = TelemetryConfig::parse_from_response(&json).unwrap();
    assert!(config.resolved_characters.is_empty());
}
```

- [ ] **Step 2: Test heartbeat enrichment from cache**

In `tests/event_processor.rs`, add:

```rust
#[tokio::test]
async fn test_heartbeat_enriched_from_resolved_cache() {
    let mut config = test_config();
    config.resolved_characters.insert(12345, claudinho::telemetry::config::CachedCharInfo {
        game_account_id: 99999,
        name: "CachedName".to_string(),
        character_id: Some("uuid-test".to_string()),
    });

    let (event_tx, event_rx) = mpsc::channel(64);
    let (action_tx, mut action_rx) = mpsc::channel(64);
    let mut processor = EventProcessor::new(config, event_rx, action_tx);

    // Client with char_id=12345, no account_id, no name
    event_tx.send(GameEvent::CharIdentity { pid: 1000, account_id: 0, char_id: 12345, from_map_server: true }).await.unwrap();
    event_tx.send(GameEvent::MapChanged { pid: 1000, map: "prontera".to_string(), x: 0, y: 0 }).await.unwrap();
    for _ in 0..2 { processor.process_pending().await; }
    while action_rx.try_recv().is_ok() {}

    let heartbeat = processor.build_heartbeat_clients("2.0.0");
    match heartbeat {
        TelemetryAction::Heartbeat { clients, .. } => {
            assert_eq!(clients.len(), 1);
            assert_eq!(clients[0].account_id, 99999, "Should use cached account_id");
            assert_eq!(clients[0].name, "CachedName", "Should use cached name");
        }
        _ => panic!("Expected Heartbeat"),
    }
}
```

- [ ] **Step 3: Test pending char report timeout**

In `tests/event_processor.rs`, add:

```rust
#[tokio::test]
async fn test_character_list_sends_report_after_account_id() {
    let (event_tx, event_rx) = mpsc::channel(64);
    let (action_tx, mut action_rx) = mpsc::channel(64);
    let mut processor = EventProcessor::new(test_config(), event_rx, action_tx);

    // CharacterList arrives
    event_tx.send(GameEvent::CharacterList {
        pid: 1000,
        characters: vec![CharSummary { char_id: 11111, name: "TestChar".to_string(), level: 99, job_id: 10 }],
    }).await.unwrap();
    processor.process_pending().await;
    while action_rx.try_recv().is_ok() {}

    // No ReportCharacters yet (waiting for account_id)
    assert!(action_rx.try_recv().is_err(), "Should not report yet");

    // account_id arrives via CharIdentity
    event_tx.send(GameEvent::CharIdentity { pid: 1000, account_id: 55555, char_id: 11111, from_map_server: true }).await.unwrap();
    processor.process_pending().await;

    // Now should have ReportCharacters action
    let mut found_report = false;
    while let Ok(action) = action_rx.try_recv() {
        if matches!(action, TelemetryAction::ReportCharacters { .. }) {
            found_report = true;
            match action {
                TelemetryAction::ReportCharacters { account_id, characters } => {
                    assert_eq!(account_id, 55555);
                    assert_eq!(characters.len(), 1);
                    assert_eq!(characters[0].name, "TestChar");
                }
                _ => unreachable!(),
            }
        }
    }
    assert!(found_report, "Should have sent ReportCharacters after account_id arrived");
}
```

- [ ] **Step 4: Run all tests**

```bash
cd D:/rag/rustrosniffer && cargo test
```

- [ ] **Step 5: Commit**

```bash
git add tests/event_processor.rs tests/telemetry_queue.rs
git commit -m "test: unit tests for game identity cache, enrichment, and report trigger"
```

---

### Task 9: Build, test, deploy (backend + sniffer)

- [ ] **Step 1: Run all Rust tests**

```bash
cd D:/rag/rustrosniffer && cargo test
```

- [ ] **Step 2: Build release**

```bash
cargo build --release
```

- [ ] **Step 3: Push both repos**

```bash
cd D:/rag/rustrosniffer && git push
cd D:/rag/instance-tracker && git push
```

- [ ] **Step 4: Deploy Vercel**

```bash
cd D:/rag/instance-tracker && npx vercel --prod -y
```

- [ ] **Step 5: Live test**

Run sniffer, do char select, verify:
1. `report-characters` is called after CharacterList + account_id
2. Characters are resolved by name
3. Heartbeat shows enriched names
4. Unresolved appear in telemetry tab

---

### Task 10: Frontend — unresolved UI in telemetry tab

**Files:**
- Modify: `src/components/mvp/telemetry-tab.tsx`

- [ ] **Step 1: Fetch unresolved characters**

In the telemetry tab component, add a query for unresolved game characters:

```typescript
const { data: unresolvedChars } = await supabase
  .from('unresolved_game_characters')
  .select('game_char_id, game_account_id, char_name, char_level, first_seen_at')
  .eq('user_id', user.id)
  .order('first_seen_at', { ascending: false })
```

- [ ] **Step 2: Show unresolved section**

Add a section below "Sniffers Ativos" when there are unresolved characters:

```tsx
{unresolvedChars && unresolvedChars.length > 0 && (
  <div>
    <h3>Personagens não resolvidos</h3>
    {unresolvedChars.map(char => (
      <div key={char.game_char_id} className="flex items-center gap-2 p-2 bg-surface rounded border border-border">
        <span className="font-medium">{char.char_name}</span>
        <span className="text-text-secondary text-xs">Nv. {char.char_level ?? '?'}</span>
        <div className="ml-auto flex gap-1">
          <button onClick={() => handleResolveCreate(char)}>Criar personagem</button>
          <button onClick={() => handleResolveLink(char)}>Associar existente</button>
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Implement resolution handlers**

```typescript
async function handleResolveCreate(char: UnresolvedChar) {
  // Create character in user's account, set game_char_id
  // Delete from unresolved
  // Trigger config_stale for sniffer
}

async function handleResolveLink(char: UnresolvedChar) {
  // Show dropdown of user's existing characters
  // On select: update character.game_char_id, rename if needed
  // Delete from unresolved
  // Trigger config_stale for sniffer
}
```

Note: Full implementation of resolution handlers requires additional UI work (modal/dropdown for character selection, account selection for create). This task provides the scaffolding — iterate on UX in follow-up.

- [ ] **Step 4: Commit**

```bash
cd D:/rag/instance-tracker
git add src/components/mvp/telemetry-tab.tsx
git commit -m "feat: unresolved game characters UI in telemetry tab"
```
