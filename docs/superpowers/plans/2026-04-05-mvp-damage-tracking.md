# MVP Damage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track individual damage hits on MVPs from multiple sniffers, store them with dedup, and display a damage breakdown panel with cumulative chart in the MVP detail view.

**Architecture:** The sniffer (Rust) captures damage hits from 5 packet types, stores them per-fight with server_tick for dedup, and sends them batch-on-death via the existing mvp-event endpoint. The backend (Next.js + Supabase) stores hits in a new table with UNIQUE constraint for multi-sniffer dedup, and serves aggregated data via a new GET endpoint. The frontend (React + Recharts) renders a damage breakdown panel below the map in the MVP detail view.

**Tech Stack:** Rust (sniffer), Next.js 16 / React 19 / Tailwind v4 (frontend), Supabase/PostgreSQL (backend), Recharts (charting)

**Cross-repo:** Sniffer changes in `D:\rag\rustrosniffer`, backend+frontend changes in `D:\rag\instance-tracker`.

---

## File Structure

### Sniffer (`D:\rag\rustrosniffer`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/packets/events.rs` | Modify | Add `server_tick`, `skill_id` to `DamageDealt` |
| `src/packets/handlers/action.rs` | Modify | Extract server_tick from all 5 parsers, add skill_id to skill parsers |
| `src/state/game_state.rs` | Modify | Replace `MvpDamageTracker` with hit-based tracking |
| `src/state/processor.rs` | Modify | Filter self-damage, resolve names at hit time, attach hits to KillBuffer |
| `src/state/kill_buffer.rs` | Modify | Add `damage_hits` and `first_hitter_name` fields |
| `src/telemetry/actions.rs` | Modify | Add `DamageHit` struct and fields to `KillData` |
| `src/telemetry/client.rs` | Modify | Serialize damage_hits in `kill_data_to_json` |
| `tests/event_processor.rs` | Modify | Add damage tracking tests |
| `tests/packet_parsers.rs` | Create | Test server_tick/skill_id extraction from all 5 packet types |

### Backend (`D:\rag\instance-tracker`)

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260405000000_mvp_damage_hits.sql` | Create | New table + RLS + first_hitter_name column |
| `src/app/api/telemetry/mvp-event/route.ts` | Modify | Accept and insert damage_hits |
| `src/app/api/telemetry/mvp-damage/route.ts` | Create | GET endpoint returning aggregated damage data |
| `src/lib/types.ts` | Modify | Add damage-related types |

### Frontend (`D:\rag\instance-tracker`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/mvp/mvp-damage-panel.tsx` | Create | Damage bars + cumulative chart |
| `src/components/mvp/mvp-tab.tsx` | Modify | Render MvpDamagePanel in detail view |

---

## Task 1: Update DamageDealt Event and Parsers (Sniffer)

**Files:**
- Modify: `D:\rag\rustrosniffer\src\packets\events.rs`
- Modify: `D:\rag\rustrosniffer\src\packets\handlers\action.rs`
- Create: `D:\rag\rustrosniffer\tests\packet_parsers.rs`

- [ ] **Step 1: Write failing tests for server_tick extraction**

Create `tests/packet_parsers.rs`:

