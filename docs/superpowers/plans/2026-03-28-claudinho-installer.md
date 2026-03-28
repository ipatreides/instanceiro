# Claudinho Installer & Tray App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ROSniffer.exe into Claudinho.exe — a Windows tray app with installer, auto-detect network, pairing flow, and auto-update.

**Architecture:** Replace the console `main()` with a Win32 `WinMain()` tray app (behind a compile flag). The sniffer capture runs on background threads while the main thread runs the Win32 message loop. Inno Setup packages everything with embedded Npcap installer.

**Tech Stack:** C++20, Win32 API (Shell_NotifyIcon, Winsock2), Inno Setup, vcpkg static linking

**Spec:** `docs/superpowers/specs/2026-03-28-claudinho-installer-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/CMakeLists.txt` | Modify | Add CLAUDINHO_TRAY option, static triplet, output rename, version define, .rc resource |
| `src/resources/resource.h` | Create | Icon resource IDs |
| `src/resources/claudinho.rc` | Create | Icon resource declarations |
| `assets/claudinho_*.ico` | Existing | 4 tray state icons (already generated) |
| `src/private/tray/TrayApp.h` | Create | Tray app class: window, icon, menu, message loop |
| `src/private/tray/TrayApp.cpp` | Create | Implementation |
| `src/private/tray/PairingServer.h` | Create | Local Winsock2 HTTP server for pairing callback |
| `src/private/tray/PairingServer.cpp` | Create | Implementation |
| `src/private/tray/AutoDetect.h` | Create | Network interface auto-detection |
| `src/private/tray/AutoDetect.cpp` | Create | Implementation |
| `src/private/tray/UpdateChecker.h` | Create | Auto-update version check + download |
| `src/private/tray/UpdateChecker.cpp` | Create | Implementation |
| `src/private/tray/AppConfig.h` | Create | %APPDATA% config path management |
| `src/private/tray/AppConfig.cpp` | Create | Implementation |
| `src/tray_main.cpp` | Create | WinMain entry point |
| `src/main.cpp` | Modify | Keep as CLI entry (unchanged, just coexists) |
| `installer/claudinho.iss` | Create | Inno Setup script |
| `src/app/api/telemetry/version/route.ts` | Create | Version check endpoint (Instanceiro side) |

---

### Task 1: Build configuration — static linking, rename, version

**Files:**
- Modify: `src/CMakeLists.txt`

- [ ] **Step 1: Read current CMakeLists.txt and modify**

Add the CLAUDINHO_TRAY option, static vcpkg triplet, output name, and version define. The key changes:

```cmake
# At the top of src/CMakeLists.txt, after existing content:

# Claudinho version
set(CLAUDINHO_VERSION "1.0.0")

# Option to build as tray app
option(CLAUDINHO_TRAY "Build as tray app instead of console" OFF)
```

In the target properties section, add:

```cmake
# Version define for all builds
target_compile_definitions(ROSniffer PRIVATE CLAUDINHO_VERSION="${CLAUDINHO_VERSION}")

# Tray app configuration
if(CLAUDINHO_TRAY)
    set_target_properties(ROSniffer PROPERTIES
        WIN32_EXECUTABLE TRUE
        OUTPUT_NAME "Claudinho"
    )
    target_compile_definitions(ROSniffer PRIVATE CLAUDINHO_TRAY=1)
    # Add resource file for icons
    target_sources(ROSniffer PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/resources/claudinho.rc")
else()
    set_target_properties(ROSniffer PROPERTIES OUTPUT_NAME "ROSniffer")
endif()
```

For static linking, add to the root `CMakeLists.txt` before the `project()` call:

```cmake
# Static linking for distribution builds
if(CLAUDINHO_STATIC)
    set(VCPKG_TARGET_TRIPLET "x64-windows-static" CACHE STRING "" FORCE)
endif()
```

- [ ] **Step 2: Build in default mode to verify nothing breaks**

Run: `cmake -S . -B build -G "Visual Studio 17 2022" && cmake --build build --config Debug`
Expected: Compiles as before, output is `ROSniffer.exe`

- [ ] **Step 3: Commit**

```bash
git add src/CMakeLists.txt CMakeLists.txt
git commit -m "feat: add CLAUDINHO_TRAY build option, version define, and static linking support"
```

---

### Task 2: Resource files — icon embedding

**Files:**
- Create: `src/resources/resource.h`
- Create: `src/resources/claudinho.rc`

