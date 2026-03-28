# Claudinho — Sniffer Installer & Tray App Design

Packages the RO-PacketSniffer-CPP as "Claudinho", a Windows tray application with an installer, for distribution to non-technical users. Phase 2 of the telemetry integration.

## Terminology

- **Claudinho**: The branded tray app name for the sniffer
- **Npcap**: The Windows packet capture driver required for network sniffing
- **Pairing**: Browser-based authentication linking Claudinho to an Instanceiro account (implemented in Phase 1)

---

## Installer

### Tool

Inno Setup — modern installer framework, supports code signing, custom UI, silent installs.

### Flow

1. **Boas-vindas**: "Instalar Claudinho v1.0"
2. **Npcap check**:
   - Check Windows registry `HKLM\SOFTWARE\Npcap` for presence and version
   - If present and version >= 1.60: skip to step 4
   - If absent or too old: show message "O Npcap e necessario para captura de pacotes"
3. **Npcap install**:
   - Npcap installer is **embedded** in the Claudinho installer (~1MB extra, avoids network dependency)
   - Execute with flags: `/S /winpcap_mode=yes` (silent install, WinPcap compatible mode)
   - WinPcap compatible mode allows packet capture without admin on subsequent runs
   - Wait for Npcap installer to complete before continuing
4. **Directory selection**: Default `C:\Program Files\Claudinho\`
5. **Install files**:
   - `Claudinho.exe` (single static binary, no DLLs)
   - `assets\claudinho_*.ico` (tray icons)
6. **Start Menu shortcut**: Creates shortcut in Start Menu
7. **Finish**: Checkbox "Iniciar Claudinho agora" (checked by default)

### UAC / Permissions

- Installer requests admin elevation (UAC prompt) — needed for Npcap driver installation
- Claudinho.exe itself does NOT require admin to run (WinPcap compatible mode enables this)
- Users see the admin prompt only once (at install time)

### Uninstaller

- Registered in Windows "Add/Remove Programs"
- Removes all files from `Program Files\Claudinho\`
- Removes all data from `%APPDATA%\Claudinho\` (token, config, queue)
- Clean uninstall — no leftovers
- Does NOT uninstall Npcap (other apps may depend on it)

### App Data Location

All runtime data lives in `%APPDATA%\Claudinho\`:

| File | Purpose |
|------|---------|
| `config.json` | API token, cached settings |
| `telemetry_queue.json` | Offline event queue |

This directory is created on first run, not by the installer.

---

## Tray App

### Behavior

Claudinho runs as a tray-only application — no console window, no main window. The only UI is the system tray icon and its context menu.

### Startup Flow

```
App starts
  ├─ Check %APPDATA%\Claudinho\config.json for api_token
  │
  ├─ No token (first run):
  │   ├─ Icon: yellow (pairing)
  │   ├─ Auto-open browser for pairing (POST /pair/initiate → open URL)
  │   ├─ Local HTTP server listens for exchange callback
  │   ├─ On success: save token, icon → green
  │   └─ Toast: "Claudinho conectado ao Instanceiro!"
  │
  ├─ Has token:
  │   ├─ Icon: yellow (connecting)
  │   ├─ GET /api/telemetry/config
  │   │   ├─ 200: load config, start capture
  │   │   └─ 401: clear token, restart pairing flow
  │   ├─ Auto-detect network interface (see below)
  │   ├─ Start packet capture
  │   ├─ Icon: green (capturing)
  │   └─ Start heartbeat timer
  │
  └─ Npcap not found:
      ├─ Icon: red (error)
      └─ Toast: "Npcap nao encontrado. Reinstale o Claudinho."
