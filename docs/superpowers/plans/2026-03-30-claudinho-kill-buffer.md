# Claudinho Kill Buffer & Config Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-second kill buffer to the C++ sniffer so MVP kill data (death, drops, tomb coords, killer name) is sent as a single consolidated POST to `/api/telemetry/mvp-event` instead of 3-4 separate requests.

**Architecture:** New `MvpKillBuffer` singleton buffers MVP kill data for 5 seconds after death detection. During the window, tomb coords and killer name are merged into the buffer. When the window closes, a single consolidated event is sent to the new `mvp-event` endpoint. Data arriving after the window falls back to the existing individual endpoints (`mvp-killer`, `mvp-tomb`).

**IMPORTANT — What is NOT buffered:**
- **`mvp-spotted` (sightings) are NEVER buffered.** Sightings need zero latency — when the sniffer detects a MVP alive, the group needs to see it immediately. Sightings continue as direct POSTs to `/api/telemetry/mvp-spotted` with no delay.
- The kill buffer only applies to **kill events** (death + drops + tomb + killer), because that data arrives in multiple packets over several seconds and benefits from consolidation.
- When the consolidated kill event is sent, the backend's `telemetry_register_kill` RPC automatically deletes any active `mvp_sightings` for that MVP (already implemented in the RPC). This ensures the sighting disappears from the UI once the kill is confirmed.
- **Sighting suppression during buffer window:** While a kill buffer is active for a MVP, the sniffer must NOT send `mvp-spotted` for that same monster_id+map. This prevents the race condition where the MVP's corpse/actor is still visible on screen after death and the sniffer re-creates a sighting that was just deleted. The `MvpKillBuffer` exposes `has_active_buffer(monster_id, map)` for this check. The backend also has a 5-minute kill cooldown on sightings as a second safety net.

**Tech Stack:** C++20, MSVC, libcurl, nlohmann/json, std::thread, std::mutex

**Target repo:** `D:\rag\RO-PacketSniffer-CPP` (NOT the instance-tracker repo)

**Spec:** `docs/superpowers/specs/2026-03-30-telemetry-reliability-design.md` (Section 1.2)

---

## File Structure

### New Files
- `src/public/telemetry/MvpKillBuffer.h` — Kill buffer class header (singleton, thread-safe)
- `src/private/telemetry/MvpKillBuffer.cpp` — Kill buffer implementation

### Modified Files
- `src/private/telemetry/TelemetryClient.cpp` — Add `send_mvp_event()` method, add `config_stale` handling
- `src/public/telemetry/TelemetryClient.h` — Declare `send_mvp_event()`
- `src/private/packets/receive/ActorDied.cpp` — Use buffer instead of direct `on_mvp_kill()`
- `src/private/packets/receive/ActorInfo.cpp` — Offer tomb data to buffer
- `src/private/packets/receive/GameMessage.cpp` — Offer killer data to buffer
- `CMakeLists.txt` — Add new source files

---

## Task 1: MvpKillBuffer Class

**Files:**
- Create: `src/public/telemetry/MvpKillBuffer.h`
- Create: `src/private/telemetry/MvpKillBuffer.cpp`
- Modify: `CMakeLists.txt`

- [ ] **Step 1: Create the header**