```rust
use rustrosniffer::packets::handlers::action;
use rustrosniffer::packets::events::GameEvent;

#[test]
fn test_parse_actor_action_v2_extracts_server_tick() {
    // 0x08C8: 34 bytes. src=[0..3], tgt=[4..7], tick=[8..11], damage=[20..23]
    let mut data = vec![0u8; 34];
    // source_id = 100
    data[0..4].copy_from_slice(&100u32.to_le_bytes());
    // target_id = 200
    data[4..8].copy_from_slice(&200u32.to_le_bytes());
    // server_tick = 413007123
    data[8..12].copy_from_slice(&413007123u32.to_le_bytes());
    // damage = 5000
    data[20..24].copy_from_slice(&5000i32.to_le_bytes());

    let event = action::parse_actor_action_v2(&data, 1, 0).unwrap();
    match event {
        GameEvent::DamageDealt { source_id, target_id, damage, server_tick, skill_id, .. } => {
            assert_eq!(source_id, 100);
            assert_eq!(target_id, 200);
            assert_eq!(damage, 5000);
            assert_eq!(server_tick, 413007123);
            assert_eq!(skill_id, None);
        }
        _ => panic!("Expected DamageDealt"),
    }
}

#[test]
fn test_parse_actor_action_v1_extracts_server_tick() {
    // 0x02E1: 33 bytes. src=[0..3], tgt=[4..7], tick=[8..11], damage=[20..23]
    let mut data = vec![0u8; 33];
    data[0..4].copy_from_slice(&100u32.to_le_bytes());
    data[4..8].copy_from_slice(&200u32.to_le_bytes());
    data[8..12].copy_from_slice(&999999u32.to_le_bytes());
    data[20..24].copy_from_slice(&1731i32.to_le_bytes());

    let event = action::parse_actor_action_v1(&data, 1, 0).unwrap();
    match event {
        GameEvent::DamageDealt { damage, server_tick, skill_id, .. } => {
            assert_eq!(damage, 1731);
            assert_eq!(server_tick, 999999);
            assert_eq!(skill_id, None);
        }
        _ => panic!("Expected DamageDealt"),
    }
}

#[test]
fn test_parse_actor_action_v0_extracts_server_tick() {
    // 0x008A: 29 bytes. src=[0..3], tgt=[4..7], tick=[8..11], damage=[16..17] as i16
    let mut data = vec![0u8; 29];
    data[0..4].copy_from_slice(&100u32.to_le_bytes());
    data[4..8].copy_from_slice(&200u32.to_le_bytes());
    data[8..12].copy_from_slice(&555555u32.to_le_bytes());
    data[16..18].copy_from_slice(&3000i16.to_le_bytes());

    let event = action::parse_actor_action_v0(&data, 1, 0).unwrap();
    match event {
        GameEvent::DamageDealt { damage, server_tick, skill_id, .. } => {
            assert_eq!(damage, 3000);
            assert_eq!(server_tick, 555555);
            assert_eq!(skill_id, None);
        }
        _ => panic!("Expected DamageDealt"),
    }
}

#[test]
fn test_parse_skill_damage_v0_extracts_skill_id_and_tick() {
    // 0x0114: 31 bytes. skill=[0..1], src=[2..5], tgt=[6..9], tick=[10..13], damage=[22..25]
    let mut data = vec![0u8; 31];
    data[0..2].copy_from_slice(&2022u16.to_le_bytes()); // skill_id
    data[2..6].copy_from_slice(&100u32.to_le_bytes()); // source
    data[6..10].copy_from_slice(&200u32.to_le_bytes()); // target
    data[10..14].copy_from_slice(&777777u32.to_le_bytes()); // tick
    data[22..26].copy_from_slice(&28476i32.to_le_bytes()); // damage

    let event = action::parse_skill_damage_v0(&data, 1, 0).unwrap();
    match event {
        GameEvent::DamageDealt { source_id, target_id, damage, server_tick, skill_id, .. } => {
            assert_eq!(source_id, 100);
            assert_eq!(target_id, 200);
            assert_eq!(damage, 28476);
            assert_eq!(server_tick, 777777);
            assert_eq!(skill_id, Some(2022));
        }
        _ => panic!("Expected DamageDealt"),
    }
}

#[test]
fn test_parse_skill_damage_v1_extracts_skill_id_and_tick() {
    // 0x01DE: 33 bytes. Same layout as v0 + 2 extra bytes at end
    let mut data = vec![0u8; 33];
    data[0..2].copy_from_slice(&252u16.to_le_bytes()); // skill_id (buff)
    data[2..6].copy_from_slice(&100u32.to_le_bytes());
    data[6..10].copy_from_slice(&200u32.to_le_bytes());
    data[10..14].copy_from_slice(&888888u32.to_le_bytes());
    data[22..26].copy_from_slice(&11594i32.to_le_bytes());

    let event = action::parse_skill_damage_v1(&data, 1, 0).unwrap();
    match event {
        GameEvent::DamageDealt { damage, server_tick, skill_id, .. } => {
            assert_eq!(damage, 11594);
            assert_eq!(server_tick, 888888);
            assert_eq!(skill_id, Some(252));
        }
        _ => panic!("Expected DamageDealt"),
    }
}

#[test]
fn test_parse_actor_action_v2_returns_none_for_zero_damage() {
    let mut data = vec![0u8; 34];
    data[0..4].copy_from_slice(&100u32.to_le_bytes());
    data[4..8].copy_from_slice(&200u32.to_le_bytes());
    data[20..24].copy_from_slice(&0i32.to_le_bytes());

    assert!(action::parse_actor_action_v2(&data, 1, 0).is_none());
}

#[test]
fn test_parse_skill_damage_v0_returns_none_for_short_payload() {
    let data = vec![0u8; 10]; // too short
    assert!(action::parse_skill_damage_v0(&data, 1, 0).is_none());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --test packet_parsers`
Expected: FAIL — `DamageDealt` doesn't have `server_tick` or `skill_id` fields yet.

- [ ] **Step 3: Update DamageDealt event**

In `src/packets/events.rs`, change:
```rust
DamageDealt { pid: u32, source_id: u32, target_id: u32, damage: i32 },
```
to:
```rust
DamageDealt { pid: u32, source_id: u32, target_id: u32, damage: i32, server_tick: u32, skill_id: Option<u16> },
```

- [ ] **Step 4: Update all 5 parsers to extract server_tick and skill_id**

In `src/packets/handlers/action.rs`:

**parse_actor_action_v2** — add tick extraction, pass skill_id: None:
```rust
pub fn parse_actor_action_v2(data: &[u8], pid: u32, _timestamp: i64) -> Option<GameEvent> {
    if data.len() < 30 {
        return None;
    }
    let source_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let target_id = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let server_tick = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let damage = i32::from_le_bytes([data[20], data[21], data[22], data[23]]);

    if damage > 0 {
        debug!("[DAMAGE] pid={} src={} → tgt={} dmg={}", pid, source_id, target_id, damage);
        Some(GameEvent::DamageDealt { pid, source_id, target_id, damage, server_tick, skill_id: None })
    } else {
        None
    }
}
```

**parse_actor_action_v1** — same pattern, remove debug hex dump (was temporary):
```rust
pub fn parse_actor_action_v1(data: &[u8], pid: u32, _timestamp: i64) -> Option<GameEvent> {
    if data.len() < 29 {
        return None;
    }
    let source_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let target_id = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let server_tick = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let damage = i32::from_le_bytes([data[20], data[21], data[22], data[23]]);

    if damage > 0 {
        debug!("[DAMAGE] pid={} src={} → tgt={} dmg={} (v1)", pid, source_id, target_id, damage);
        Some(GameEvent::DamageDealt { pid, source_id, target_id, damage, server_tick, skill_id: None })
    } else {
        None
    }
}
```

**parse_actor_action_v0** — tick at [8..11], damage at [16..17] as i16:
```rust
pub fn parse_actor_action_v0(data: &[u8], pid: u32, _timestamp: i64) -> Option<GameEvent> {
    if data.len() < 25 {
        return None;
    }
    let source_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let target_id = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let server_tick = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let damage = i16::from_le_bytes([data[16], data[17]]) as i32;

    if damage > 0 {
        debug!("[DAMAGE] pid={} src={} → tgt={} dmg={} (v0)", pid, source_id, target_id, damage);
        Some(GameEvent::DamageDealt { pid, source_id, target_id, damage, server_tick, skill_id: None })
    } else {
        None
    }
}
```