- [ ] **Step 1: Create resource.h**

```cpp
// src/resources/resource.h
#pragma once

#define IDI_CLAUDINHO_GRAY    101
#define IDI_CLAUDINHO_YELLOW  102
#define IDI_CLAUDINHO_GREEN   103
#define IDI_CLAUDINHO_RED     104

// Menu command IDs
#define IDM_STATUS            2001
#define IDM_RECONNECT         2002
#define IDM_UPDATE            2003
#define IDM_EXIT              2004

// Custom messages
#define WM_TRAYICON           (WM_USER + 1)
#define WM_APP_PAIRING_DONE   (WM_USER + 2)
#define WM_APP_CONFIG_LOADED  (WM_USER + 3)
```

- [ ] **Step 2: Create claudinho.rc**

```rc
// src/resources/claudinho.rc
#include "resource.h"

IDI_CLAUDINHO_GRAY    ICON "../../assets/claudinho_gray.ico"
IDI_CLAUDINHO_YELLOW  ICON "../../assets/claudinho_yellow.ico"
IDI_CLAUDINHO_GREEN   ICON "../../assets/claudinho_green.ico"
IDI_CLAUDINHO_RED     ICON "../../assets/claudinho_red.ico"
```

- [ ] **Step 3: Build with tray option to verify resources compile**

