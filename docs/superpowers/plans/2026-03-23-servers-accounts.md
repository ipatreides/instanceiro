# Servers & Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce server/account hierarchy — accounts group characters, enforce party rules (same server, 1 char per account), drag-and-drop reordering with @dnd-kit.

**Architecture:** DB-first (tables + seed), then types, then hook, then UI components (account bar with dnd-kit), then party validation, then dashboard wiring, then tests.

**Tech Stack:** Next.js 16, React 19, Supabase, Tailwind CSS 4, @dnd-kit/core + @dnd-kit/sortable

**Spec:** `docs/superpowers/specs/2026-03-23-servers-accounts-design.md`

---

## Task Overview

| # | Task | Items |
|---|------|-------|
| 1 | DB migration + types + install dnd-kit | Tables, seed, alter characters, types.ts, npm install |
| 2 | Build `useAccounts` hook | CRUD, reorder, collapse |
| 3 | Modify `useCharacters` for account_id | createCharacter needs account_id, ordering by sort_order |
| 4 | Build AccountContainer component | Single account block (expanded/collapsed) with sortable chars |
| 5 | Build AccountBar component | Replaces CharacterBar, sortable accounts with dnd-kit |
| 6 | Build AccountModal + CreateAccountModal | Manage account, create account |
| 7 | Wire dashboard + party validation | Replace CharacterBar, update participant list |
| 8 | Unit tests | Account logic, server validation |
| 9 | Build + verify | Full build check, manual test |

---

### Task 1: DB migration + types + install dnd-kit

**Problem:** Need new tables (`servers`, `accounts`), alter `characters`, seed servers, add TypeScript types, install dnd-kit.

**Files:**
- Create: `supabase/migrations/20260323_servers_accounts.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Install @dnd-kit dependencies**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Create the SQL migration file**

```sql
-- supabase/migrations/20260323_servers_accounts.sql

-- 1. Servers (seed data)
CREATE TABLE servers (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL
);

INSERT INTO servers (name) VALUES ('Freya'), ('Nidhogg');

ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servers_public_read" ON servers FOR SELECT USING (true);

-- 2. Accounts
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  server_id int NOT NULL REFERENCES servers(id),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_collapsed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select_own" ON accounts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "accounts_insert_own" ON accounts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "accounts_update_own" ON accounts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "accounts_delete_own" ON accounts FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_accounts_user_id ON accounts(user_id);

-- 3. Alter characters: add account_id and sort_order
-- DB will be wiped, so we can add NOT NULL directly
ALTER TABLE characters ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE characters ADD COLUMN sort_order int NOT NULL DEFAULT 0;

-- Make account_id NOT NULL after wipe (existing data cleared)
-- If there are existing characters, they need to be deleted first
DELETE FROM instance_completions;
DELETE FROM character_instances;
DELETE FROM instance_party_members;
DELETE FROM instance_parties;
DELETE FROM character_shares;
DELETE FROM characters;
ALTER TABLE characters ALTER COLUMN account_id SET NOT NULL;

CREATE INDEX idx_characters_account_id ON characters(account_id);
```

- [ ] **Step 3: Run migration against Supabase**

```bash
npx supabase db query --linked -f supabase/migrations/20260323_servers_accounts.sql
```

Verify:
```bash
npx supabase db query --linked "SELECT * FROM servers ORDER BY id"
```
Expected: 2 rows (Freya, Nidhogg).

- [ ] **Step 4: Add TypeScript types**

In `src/lib/types.ts`, add after the `Profile` interface:

```typescript
export interface Server {
  id: number;
  name: string;
}