**parse_skill_damage_v0** — skill_id at [0..1], src at [2..5], tgt at [6..9], tick at [10..13], damage at [22..25]:
```rust
pub fn parse_skill_damage_v0(data: &[u8], pid: u32, _timestamp: i64) -> Option<GameEvent> {
    if data.len() < 29 {
        return None;
    }
    let skill_id = u16::from_le_bytes([data[0], data[1]]);
    let source_id = u32::from_le_bytes([data[2], data[3], data[4], data[5]]);
    let target_id = u32::from_le_bytes([data[6], data[7], data[8], data[9]]);
    let server_tick = u32::from_le_bytes([data[10], data[11], data[12], data[13]]);
    let damage = i32::from_le_bytes([data[22], data[23], data[24], data[25]]);

    if damage > 0 {
        debug!("[SKILL-DAMAGE] pid={} skill={} src={} → tgt={} dmg={}", pid, skill_id, source_id, target_id, damage);
        Some(GameEvent::DamageDealt { pid, source_id, target_id, damage, server_tick, skill_id: Some(skill_id) })
    } else {
        None
    }
}
```

**parse_skill_damage_v1** — same layout as v0, 33 bytes:
```rust
pub fn parse_skill_damage_v1(data: &[u8], pid: u32, _timestamp: i64) -> Option<GameEvent> {
    if data.len() < 31 {
        return None;
    }
    let skill_id = u16::from_le_bytes([data[0], data[1]]);
    let source_id = u32::from_le_bytes([data[2], data[3], data[4], data[5]]);
    let target_id = u32::from_le_bytes([data[6], data[7], data[8], data[9]]);
    let server_tick = u32::from_le_bytes([data[10], data[11], data[12], data[13]]);
    let damage = i32::from_le_bytes([data[22], data[23], data[24], data[25]]);

    if damage > 0 {
        debug!("[SKILL-DAMAGE] pid={} skill={} src={} → tgt={} dmg={} (v1)", pid, skill_id, source_id, target_id, damage);
        Some(GameEvent::DamageDealt { pid, source_id, target_id, damage, server_tick, skill_id: Some(skill_id) })
    } else {
        None
    }
}
```

- [ ] **Step 5: Fix all compilation errors in processor.rs**

The `DamageDealt` match arm in `processor.rs` needs to destructure the new fields. Update the match pattern at ~line 622:

```rust
GameEvent::DamageDealt { pid, source_id, target_id, damage, server_tick, skill_id } => {
```