```

### Tray Icon States

| State | Icon | Tooltip |
|-------|------|---------|
| Disconnected (no token) | `claudinho_gray.ico` | "Claudinho — Desconectado" |
| Pairing / connecting | `claudinho_yellow.ico` | "Claudinho — Conectando..." |
| Capturing | `claudinho_green.ico` | "Claudinho — Capturando" |
| Error | `claudinho_red.ico` | "Claudinho — Erro" |

Icons are `.ico` files with embedded sizes: 16x16, 32x32, 48x48, 256x256. The sphere color changes per state while the purple hood remains constant.

### Context Menu (right-click)

```
┌──────────────────────────────┐
│  Claudinho v1.0.0            │
│  ● Capturando — prontera     │
│──────────────────────────────│
│  Reconectar ao Instanceiro   │
│  Verificar atualizacoes      │
│──────────────────────────────│
│  Sair                        │
└──────────────────────────────┘
```

- **Status line**: Shows current state and map name (from heartbeat). Updates dynamically.
- **Reconectar ao Instanceiro**: Clears saved token and restarts pairing flow. Useful when switching accounts.
- **Verificar atualizacoes**: Manual trigger for update check (see Auto-Update section).
- **Sair**: Graceful shutdown — stops capture, sends final heartbeat, exits.

### Toast Notifications

Windows toast notifications (balloon tips) for important events:

| Event | Message |
|-------|---------|
| Pairing success | "Claudinho conectado ao Instanceiro!" |
| Token revoked / 401 | "Conexao perdida. Clique para reconectar." |
| Update available | "Nova versao disponivel: v1.1.0" |
| Npcap missing | "Npcap nao encontrado. Reinstale o Claudinho." |
| API offline > 5 min | "Servidor indisponivel. Eventos em fila." |

---

## Network Interface Auto-Detection

### Strategy: Dynamic Detection (Option B)

On every startup, Claudinho auto-detects which network interface carries RO traffic. No configuration needed, adapts to Wi-Fi/Ethernet/VPN changes between sessions.

### Algorithm

1. List all available Npcap interfaces via `pcap_findalldevs()`
2. For each interface, open a capture handle with a BPF filter for the RO server IPs (`capture_ips` from telemetry config, fallback to hardcoded `172.65.169.160`)
3. Run `pcap_loop` with a short timeout (3 seconds) on each interface in parallel (one thread per interface)
4. First interface to receive a matching packet wins — close all other handles
5. If no interface receives traffic within 10 seconds: retry every 30 seconds (game might not be running yet)
6. Log selected interface to console/file for debugging

### Fallback

If `config.json` has a `device_id` set, use it directly (skip auto-detect). This preserves backward compatibility for advanced users.

---

## Auto-Update

### Check Mechanism

On startup and every 6 hours, Claudinho calls:

```
GET /api/telemetry/version
```

**Response:**
```json
{
  "latest_version": "1.1.0",
  "download_url": "https://instanceiro.com/downloads/claudinho-1.1.0-setup.exe",
  "changelog": "Correcoes de bugs e melhorias de performance",
  "required": false
}
```

### Flow

1. Compare `latest_version` with compiled-in version string
2. If different:
   - Toast notification: "Nova versao disponivel: v1.1.0"
   - Context menu shows: "Atualizar para v1.1.0" (replaces "Verificar atualizacoes")
3. User clicks update (via toast or menu):
   - Download the installer `.exe` to `%TEMP%`
   - Launch the installer
   - Exit Claudinho (installer handles the rest — overwrites old exe)
4. If `required: true`: show persistent notification, disable capture until updated

### API Route (Instanceiro side)

Create `GET /api/telemetry/version` — returns the latest version info. Version data stored in an environment variable or simple DB table. No authentication needed (public endpoint).

---

## Build Configuration

### Release Build

Switch from Debug to Release for distribution:

| Setting | Debug (current) | Release (distribution) |
|---------|-----------------|----------------------|
| Optimization | `/Od` (none) | `/O2` (max speed) |
| Runtime | `/MDd` (dynamic debug) | `/MT` (static release) |
| DLLs | libcurl-d.dll, zlibd1.dll | None (all static) |
| Symbols | `.pdb` (28MB) | None |
| Exe size | ~3.5MB + 1.6MB DLLs | ~2-3MB single file |

### Static Linking

Change vcpkg triplet from `x64-windows` (dynamic) to `x64-windows-static` (static):

```cmake
# In CMakeLists.txt or CMakePresets.json:
set(VCPKG_TARGET_TRIPLET "x64-windows-static")