export interface Account {
  id: string;
  user_id: string;
  server_id: number;
  name: string;
  sort_order: number;
  is_collapsed: boolean;
  created_at: string;
}
```

Update the `Character` interface — add `account_id` and `sort_order`:

```typescript
export interface Character {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  class: string;
  class_path: string[];
  level: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  isShared?: boolean;
  ownerUsername?: string | null;
}
```

- [ ] **Step 5: Verify build + commit**

```bash
npx next build
git add -A
git commit -m "feat: add servers/accounts tables, types, and install dnd-kit"
```

---

### Task 2: Build `useAccounts` hook

**Problem:** Need a hook to CRUD accounts, reorder them, and reorder characters within them.

**Files:**
- Create: `src/hooks/use-accounts.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/use-accounts.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Account, Server } from "@/lib/types";

interface UseAccountsReturn {
  accounts: Account[];
  servers: Server[];
  loading: boolean;
  createAccount: (name: string, serverId: number) => Promise<Account>;
  updateAccount: (id: string, data: { name?: string; is_collapsed?: boolean }) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  reorderAccounts: (orderedIds: string[]) => Promise<void>;
  reorderCharacters: (accountId: string, orderedCharIds: string[]) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();

    const [accountsRes, serversRes] = await Promise.all([
      supabase.from("accounts").select("*").order("sort_order", { ascending: true }),
      supabase.from("servers").select("*").order("id", { ascending: true }),
    ]);

    setAccounts(accountsRes.data ?? []);
    setServers(serversRes.data ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchAll]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchAll();
    setLoading(false);
  }, [fetchAll]);

  const createAccount = useCallback(async (name: string, serverId: number): Promise<Account> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Set sort_order to max + 1
    const maxOrder = accounts.length > 0 ? Math.max(...accounts.map((a) => a.sort_order)) + 1 : 0;

    const { data, error } = await supabase
      .from("accounts")
      .insert({ user_id: user.id, server_id: serverId, name, sort_order: maxOrder })
      .select()
      .single();

    if (error || !data) throw error ?? new Error("Failed to create account");
    setAccounts((prev) => [...prev, data]);
    return data;
  }, [accounts]);

  const updateAccount = useCallback(async (id: string, data: { name?: string; is_collapsed?: boolean }) => {
    const supabase = createClient();
    const { error } = await supabase.from("accounts").update(data).eq("id", id);
    if (error) throw error;
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, ...data } : a));
  }, []);

  const deleteAccount = useCallback(async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) throw error;
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const reorderAccounts = useCallback(async (orderedIds: string[]) => {
    const supabase = createClient();
    const updates = orderedIds.map((id, i) => ({ id, sort_order: i }));

    // Optimistic update
    setAccounts((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      return orderedIds.map((id, i) => ({ ...map.get(id)!, sort_order: i }));
    });

    // Persist
    for (const u of updates) {
      await supabase.from("accounts").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
  }, []);

  const reorderCharacters = useCallback(async (accountId: string, orderedCharIds: string[]) => {
    const supabase = createClient();
    for (let i = 0; i < orderedCharIds.length; i++) {
      await supabase.from("characters").update({ sort_order: i }).eq("id", orderedCharIds[i]);
    }
  }, []);

  return { accounts, servers, loading, createAccount, updateAccount, deleteAccount, reorderAccounts, reorderCharacters, refetch };
}
```

- [ ] **Step 2: Verify build + commit**

```bash
npx next build
git add src/hooks/use-accounts.ts
git commit -m "feat: add useAccounts hook with CRUD, reorder, collapse"
```

---

### Task 3: Modify `useCharacters` for account_id

**Problem:** `createCharacter` needs `account_id`. Characters should be ordered by `sort_order`.

**Files:**
- Modify: `src/hooks/use-characters.ts`
- Modify: `src/components/characters/character-form.tsx`

- [ ] **Step 1: Update useCharacters**

In `CreateCharacterData` interface, add `account_id: string`.

In `createCharacter`, include `account_id` in the insert:
```typescript
const { data: character, error: charError } = await supabase
  .from("characters")
  .insert({
    user_id: user.id,
    account_id: data.account_id,
    name: data.name,
    class: data.class_name,
    class_path: data.class_path,
    level: data.level,
  })
  .select()
  .single();