```cpp
// src/public/telemetry/MvpKillBuffer.h
#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <mutex>
#include <thread>
#include <optional>
#include <chrono>
#include <functional>
#include "TelemetryClient.h"

struct BufferedKill {
    uint32_t monster_id{};
    std::string map;
    uint16_t x{};
    uint16_t y{};
    long timestamp{};
    std::vector<TelemetryMvpLoot> loots;
    // Tomb data (may arrive during buffer window)
    std::optional<uint16_t> tomb_x;
    std::optional<uint16_t> tomb_y;
    // Killer data (may arrive during buffer window)
    std::string killer_name;
    int kill_hour{-1};
    int kill_minute{-1};
    // Timing
    std::chrono::steady_clock::time_point created_at;
};

class MvpKillBuffer {
public:
    static MvpKillBuffer& instance() {
        static MvpKillBuffer inst;
        return inst;
    }

    /// Start buffering a new MVP kill. Starts the 5s flush timer.
    void start_kill(uint32_t monster_id, const std::string& map,
                    uint16_t x, uint16_t y, long timestamp);

    /// Add loots collected after death (called from ActorDied 3s delay thread).
    void add_loots(uint32_t monster_id, const std::string& map,
                   const std::vector<TelemetryMvpLoot>& loots);

    /// Offer tomb coordinates. Returns true if consumed by buffer, false if no active buffer.
    bool offer_tomb(const std::string& map, uint16_t tomb_x, uint16_t tomb_y);

    /// Offer killer name. Returns true if consumed by buffer, false if no active buffer.
    bool offer_killer(const std::string& map, const std::string& killer_name,
                      int kill_hour, int kill_minute);

    /// Check if there's an active buffer for this monster+map (used to suppress sightings).
    bool has_active_buffer(uint32_t monster_id, const std::string& map) const;

    /// Shutdown: flush any pending buffer immediately.
    void shutdown();

private:
    MvpKillBuffer() = default;
    ~MvpKillBuffer() { shutdown(); }
    MvpKillBuffer(const MvpKillBuffer&) = delete;
    MvpKillBuffer& operator=(const MvpKillBuffer&) = delete;

    void schedule_flush(uint32_t monster_id, const std::string& map);
    void flush(uint32_t monster_id, const std::string& map);

    static constexpr int BUFFER_WINDOW_MS = 5000;

    mutable std::mutex m_mtx;
    // Key: "monster_id:map" → BufferedKill
    // Typically only one active at a time, but safe for multiple
    std::unordered_map<std::string, BufferedKill> m_buffers;

    static std::string make_key(uint32_t monster_id, const std::string& map) {
        return std::to_string(monster_id) + ":" + map;
    }
};
```

- [ ] **Step 2: Create the implementation**

```cpp
// src/private/telemetry/MvpKillBuffer.cpp
#include "telemetry/MvpKillBuffer.h"
#include "telemetry/TelemetryClient.h"
#include <iostream>

void MvpKillBuffer::start_kill(uint32_t monster_id, const std::string& map,
                                uint16_t x, uint16_t y, long timestamp)
{
    std::string key = make_key(monster_id, map);

    {
        std::lock_guard<std::mutex> lock(m_mtx);
        // If there's already a buffer for this key, flush it first
        if (m_buffers.count(key)) {
            // Will be flushed by timer, don't double-flush
        }

        BufferedKill bk;
        bk.monster_id = monster_id;
        bk.map = map;
        bk.x = x;
        bk.y = y;
        bk.timestamp = timestamp;
        bk.created_at = std::chrono::steady_clock::now();
        m_buffers[key] = std::move(bk);
    }

    std::cout << "[KillBuffer] Started buffer for monster_id=" << monster_id
              << " map=" << map << " (5s window)" << std::endl;

    schedule_flush(monster_id, map);
}

void MvpKillBuffer::add_loots(uint32_t monster_id, const std::string& map,
                               const std::vector<TelemetryMvpLoot>& loots)
{
    std::lock_guard<std::mutex> lock(m_mtx);
    std::string key = make_key(monster_id, map);
    auto it = m_buffers.find(key);
    if (it != m_buffers.end()) {
        it->second.loots = loots;
        std::cout << "[KillBuffer] Added " << loots.size() << " loots to buffer" << std::endl;
    }
}

bool MvpKillBuffer::offer_tomb(const std::string& map, uint16_t tomb_x, uint16_t tomb_y)
{
    std::lock_guard<std::mutex> lock(m_mtx);
    // Find any active buffer on this map
    for (auto& [key, bk] : m_buffers) {
        if (bk.map == map && !bk.tomb_x.has_value()) {
            bk.tomb_x = tomb_x;
            bk.tomb_y = tomb_y;
            std::cout << "[KillBuffer] Added tomb coords (" << tomb_x << "," << tomb_y
                      << ") to buffer" << std::endl;
            return true;
        }
    }
    return false;
}

bool MvpKillBuffer::offer_killer(const std::string& map, const std::string& killer_name,
                                  int kill_hour, int kill_minute)
{
    std::lock_guard<std::mutex> lock(m_mtx);
    for (auto& [key, bk] : m_buffers) {
        if (bk.map == map && bk.killer_name.empty()) {
            bk.killer_name = killer_name;
            bk.kill_hour = kill_hour;
            bk.kill_minute = kill_minute;
            std::cout << "[KillBuffer] Added killer '" << killer_name
                      << "' to buffer" << std::endl;
            return true;
        }
    }
    return false;
}

bool MvpKillBuffer::has_active_buffer(uint32_t monster_id, const std::string& map) const
{
    std::lock_guard<std::mutex> lock(m_mtx);
    return m_buffers.count(make_key(monster_id, map)) > 0;
}

void MvpKillBuffer::schedule_flush(uint32_t monster_id, const std::string& map)
{
    std::string key = make_key(monster_id, map);
    std::thread([this, monster_id, map, key]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(BUFFER_WINDOW_MS));
        flush(monster_id, map);
    }).detach();
}

void MvpKillBuffer::flush(uint32_t monster_id, const std::string& map)
{
    BufferedKill bk;
    {
        std::lock_guard<std::mutex> lock(m_mtx);
        std::string key = make_key(monster_id, map);
        auto it = m_buffers.find(key);
        if (it == m_buffers.end()) return;
        bk = std::move(it->second);
        m_buffers.erase(it);
    }

    std::cout << "[KillBuffer] Flushing buffer: monster_id=" << bk.monster_id
              << " map=" << bk.map
              << " has_tomb=" << bk.tomb_x.has_value()
              << " has_killer=" << !bk.killer_name.empty()
              << " loots=" << bk.loots.size() << std::endl;

    TelemetryClient::instance().send_mvp_event(bk);
}

void MvpKillBuffer::shutdown()
{
    std::lock_guard<std::mutex> lock(m_mtx);
    for (auto& [key, bk] : m_buffers) {
        TelemetryClient::instance().send_mvp_event(bk);
    }
    m_buffers.clear();
}
```