Run: `cmake -S . -B build_tray -G "Visual Studio 17 2022" -DCLAUDINHO_TRAY=ON && cmake --build build_tray --config Debug`
Expected: Compiles (will fail at link since WinMain doesn't exist yet, but resources compile)

- [ ] **Step 4: Commit**

```bash
git add src/resources/
git commit -m "feat: add Win32 icon resources for Claudinho tray states"
```

---

### Task 3: AppConfig — %APPDATA% path management

**Files:**
- Create: `src/private/tray/AppConfig.h`
- Create: `src/private/tray/AppConfig.cpp`

- [ ] **Step 1: Create AppConfig.h**

```cpp
// src/private/tray/AppConfig.h
#pragma once

#include <string>
#include <nlohmann/json.hpp>

// Manages config at %APPDATA%\Claudinho\config.json
// Falls back to ./config.json for CLI mode
class AppConfig
{
public:
    static std::string get_config_dir();
    static std::string get_config_path();
    static std::string get_queue_path();

    static nlohmann::json load();
    static void save(const nlohmann::json& config);

    // Convenience: get/set API token
    static std::string get_token();
    static void set_token(const std::string& token);
    static void clear_token();

    static std::string get_api_url();
};
```

- [ ] **Step 2: Create AppConfig.cpp**

```cpp
// src/private/tray/AppConfig.cpp
#include "tray/AppConfig.h"

#include <filesystem>
#include <fstream>
#include <iostream>

#ifdef CLAUDINHO_TRAY
#include <windows.h>
#include <shlobj.h>
#endif

std::string AppConfig::get_config_dir()
{
#ifdef CLAUDINHO_TRAY
    char path[MAX_PATH];
    if (SHGetFolderPathA(nullptr, CSIDL_APPDATA, nullptr, 0, path) == S_OK)
    {
        std::string dir = std::string(path) + "\\Claudinho";
        std::filesystem::create_directories(dir);
        return dir;
    }
#endif
    return ".";
}

std::string AppConfig::get_config_path()
{
    return get_config_dir() + "\\config.json";
}

std::string AppConfig::get_queue_path()
{
    return get_config_dir() + "\\telemetry_queue.json";
}

nlohmann::json AppConfig::load()
{
    std::ifstream file(get_config_path());
    if (!file.is_open()) return {};
    try
    {
        nlohmann::json config;
        file >> config;
        return config;
    }
    catch (...)
    {
        return {};
    }
}

void AppConfig::save(const nlohmann::json& config)
{
    auto dir = get_config_dir();
    std::filesystem::create_directories(dir);
    std::ofstream file(get_config_path(), std::ios::trunc);
    if (file.is_open())
    {
        file << config.dump(2);
    }
}

std::string AppConfig::get_token()
{
    auto config = load();
    if (config.contains("api") && config["api"].contains("key"))
        return config["api"]["key"].get<std::string>();
    return "";
}

void AppConfig::set_token(const std::string& token)
{
    auto config = load();
    if (!config.contains("api")) config["api"] = {};
    config["api"]["key"] = token;
    // Set default API URL if not present
    if (!config["api"].contains("url") || config["api"]["url"].get<std::string>().empty())
        config["api"]["url"] = "https://instanceiro.com/api";
    save(config);
}

void AppConfig::clear_token()
{
    auto config = load();
    if (config.contains("api"))
    {
        config["api"].erase("key");
    }
    save(config);
}

std::string AppConfig::get_api_url()
{
    auto config = load();
    if (config.contains("api") && config["api"].contains("url"))
        return config["api"]["url"].get<std::string>();
    return "https://instanceiro.com/api";
}
```

- [ ] **Step 3: Build and verify**

Run: `cmake --build build --config Debug`

- [ ] **Step 4: Commit**

```bash
git add src/private/tray/AppConfig.h src/private/tray/AppConfig.cpp
git commit -m "feat: add AppConfig for %APPDATA% config path management"
```

---

### Task 4: PairingServer — local HTTP callback

**Files:**
- Create: `src/private/tray/PairingServer.h`
- Create: `src/private/tray/PairingServer.cpp`

- [ ] **Step 1: Create PairingServer.h**

```cpp
// src/private/tray/PairingServer.h
#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <thread>

#ifdef _WIN32
#include <winsock2.h>
#endif

// Minimal one-shot HTTP server for pairing OAuth callback.
// Listens on localhost:<random_port>, accepts ONE GET request,
// extracts exchange_code from query string, responds with HTML, shuts down.
class PairingServer
{
public:
    using Callback = std::function<void(const std::string& exchange_code)>;

    // Returns the port it bound to, or 0 on failure.
    uint16_t start(Callback on_code_received);

    // Force stop if user cancels pairing
    void stop();

    ~PairingServer();

private:
    SOCKET m_listen_sock = INVALID_SOCKET;
    std::thread m_thread;

    static std::string parse_exchange_code(const char* request);
};
```

- [ ] **Step 2: Create PairingServer.cpp**

```cpp
// src/private/tray/PairingServer.cpp
#include "tray/PairingServer.h"

#include <iostream>
#include <cstring>
#include <ws2tcpip.h>

uint16_t PairingServer::start(Callback on_code_received)
{
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 0;

    m_listen_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (m_listen_sock == INVALID_SOCKET) { WSACleanup(); return 0; }

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = 0; // OS picks free port

    if (bind(m_listen_sock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR)
    {
        closesocket(m_listen_sock);
        m_listen_sock = INVALID_SOCKET;
        WSACleanup();
        return 0;
    }

    int len = sizeof(addr);
    getsockname(m_listen_sock, (sockaddr*)&addr, &len);
    uint16_t port = ntohs(addr.sin_port);

    if (listen(m_listen_sock, 1) == SOCKET_ERROR)
    {
        closesocket(m_listen_sock);
        m_listen_sock = INVALID_SOCKET;
        WSACleanup();
        return 0;
    }

    m_thread = std::thread([this, cb = std::move(on_code_received)]() {
        SOCKET client = accept(m_listen_sock, nullptr, nullptr);
        if (client == INVALID_SOCKET) return;

        char buf[2048]{};
        int n = recv(client, buf, sizeof(buf) - 1, 0);
        if (n > 0)
        {
            buf[n] = '\0';
            std::string code = parse_exchange_code(buf);

            const char* body =
                "<html><body style=\"font-family:sans-serif;text-align:center;padding:40px\">"
                "<h2>Pronto!</h2><p>Voce pode fechar esta janela.</p></body></html>";

            std::string response =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: text/html; charset=utf-8\r\n"
                "Connection: close\r\n"
                "Content-Length: " + std::to_string(std::strlen(body)) + "\r\n"
                "\r\n" + body;

            send(client, response.c_str(), (int)response.size(), 0);
            shutdown(client, SD_SEND);

            char drain[512];
            while (recv(client, drain, sizeof(drain), 0) > 0) {}

            closesocket(client);

            if (!code.empty())
            {
                cb(code);
            }
        }
        else
        {
            closesocket(client);
        }

        if (m_listen_sock != INVALID_SOCKET)
        {
            closesocket(m_listen_sock);
            m_listen_sock = INVALID_SOCKET;
        }
    });

    return port;
}

void PairingServer::stop()
{
    if (m_listen_sock != INVALID_SOCKET)
    {
        closesocket(m_listen_sock);
        m_listen_sock = INVALID_SOCKET;
    }
    if (m_thread.joinable()) m_thread.join();
}

PairingServer::~PairingServer()
{
    stop();
}

std::string PairingServer::parse_exchange_code(const char* request)
{
    std::string req(request);
    const std::string key = "exchange_code=";
    auto pos = req.find(key);
    if (pos == std::string::npos) return {};
    pos += key.size();
    auto end = req.find_first_of("& \r\n", pos);
    return req.substr(pos, end - pos);
}
```

- [ ] **Step 3: Build and verify**

Run: `cmake --build build --config Debug`

- [ ] **Step 4: Commit**

```bash
git add src/private/tray/PairingServer.h src/private/tray/PairingServer.cpp
git commit -m "feat: add PairingServer for local OAuth callback"
```

---

### Task 5: AutoDetect — network interface detection

**Files:**
- Create: `src/private/tray/AutoDetect.h`
- Create: `src/private/tray/AutoDetect.cpp`

- [ ] **Step 1: Create AutoDetect.h**

```cpp
// src/private/tray/AutoDetect.h
#pragma once

#include <string>
#include <vector>
#include <pcap/pcap.h>

// Auto-detects which network interface carries RO traffic
// by probing all interfaces in parallel.
class AutoDetect
{
public:
    // Returns the device name (e.g., \Device\NPF_{GUID}) that has RO traffic,
    // or empty string if none found within timeout_seconds.
    static std::string find_interface(const std::vector<std::string>& server_ips,
                                      int timeout_seconds = 10);
};
```

- [ ] **Step 2: Create AutoDetect.cpp**

```cpp
// src/private/tray/AutoDetect.cpp
#include "tray/AutoDetect.h"

#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

struct ProbeContext
{
    std::atomic<bool>* found;
    std::string* result;
    std::mutex* result_mtx;
};

static void probe_callback(u_char* user, const pcap_pkthdr*, const u_char*)
{
    auto* ctx = reinterpret_cast<ProbeContext*>(user);
    ctx->found->store(true);
}

std::string AutoDetect::find_interface(const std::vector<std::string>& server_ips,
                                        int timeout_seconds)
{
    pcap_if_t* alldevs = nullptr;
    char errbuf[PCAP_ERRBUF_SIZE];

    if (pcap_findalldevs(&alldevs, errbuf) == -1 || !alldevs)
    {
        std::cerr << "[AutoDetect] pcap_findalldevs failed: " << errbuf << std::endl;
        return "";
    }

    // Build BPF filter
    std::string filter = "(";
    for (size_t i = 0; i < server_ips.size(); ++i)
    {
        if (i > 0) filter += " or ";
        filter += "src host " + server_ips[i];
    }
    filter += ") and not (port 80 or port 443)";

    std::atomic<bool> found{false};
    std::string result;
    std::mutex result_mtx;
    std::vector<std::thread> threads;
    std::vector<pcap_t*> handles;
    std::mutex handles_mtx;

    // Probe each interface
    for (pcap_if_t* dev = alldevs; dev != nullptr; dev = dev->next)
    {
        std::string dev_name = dev->name;
        threads.emplace_back([dev_name, &filter, &found, &result, &result_mtx,
                              &handles, &handles_mtx]() {
            char err[PCAP_ERRBUF_SIZE];
            pcap_t* h = pcap_open_live(dev_name.c_str(), 256, 0, 250, err);
            if (!h) return;

            {
                std::lock_guard<std::mutex> lock(handles_mtx);
                handles.push_back(h);
            }

            bpf_program fp;
            if (pcap_compile(h, &fp, filter.c_str(), 1, PCAP_NETMASK_UNKNOWN) == 0)
            {
                pcap_setfilter(h, &fp);
                pcap_freecode(&fp);
            }

            ProbeContext ctx{&found, &result, &result_mtx};
            // pcap_loop returns when breakloop is called or packet received
            int ret = pcap_loop(h, 1, probe_callback, reinterpret_cast<u_char*>(&ctx));

            if (ret >= 0 && !found.exchange(true))
            {
                // This interface won the race
            }

            if (found.load())
            {
                std::lock_guard<std::mutex> lock(result_mtx);
                if (result.empty())
                    result = dev_name;
            }
        });
    }

    // Wait for timeout or detection
    auto start = std::chrono::steady_clock::now();
    while (!found.load() &&
           std::chrono::steady_clock::now() - start < std::chrono::seconds(timeout_seconds))
    {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    // Break all probe loops
    {
        std::lock_guard<std::mutex> lock(handles_mtx);
        for (auto* h : handles)
        {
            pcap_breakloop(h);
        }
    }

    // Join all threads
    for (auto& t : threads)
    {
        if (t.joinable()) t.join();
    }

    // Close handles
    {
        std::lock_guard<std::mutex> lock(handles_mtx);
        for (auto* h : handles)
        {
            pcap_close(h);
        }
    }

    pcap_freealldevs(alldevs);

    if (!result.empty())
    {
        std::cout << "[AutoDetect] Found interface: " << result << std::endl;
    }

    return result;
}
```

- [ ] **Step 3: Build and verify**

Run: `cmake --build build --config Debug`

- [ ] **Step 4: Commit**

```bash
git add src/private/tray/AutoDetect.h src/private/tray/AutoDetect.cpp
git commit -m "feat: add AutoDetect for network interface auto-detection"
```

---

### Task 6: UpdateChecker — auto-update via Instanceiro

**Files:**
- Create: `src/private/tray/UpdateChecker.h`
- Create: `src/private/tray/UpdateChecker.cpp`

- [ ] **Step 1: Create UpdateChecker.h**

```cpp
// src/private/tray/UpdateChecker.h
#pragma once

#include <string>
#include <nlohmann/json.hpp>

struct UpdateInfo
{
    std::string latest_version;
    std::string download_url;
    std::string changelog;
    bool required = false;
    bool available = false;
};

class UpdateChecker
{
public:
    // Check for update against the API. Returns info about available update.
    static UpdateInfo check(const std::string& api_url, const std::string& current_version);

    // Download installer to %TEMP% and launch it. Returns true if launched.
    static bool download_and_launch(const std::string& download_url);
};
```

- [ ] **Step 2: Create UpdateChecker.cpp**

```cpp
// src/private/tray/UpdateChecker.cpp
#include "tray/UpdateChecker.h"

#include <curl/curl.h>
#include <fstream>
#include <iostream>
#include <filesystem>

#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#endif

static size_t write_callback(char* ptr, size_t size, size_t nmemb, void* userdata)
{
    auto& response = *static_cast<std::string*>(userdata);
    response.append(ptr, size * nmemb);
    return size * nmemb;
}

static size_t file_write_callback(char* ptr, size_t size, size_t nmemb, void* userdata)
{
    auto* file = static_cast<std::ofstream*>(userdata);
    file->write(ptr, size * nmemb);
    return size * nmemb;
}

UpdateInfo UpdateChecker::check(const std::string& api_url, const std::string& current_version)
{
    UpdateInfo info;

    CURL* curl = curl_easy_init();
    if (!curl) return info;

    std::string url = api_url + "/telemetry/version";
    std::string response;

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);

    CURLcode res = curl_easy_perform(curl);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) return info;

    try
    {
        auto json = nlohmann::json::parse(response);
        info.latest_version = json.value("latest_version", "");
        info.download_url = json.value("download_url", "");
        info.changelog = json.value("changelog", "");
        info.required = json.value("required", false);
        info.available = !info.latest_version.empty() && info.latest_version != current_version;
    }
    catch (...) {}

    return info;
}

bool UpdateChecker::download_and_launch(const std::string& download_url)
{
#ifdef _WIN32
    // Download to %TEMP%
    char temp_path[MAX_PATH];
    GetTempPathA(MAX_PATH, temp_path);
    std::string dest = std::string(temp_path) + "claudinho-update.exe";

    CURL* curl = curl_easy_init();
    if (!curl) return false;

    std::ofstream file(dest, std::ios::binary);
    if (!file.is_open()) { curl_easy_cleanup(curl); return false; }

    curl_easy_setopt(curl, CURLOPT_URL, download_url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, file_write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &file);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 120L);

    CURLcode res = curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    file.close();

    if (res != CURLE_OK) return false;

    // Launch installer
    ShellExecuteA(nullptr, "open", dest.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    return true;
#else
    return false;
#endif
}
```

- [ ] **Step 3: Build and verify**

Run: `cmake --build build --config Debug`

- [ ] **Step 4: Commit**

```bash
git add src/private/tray/UpdateChecker.h src/private/tray/UpdateChecker.cpp
git commit -m "feat: add UpdateChecker for auto-update via Instanceiro"
```

---

### Task 7: TrayApp — system tray UI

**Files:**
- Create: `src/private/tray/TrayApp.h`
- Create: `src/private/tray/TrayApp.cpp`

- [ ] **Step 1: Create TrayApp.h**

```cpp
// src/private/tray/TrayApp.h
#pragma once

#ifdef CLAUDINHO_TRAY

#include <windows.h>
#include <shellapi.h>
#include <string>

enum class TrayState
{
    Disconnected,  // gray
    Connecting,    // yellow
    Capturing,     // green
    Error          // red
};

class TrayApp
{
public:
    static TrayApp& instance();

    // Initialize and run. Blocks until exit.
    int run(HINSTANCE hInstance);

    // Called from background threads to update state
    void set_state(TrayState state, const std::string& status_text = "");
    void show_toast(const std::wstring& title, const std::wstring& text);

    // Get window handle (for PostMessage from background threads)
    HWND hwnd() const { return m_hwnd; }
    HINSTANCE hinstance() const { return m_hInstance; }

private:
    TrayApp() = default;

    HINSTANCE m_hInstance = nullptr;
    HWND m_hwnd = nullptr;
    HMENU m_menu = nullptr;
    NOTIFYICONDATAW m_nid = {};
    TrayState m_state = TrayState::Disconnected;
    std::wstring m_status_text = L"Desconectado";
    std::wstring m_update_label;

    // Win32 callbacks
    static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);

    void create_menu();
    void update_menu();
    void show_context_menu();
    void update_tray_icon();
    void remove_tray_icon();
    int get_icon_resource_id() const;

    // Actions
    void on_reconnect();
    void on_check_update();
    void on_exit();

    // Startup
    void start_background();
};

#endif // CLAUDINHO_TRAY
```

- [ ] **Step 2: Create TrayApp.cpp**

This is the largest file. It implements the Win32 message loop, tray icon management, context menu, and orchestrates the startup flow (pairing → config → auto-detect → capture).

Key implementation points:
- `run()`: Creates hidden HWND_MESSAGE window, registers tray icon, enters message loop
- `WndProc`: Handles WM_TRAYICON (right-click → menu), WM_COMMAND (menu items), WM_TIMER (heartbeat/update), WM_APP_PAIRING_DONE, TaskbarCreated
- `start_background()`: Launches a thread that runs the startup flow (check token → pair or config → auto-detect → start capture)
- `set_state()`: Thread-safe state update, calls `PostMessage` to trigger icon update on main thread
- `show_toast()`: Shows balloon notification via Shell_NotifyIcon
- Single instance check via `CreateMutexW(L"Global\\ClaudinhoMutex")`

The full implementation is ~300 lines. The engineer should implement it following the spec's architecture diagram and the patterns from the spike (Win32 tray skeleton, pcap_breakloop for shutdown, TaskbarCreated recovery).

- [ ] **Step 3: Build with CLAUDINHO_TRAY=ON**

Run: `cmake -S . -B build_tray -G "Visual Studio 17 2022" -DCLAUDINHO_TRAY=ON && cmake --build build_tray --config Debug`

- [ ] **Step 4: Commit**

```bash
git add src/private/tray/TrayApp.h src/private/tray/TrayApp.cpp
git commit -m "feat: add TrayApp with Win32 system tray, context menu, and toast notifications"
```

---

### Task 8: tray_main.cpp — WinMain entry point

**Files:**
- Create: `src/tray_main.cpp`
- Modify: `src/CMakeLists.txt`

- [ ] **Step 1: Create tray_main.cpp**

```cpp
// src/tray_main.cpp
#ifdef CLAUDINHO_TRAY

#include <windows.h>
#include "tray/TrayApp.h"

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, LPWSTR, int)
{
    return TrayApp::instance().run(hInstance);
}

#endif
```

- [ ] **Step 2: Update CMakeLists.txt to include tray_main.cpp conditionally**

Add `src/tray_main.cpp` to the source glob or explicitly. The GLOB_RECURSE already picks it up since it's in `src/`.

When `CLAUDINHO_TRAY=ON`, the `WIN32_EXECUTABLE TRUE` property makes MSVC use `wWinMain` as entry point instead of `main`. Both `main.cpp` and `tray_main.cpp` compile, but only the appropriate entry point is used by the linker.

To avoid linker conflicts, wrap the contents of `main.cpp` in `#ifndef CLAUDINHO_TRAY`:

```cpp
// At the very top of src/main.cpp:
#ifndef CLAUDINHO_TRAY

// ... entire existing main.cpp content ...

#endif // CLAUDINHO_TRAY
```

- [ ] **Step 3: Build both targets**

```bash
# CLI mode (default)
cmake -S . -B build -G "Visual Studio 17 2022" && cmake --build build --config Debug
# Tray mode
cmake -S . -B build_tray -G "Visual Studio 17 2022" -DCLAUDINHO_TRAY=ON && cmake --build build_tray --config Debug
```

Expected: Both compile successfully. CLI produces `ROSniffer.exe`, tray produces `Claudinho.exe`.

- [ ] **Step 4: Test tray app**

Run `build_tray/src/Debug/Claudinho.exe`. Expected: Claudinho icon appears in system tray (gray). Right-click shows context menu. "Sair" exits the app.

- [ ] **Step 5: Commit**

```bash
git add src/tray_main.cpp src/main.cpp src/CMakeLists.txt
git commit -m "feat: add WinMain entry point, both CLI and tray targets build"
```

---

### Task 9: Wire up startup flow in TrayApp

**Files:**
- Modify: `src/private/tray/TrayApp.cpp`
- Modify: `src/private/telemetry/TelemetryClient.cpp` (use AppConfig paths)

- [ ] **Step 1: Implement start_background() in TrayApp**

The background thread runs the full startup:

1. Check `AppConfig::get_token()` for saved token
2. If no token: start PairingServer, POST `/pair/initiate`, open browser, wait for callback
3. On callback: POST `/pair/exchange` with exchange code, save token via `AppConfig::set_token()`
4. With token: call `TelemetryClient::instance().init()` (fetches config)
5. Auto-detect interface: `AutoDetect::find_interface(server_ips)` with IPs from config
6. If interface found: start `Sniffer::get()->start_capture()` on another thread
7. Update tray state throughout

- [ ] **Step 2: Update TelemetryClient to use AppConfig**

Modify `TelemetryClient::load_token()` to use `AppConfig::get_config_path()` instead of hardcoded `"config.json"`.

Modify `TelemetryQueue` to use `AppConfig::get_queue_path()` instead of hardcoded `"telemetry_queue.json"`.

- [ ] **Step 3: Test full flow**

Run `Claudinho.exe`. Expected:
1. Icon yellow → browser opens pairing page
2. Confirm in browser → icon green
3. Right-click → status shows "Capturando"

- [ ] **Step 4: Commit**

```bash
git add src/private/tray/ src/private/telemetry/
git commit -m "feat: wire up full startup flow — pairing, config, auto-detect, capture"
```

---

### Task 10: Modify Sniffer for auto-detect and graceful shutdown

**Files:**
- Modify: `src/private/Sniffer.cpp`
- Modify: `src/public/Sniffer.h`

- [ ] **Step 1: Reduce pcap timeout to 250ms**

In `Sniffer::start_capture()`, change:
```cpp
handle = pcap_open_live(capture_device->name, 65536, 1, 1000, err_buf);
```
to:
```cpp
int timeout_ms = 250;  // Responsive shutdown (was 1000)
handle = pcap_open_live(capture_device->name, 65536, 1, timeout_ms, err_buf);
```

- [ ] **Step 2: Add stop_capture() method**

Add to Sniffer class:
```cpp
void stop_capture()
{
    if (handle && bCaptureStarted)
    {
        pcap_breakloop(handle);
    }
}
```

- [ ] **Step 3: Add start_capture overload that takes device name directly**

For auto-detect, we already know the device name. Add:
```cpp
void start_capture_on(const std::string& device_name, const std::vector<std::string>& ips, bool save = false);
```

This bypasses `get_capture_device()` and `get_capture_ips()` (which read config.json).

- [ ] **Step 4: Build and verify**

Run: `cmake --build build --config Debug`

- [ ] **Step 5: Commit**

```bash
git add src/private/Sniffer.cpp src/public/Sniffer.h
git commit -m "feat: add stop_capture, auto-detect overload, and reduce pcap timeout"
```

---

### Task 11: Version check API route (Instanceiro)

**Files:**
- Create: `src/app/api/telemetry/version/route.ts` (in instance-tracker repo)

- [ ] **Step 1: Create the version endpoint**

```typescript
// src/app/api/telemetry/version/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    latest_version: process.env.CLAUDINHO_VERSION ?? '1.0.0',
    download_url: process.env.CLAUDINHO_DOWNLOAD_URL ?? '',
    changelog: process.env.CLAUDINHO_CHANGELOG ?? '',
    required: false,
  })
}
```

Version info comes from environment variables, updated when a new version is released.

- [ ] **Step 2: Commit**

```bash
cd D:/rag/instance-tracker
git add src/app/api/telemetry/version/route.ts
git commit -m "feat: add GET /api/telemetry/version for Claudinho auto-update"
```

---

### Task 12: Inno Setup installer script

**Files:**
- Create: `installer/claudinho.iss`

- [ ] **Step 1: Create the Inno Setup script**

```iss
; installer/claudinho.iss
; Claudinho Installer — Inno Setup Script

#define MyAppName "Claudinho"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Instanceiro"
#define MyAppExeName "Claudinho.exe"

[Setup]
AppId={{B8F3D2A1-7E4C-4A5B-9D6F-1C2E3A4B5D6E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=Claudinho-{#MyAppVersion}-setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
WizardStyle=modern

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
; Main executable (built with CLAUDINHO_TRAY=ON, Release, static)
Source: "..\build_release\src\Release\Claudinho.exe"; DestDir: "{app}"; Flags: ignoreversion

; Npcap installer (embedded)
Source: "..\installer\npcap-installer.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; Launch after install
Filename: "{app}\{#MyAppExeName}"; Description: "Iniciar Claudinho"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean %APPDATA%\Claudinho on uninstall
Type: filesandordirs; Name: "{userappdata}\Claudinho"

[Code]
function NpcapInstalled(): Boolean;
var
  Version: string;
begin
  Result := RegQueryStringValue(HKLM, 'SOFTWARE\Npcap', 'VersionString', Version);
end;

procedure InstallNpcap();
var
  ResultCode: Integer;
begin
  if not NpcapInstalled() then
  begin
    WizardForm.StatusLabel.Caption := 'Instalando Npcap...';
    Exec(ExpandConstant('{tmp}\npcap-installer.exe'),
         '/S /winpcap_mode=yes /admin_only=no',
         '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    InstallNpcap();
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
end;
```

- [ ] **Step 2: Commit**

```bash
git add installer/claudinho.iss
git commit -m "feat: add Inno Setup installer script with embedded Npcap"
```

---

### Task 13: Release build script

**Files:**
- Create: `build_release.cmd`

- [ ] **Step 1: Create the build script**

```batch
@echo off
echo === Building Claudinho Release ===

REM Generate with static linking and tray mode
cmake -S . -B build_release -G "Visual Studio 17 2022" ^
    -DCMAKE_BUILD_TYPE=Release ^
    -DCLAUDINHO_TRAY=ON ^
    -DCLAUDINHO_STATIC=ON

REM Build Release
cmake --build build_release --config Release

if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)

echo.
echo === Build complete ===
echo Output: build_release\src\Release\Claudinho.exe
echo.

REM Check if Inno Setup is available
where iscc >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo === Building installer ===
    iscc installer\claudinho.iss
    echo Installer: dist\Claudinho-1.0.0-setup.exe
) else (
    echo Inno Setup not found. Install from https://jrsoftware.org/isinfo.php
    echo Then run: iscc installer\claudinho.iss
)
```

- [ ] **Step 2: Test build**

Run: `build_release.cmd`
Expected: `build_release/src/Release/Claudinho.exe` is created (~2-3MB, no DLLs needed)

- [ ] **Step 3: Commit**

```bash
git add build_release.cmd
git commit -m "feat: add release build script for Claudinho distribution"
```

---

### Task 14: End-to-end test

- [ ] **Step 1: Build release**

Run: `build_release.cmd`

- [ ] **Step 2: Run Claudinho.exe**

Double-click `build_release/src/Release/Claudinho.exe`.
Expected:
- Claudinho icon appears in system tray (gray → yellow)
- Browser opens pairing page
- After confirming: icon turns green, toast "Claudinho conectado!"

- [ ] **Step 3: Verify capture**

With RO running, verify that telemetry events are sent (check Instanceiro DB for heartbeat updates).

- [ ] **Step 4: Test context menu**

Right-click tray icon:
- Status shows current state
- "Reconectar" works
- "Verificar atualizacoes" works (no update available)
- "Sair" exits cleanly

- [ ] **Step 5: Build installer (if Inno Setup available)**

Run: `iscc installer/claudinho.iss`
Test the installer on a clean machine or VM.