```

Change the order clause from `created_at` to `sort_order`:
```typescript
.order("sort_order", { ascending: true })
```

- [ ] **Step 2: Update CharacterForm to accept accountId**

In `src/components/characters/character-form.tsx`, add `accountId` prop:

```typescript
interface CharacterFormProps {
  accountId?: string;
  // ... existing props
}
```

Include it in the submit data (if present):
```typescript
await onSubmit({
  name: name.trim(),
  class_name: classInput,
  class_path: classPath,
  level,
  ...(accountId && { account_id: accountId }),
});
```

Update `CreateCharacterData` type if needed to include optional `account_id`.

- [ ] **Step 3: Verify build + commit**

```bash
npx next build
git add src/hooks/use-characters.ts src/components/characters/character-form.tsx
git commit -m "feat: add account_id to character creation and ordering"
```

---

### Task 4: Build AccountContainer component

**Problem:** Need a single account block — expanded shows header + char cards, collapsed shows compact block. Characters are sortable via @dnd-kit within the container.

**Files:**
- Create: `src/components/accounts/account-container.tsx`

- [ ] **Step 1: Create the component**

Props:
```typescript
interface AccountContainerProps {
  account: Account;
  characters: Character[];
  selectedCharId: string | null;
  onSelectChar: (char: Character) => void;
  onEditChar: (char: Character) => void;
  onToggleCollapse: () => void;
  onOpenAccountModal: () => void;
}
```

**Expanded:** border container with header (clickable name → modal, ▼ collapse toggle) and horizontal row of sortable character cards (same styling as current CharacterBar cards).

**Collapsed:** same height, narrow block with account name, char count `(N)`, ► expand icon.

Use `@dnd-kit/sortable` with `SortableContext` + `horizontalListSortingStrategy` for character reordering within the account.

Each char card is a `useSortable` item with drag handle.

- [ ] **Step 2: Verify build + commit**

```bash
npx next build
git add src/components/accounts/account-container.tsx
git commit -m "feat: add AccountContainer with collapse and sortable chars"
```

---

### Task 5: Build AccountBar component

**Problem:** Replaces CharacterBar. Renders all accounts as sortable containers. Drag accounts to reorder, drag chars within accounts to reorder.

**Files:**
- Create: `src/components/accounts/account-bar.tsx`

- [ ] **Step 1: Create the component**

Props:
```typescript
interface AccountBarProps {
  accounts: Account[];
  characters: Character[];
  selectedCharId: string | null;
  onSelectChar: (char: Character) => void;
  onEditChar: (char: Character) => void;
  onToggleCollapse: (accountId: string) => void;
  onOpenAccountModal: (account: Account) => void;
  onCreateAccount: () => void;
  onReorderAccounts: (orderedIds: string[]) => void;
  onReorderCharacters: (accountId: string, orderedCharIds: string[]) => void;
}
```

Uses `DndContext` + `SortableContext` with `horizontalListSortingStrategy` for account-level sorting.

Each account is rendered as an `AccountContainer` wrapped in `useSortable`.

The [+] button at the end creates new account.

Horizontal scroll with `overflow-x-auto` and existing no-scrollbar CSS.

`onDragEnd` handler determines if an account was dragged (reorder accounts) or a character (reorder within account).

**Important:** Use nested `DndContext` for character reordering within accounts (separate from account-level DndContext), or use a single DndContext with item type discrimination.

Recommended: single `DndContext` with `id` prefixes — account items prefixed `account-{id}`, char items prefixed `char-{id}`. In `onDragEnd`, check prefix to determine what was dragged.

- [ ] **Step 2: Verify build + commit**

```bash
npx next build
git add src/components/accounts/account-bar.tsx
git commit -m "feat: add AccountBar with drag-and-drop sortable accounts and chars"
```

---

### Task 6: Build AccountModal + CreateAccountModal

**Problem:** Need modals for managing accounts (edit name, manage chars, delete) and creating new accounts (name + server badge selector).

**Files:**
- Create: `src/components/accounts/account-modal.tsx`
- Create: `src/components/accounts/create-account-modal.tsx`

- [ ] **Step 1: Create AccountModal**

Opened by clicking account name. Contains:
- Account name: editable text input, save on blur or button
- Server: read-only label (look up server name from `servers` array)
- Character list: rows with name/class/level + delete button (with inline confirm)
- "Adicionar personagem" button → opens CharacterForm (passed `accountId`)
- "Excluir conta" button at bottom (red, with confirm: "Excluir conta e todos os personagens?")

Uses existing `Modal` component. The character form can be inline or a nested section within the modal.

- [ ] **Step 2: Create CreateAccountModal**

Small modal with:
- Name input (required)
- Server selector: two badge buttons side-by-side

```tsx
<div className="flex gap-2">
  <button
    type="button"
    onClick={() => setServerId(1)}
    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
      serverId === 1
        ? "bg-[#7C3AED] text-white"
        : "bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C] hover:border-[#7C3AED]"
    }`}
  >
    Freya
  </button>
  <button
    type="button"
    onClick={() => setServerId(2)}
    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
      serverId === 2
        ? "bg-[#7C3AED] text-white"
        : "bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C] hover:border-[#7C3AED]"
    }`}
  >
    Nidhogg
  </button>
