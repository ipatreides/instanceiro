# Telemetry Hub Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move telemetry management into a dedicated "Telemetria" tab in the Group Hub with version status, sessions, FAQ, and setup guide.

**Architecture:** New `telemetry-tab.tsx` component replaces the old `telemetry-settings.tsx`. Hub tab switcher in `mvp-tab.tsx` gets a third tab. Backend adds `client_version` to sessions and auto-revoke logic to heartbeat. C++ sniffer sends version in heartbeat.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Supabase, C++

---

### Task 1: Add client_version column to telemetry_sessions

**Files:**
- Create: `supabase/migrations/20260329900000_session_client_version.sql`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE telemetry_sessions ADD COLUMN client_version TEXT;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db query --linked -f supabase/migrations/20260329900000_session_client_version.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260329900000_session_client_version.sql
git commit -m "feat: add client_version column to telemetry_sessions"
```

---

### Task 2: Update heartbeat to accept client_version and auto-revoke stale tokens

**Files:**
- Modify: `src/app/api/telemetry/heartbeat/route.ts`
- Modify: `src/lib/telemetry.ts`

- [ ] **Step 1: Add auto-revoke check to resolveTelemetryContext**

In `src/lib/telemetry.ts`, after the token validation (line ~42-49 where it checks `tokenErr || !tokenRow`), add a check for stale tokens. If `last_used_at` is older than 1 hour, revoke the token and return 401:

```typescript
// Auto-revoke tokens inactive for more than 1 hour
if (tokenRow.last_used_at) {
  const lastUsed = new Date(tokenRow.last_used_at).getTime()
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  if (lastUsed < oneHourAgo) {
    await supabase
      .from('telemetry_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenRow.id)
    return { error: 'Token expired due to inactivity', status: 401 }
  }
}
```

Insert this AFTER the token validation block and BEFORE the `last_used_at` update.

- [ ] **Step 2: Accept client_version in heartbeat and save to session**

In `src/app/api/telemetry/heartbeat/route.ts`, update the body destructuring and the session update:

```typescript
const { current_map, config_version, client_version } = body

// Update session with current map, heartbeat, and client version
await supabase
  .from('telemetry_sessions')
  .update({
    current_map: current_map ?? null,
    last_heartbeat: new Date().toISOString(),
    ...(client_version ? { client_version } : {}),
  })
  .eq('id', ctx.sessionId)
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/telemetry/heartbeat/route.ts src/lib/telemetry.ts
git commit -m "feat: heartbeat accepts client_version, auto-revokes stale tokens"
```

---

### Task 3: C++ sniffer sends client_version in heartbeat

**Files:**
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\private\telemetry\TelemetryClient.cpp`

- [ ] **Step 1: Add client_version to heartbeat body**

In the `heartbeat_loop` method, find where the heartbeat body JSON is constructed (around line 149). Add `client_version`:

```cpp
nlohmann::json body = {
    {"current_map", current_map},
    {"config_version", config_ver},
    {"client_version", CLAUDINHO_VERSION}
};
```

`CLAUDINHO_VERSION` is already defined as a compile-time macro.

- [ ] **Step 2: Build**

Run: `cmake --build build-release --config Release`

- [ ] **Step 3: Commit**

```bash
cd D:\rag\RO-PacketSniffer-CPP
git add src/private/telemetry/TelemetryClient.cpp
git commit -m "feat: send client_version in heartbeat"
```

---

### Task 4: Create telemetry-tab.tsx component

**Files:**
- Create: `src/components/mvp/telemetry-tab.tsx`

This is the main new component with 4 sections: version status, sessions, FAQ, and setup guide.

- [ ] **Step 1: Create the component**

Create `src/components/mvp/telemetry-tab.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TelemetryToken } from "@/lib/types";
import { formatDateTimeBRT } from "@/lib/date-brt";

interface TelemetrySession {
  id: string;
  token_id: string;
  current_map: string | null;
  client_version: string | null;
  last_heartbeat: string;
  started_at: string;
}

interface VersionInfo {
  latest_version: string;
  download_url: string;
  changelog: string;
}

interface TelemetryTabProps {
  userId: string;
}

const FAQ_ITEMS = [
  {
    q: "O que é o Claudinho?",
    a: "Programa que roda junto com o Ragnarok e detecta automaticamente quando MVPs morrem, quem matou, e onde a tumba apareceu. As informações aparecem em tempo real no Instanceiro.",
  },
  {
    q: "É seguro?",
    a: "O Claudinho apenas lê os pacotes de rede do jogo. Não modifica nada, não injeta código, não interage com o client. Funciona como um observador passivo.",
  },
  {
    q: "Preciso deixar aberto?",
    a: "Sim, enquanto estiver jogando. Ele roda na bandeja do sistema (ao lado do relógio) e usa poucos recursos.",
  },
  {
    q: "Funciona com mais de um client?",
    a: "Sim, detecta todos os clients do Ragnarok abertos automaticamente.",
  },
];

const NPCAP_URL = "https://npcap.com/#download";

export function TelemetryTab({ userId }: TelemetryTabProps) {
  const [tokens, setTokens] = useState<TelemetryToken[]>([]);
  const [sessions, setSessions] = useState<TelemetrySession[]>([]);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [{ data: tokenData }, { data: sessionData }] = await Promise.all([
      supabase
        .from("telemetry_tokens")
        .select("id, user_id, name, created_at, last_used_at, revoked_at")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("telemetry_sessions")
        .select("id, token_id, current_map, client_version, last_heartbeat, started_at")
        .eq("user_id", userId),
    ]);

    setTokens(tokenData ?? []);
    setSessions(sessionData ?? []);
  }, [userId]);

  useEffect(() => {
    fetchData();

    // Fetch version info
    fetch("/api/telemetry/version")
      .then((r) => r.json())
      .then((data) => setVersionInfo(data))
      .catch(() => {});
  }, [fetchData]);

  // Poll sessions every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const isOnline = (session: TelemetrySession) => {
    return Date.now() - new Date(session.last_heartbeat).getTime() < 2 * 60 * 1000;
  };

  const handleRevoke = async (tokenId: string) => {
    const supabase = createClient();
    await supabase
      .from("telemetry_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId);
    setRevoking(null);
    fetchData();
  };

  // Find the most recent session for version display
  const latestSession = sessions
    .filter((s) => tokens.some((t) => t.id === s.token_id))
    .sort((a, b) => new Date(b.last_heartbeat).getTime() - new Date(a.last_heartbeat).getTime())[0];

  const clientVersion = latestSession?.client_version ?? null;
  const isClientOnline = latestSession ? isOnline(latestSession) : false;
  const hasTokens = tokens.length > 0;

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
      {/* Version Status */}
      {hasTokens && versionInfo && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-text-secondary mb-2">VERSÃO</h4>
          {isClientOnline && clientVersion ? (
            clientVersion === versionInfo.latest_version ? (
              <p className="text-sm text-status-available-text">
                Claudinho v{clientVersion} ✓
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-status-error-text">
                  Versão desatualizada (v{clientVersion})
                </p>
                <a
                  href={versionInfo.download_url}
                  className="text-xs text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Baixar v{versionInfo.latest_version}
                </a>
              </div>
            )
          ) : clientVersion ? (
            <p className="text-sm text-text-secondary">
              Claudinho offline — última versão: v{clientVersion}
            </p>
          ) : (
            <p className="text-sm text-text-secondary">Claudinho offline</p>
          )}
        </div>
      )}

      {/* Active Sessions */}
      {hasTokens && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-text-secondary mb-2">
            SESSÕES ({tokens.length})
          </h4>
          <div className="space-y-2">
            {tokens.map((t) => {
              const session = sessions.find((s) => s.token_id === t.id);
              const online = session ? isOnline(session) : false;

              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between bg-bg border border-border rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${online ? "bg-status-available animate-pulse" : "bg-border"}`}
                    />
                    <div>
                      <span className="text-sm text-text-primary">
                        {t.name ?? "Sniffer"}
                      </span>
                      {online && session?.current_map && (
                        <span className="text-xs text-text-secondary ml-2">
                          {session.current_map}
                        </span>
                      )}
                      {!online && (
                        <span className="text-xs text-text-secondary ml-2">
                          Último uso: {formatDateTimeBRT(t.last_used_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  {revoking !== t.id ? (
                    <button
                      onClick={() => setRevoking(t.id)}
                      className="text-xs text-status-error-text hover:underline cursor-pointer"
                    >
                      Revogar
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRevoke(t.id)}
                        className="text-xs text-white bg-status-error rounded-md px-2 py-1 cursor-pointer"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setRevoking(null)}
                        className="text-xs text-text-secondary cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FAQ Accordion — always visible */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold text-text-secondary mb-2">DÚVIDAS FREQUENTES</h4>
        <div className="space-y-1">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-card-hover-bg transition-colors"
              >
                <span className="text-sm text-text-primary">{item.q}</span>
                <span className={`text-text-secondary transition-transform ${openFaq === i ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
              {openFaq === i && (
                <div className="px-3 pb-2">
                  <p className="text-xs text-text-secondary leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Setup Guide — only when no tokens */}
      {!hasTokens && versionInfo && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-text-secondary mb-3">COMO CONFIGURAR</h4>
          <ol className="space-y-3 text-sm text-text-primary">
            <li className="flex gap-2">
              <span className="text-primary font-bold">1.</span>
              <span>
                Baixe e instale o{" "}
                <a href={NPCAP_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Npcap
                </a>
                {" "}— necessário para captura de pacotes
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold">2.</span>
              <span>
                Baixe o{" "}
                <a href={versionInfo.download_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Claudinho v{versionInfo.latest_version}
                </a>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold">3.</span>
              <span>Abra o Claudinho — ele aparece na bandeja do sistema (ao lado do relógio)</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold">4.</span>
              <span>Clique em &quot;Parear&quot; no Claudinho e insira o código exibido no app</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/components/mvp/telemetry-tab.tsx
git commit -m "feat: telemetry tab component with version status, sessions, FAQ, setup guide"
```

---

### Task 5: Wire telemetry tab into hub and remove old telemetry settings

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx`
- Delete: `src/components/mvp/telemetry-settings.tsx`

- [ ] **Step 1: Add "Telemetria" tab to hub tab switcher**

In `src/components/mvp/mvp-tab.tsx`, change the `hubTab` state type (line 65):

```tsx
const [hubTab, setHubTab] = useState<"grupo" | "stats" | "telemetria">("grupo");
```

Add the third tab button after the "Stats" button (around line 355):

```tsx
<button
  onClick={() => setHubTab("telemetria")}
  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
    hubTab === "telemetria"
      ? "text-text-primary border-b-2 border-primary"
      : "text-text-secondary hover:text-text-primary"
  }`}
>
  Telemetria
</button>
```

- [ ] **Step 2: Render TelemetryTab and update conditional**

Replace the import of `TelemetrySettings` with `TelemetryTab`:

```tsx
import { TelemetryTab } from "./telemetry-tab";
```

Remove the old `TelemetrySettings` import.

Update the tab content rendering (around line 358) to handle three tabs:

```tsx
{(!group || hubTab === "grupo") ? (
  <MvpGroupHub
    group={group}
    members={members}
    characters={characters}
    selectedCharId={selectedCharId}
    serverId={serverId}
    memberNames={memberNames}
    memberUsernames={memberUsernames}
    onCreateGroup={createGroup}
    onUpdateGroup={updateGroup}
    onInviteCharacter={inviteCharacter}
    onLeaveGroup={leaveGroup}
  />
) : hubTab === "stats" ? (
  <MvpGroupStats groupId={group!.id} />
) : userId ? (
  <TelemetryTab userId={userId} />
) : null}
```

- [ ] **Step 3: Remove old TelemetrySettings section**

Delete the block (around line 375-379):

```tsx
{userId && (
  <div className="mt-4 pt-4 border-t border-border">
    <TelemetrySettings userId={userId} />
  </div>
)}
```

- [ ] **Step 4: Delete old component**

```bash
rm src/components/mvp/telemetry-settings.tsx
```

- [ ] **Step 5: Verify build**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git rm src/components/mvp/telemetry-settings.tsx
git commit -m "feat: wire telemetry tab into hub, remove old telemetry settings"
```

---

### Task 6: Re-upload Claudinho with heartbeat version and deploy

- [ ] **Step 1: Rebuild release**

```bash
cd D:\rag\RO-PacketSniffer-CPP
cmake --build build-release --config Release
```

- [ ] **Step 2: Upload to Supabase Storage**

```bash
cd D:\rag\instance-tracker
source .env.local
curl -s -X POST \
  "https://swgnctajsbiyhqxstrnx.supabase.co/storage/v1/object/claudinho-releases/Claudinho-1.1.0.exe" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/octet-stream" \
  -H "x-upsert: true" \
  --data-binary @"D:\rag\RO-PacketSniffer-CPP\build-release\src\Release\Claudinho.exe"
```

- [ ] **Step 3: Merge and push**

```bash
cd D:\rag\instance-tracker
git checkout main && git pull origin main
git merge worktree-golden-prancing-charm
git push origin main
```