- [ ] **Step 3: Add to CMakeLists.txt**

Add `src/private/telemetry/MvpKillBuffer.cpp` to the source files list in `CMakeLists.txt`. Find the existing `SOURCES` or `add_executable` call and add the new file alongside `TelemetryClient.cpp` and `TelemetryQueue.cpp`.

- [ ] **Step 4: Build to verify compilation**

Run: `cmake --build build --config Debug 2>&1 | tail -20`
Expected: Compilation succeeds (link errors for `send_mvp_event` are ok — implemented in Task 2)

- [ ] **Step 5: Commit**

```bash
git add src/public/telemetry/MvpKillBuffer.h src/private/telemetry/MvpKillBuffer.cpp CMakeLists.txt
git commit -m "feat: add MvpKillBuffer for consolidated kill events"
```

---

## Task 2: TelemetryClient — send_mvp_event() + config_stale

**Files:**
- Modify: `src/public/telemetry/TelemetryClient.h`
- Modify: `src/private/telemetry/TelemetryClient.cpp`

- [ ] **Step 1: Declare send_mvp_event in header**

In `TelemetryClient.h`, add after the existing `on_mvp_kill` declaration:

```cpp
/// Send a consolidated MVP event to /api/telemetry/mvp-event
void send_mvp_event(const BufferedKill& kill);
```

Also add the forward declaration at the top:

```cpp
struct BufferedKill; // forward declaration
```

And add the include after the existing includes:

```cpp
#include "MvpKillBuffer.h"
```

- [ ] **Step 2: Implement send_mvp_event**

In `TelemetryClient.cpp`, add after the existing `on_mvp_broadcast` implementation:

```cpp
void TelemetryClient::send_mvp_event(const BufferedKill& kill)
{
    if (!m_enabled) return;

    nlohmann::json body = {
        {"monster_id", kill.monster_id},
        {"map", kill.map},
        {"timestamp", kill.timestamp}
    };

    // Tomb coords
    if (kill.tomb_x.has_value() && kill.tomb_y.has_value()) {
        body["tomb_x"] = kill.tomb_x.value();
        body["tomb_y"] = kill.tomb_y.value();
    }

    // Killer name + tomb time
    if (!kill.killer_name.empty()) {
        body["killer_name"] = kill.killer_name;
        if (kill.kill_hour >= 0 && kill.kill_minute >= 0) {
            body["kill_hour"] = kill.kill_hour;
            body["kill_minute"] = kill.kill_minute;
        }
    }

    // Loots
    if (!kill.loots.empty()) {
        nlohmann::json loot_array = nlohmann::json::array();
        for (const auto& loot : kill.loots) {
            loot_array.push_back({{"item_id", loot.item_id}, {"amount", loot.amount}});
        }
        body["loots"] = loot_array;
    }

    send_telemetry("POST", "telemetry/mvp-event", body);
}
```

- [ ] **Step 3: Suppress sightings during active kill buffer**

In `TelemetryClient.cpp`, in the `on_mvp_spotted()` method, add a check at the top (after the `is_instance_map` check):

```cpp
#include "MvpKillBuffer.h"

// ... inside on_mvp_spotted(), after is_instance_map check:
if (MvpKillBuffer::instance().has_active_buffer(monster_id, clean_map)) {
    std::cout << "[Telemetry] Suppressing spotted for " << monster_id
              << " — kill buffer active" << std::endl;
    return;
}
```

This prevents re-creating a sighting for a MVP that just died and is still in the kill buffer window.

- [ ] **Step 4: Add config_stale handling to heartbeat**

In `TelemetryClient.cpp`, in the `heartbeat_loop()` function, after the existing `config_version` check (around line 195), add:

```cpp
// Also check for explicit config_stale flag from server
if (response.contains("config_stale") && response["config_stale"].get<bool>()) {
    std::cout << "[Telemetry] Server reports config stale, reloading..." << std::endl;
    fetch_config();
}
```

- [ ] **Step 5: Build to verify compilation**

Run: `cmake --build build --config Debug`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/public/telemetry/TelemetryClient.h src/private/telemetry/TelemetryClient.cpp
git commit -m "feat: add send_mvp_event and config_stale handling"
```

---

## Task 3: Wire ActorDied to Use Kill Buffer

**Files:**
- Modify: `src/private/packets/receive/ActorDied.cpp`

- [ ] **Step 1: Add include**

At the top, add:

```cpp
#include "telemetry/MvpKillBuffer.h"
```

- [ ] **Step 2: Replace direct send with buffer start**

In the MVP kill detection section (the detached thread that waits 3s for drops), replace:

```cpp
// OLD CODE (remove this block):
std::thread([=]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(3000));
    auto drops = DropTracker::get_recent_drops_for(monster_id);
    std::vector<TelemetryMvpLoot> loots;
    for (const auto& [item_id, amount] : drops) {
        loots.push_back({item_id, amount});
    }
    TelemetryClient::instance().on_mvp_kill(monster_id, map, ax, ay, ts, loots);
}).detach();
```

With:

```cpp
// NEW CODE: Start buffer immediately, add loots after 3s delay
MvpKillBuffer::instance().start_kill(actor.monster_id, clean_map, ax, ay, ts);

std::thread([monster_id = actor.monster_id, clean_map]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(3000));
    auto drops = DropTracker::get_recent_drops_for(monster_id);
    std::vector<TelemetryMvpLoot> loots;
    for (const auto& [item_id, amount] : drops) {
        loots.push_back({item_id, amount});
    }
    MvpKillBuffer::instance().add_loots(monster_id, clean_map, loots);
}).detach();
```

Note: The buffer's 5s timer (started in `start_kill`) will flush after the 3s drop collection completes, giving ~2s of additional margin for tomb/killer data.

- [ ] **Step 3: Build and verify**

Run: `cmake --build build --config Debug`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/private/packets/receive/ActorDied.cpp
git commit -m "feat: wire ActorDied to use MvpKillBuffer instead of direct send"
```

---

## Task 4: Wire Tomb Detection to Offer Data to Buffer

**Files:**
- Modify: `src/private/packets/receive/ActorInfo.cpp`

- [ ] **Step 1: Add include**