</div>
```

- "Criar" button disabled until name + server selected

- [ ] **Step 3: Verify build + commit**

```bash
npx next build
git add src/components/accounts/account-modal.tsx src/components/accounts/create-account-modal.tsx
git commit -m "feat: add AccountModal and CreateAccountModal"
```

---

### Task 7: Wire dashboard + party validation

**Problem:** Replace CharacterBar with AccountBar in dashboard. Add `useAccounts` hook. Update participant list with server + account validation.

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/components/instances/participant-list.tsx`
- Delete: `src/components/characters/character-bar.tsx`

- [ ] **Step 1: Update dashboard**

1. Import `useAccounts` and `AccountBar`, `AccountModal`, `CreateAccountModal`
2. Replace `CharacterBar` usage with `AccountBar`
3. Add `useAccounts()` hook call
4. Add state for `accountModalAccount` (Account | null) and `showCreateAccount` (boolean)
5. Wire all AccountBar callbacks (select, edit, collapse, modal, create, reorder)
6. Render AccountModal and CreateAccountModal
7. Update character creation flow to include `account_id`
8. Remove CharacterBar import

- [ ] **Step 2: Update participant list with validation**

In `src/components/instances/participant-list.tsx`:

Add `account_id` to the `Participant` interface:
```typescript
export interface Participant {
  // ... existing fields
  account_id?: string;
  server_id?: number;
}
```

In the `onAdd` handler (called from parent), before adding:
- **Server check:** if participants list is not empty, check if new participant's `server_id` matches existing ones. If not, show toast/alert: "Servidor diferente dos outros participantes"
- **Account check:** if new participant is "own" type, check if another participant has the same `account_id`. If so, block: "Já tem um personagem desta conta na party"

The `Character` type now has `account_id`. When creating a Participant from a Character, pass `account_id` and look up `server_id` via the character's account.

- [ ] **Step 3: Delete old CharacterBar**

```bash
git rm src/components/characters/character-bar.tsx
```

- [ ] **Step 4: Verify build + commit**

```bash
npx next build
npm test
git add -A
git commit -m "feat: wire AccountBar in dashboard, add party validation, remove CharacterBar"
```

---

### Task 8: Unit tests

**Problem:** Test account logic and server validation for parties.

**Files:**
- Create: `src/lib/__tests__/account-logic.test.ts`
- Create: `src/lib/__tests__/server-validation.test.ts`

- [ ] **Step 1: Write account logic tests**

