# Servers & Accounts — Design Spec

**Date:** 2026-03-23
**Status:** Approved
**Goal:** Introduce server and account concepts. Accounts group characters, enforce 1-char-per-account in instance parties, and enable drag-and-drop reordering in the character bar.

---

## Overview

The game has two servers (Freya, Nidhogg). Players have multiple game accounts, each bound to one server. Each account has multiple characters. The tracker needs to model this hierarchy to enforce party composition rules and improve character organization.

**Hierarchy:** User → Accounts → Characters
**Key constraint:** An instance party can only contain characters from the same server, and at most 1 character per account.

---

## Database

### New table: `servers` (seed data)

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| name | text UNIQUE NOT NULL | "Freya", "Nidhogg" |

Seeded on migration. Not user-editable.

### New table: `accounts`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid FK → auth.users NOT NULL | owner |
| server_id | int FK → servers NOT NULL | which server |
| name | text NOT NULL | display name (e.g., "Principal", "Alt") |
| sort_order | int NOT NULL DEFAULT 0 | position in character bar |
| is_collapsed | boolean NOT NULL DEFAULT false | minimized state |
| created_at | timestamptz NOT NULL DEFAULT now() |

### Alter table: `characters`

Add columns:
- `account_id uuid FK → accounts NOT NULL` — which account this char belongs to
- `sort_order int NOT NULL DEFAULT 0` — position within the account

### RLS

- `servers`: public read (no auth needed)
- `accounts`: users can CRUD their own (user_id = auth.uid())
- `characters`: existing policies + account_id must reference an account owned by auth.uid()

---

## Data Migration

Database will be wiped before deploying this feature — no migration of existing characters needed.

1. Create `servers` with Freya (id=1) and Nidhogg (id=2)
2. Add `account_id` (NOT NULL) and `sort_order` columns to `characters`
3. Existing data will be cleared

---

## Character Bar — New UI

### Layout

Characters grouped by account in a horizontal scrollable bar. Each account is a visual container.

**Expanded:**
```
┌─ Conta1 ─▼───────────────┐  ┌─ Conta2 ─▼────────┐  [+]
│ [Char1] [Char2] [Char3]  │  │ [Char4] [Char5]    │
└───────────────────────────┘  └────────────────────┘
```

**Minimized (Conta1 collapsed):**
```
┌────────┐  ┌─ Conta2 ─▼────────┐  [+]
│Conta1  │  │ [Char4] [Char5]    │
│  (3) ► │  └────────────────────┘
└────────┘
```

### Behavior

- **Same row height** — collapsed accounts keep the same height as expanded ones, only shrink horizontally to a compact block showing name + char count + ► expand icon
- **▼/► toggle** — click to collapse/expand. State persisted in DB (`is_collapsed`)
- **Click account name** — opens Account Modal (manage chars, edit name, see server)
- **Server name NOT shown** in the bar — only visible inside the account modal
- **[+] button** (outside accounts, at the end) — creates a new account
- **Drag account** — @dnd-kit sortable, reorders accounts horizontally (saves `sort_order`)
- **Drag character** — @dnd-kit sortable within account, reorders characters horizontally (saves `sort_order`)
- **Click character** — selects it (as today)
- **Click selected character** — opens character edit modal (as today)

### Account Modal

Opened by clicking the account name in the bar. Contains:

- **Account name** — editable text field
- **Server** — displayed as read-only label (Freya/Nidhogg). Not changeable after creation.
- **Character list** — all characters in this account, with:
  - Name, class, level per row
  - Delete button per character (with confirmation)
  - "Adicionar personagem" button — opens character creation form (existing `CharacterForm`) with `account_id` pre-set
- **Excluir conta** — deletes account + all characters (with confirmation)

### Create Account Flow

Click [+] at end of bar → small modal:
- Name field (required)
- Server selector: two badge buttons side by side (`[Freya]` `[Nidhogg]`). Clicking one selects it (purple bg) and deselects the other (muted bg). Required — cannot submit without selecting one.
- "Criar" button (disabled until name + server filled)

---

## Party Validation (Instance Modal)

When adding a participant to the `ParticipantList`:

### Server check
- The first participant sets the server context (derived from their account's server)
- All subsequent participants must be from the same server
- Friends list filtered to only show characters from the matching server
- If all participants removed, server context resets

### Account check
- At most 1 character per account in the party
- If user tries to add a 2nd char from the same account → block with message "Já tem um personagem desta conta na party"
- This applies to own characters AND friend characters (friends may share an account concept — but since we only know their character, this check applies to own chars only where we know the account)

### Validation in RPC
- `complete_instance_party` RPC should validate: all own characters belong to the same server
- Client-side validation is primary (instant feedback), server-side is safety net

---

## Type Changes

### New types in `src/lib/types.ts`

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

### Updated `Character` type

Add fields:
```typescript
export interface Character {
  // ... existing fields ...
  account_id: string;
  sort_order: number;
}
```

---

## Hooks

### New: `useAccounts`

```typescript
interface UseAccountsReturn {
  accounts: Account[];
  loading: boolean;
  createAccount: (name: string, serverId: number) => Promise<Account>;
  updateAccount: (id: string, data: { name?: string; is_collapsed?: boolean; sort_order?: number }) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  reorderAccounts: (orderedIds: string[]) => Promise<void>;
  reorderCharacters: (accountId: string, orderedCharIds: string[]) => Promise<void>;
}
```

### Modified: `useCharacters`

- `createCharacter` now requires `account_id` parameter
- Characters returned with `account_id` and `sort_order`
- No more flat list sorting — characters ordered by account's `sort_order`, then by character's `sort_order` within account

---

## Component Structure

### New components

- **`src/components/accounts/account-bar.tsx`** — replaces `CharacterBar`. Renders accounts as containers with @dnd-kit sortable. Each account contains sortable characters.
- **`src/components/accounts/account-container.tsx`** — single account block (header + chars or collapsed view)
- **`src/components/accounts/account-modal.tsx`** — manage account (chars, name, delete)
- **`src/components/accounts/create-account-modal.tsx`** — new account form (name + server)

### Modified components

- **`src/app/dashboard/page.tsx`** — replace `CharacterBar` with `AccountBar`, add `useAccounts` hook
- **`src/components/instances/participant-list.tsx`** — add server + account validation
- **`src/components/characters/character-form.tsx`** — receives `accountId` prop (pre-set, not user-selectable)

### Removed components

- **`src/components/characters/character-bar.tsx`** — replaced by `AccountBar`

---

## Dependencies

- **@dnd-kit/core** — drag and drop primitives
- **@dnd-kit/sortable** — sortable list helpers
- **@dnd-kit/utilities** — CSS transform utilities

---

## Testing

### Unit tests

**`src/lib/__tests__/account-logic.test.ts`:**
- Party validation: same server enforcement
- Party validation: 1 char per account enforcement
- Reorder logic: sort_order computation from ordered ID array
- Account collapse/expand state

**`src/lib/__tests__/server-validation.test.ts`:**
- Server check: first participant sets context
- Server check: block different server
- Server check: reset when all removed

### E2E

Auth-constrained — manual testing for drag-and-drop and modal flows.

---

## Out of Scope

- Moving characters between accounts
- Moving accounts between servers
- Server-specific instance lists (both servers have same instances)
- Auto-detecting server from game data