# MSVC static runtime:
set_target_properties(ROSniffer PROPERTIES
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>"
)
```

This eliminates all DLL dependencies. The output is a single `Claudinho.exe` that only needs Npcap runtime (which is a system driver, not a DLL we bundle).

### Executable Rename

Rename output from `ROSniffer.exe` to `Claudinho.exe` in CMakeLists.txt:

```cmake
set_target_properties(ROSniffer PROPERTIES OUTPUT_NAME "Claudinho")
```

### Windows Subsystem

Change from console app to Windows app (no console window):

```cmake
set_target_properties(ROSniffer PROPERTIES WIN32_EXECUTABLE TRUE)
```

Entry point changes from `main()` to `WinMain()`. The tray app uses the Win32 API for the system tray (Shell_NotifyIcon).

---

## Tray App Implementation

### Win32 System Tray

Uses the Windows Shell_NotifyIcon API:

- `Shell_NotifyIcon(NIM_ADD, ...)` — register tray icon on startup
- `Shell_NotifyIcon(NIM_MODIFY, ...)` — change icon/tooltip on state change
- `Shell_NotifyIcon(NIM_DELETE, ...)` — remove on exit
- `NOTIFYICONDATA.hIcon` — loaded from embedded `.ico` resource
- `WM_APP` custom message for tray click events
- `TrackPopupMenu()` for the context menu

### Icon Resources

Icons embedded in the exe via `.rc` resource file:

```rc
IDI_CLAUDINHO_GRAY    ICON "assets/claudinho_gray.ico"
IDI_CLAUDINHO_YELLOW  ICON "assets/claudinho_yellow.ico"
IDI_CLAUDINHO_GREEN   ICON "assets/claudinho_green.ico"
IDI_CLAUDINHO_RED     ICON "assets/claudinho_red.ico"
```

### Architecture

The tray app replaces the current `main()` console entry point:

```
WinMain()
  ├─ Create hidden window (message pump for tray events)
  ├─ Register tray icon (gray)
  ├─ TelemetryClient::init() (pairing, config, auto-detect)
  ├─ Start capture on background thread
  ├─ Enter message loop (GetMessage/DispatchMessage)
  │   ├─ WM_APP: tray click → show context menu
  │   ├─ WM_COMMAND: menu item selected
  │   └─ WM_TIMER: heartbeat, update check
  └─ On WM_CLOSE/quit: cleanup, remove tray icon, exit
```

The existing sniffer code (Sniffer::start_capture, packet handlers, telemetry) runs on background threads. The main thread runs the Win32 message loop for the tray UI.

### CLI Compatibility

Keep the old `main()` entry point available via a compile flag or separate build target, for debugging and development:

```cmake
option(CLAUDINHO_TRAY "Build as tray app instead of console" OFF)

if(CLAUDINHO_TRAY)
    set_target_properties(ROSniffer PROPERTIES WIN32_EXECUTABLE TRUE)
    target_compile_definitions(ROSniffer PRIVATE CLAUDINHO_TRAY=1)
endif()
```

---

## Instance Map Filter

Already implemented in Phase 1. Claudinho ignores MVP kills in instance maps (pattern: `digit@name`, e.g., `1@abbey`, `2@tower`). No additional work needed.

---

## Installer Contents Summary

```
Claudinho-1.0.0-setup.exe (Inno Setup installer, ~5MB)
  ├─ Claudinho.exe (~2-3MB, statically linked)
  ├─ assets/claudinho_*.ico (4 state icons)
  ├─ npcap-installer.exe (~1MB, embedded)
  └─ Inno Setup scripts (uninstaller, shortcuts, registry)

Installed to: C:\Program Files\Claudinho\
Runtime data: %APPDATA%\Claudinho\
```

---

## Security

- Token stored in `%APPDATA%\Claudinho\config.json` (user-scoped, not world-readable)
- Npcap installed in WinPcap compatible mode (no admin needed for capture)
- Auto-update downloads only from `instanceiro.com` domain
- Installer can be code-signed in the future (prevents Windows SmartScreen warnings)

## Scope Exclusions

- No auto-start with Windows (user opens manually)
- No game process detection (user manages when to run)
- No custom installer UI theme (Inno Setup default is fine)
- No macOS/Linux support (RO LATAM is Windows-only)