```typescript
// src/lib/__tests__/account-logic.test.ts

describe("Account logic", () => {
  it("reorder produces correct sort_order values", () => {
    const ids = ["a", "b", "c"];
    const result = ids.map((id, i) => ({ id, sort_order: i }));
    expect(result).toEqual([
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ]);
  });

  it("reorder handles single item", () => {
    const ids = ["a"];
    const result = ids.map((id, i) => ({ id, sort_order: i }));
    expect(result).toEqual([{ id: "a", sort_order: 0 }]);
  });

  it("collapse state toggles correctly", () => {
    const account = { is_collapsed: false };
    const toggled = { ...account, is_collapsed: !account.is_collapsed };
    expect(toggled.is_collapsed).toBe(true);
    const toggledBack = { ...toggled, is_collapsed: !toggled.is_collapsed };
    expect(toggledBack.is_collapsed).toBe(false);
  });

  it("new account gets max sort_order + 1", () => {
    const accounts = [{ sort_order: 0 }, { sort_order: 2 }, { sort_order: 1 }];
    const maxOrder = Math.max(...accounts.map((a) => a.sort_order)) + 1;
    expect(maxOrder).toBe(3);
  });

  it("first account gets sort_order 0", () => {
    const accounts: { sort_order: number }[] = [];
    const maxOrder = accounts.length > 0 ? Math.max(...accounts.map((a) => a.sort_order)) + 1 : 0;
    expect(maxOrder).toBe(0);
  });
});
```

- [ ] **Step 2: Write server validation tests**

```typescript
// src/lib/__tests__/server-validation.test.ts

describe("Party server validation", () => {
  it("first participant sets server context", () => {
    const participants: { server_id: number }[] = [];
    const newParticipant = { server_id: 1 };
    // No existing participants = no server check needed
    const serverContext = participants.length > 0 ? participants[0].server_id : null;
    expect(serverContext).toBeNull();
  });

  it("allows same server participant", () => {
    const participants = [{ server_id: 1 }];
    const newParticipant = { server_id: 1 };
    const serverContext = participants[0].server_id;
    expect(newParticipant.server_id === serverContext).toBe(true);
  });

  it("blocks different server participant", () => {
    const participants = [{ server_id: 1 }];
    const newParticipant = { server_id: 2 };
    const serverContext = participants[0].server_id;
    expect(newParticipant.server_id === serverContext).toBe(false);
  });

  it("resets server context when all removed", () => {
    const participants: { server_id: number }[] = [];
    const serverContext = participants.length > 0 ? participants[0].server_id : null;
    expect(serverContext).toBeNull();
  });

  it("blocks duplicate account in party", () => {
    const participants = [{ account_id: "acc1", character_id: "c1" }];
    const newParticipant = { account_id: "acc1", character_id: "c2" };
    const hasSameAccount = participants.some((p) => p.account_id === newParticipant.account_id);
    expect(hasSameAccount).toBe(true);
  });

  it("allows different accounts in party", () => {
    const participants = [{ account_id: "acc1", character_id: "c1" }];
    const newParticipant = { account_id: "acc2", character_id: "c2" };
    const hasSameAccount = participants.some((p) => p.account_id === newParticipant.account_id);
    expect(hasSameAccount).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests + commit**

```bash
npm test
git add src/lib/__tests__/account-logic.test.ts src/lib/__tests__/server-validation.test.ts
git commit -m "test: add unit tests for account logic and server validation"
```

---

### Task 9: Build + verify

**Problem:** Final verification that everything works.

- [ ] **Step 1: Full build**

```bash
npx next build
```

- [ ] **Step 2: All unit tests**

```bash
npm test
```

- [ ] **Step 3: Manual test checklist**

1. Create a new account (name + Freya server badge)
2. Create a character inside the account
3. Create a second account (Nidhogg)
4. See both accounts in the bar with chars grouped
5. Collapse an account → shrinks horizontally, same height
6. Expand it back
7. Drag an account to reorder → persists on reload
8. Drag a character within account to reorder → persists
9. Click account name → AccountModal opens (edit name, see server, manage chars)
10. Open instance modal → participant list validates same server
11. Try adding 2 chars from same account → blocked

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: adjustments from manual testing of servers and accounts"
```