```cpp
#include "telemetry/MvpKillBuffer.h"
```

- [ ] **Step 2: Offer tomb to buffer first, fallback to direct send**

In the `report_npc()` function, in the tomb detection block (where `is_tomb` is true and telemetry is enabled), replace:

```cpp
// OLD:
TelemetryClient::instance().on_mvp_tomb(coord_map, coord_x, coord_y, 0);
```

With:

```cpp
// NEW: Try buffer first, fall back to direct send
std::string clean_map = TelemetryClient::strip_gat(coord_map);
if (!MvpKillBuffer::instance().offer_tomb(clean_map, coord_x, coord_y)) {
    // No active buffer — send directly (tomb arrived after buffer window)
    TelemetryClient::instance().on_mvp_tomb(coord_map, coord_x, coord_y, 0);
}
```

Note: `strip_gat` may be a member function or static. Check the existing code — if `on_mvp_tomb` already strips `.gat`, then pass `coord_map` directly to both and let each handle it. The buffer stores clean map names (stripped by `start_kill`), so `offer_tomb` needs the clean version for matching.

- [ ] **Step 3: Build and verify**

Run: `cmake --build build --config Debug`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/private/packets/receive/ActorInfo.cpp
git commit -m "feat: offer tomb data to kill buffer before direct send"
```

---

## Task 5: Wire Killer Detection to Offer Data to Buffer

**Files:**
- Modify: `src/private/packets/receive/GameMessage.cpp`

- [ ] **Step 1: Add include**

```cpp
#include "telemetry/MvpKillBuffer.h"
```

- [ ] **Step 2: Offer killer to buffer first, fallback to direct send**

In the `NPC_TALK_CLOSE` handler, where `on_mvp_killer` is called, replace:

```cpp
// OLD:
TelemetryClient::instance().on_mvp_killer(
    tomb.map, tomb.x, tomb.y, talks.killer,
    talks.kill_hour, talks.kill_minute);
```

With:

```cpp
// NEW: Try buffer first, fall back to direct send
if (!MvpKillBuffer::instance().offer_killer(
        tomb.map, talks.killer, talks.kill_hour, talks.kill_minute))
{
    // No active buffer — send directly (killer data arrived after buffer window)
    TelemetryClient::instance().on_mvp_killer(
        tomb.map, tomb.x, tomb.y, talks.killer,
        talks.kill_hour, talks.kill_minute);
}
```

- [ ] **Step 3: Build and verify**

Run: `cmake --build build --config Debug`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/private/packets/receive/GameMessage.cpp
git commit -m "feat: offer killer data to kill buffer before direct send"
```

---

## Task 6: Final Build + Manual Testing

**Files:** None (testing only)

- [ ] **Step 1: Clean build**

```bash
cmake -S . -B build -G "Visual Studio 17 2022" -DCMAKE_BUILD_TYPE=Debug
cmake --build build --config Debug
```

Expected: Build succeeds with no errors and no new warnings.

- [ ] **Step 2: Manual test plan**

Test by running the sniffer against the game client:

1. **Kill buffer works:** Kill an MVP, observe console output:
   - `[KillBuffer] Started buffer for monster_id=X map=Y (5s window)`
   - `[KillBuffer] Added N loots to buffer` (after ~3s)
   - `[KillBuffer] Added tomb coords (X,Y) to buffer` (if tomb appears within 5s)
   - `[KillBuffer] Flushing buffer: monster_id=X map=Y has_tomb=true has_killer=false loots=N`
   - Verify one POST to `/api/telemetry/mvp-event` instead of separate requests

2. **Late tomb/killer fallback:** Click a tomb after more than 5 seconds:
   - `[KillBuffer] offer_tomb returned false` → direct `on_mvp_tomb()` call
   - Verify POST to `/api/telemetry/mvp-tomb` (old endpoint)

3. **Config reload:** Change MVP list in Supabase `mvps` table:
   - Wait for next heartbeat
   - Observe `[Telemetry] Server reports config stale, reloading...`
   - Verify new MVPs are tracked without restarting sniffer

- [ ] **Step 3: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: adjustments from manual testing"
```