(The body will be rewritten in Task 2, but for now just add the fields to the destructure so it compiles.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test --test packet_parsers`
Expected: All 7 tests PASS.

- [ ] **Step 7: Run full test suite**

Run: `cargo test`
Expected: All tests PASS (including existing event_processor tests).

- [ ] **Step 8: Commit**

```bash
cd D:\rag\rustrosniffer
git add src/packets/events.rs src/packets/handlers/action.rs tests/packet_parsers.rs
git commit -m "feat: add server_tick and skill_id to DamageDealt event

Extract server_tick from packet bytes in all 5 damage parsers
(action v0/v1/v2 + skill v0/v1). Skill parsers also extract
skill_id. Clean up v1 action parser debug hex dump."
```

---

## Task 2: Refactor MvpDamageTracker to Individual Hits (Sniffer)

**Files:**
- Modify: `D:\rag\rustrosniffer\src\state\game_state.rs`
- Modify: `D:\rag\rustrosniffer\src\state\processor.rs`
- Modify: `D:\rag\rustrosniffer\tests\event_processor.rs`

- [ ] **Step 1: Write failing test for hit-based damage tracking**

Add to `tests/event_processor.rs`:

```rust
#[tokio::test]
async fn test_mvp_damage_tracks_individual_hits() {
    let config = TelemetryConfig {
        mvp_monster_ids: HashSet::from([1038]),
        batch_window_ms: 100,
        ..Default::default()
    };
    let (event_tx, event_rx) = tokio::sync::mpsc::channel(100);
    let (action_tx, mut action_rx) = tokio::sync::mpsc::channel(100);
    let mut processor = EventProcessor::new(config, event_rx, action_tx);

    // Spawn MVP actor
    event_tx.send(GameEvent::ActorSpawned {
        pid: 1, actor_id: 500, monster_id: 1038,
        name: "Osiris".into(), x: 100, y: 100,
        actor_type: ActorType::Monster,
    }).await.unwrap();
    processor.process_pending().await;

    // Spawn player actor
    event_tx.send(GameEvent::ActorSpawned {
        pid: 1, actor_id: 1000, monster_id: 4000,
        name: "TestPlayer".into(), x: 100, y: 100,
        actor_type: ActorType::Player,
    }).await.unwrap();
    processor.process_pending().await;

    // Player hits MVP with skill
    event_tx.send(GameEvent::DamageDealt {
        pid: 1, source_id: 1000, target_id: 500,
        damage: 5000, server_tick: 100000, skill_id: Some(2022),
    }).await.unwrap();
    processor.process_pending().await;

    // Player hits MVP with basic attack
    event_tx.send(GameEvent::DamageDealt {
        pid: 1, source_id: 1000, target_id: 500,
        damage: 300, server_tick: 101000, skill_id: None,
    }).await.unwrap();
    processor.process_pending().await;

    // Verify tracker has 2 hits
    let tracker = processor.state.mvp_damage.get(&(1, 500)).unwrap();
    assert_eq!(tracker.hits.len(), 2);
    assert_eq!(tracker.first_hitter_name, Some("TestPlayer".into()));
    assert_eq!(tracker.hits[0].damage, 5000);
    assert_eq!(tracker.hits[0].server_tick, 100000);
    assert_eq!(tracker.hits[0].skill_id, Some(2022));
    assert_eq!(tracker.hits[0].source_name, "TestPlayer");
    assert_eq!(tracker.hits[0].elapsed_ms, 0); // first hit
    assert_eq!(tracker.hits[1].damage, 300);
    assert_eq!(tracker.hits[1].elapsed_ms, 1000); // 101000 - 100000
}

#[tokio::test]
async fn test_mvp_damage_filters_self_damage() {
    let config = TelemetryConfig {
        mvp_monster_ids: HashSet::from([1038]),
        batch_window_ms: 100,
        ..Default::default()
    };
    let (event_tx, event_rx) = tokio::sync::mpsc::channel(100);
    let (action_tx, _action_rx) = tokio::sync::mpsc::channel(100);
    let mut processor = EventProcessor::new(config, event_rx, action_tx);

    // Spawn MVP
    event_tx.send(GameEvent::ActorSpawned {
        pid: 1, actor_id: 500, monster_id: 1038,
        name: "Osiris".into(), x: 100, y: 100,
        actor_type: ActorType::Monster,
    }).await.unwrap();
    processor.process_pending().await;

    // Self-damage (buff skill 252, source == target)
    event_tx.send(GameEvent::DamageDealt {
        pid: 1, source_id: 500, target_id: 500,
        damage: 1000, server_tick: 100000, skill_id: Some(252),
    }).await.unwrap();
    processor.process_pending().await;

    // No tracker should exist (self-damage filtered)
    assert!(processor.state.mvp_damage.get(&(1, 500)).is_none());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test test_mvp_damage_tracks_individual_hits test_mvp_damage_filters_self_damage`
Expected: FAIL — `MvpDamageTracker` doesn't have `hits` field.

- [ ] **Step 3: Update MvpDamageTracker and add DamageHit**

In `src/state/game_state.rs`, replace the existing `MvpDamageTracker`:

```rust
/// Individual damage hit on an MVP, stored for telemetry reporting.
#[derive(Debug, Clone)]
pub struct DamageHit {
    pub source_name: String,
    pub damage: i32,
    pub server_tick: u32,
    pub elapsed_ms: u64,
    pub skill_id: Option<u16>,
}

/// Tracks damage dealt to an MVP for DPS/first-hitter analysis.
pub struct MvpDamageTracker {
    pub monster_id: u32,
    pub monster_name: String,
    pub first_hitter_name: Option<String>,
    pub first_tick: Option<u32>,
    pub hits: Vec<DamageHit>,
}
```

- [ ] **Step 4: Update processor.rs DamageDealt handler**

Replace the handler at ~line 622:

```rust
GameEvent::DamageDealt { pid, source_id, target_id, damage, server_tick, skill_id } => {
    // Filter self-damage (buffs)
    if source_id == target_id {
        break;
    }

    // Check if target is an MVP
    if let Some(actor) = self.state.actor_cache.get(&(pid, target_id)) {
        if self.state.config.is_mvp(actor.monster_id) {
            // Resolve source name from actor cache
            let source_name = self.state.actor_cache.get(&(pid, source_id))
                .map(|a| a.name.clone())
                .unwrap_or_else(|| format!("actor_{}", source_id));

            let key = (pid, target_id);
            let tracker = self.state.mvp_damage.entry(key).or_insert_with(|| MvpDamageTracker {
                monster_id: actor.monster_id,
                monster_name: actor.name.clone(),
                first_hitter_name: None,
                first_tick: None,
                hits: Vec::new(),
            });

            // Set first hitter
            if tracker.first_hitter_name.is_none() {
                tracker.first_hitter_name = Some(source_name.clone());
                tracker.first_tick = Some(server_tick);
                info!("[MVP-DAMAGE] First hit on {} by {}", actor.name, source_name);
            }

            // Calculate elapsed_ms from first tick
            let elapsed_ms = tracker.first_tick
                .map(|ft| server_tick.wrapping_sub(ft) as u64)
                .unwrap_or(0);

            tracker.hits.push(DamageHit {
                source_name,
                damage,
                server_tick,
                elapsed_ms,
                skill_id,
            });
        }
    }
}
```

- [ ] **Step 5: Update ActorDied damage summary log**

In processor.rs, update the ActorDied handler (~line 357) to use the new struct:

```rust
if let Some(tracker) = self.state.mvp_damage.remove(&(pid, actor_id)) {
    // Aggregate damage by source for logging
    let mut damage_by_source: std::collections::HashMap<&str, u64> = std::collections::HashMap::new();
    for hit in &tracker.hits {
        *damage_by_source.entry(&hit.source_name).or_insert(0) += hit.damage as u64;
    }
    let total: u64 = damage_by_source.values().sum();
    let mut sorted: Vec<_> = damage_by_source.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(a.1));

    info!(
        "[MVP-DAMAGE] {} died! First hitter: {:?}, Total damage: {}, Hits: {}",
        tracker.monster_name,
        tracker.first_hitter_name,
        total,
        tracker.hits.len(),
    );
    for (src, dmg) in sorted.iter().take(10) {
        let pct = if total > 0 { (*dmg as f64 / total as f64 * 100.0) as u32 } else { 0 };
        info!("[MVP-DAMAGE]   {}: {} dmg ({}%)", src, dmg, pct);
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test test_mvp_damage`
Expected: Both tests PASS.

- [ ] **Step 7: Run full test suite**

Run: `cargo test`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
cd D:\rag\rustrosniffer
git add src/state/game_state.rs src/state/processor.rs tests/event_processor.rs
git commit -m "feat: track individual damage hits per MVP fight

Replace damage_by_source HashMap with Vec<DamageHit> containing
source_name, server_tick, elapsed_ms, skill_id per hit. Filter
self-damage. Resolve source names from actor_cache at hit time."
```

---

## Task 3: Extend KillData and Telemetry Payload (Sniffer)

**Files:**
- Modify: `D:\rag\rustrosniffer\src\telemetry\actions.rs`
- Modify: `D:\rag\rustrosniffer\src\state\kill_buffer.rs`
- Modify: `D:\rag\rustrosniffer\src\state\processor.rs`
- Modify: `D:\rag\rustrosniffer\src\telemetry\client.rs`

- [ ] **Step 1: Add DamageHitData to telemetry actions**

In `src/telemetry/actions.rs`, add after `KillData`:

```rust
#[derive(Debug, Clone)]
pub struct DamageHitData {
    pub source_name: String,
    pub damage: i32,
    pub server_tick: u32,
    pub elapsed_ms: u64,
    pub skill_id: Option<u16>,
}
```

Add fields to `KillData`:

```rust
pub struct KillData {
    pub monster_id: u32,
    pub map: String,
    pub x: u16,
    pub y: u16,
    pub timestamp: i64,
    pub client_pid: u32,
    pub loots: Vec<(u16, u16)>,
    pub tomb: Option<(u16, u16)>,
    pub killer_name: Option<String>,
    pub kill_hour: Option<i32>,
    pub kill_minute: Option<i32>,
    pub damage_hits: Vec<DamageHitData>,       // NEW
    pub first_hitter_name: Option<String>,      // NEW
}
```

- [ ] **Step 2: Update KillBuffer to carry damage hits**

In `src/state/kill_buffer.rs`, add to `KillBuffer`:

```rust
pub struct KillBuffer {
    pub monster_id: u32,
    pub map: String,
    pub x: u16,
    pub y: u16,
    pub timestamp: i64,
    pub client_pid: u32,
    pub loots: Vec<(u16, u16)>,
    pub tomb: Option<(u16, u16)>,
    pub killer: Option<KillerInfo>,
    pub created_at: Instant,
    pub damage_hits: Vec<DamageHitData>,       // NEW
    pub first_hitter_name: Option<String>,      // NEW
}
```

Update `into_kill_data()` to pass the new fields:

```rust
pub fn into_kill_data(self) -> KillData {
    KillData {
        monster_id: self.monster_id,
        map: self.map,
        x: self.x,
        y: self.y,
        timestamp: self.timestamp,
        client_pid: self.client_pid,
        loots: self.loots,
        tomb: self.tomb,
        killer_name: self.killer.as_ref().map(|k| k.name.clone()),
        kill_hour: self.killer.as_ref().map(|k| k.hour),
        kill_minute: self.killer.as_ref().map(|k| k.minute),
        damage_hits: self.damage_hits,
        first_hitter_name: self.first_hitter_name,
    }
}
```

Update `KillBuffer::new()` (or wherever it's constructed) to initialize the new fields with empty defaults.

- [ ] **Step 3: Transfer damage hits from tracker to KillBuffer in processor.rs**

In processor.rs, where the KillBuffer is created for an MVP death (~line 392), after removing the `MvpDamageTracker`, convert its hits:

```rust
// Convert damage tracker hits to telemetry format
let (damage_hits, first_hitter_name) = if let Some(tracker) = self.state.mvp_damage.remove(&(pid, actor_id)) {
    // ... (keep existing logging from Task 2) ...

    let hits: Vec<DamageHitData> = tracker.hits.into_iter().map(|h| DamageHitData {
        source_name: h.source_name,
        damage: h.damage,
        server_tick: h.server_tick,
        elapsed_ms: h.elapsed_ms,
        skill_id: h.skill_id,
    }).collect();
    (hits, tracker.first_hitter_name)
} else {
    (Vec::new(), None)
};
```

Then set these on the KillBuffer:

```rust
kill_buffer.damage_hits = damage_hits;
kill_buffer.first_hitter_name = first_hitter_name;
```

- [ ] **Step 4: Update kill_data_to_json in client.rs**

In `src/telemetry/client.rs`, update `kill_data_to_json`:

```rust
fn kill_data_to_json(kill: &KillData) -> Value {
    let mut json = serde_json::json!({
        "monster_id": kill.monster_id,
        "map": kill.map,
        "x": kill.x,
        "y": kill.y,
        "timestamp": kill.timestamp,
        "client_pid": kill.client_pid,
        "loots": kill.loots.iter().map(|(id, amount)| {
            serde_json::json!({"id": id, "amount": amount})
        }).collect::<Vec<_>>(),
        "tomb": kill.tomb.map(|(x, y)| serde_json::json!({"x": x, "y": y})),
        "killer_name": kill.killer_name,
        "kill_hour": kill.kill_hour,
        "kill_minute": kill.kill_minute,
    });

    if !kill.damage_hits.is_empty() {
        json["damage_hits"] = serde_json::json!(kill.damage_hits.iter().map(|h| {
            serde_json::json!({
                "source_name": h.source_name,
                "damage": h.damage,
                "server_tick": h.server_tick,
                "elapsed_ms": h.elapsed_ms,
                "skill_id": h.skill_id,
            })
        }).collect::<Vec<_>>());
    }
    if let Some(ref name) = kill.first_hitter_name {
        json["first_hitter_name"] = serde_json::json!(name);
    }

    json
}
```

- [ ] **Step 5: Build and run all tests**

Run: `cargo test`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd D:\rag\rustrosniffer
git add src/telemetry/actions.rs src/state/kill_buffer.rs src/state/processor.rs src/telemetry/client.rs
git commit -m "feat: include damage hits in mvp-event payload

Transfer individual hits from MvpDamageTracker to KillBuffer on
MVP death, serialize as damage_hits[] + first_hitter_name in the
mvp-event JSON payload. Fields are optional for backward compat."
```

---

## Task 4: Database Migration (Backend)

**Files:**
- Create: `D:\rag\instance-tracker\supabase\migrations\20260405000000_mvp_damage_hits.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260405000000_mvp_damage_hits.sql`:

```sql
-- MVP Damage Hit Tracking
-- Stores individual damage hits per MVP kill for DPS analysis.
-- Dedup key: (kill_id, source_name, server_tick, damage) allows
-- multiple sniffers to contribute complementary data to same fight.

-- Add first_hitter_name to mvp_kills
ALTER TABLE mvp_kills ADD COLUMN IF NOT EXISTS first_hitter_name text;

-- Individual damage hits table
CREATE TABLE mvp_kill_damage_hits (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kill_id         uuid NOT NULL REFERENCES mvp_kills(id) ON DELETE CASCADE,
    source_name     text NOT NULL,
    damage          integer NOT NULL,
    server_tick     bigint NOT NULL,
    elapsed_ms      integer NOT NULL,
    skill_id        smallint,
    reported_by     uuid REFERENCES telemetry_sessions(id),
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (kill_id, source_name, server_tick, damage)
);

CREATE INDEX idx_damage_hits_kill_id ON mvp_kill_damage_hits(kill_id);

-- RLS
ALTER TABLE mvp_kill_damage_hits ENABLE ROW LEVEL SECURITY;

-- Read: group members can view damage hits (via parent kill's group)
CREATE POLICY "damage_hits_group_read" ON mvp_kill_damage_hits FOR SELECT
USING (
    kill_id IN (
        SELECT k.id FROM mvp_kills k
        WHERE k.group_id IN (
            SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid()
        )
        OR (k.group_id IS NULL AND k.registered_by IN (
            SELECT id FROM characters WHERE user_id = auth.uid()
        ))
    )
);

-- Insert: via service role only (telemetry endpoint)
-- No user-facing insert policy needed
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or apply via Supabase dashboard)
Expected: Migration applies successfully.

- [ ] **Step 3: Commit**

```bash
cd D:\rag\instance-tracker
git add supabase/migrations/20260405000000_mvp_damage_hits.sql
git commit -m "feat: add mvp_kill_damage_hits table and first_hitter_name column

Stores individual damage hits per MVP kill with dedup via UNIQUE
constraint on (kill_id, source_name, server_tick, damage). RLS
policy inherits access from parent kill's group membership."
```

---

## Task 5: Extend mvp-event Endpoint (Backend)

**Files:**
- Modify: `D:\rag\instance-tracker\src\app\api\telemetry\mvp-event\route.ts`

- [ ] **Step 1: Add damage_hits processing to mvp-event**

After the existing RPC call that returns `{ action, kill_id }`, add damage hit insertion:

```typescript
// After: const result = await supabase.rpc('register_kill_from_event', { ... })

const killId = result.data?.kill_id

// Insert damage hits if provided (even if kill was deduplicated)
if (killId && Array.isArray(body.damage_hits) && body.damage_hits.length > 0) {
  const hits = body.damage_hits.map((h: {
    source_name: string
    damage: number
    server_tick: number
    elapsed_ms: number
    skill_id?: number | null
  }) => ({
    kill_id: killId,
    source_name: h.source_name,
    damage: h.damage,
    server_tick: h.server_tick,
    elapsed_ms: h.elapsed_ms,
    skill_id: h.skill_id ?? null,
    reported_by: ctx.sessionId ?? null,
  }))

  const { error: hitsError } = await supabase
    .from('mvp_kill_damage_hits')
    .upsert(hits, { onConflict: 'kill_id,source_name,server_tick,damage', ignoreDuplicates: true })

  if (hitsError) {
    console.error('Failed to insert damage hits:', hitsError.message)
    // Non-fatal: kill was still registered, damage is optional
  }
}

// Update first_hitter_name if provided and not yet set
if (killId && body.first_hitter_name) {
  await supabase
    .from('mvp_kills')
    .update({ first_hitter_name: body.first_hitter_name })
    .eq('id', killId)
    .is('first_hitter_name', null)
}
```

Note: `ctx.sessionId` — check if `resolveTelemetryContext` already returns a session ID. If not, it may need to be resolved from the token. If unavailable, pass `null` for `reported_by`.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd D:\rag\instance-tracker
git add src/app/api/telemetry/mvp-event/route.ts
git commit -m "feat: accept damage_hits in mvp-event endpoint

Insert individual hits into mvp_kill_damage_hits with ON CONFLICT
DO NOTHING for dedup. Process hits even when kill is deduplicated
to allow multi-sniffer aggregation. Update first_hitter_name on
kill record if not yet set."
```

---

## Task 6: Create mvp-damage GET Endpoint (Backend)

**Files:**
- Create: `D:\rag\instance-tracker\src\app\api\telemetry\mvp-damage\route.ts`
- Modify: `D:\rag\instance-tracker\src\lib\types.ts`

- [ ] **Step 1: Add types**

In `src/lib/types.ts`, add:

```typescript
export interface MvpDamageAttacker {
  name: string
  total_damage: number
  pct: number
  is_first_hitter: boolean
}

export interface MvpDamageTimelinePoint {
  elapsed_ms: number
  [attackerName: string]: number
}

export interface MvpDamageResponse {
  kill_id: string
  first_hitter: string | null
  duration_ms: number
  sniffer_count: number
  attackers: MvpDamageAttacker[]
  timeline: MvpDamageTimelinePoint[]
}
```

- [ ] **Step 2: Create the endpoint**

Create `src/app/api/telemetry/mvp-damage/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const killId = request.nextUrl.searchParams.get('kill_id')
  if (!killId) {
    return NextResponse.json({ error: 'kill_id required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify user has access to this kill (RLS handles it)
  const { data: kill, error: killError } = await supabase
    .from('mvp_kills')
    .select('id, first_hitter_name')
    .eq('id', killId)
    .single()

  if (killError || !kill) {
    return NextResponse.json({ error: 'Kill not found' }, { status: 404 })
  }

  // Fetch all damage hits for this kill
  const { data: hits, error: hitsError } = await supabase
    .from('mvp_kill_damage_hits')
    .select('source_name, damage, server_tick, elapsed_ms, skill_id, reported_by')
    .eq('kill_id', killId)
    .order('elapsed_ms', { ascending: true })

  if (hitsError || !hits || hits.length === 0) {
    return NextResponse.json(null)
  }

  // Aggregate by source
  const damageBySource = new Map<string, number>()
  for (const hit of hits) {
    damageBySource.set(
      hit.source_name,
      (damageBySource.get(hit.source_name) ?? 0) + hit.damage
    )
  }

  const totalDamage = Array.from(damageBySource.values()).reduce((a, b) => a + b, 0)
  const durationMs = Math.max(...hits.map(h => h.elapsed_ms))

  // Build attackers list sorted by damage DESC
  const attackers = Array.from(damageBySource.entries())
    .map(([name, total_damage]) => ({
      name,
      total_damage,
      pct: totalDamage > 0 ? Math.round(total_damage / totalDamage * 100) : 0,
      is_first_hitter: name === kill.first_hitter_name,
    }))
    .sort((a, b) => b.total_damage - a.total_damage)

  // Determine which attackers make the >=1% cut for timeline
  const timelineAttackers = new Set(attackers.filter(a => a.pct >= 1).map(a => a.name))

  // Build cumulative timeline in 1-second buckets
  const bucketMs = 1000
  const numBuckets = Math.ceil(durationMs / bucketMs) + 1
  const cumulative = new Map<string, number>()
  for (const name of timelineAttackers) {
    cumulative.set(name, 0)
  }

  // Pre-bucket all hits
  const bucketedHits = new Map<number, Map<string, number>>()
  for (const hit of hits) {
    if (!timelineAttackers.has(hit.source_name)) continue
    const bucket = Math.floor(hit.elapsed_ms / bucketMs)
    if (!bucketedHits.has(bucket)) bucketedHits.set(bucket, new Map())
    const bm = bucketedHits.get(bucket)!
    bm.set(hit.source_name, (bm.get(hit.source_name) ?? 0) + hit.damage)
  }

  const timeline: Record<string, number>[] = []
  for (let i = 0; i < numBuckets; i++) {
    const point: Record<string, number> = { elapsed_ms: i * bucketMs }
    const bucketDmg = bucketedHits.get(i)
    for (const name of timelineAttackers) {
      if (bucketDmg) {
        cumulative.set(name, (cumulative.get(name) ?? 0) + (bucketDmg.get(name) ?? 0))
      }
      point[name] = cumulative.get(name) ?? 0
    }
    timeline.push(point)
  }

  // Count distinct sniffers
  const snifferCount = new Set(hits.map(h => h.reported_by).filter(Boolean)).size

  return NextResponse.json({
    kill_id: killId,
    first_hitter: kill.first_hitter_name,
    duration_ms: durationMs,
    sniffer_count: Math.max(snifferCount, 1),
    attackers,
    timeline,
  })
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd D:\rag\instance-tracker
git add src/app/api/telemetry/mvp-damage/route.ts src/lib/types.ts
git commit -m "feat: add GET /api/telemetry/mvp-damage endpoint

Returns aggregated damage breakdown + cumulative timeline for a
given kill_id. Attackers sorted by damage DESC with percentages.
Timeline pre-aggregated in 1-second buckets for Recharts."
```

---

## Task 7: MvpDamagePanel Component (Frontend)

**Files:**
- Create: `D:\rag\instance-tracker\src\components\mvp\mvp-damage-panel.tsx`
- Modify: `D:\rag\instance-tracker\src\components\mvp\mvp-tab.tsx`
- Modify: `D:\rag\instance-tracker\package.json`

- [ ] **Step 1: Install recharts**

```bash
cd D:\rag\instance-tracker
npm install recharts
```

- [ ] **Step 2: Create MvpDamagePanel component**

Create `src/components/mvp/mvp-damage-panel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Sword } from 'lucide-react'
import type { MvpDamageResponse } from '@/lib/types'

const CHART_COLORS = [
  'var(--primary)',           // Copper
  'var(--status-available)',  // Jade
  'var(--status-soon)',       // Gold
  'var(--primary-secondary)', // Amber
  'var(--text-secondary)',    // Slate
  'var(--status-error)',      // Ember
]

function formatDamage(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

export function MvpDamagePanel({ killId }: { killId: string }) {
  const [data, setData] = useState<MvpDamageResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/telemetry/mvp-damage?kill_id=${killId}`)
      .then(res => res.ok ? res.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [killId])

  if (loading) {
    return (
      <div className="border border-border rounded-lg bg-surface p-4 animate-pulse">
        <div className="h-4 bg-bg rounded w-1/3 mb-3" />
        <div className="h-20 bg-bg rounded mb-3" />
        <div className="h-32 bg-bg rounded" />
      </div>
    )
  }

  if (!data || data.attackers.length === 0) return null

  const totalDamage = data.attackers.reduce((sum, a) => sum + a.total_damage, 0)
  const mainAttackers = data.attackers.filter(a => a.pct >= 1)
  const others = data.attackers.filter(a => a.pct < 1)
  const othersDamage = others.reduce((sum, a) => sum + a.total_damage, 0)
  const othersPct = totalDamage > 0 ? Math.round(othersDamage / totalDamage * 100) : 0

  const durationSec = Math.round(data.duration_ms / 1000)

  return (
    <div className="border border-border rounded-lg bg-surface p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-semibold text-primary">Damage Breakdown</span>
        <span className="text-[11px] font-semibold tracking-[1.5px] uppercase text-text-secondary">
          {durationSec}s · {data.attackers.length} atk · {data.sniffer_count} sniffer{data.sniffer_count > 1 ? 's' : ''}
        </span>
      </div>

      {/* Damage bars */}
      <div className="flex flex-col gap-1.5 mb-4">
        {mainAttackers.map((attacker, i) => (
          <div key={attacker.name} className="flex items-center gap-2">
            <div className="w-[110px] flex items-center justify-end gap-1 shrink-0">
              <span className="text-xs font-medium text-text-primary truncate">{attacker.name}</span>
              {attacker.is_first_hitter && (
                <Sword
                  size={12}
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity="var(--icon-fill-opacity)"
                  className="shrink-0"
                />
              )}
            </div>
            <div className="flex-1 bg-bg rounded-sm h-[22px] relative overflow-hidden border border-border">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${Math.max(attacker.pct, 1)}%`,
                  background: `linear-gradient(90deg, ${CHART_COLORS[i] ?? CHART_COLORS[5]}, color-mix(in srgb, ${CHART_COLORS[i] ?? CHART_COLORS[5]} 70%, white))`,
                }}
              />
              <div className="absolute right-1.5 top-[3px] text-[11px] font-medium text-text-primary">
                {formatDamage(attacker.total_damage)} <span className="text-text-secondary">({attacker.pct}%)</span>
              </div>
            </div>
          </div>
        ))}

        {others.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-[110px] flex items-center justify-end shrink-0">
              <span className="text-xs font-medium text-text-secondary">Others ({others.length})</span>
            </div>
            <div className="flex-1 bg-bg rounded-sm h-[22px] relative overflow-hidden border border-border">
              <div
                className="h-full rounded-sm bg-border"
                style={{ width: `${Math.max(othersPct, 0.5)}%`, minWidth: '3px' }}
              />
              <div className="absolute right-1.5 top-[3px] text-[11px] font-medium text-text-secondary">
                {formatDamage(othersDamage)} ({othersPct}%)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cumulative chart */}
      {data.timeline.length > 1 && (
        <div className="border-t border-border pt-3">
          <div className="text-xs font-semibold text-primary mb-2">Cumulative Damage</div>
          <div className="bg-bg rounded-md border border-border p-2" style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.timeline}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="elapsed_ms"
                  tickFormatter={(ms: number) => `${Math.round(ms / 1000)}s`}
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                  stroke="var(--border)"
                />
                <YAxis
                  tickFormatter={(v: number) => formatDamage(v)}
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                  stroke="var(--border)"
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 12,
                  }}
                  labelFormatter={(ms: number) => `${Math.round(ms / 1000)}s`}
                  formatter={(value: number) => [formatDamage(value), '']}
                />
                {mainAttackers.map((attacker, i) => (
                  <Line
                    key={attacker.name}
                    type="monotone"
                    dataKey={attacker.name}
                    stroke={CHART_COLORS[i] ?? CHART_COLORS[5]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex gap-3 mt-2 justify-center flex-wrap">
            {mainAttackers.map((attacker, i) => (
              <div key={attacker.name} className="flex items-center gap-1 text-[11px] font-medium text-text-primary">
                <div
                  className="w-3 h-[2px] rounded-full"
                  style={{ background: CHART_COLORS[i] ?? CHART_COLORS[5] }}
                />
                {attacker.name}
                {attacker.is_first_hitter && (
                  <Sword
                    size={10}
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity="var(--icon-fill-opacity)"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Integrate into mvp-tab.tsx**

In `src/components/mvp/mvp-tab.tsx`, add the import:

```typescript
import { MvpDamagePanel } from './mvp-damage-panel'
```

Then in the detail view section (after the map/coords area, before kill history at ~line 553), add:

```tsx
{/* Damage breakdown panel */}
{selectedKill && selectedKill.source === 'telemetry' && (
  <MvpDamagePanel killId={selectedKill.kill_id} />
)}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
cd D:\rag\instance-tracker
git add package.json package-lock.json src/components/mvp/mvp-damage-panel.tsx src/components/mvp/mvp-tab.tsx
git commit -m "feat: add MvpDamagePanel with bars and cumulative chart

New component renders below map/coords in MVP detail view when
kill has damage data. Shows horizontal bars per attacker with
percentages, Lucide Sword icon for first hitter, and Recharts
cumulative line chart for attackers with >=1% damage."
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| Capture skill + action damage (5 packet types) | Task 1 (parsers already exist, adding server_tick/skill_id) |
| server_tick and skill_id on DamageDealt | Task 1 |
| Filter self-damage | Task 2 |
| Resolve names at hit time | Task 2 |
| Individual hits in MvpDamageTracker | Task 2 |
| Extend KillData/KillBuffer with hits | Task 3 |
| Serialize damage_hits in JSON payload | Task 3 |
| New table mvp_kill_damage_hits | Task 4 |
| first_hitter_name on mvp_kills | Task 4 |
| RLS policy | Task 4 |
| mvp-event accepts damage_hits (even on dedup) | Task 5 |
| GET /api/telemetry/mvp-damage endpoint | Task 6 |
| Timeline aggregated in 1s buckets | Task 6 |
| sniffer_count from distinct reported_by | Task 6 |
| Install recharts | Task 7 |
| MvpDamagePanel with bars + chart | Task 7 |
| Lucide Sword duotone for first hitter | Task 7 |
| Design system tokens (no hardcoded hex) | Task 7 |
| >=1% threshold for chart lines | Task 7 |
| "Others" aggregation | Task 7 |
| Panel below map/coords in detail view | Task 7 |

### Placeholder Scan
No TBDs, TODOs, or "fill in later" found.

### Type Consistency
- `DamageHit` (Rust game_state) → `DamageHitData` (Rust telemetry) → JSON `damage_hits[]` → `mvp_kill_damage_hits` table → `MvpDamageResponse` (TS) → `MvpDamagePanel` props. Field names are consistent throughout: `source_name`, `damage`, `server_tick`, `elapsed_ms`, `skill_id`.
- `first_hitter_name` flows: `MvpDamageTracker` → `KillBuffer` → `KillData` → JSON → `mvp_kills.first_hitter_name` → `MvpDamageResponse.first_hitter`.
