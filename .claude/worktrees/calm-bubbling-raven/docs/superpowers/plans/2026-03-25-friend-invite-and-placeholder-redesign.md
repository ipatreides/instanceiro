# Friend Invite + Placeholder Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace schedule-bound invites with disposable friend invite links, and redesign placeholders to support role-based slots (DPS Físico, DPS Mágico, Artista) with distinct icons and colors.

**Architecture:** Single Supabase migration creates `friend_invites` table + RPCs and alters `schedule_placeholders`. Frontend gets a new friend invite page (unauth + auth), new `SlotTypeIcon` component, and updated schedule modal with slot type selector.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL RPCs, RLS), Tailwind CSS v4 with design tokens

**Spec:** `docs/superpowers/specs/2026-03-25-friend-invite-simplification.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/013_friend_invites_and_placeholder_redesign.sql` | DB migration: friend_invites table, RPCs, placeholder schema change, drop old tables |
| `src/lib/class-roles.ts` | Slot type constants, labels, Artista class list |
| `src/components/ui/slot-type-icon.tsx` | Duotone SVG icon component per slot type |
| `src/hooks/use-friend-invite.ts` | Hook for friend invite page (resolve + accept) |

### Modified files
| File | Changes |
|------|---------|
| `src/app/globals.css` | Add `--slot-dps-fisico`, `--slot-dps-magico`, `--slot-artista`, `--slot-classe` tokens |
| `src/lib/types.ts` | Remove `ScheduleInvite`, `InviteData`; update `SchedulePlaceholder`; add `FriendInvite` |
| `src/app/invite/[code]/page.tsx` | Full rewrite: simplified friend invite page (unauth + auth) |
| `src/hooks/use-schedules.ts` | Remove `generateInviteCode`, `getInviteCode`; update `addPlaceholder` for slot types |
| `src/components/schedules/schedule-modal.tsx` | Remove invite link section; replace placeholder form with slot type selector + `SlotTypeIcon` |
| `src/lib/supabase/middleware.ts` | Remove `/invite` from protected routes |
| `src/components/friends/friends-sidebar.tsx` | Add "Gerar link de convite" button with inline link display |

### Removed files
| File | Reason |
|------|--------|
| `src/hooks/use-invite.ts` | Replaced by `use-friend-invite.ts` |
| `src/lib/__tests__/invite-types.test.ts` | Old tests for schedule-bound invite types |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/013_friend_invites_and_placeholder_redesign.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Part A: Friend invites
-- ============================================================

CREATE TABLE friend_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code)
);

ALTER TABLE friend_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creator can view own invites"
  ON friend_invites FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can create invites"
  ON friend_invites FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can delete invites"
  ON friend_invites FOR DELETE
  USING (auth.uid() = created_by);

-- RPC: resolve_friend_invite (read-only, works for anon + authenticated)
CREATE OR REPLACE FUNCTION resolve_friend_invite(invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_creator RECORD;
BEGIN
  SELECT * INTO v_invite FROM friend_invites WHERE code = invite_code;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'invalid');
  END IF;

  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('status', 'used');
  END IF;

  -- Load creator profile
  SELECT id, username, display_name, avatar_url INTO v_creator
  FROM profiles WHERE id = v_invite.created_by;

  -- Unauthenticated user
  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'status', 'unauthenticated',
      'creator', json_build_object(
        'id', v_creator.id,
        'username', v_creator.username,
        'display_name', v_creator.display_name,
        'avatar_url', v_creator.avatar_url
      )
    );
  END IF;

  -- Self invite
  IF v_invite.created_by = auth.uid() THEN
    RETURN json_build_object('status', 'self_invite');
  END IF;

  -- Already friends
  IF EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
    AND (
      (requester_id = auth.uid() AND addressee_id = v_invite.created_by)
      OR (requester_id = v_invite.created_by AND addressee_id = auth.uid())
    )
  ) THEN
    RETURN json_build_object(
      'status', 'already_friends',
      'creator', json_build_object(
        'id', v_creator.id,
        'username', v_creator.username,
        'display_name', v_creator.display_name,
        'avatar_url', v_creator.avatar_url
      )
    );
  END IF;

  RETURN json_build_object(
    'status', 'valid',
    'creator', json_build_object(
      'id', v_creator.id,
      'username', v_creator.username,
      'display_name', v_creator.display_name,
      'avatar_url', v_creator.avatar_url
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Must be callable by anon (unauthenticated users on invite page)
GRANT EXECUTE ON FUNCTION resolve_friend_invite TO anon, authenticated;

-- RPC: accept_friend_invite
CREATE OR REPLACE FUNCTION accept_friend_invite(invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite FROM friend_invites WHERE code = invite_code;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'invalid');
  END IF;

  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('status', 'used');
  END IF;

  IF v_invite.created_by = auth.uid() THEN
    RETURN json_build_object('status', 'self_invite');
  END IF;

  -- Already friends
  IF EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
    AND (
      (requester_id = auth.uid() AND addressee_id = v_invite.created_by)
      OR (requester_id = v_invite.created_by AND addressee_id = auth.uid())
    )
  ) THEN
    RETURN json_build_object('status', 'already_friends');
  END IF;

  -- Create friendship
  INSERT INTO friendships (requester_id, addressee_id, status)
  VALUES (auth.uid(), v_invite.created_by, 'accepted');

  -- Mark invite as used
  UPDATE friend_invites
  SET used_by = auth.uid(), used_at = NOW()
  WHERE id = v_invite.id;

  RETURN json_build_object('status', 'accepted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: create_friend_invite (with collision retry)
CREATE OR REPLACE FUNCTION create_friend_invite()
RETURNS JSON AS $$
DECLARE
  v_code TEXT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_code := generate_invite_code(8);
    BEGIN
      INSERT INTO friend_invites (code, created_by) VALUES (v_code, auth.uid());
      RETURN json_build_object('code', v_code);
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION 'Failed to generate unique invite code';
      END IF;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Part B: Drop old invite system
-- ============================================================

DROP FUNCTION IF EXISTS accept_invite(TEXT, UUID);
DROP FUNCTION IF EXISTS resolve_invite(TEXT);
DROP TABLE IF EXISTS schedule_invites;

-- ============================================================
-- Part C: Placeholder redesign
-- ============================================================

-- Add new columns with defaults (safe for existing rows)
ALTER TABLE schedule_placeholders
  ADD COLUMN slot_type TEXT DEFAULT 'class',
  ADD COLUMN slot_label TEXT DEFAULT '',
  ADD COLUMN slot_class TEXT;

-- Migrate existing data
UPDATE schedule_placeholders
SET slot_type = 'class',
    slot_label = character_class,
    slot_class = character_class;

-- Make NOT NULL
ALTER TABLE schedule_placeholders ALTER COLUMN slot_type SET NOT NULL;
ALTER TABLE schedule_placeholders ALTER COLUMN slot_label SET NOT NULL;

-- Remove defaults
ALTER TABLE schedule_placeholders ALTER COLUMN slot_type DROP DEFAULT;
ALTER TABLE schedule_placeholders ALTER COLUMN slot_label DROP DEFAULT;

-- Drop old columns
ALTER TABLE schedule_placeholders DROP COLUMN character_name;
ALTER TABLE schedule_placeholders DROP COLUMN character_class;

-- Add CHECK constraint
ALTER TABLE schedule_placeholders
  ADD CONSTRAINT valid_slot_type
  CHECK (slot_type IN ('class', 'dps_fisico', 'dps_magico', 'artista'));

-- RPC: claim_placeholder
CREATE OR REPLACE FUNCTION claim_placeholder(p_placeholder_id UUID, p_character_id UUID)
RETURNS JSON AS $$
DECLARE
  v_placeholder RECORD;
  v_char RECORD;
BEGIN
  -- Lock and fetch placeholder
  SELECT * INTO v_placeholder
  FROM schedule_placeholders
  WHERE id = p_placeholder_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF v_placeholder.claimed_by IS NOT NULL THEN
    RETURN json_build_object('status', 'already_claimed');
  END IF;

  -- Validate character ownership
  SELECT * INTO v_char FROM characters WHERE id = p_character_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_owner');
  END IF;

  -- Validate class restriction
  IF v_placeholder.slot_type = 'class' AND v_char.class != v_placeholder.slot_class THEN
    RETURN json_build_object('status', 'class_mismatch');
  END IF;

  IF v_placeholder.slot_type = 'artista' AND v_char.class NOT IN ('Trovador', 'Musa') THEN
    RETURN json_build_object('status', 'class_mismatch');
  END IF;

  -- dps_fisico and dps_magico have no class restriction

  -- Claim
  UPDATE schedule_placeholders
  SET claimed_by = auth.uid(), claimed_character_id = p_character_id
  WHERE id = v_placeholder.id;

  RETURN json_build_object('status', 'claimed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db reset` or `npx supabase migration up`
Expected: Migration applies without errors

- [ ] **Step 3: Verify in Supabase Studio**

Check:
- `friend_invites` table exists with correct columns
- `schedule_invites` table is gone
- `schedule_placeholders` has `slot_type`, `slot_label`, `slot_class` columns (no `character_name`, `character_class`)
- RPCs: `resolve_friend_invite`, `accept_friend_invite`, `create_friend_invite`, `claim_placeholder` exist

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_friend_invites_and_placeholder_redesign.sql
git commit -m "feat: migration for friend invites + placeholder redesign"
```

---

## Task 2: Design Tokens + Slot Type Constants

**Files:**
- Modify: `src/app/globals.css:5-31` (dark theme), `src/app/globals.css:35-62` (light theme), `src/app/globals.css:64-91` (@theme inline)
- Create: `src/lib/class-roles.ts`

- [ ] **Step 1: Add slot color tokens to globals.css dark theme**

In `src/app/globals.css`, after `--radius-lg: 12px;` (line 31), add:

```css
  --slot-dps-fisico: #e07040;
  --slot-dps-magico: #7b68ee;
  --slot-artista: #e8a665;
  --slot-classe: #4a9a8a;
```

- [ ] **Step 2: Add slot color tokens to globals.css light theme**

In `src/app/globals.css`, after `--radius-lg: 12px;` in the light theme block (line 61), add:

```css
  --slot-dps-fisico: #c45a30;
  --slot-dps-magico: #5b48ce;
  --slot-artista: #c4863e;
  --slot-classe: #3a7a6a;
```

- [ ] **Step 3: Add slot tokens to @theme inline block**

In `src/app/globals.css`, after `--radius-lg: var(--radius-lg);` (line 90), add:

```css
  --color-slot-dps-fisico: var(--slot-dps-fisico);
  --color-slot-dps-magico: var(--slot-dps-magico);
  --color-slot-artista: var(--slot-artista);
  --color-slot-classe: var(--slot-classe);
```

- [ ] **Step 4: Create src/lib/class-roles.ts**

```typescript
export const ARTISTA_CLASSES = ['Trovador', 'Musa'] as const;

export type SlotType = 'class' | 'dps_fisico' | 'dps_magico' | 'artista';

export const SLOT_TYPES: SlotType[] = ['dps_fisico', 'dps_magico', 'artista', 'class'];

export const SLOT_TYPE_LABELS: Record<SlotType, string> = {
  class: 'Classe',
  dps_fisico: 'DPS Físico',
  dps_magico: 'DPS Mágico',
  artista: 'Artista',
};

export const SLOT_TYPE_DESCRIPTIONS: Record<SlotType, string> = {
  class: 'Classe específica',
  dps_fisico: 'Qualquer classe',
  dps_magico: 'Qualquer classe',
  artista: 'Trovador ou Musa',
};

export const SLOT_TYPE_COLORS: Record<SlotType, string> = {
  dps_fisico: 'var(--slot-dps-fisico)',
  dps_magico: 'var(--slot-dps-magico)',
  artista: 'var(--slot-artista)',
  class: 'var(--slot-classe)',
};
```

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/lib/class-roles.ts
git commit -m "feat: slot type design tokens and constants"
```

---

## Task 3: SlotTypeIcon Component

**Files:**
- Create: `src/components/ui/slot-type-icon.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { SlotType } from "@/lib/class-roles";
import { SLOT_TYPE_COLORS } from "@/lib/class-roles";

interface SlotTypeIconProps {
  type: SlotType;
  size?: number;
  className?: string;
}

function CrosshairIcon() {
  return (
    <>
      <circle cx="12" cy="12" r="8" fill="none" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="6" fill="none" />
      <line x1="12" y1="18" x2="12" y2="22" fill="none" />
      <line x1="2" y1="12" x2="6" y2="12" fill="none" />
      <line x1="18" y1="12" x2="22" y2="12" fill="none" />
    </>
  );
}

function StarIcon() {
  return (
    <path d="M12 2 L13.5 8.5 L20 7 L15 12 L20 17 L13.5 15.5 L12 22 L10.5 15.5 L4 17 L9 12 L4 7 L10.5 8.5 Z" />
  );
}

function MusicNoteIcon() {
  return (
    <>
      <circle cx="8" cy="17" r="3" />
      <line x1="11" y1="17" x2="11" y2="4" fill="none" />
      <path d="M11 4 Q16 3 18 7 Q16 5 11 6" fill="none" />
    </>
  );
}

function ShieldIcon() {
  return (
    <path d="M12 3 L4 7 L4 14 Q4 19 12 22 Q20 19 20 14 L20 7 Z" />
  );
}

const ICON_MAP: Record<SlotType, () => React.JSX.Element> = {
  dps_fisico: CrosshairIcon,
  dps_magico: StarIcon,
  artista: MusicNoteIcon,
  class: ShieldIcon,
};

export function SlotTypeIcon({ type, size = 44, className }: SlotTypeIconProps) {
  const color = SLOT_TYPE_COLORS[type];
  const IconContent = ICON_MAP[type];
  const svgSize = Math.round(size * 0.55);

  return (
    <div
      className={`flex items-center justify-center rounded-[var(--radius-md)] ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <svg
        width={svgSize}
        height={svgSize}
        viewBox="0 0 24 24"
        fill="none"
        style={{
          stroke: color,
          fill: color,
          fillOpacity: "var(--icon-fill-opacity)",
          strokeWidth: 1.6,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      >
        <IconContent />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx next build` (or just check no TS errors in editor)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/slot-type-icon.tsx
git commit -m "feat: SlotTypeIcon duotone component for placeholder slots"
```

---

## Task 4: Update Types

**Files:**
- Modify: `src/lib/types.ts:85-129`

- [ ] **Step 1: Replace old types with new ones**

In `src/lib/types.ts`, replace the `ScheduleInvite`, `SchedulePlaceholder`, and `InviteData` interfaces (lines 85-129) with:

```typescript
export interface SchedulePlaceholder {
  id: string;
  schedule_id: string;
  slot_type: 'class' | 'dps_fisico' | 'dps_magico' | 'artista';
  slot_label: string;
  slot_class: string | null;
  added_by: string;
  claimed_by: string | null;
  claimed_character_id: string | null;
  created_at: string;
}

export interface FriendInvite {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface FriendInviteCreator {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}
```

- [ ] **Step 2: Remove ScheduleInvite and InviteData references**

Delete the `ScheduleInvite` interface (was lines 85-91) and `InviteData` interface (was lines 104-129). They are no longer used.

- [ ] **Step 3: Verify no import errors**

Run: `npx tsc --noEmit`
Expected: Errors in files that still reference old types (use-invite.ts, use-schedules.ts, schedule-modal.tsx) — these get fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: update types for placeholder redesign and friend invites"
```

---

## Task 5: Friend Invite Hook

**Files:**
- Delete: `src/hooks/use-invite.ts`
- Delete: `src/lib/__tests__/invite-types.test.ts`
- Create: `src/hooks/use-friend-invite.ts`

- [ ] **Step 1: Delete old files**

```bash
rm src/hooks/use-invite.ts
rm src/lib/__tests__/invite-types.test.ts
```

- [ ] **Step 2: Create src/hooks/use-friend-invite.ts**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FriendInviteCreator } from "@/lib/types";

type InviteStatus = 'loading' | 'valid' | 'already_friends' | 'self_invite' | 'used' | 'invalid' | 'unauthenticated';

interface UseFriendInviteReturn {
  status: InviteStatus;
  creator: FriendInviteCreator | null;
  acceptInvite: () => Promise<'accepted' | 'already_friends' | 'used' | 'error'>;
  accepting: boolean;
}

export function useFriendInvite(code: string): UseFriendInviteReturn {
  const [status, setStatus] = useState<InviteStatus>('loading');
  const [creator, setCreator] = useState<FriendInviteCreator | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: result, error } = await supabase.rpc("resolve_friend_invite", {
        invite_code: code,
      });

      if (error) {
        setStatus('invalid');
        return;
      }

      const parsed = result as { status: string; creator?: FriendInviteCreator };
      setStatus(parsed.status as InviteStatus);
      setCreator(parsed.creator ?? null);
    };

    load();
  }, [code]);

  const acceptInvite = useCallback(async () => {
    setAccepting(true);
    const supabase = createClient();
    const { data: result, error } = await supabase.rpc("accept_friend_invite", {
      invite_code: code,
    });

    setAccepting(false);

    if (error) return 'error' as const;
    return (result as { status: string }).status as 'accepted' | 'already_friends' | 'used' | 'error';
  }, [code]);

  return { status, creator, acceptInvite, accepting };
}
```

- [ ] **Step 3: Commit**

```bash
git add -A src/hooks/use-invite.ts src/hooks/use-friend-invite.ts src/lib/__tests__/invite-types.test.ts
git commit -m "feat: replace use-invite with use-friend-invite hook"
```

---

## Task 6: Rewrite Invite Page

**Files:**
- Modify: `src/app/invite/[code]/page.tsx` (full rewrite)
- Modify: `src/lib/supabase/middleware.ts:39-41`

- [ ] **Step 1: Update middleware to allow unauth access to /invite**

In `src/lib/supabase/middleware.ts`, change line 39-40 from:

```typescript
  const isProtectedRoute =
    pathname.startsWith("/dashboard") || pathname.startsWith("/invite");
```

to:

```typescript
  const isProtectedRoute =
    pathname.startsWith("/dashboard");
```

- [ ] **Step 2: Rewrite the invite page**

Replace the entire content of `src/app/invite/[code]/page.tsx`:

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useFriendInvite } from "@/hooks/use-friend-invite";
import { Avatar } from "@/components/ui/avatar";
import { FullPageSpinner } from "@/components/ui/spinner";
import { LoginButton } from "@/components/auth/login-button";

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { status, creator, acceptInvite, accepting } = useFriendInvite(code);

  if (status === "loading") {
    return <FullPageSpinner label="Carregando convite..." />;
  }

  const handleAccept = async () => {
    const result = await acceptInvite();
    if (result === "accepted") {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-8 space-y-5">
          {/* Unauthenticated — show creator + login buttons */}
          {status === "unauthenticated" && creator && (
            <>
              <div className="flex justify-center">
                <Avatar src={creator.avatar_url} name={creator.display_name ?? creator.username} size="lg" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary">
                  {creator.display_name ?? creator.username}
                </h1>
                <p className="text-sm text-text-secondary mt-1">te convidou para o Instanceiro</p>
              </div>
              <div className="pt-2">
                <LoginButton />
              </div>
            </>
          )}

          {/* Valid — show creator + accept button */}
          {status === "valid" && creator && (
            <>
              <div className="flex justify-center">
                <Avatar src={creator.avatar_url} name={creator.display_name ?? creator.username} size="lg" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary">
                  {creator.display_name ?? creator.username}
                </h1>
                <p className="text-sm text-text-secondary mt-1">te convidou para o Instanceiro</p>
              </div>
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full px-6 py-3 text-sm font-semibold text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                {accepting ? "Aceitando..." : "Aceitar convite"}
              </button>
            </>
          )}

          {/* Already friends */}
          {status === "already_friends" && creator && (
            <>
              <div className="flex justify-center">
                <Avatar src={creator.avatar_url} name={creator.display_name ?? creator.username} size="lg" />
              </div>
              <h1 className="text-xl font-bold text-text-primary">
                Você já é amigo de {creator.display_name ?? creator.username}
              </h1>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2 text-sm text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Ir para o dashboard
              </button>
            </>
          )}

          {/* Self invite */}
          {status === "self_invite" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Este é seu próprio convite</h1>
              <p className="text-sm text-text-secondary">Compartilhe o link com seus amigos.</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2 text-sm text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Ir para o dashboard
              </button>
            </>
          )}

          {/* Used */}
          {status === "used" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Convite já utilizado</h1>
              <p className="text-sm text-text-secondary">Este convite já foi aceito por outro usuário.</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2 text-sm text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Ir para o dashboard
              </button>
            </>
          )}

          {/* Invalid */}
          {status === "invalid" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Convite inválido</h1>
              <p className="text-sm text-text-secondary">Este link de convite não existe.</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2 text-sm text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Ir para o dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx next build`

- [ ] **Step 4: Commit**

```bash
git add src/app/invite/[code]/page.tsx src/lib/supabase/middleware.ts
git commit -m "feat: simplified friend invite page with unauth support"
```

---

## Task 7: Update use-schedules Hook

**Files:**
- Modify: `src/hooks/use-schedules.ts:332-408` (remove invite code functions, update placeholder functions), `src/hooks/use-schedules.ts:442-463` (update return)

- [ ] **Step 1: Remove generateInviteCode and getInviteCode**

In `src/hooks/use-schedules.ts`, delete the `generateInviteCode` function (lines 332-366) and the `getInviteCode` function (lines 368-376).

- [ ] **Step 2: Update addPlaceholder for new slot fields**

Replace the `addPlaceholder` function (was lines 378-393) with:

```typescript
  const addPlaceholder = useCallback(async (
    scheduleId: string,
    slotType: 'class' | 'dps_fisico' | 'dps_magico' | 'artista',
    slotLabel: string,
    slotClass: string | null,
  ) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase
      .from("schedule_placeholders")
      .insert({
        schedule_id: scheduleId,
        slot_type: slotType,
        slot_label: slotLabel,
        slot_class: slotClass,
        added_by: user.id,
      });

    if (error) throw error;
  }, []);
```

- [ ] **Step 3: Update return object**

Remove `generateInviteCode` and `getInviteCode` from the return object (lines 456-457). The return should be:

```typescript
  return {
    schedules,
    loading,
    createSchedule,
    updateScheduleTitle,
    joinSchedule,
    leaveSchedule,
    removeParticipant,
    inviteFriend,
    getEligibleFriends,
    completeSchedule,
    expireSchedule,
    updateScheduleTime,
    getParticipants,
    addPlaceholder,
    removePlaceholder,
    getPlaceholders,
    getScheduledCharacterIds,
    getScheduledCharsWithTimes,
  };
```

- [ ] **Step 4: Remove schedule_invites import/reference if any**

Search the file for any remaining reference to `schedule_invites`, `ScheduleInvite`, or `InviteData` and remove them.

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: May show errors in schedule-modal.tsx (fixed in next task)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-schedules.ts
git commit -m "feat: update use-schedules for placeholder slot types, remove invite code functions"
```

---

## Task 8: Update Schedule Modal

**Files:**
- Modify: `src/components/schedules/schedule-modal.tsx`

This is the largest change. The modal needs:
1. Remove invite link section from footer (lines 340-358)
2. Replace placeholder rendering with `SlotTypeIcon` + badge (lines 657-681)
3. Replace placeholder add form with slot type selector (lines 696-745)

- [ ] **Step 1: Add imports**

At the top of `src/components/schedules/schedule-modal.tsx`, add:

```typescript
import { SlotTypeIcon } from "@/components/ui/slot-type-icon";
import { SLOT_TYPES, SLOT_TYPE_LABELS, SLOT_TYPE_DESCRIPTIONS, SLOT_TYPE_COLORS } from "@/lib/class-roles";
import type { SlotType } from "@/lib/class-roles";
```

- [ ] **Step 2: Remove invite-related state and handlers**

Remove all state and handler code related to `inviteCode`, `inviteCopied`, `handleGenerateInvite`, `handleCopyInvite`. Remove the `onGenerateInviteCode` and `onGetInviteCode` props.

- [ ] **Step 3: Update placeholder state**

Replace `placeholderName` and `placeholderClass` state with:

```typescript
const [placeholderSlotType, setPlaceholderSlotType] = useState<SlotType>("dps_fisico");
const [placeholderClass, setPlaceholderClass] = useState("");
```

- [ ] **Step 4: Remove invite link from footer**

In the footer section (lines 339-358), remove the entire invite link block (`{isCreator && ( ... )}` with the "Gerar link" / "Copiar link" buttons).

- [ ] **Step 5: Replace placeholder rendering**

Replace the placeholder rendering block (lines 657-681) with:

```tsx
{placeholders.filter((p) => !p.claimed_by).map((p) => (
  <div
    key={p.id}
    className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border"
  >
    <SlotTypeIcon type={p.slot_type} size={28} />
    <div className="flex flex-col flex-1 min-w-0">
      <span className="text-sm text-text-secondary italic">Vaga aberta</span>
      <span className="text-[10px] text-text-secondary">{SLOT_TYPE_DESCRIPTIONS[p.slot_type]}</span>
    </div>
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)]"
      style={{
        background: `color-mix(in srgb, ${SLOT_TYPE_COLORS[p.slot_type]} 15%, transparent)`,
        color: SLOT_TYPE_COLORS[p.slot_type],
      }}
    >
      {p.slot_label}
    </span>
    {isCreator && (
      <button
        onClick={() => handleRemovePlaceholder(p.id)}
        disabled={busy}
        className="text-xs text-status-error hover:text-status-error-text cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
      >
        Remover
      </button>
    )}
  </div>
))}
```

- [ ] **Step 6: Replace placeholder add form**

Replace the placeholder form block (lines 696-745) with:

```tsx
{!showPlaceholderForm ? (
  <button
    type="button"
    onClick={() => setShowPlaceholderForm(true)}
    className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-xs hover:bg-surface transition-colors cursor-pointer text-primary"
  >
    <span className="w-5 h-5 rounded-full bg-border flex items-center justify-center text-[10px] text-text-secondary flex-shrink-0">+</span>
    Adicionar vaga
  </button>
) : (
  <div className="flex flex-col gap-2 p-3 rounded-lg bg-bg border border-border">
    <label className="text-xs text-text-secondary font-semibold">Tipo de vaga</label>
    <div className="flex flex-wrap gap-1.5">
      {SLOT_TYPES.map((st) => (
        <button
          key={st}
          type="button"
          onClick={() => { setPlaceholderSlotType(st); setPlaceholderClass(""); }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border transition-colors cursor-pointer ${
            placeholderSlotType === st
              ? "border-primary bg-primary/10 text-text-primary"
              : "border-border bg-surface text-text-secondary hover:border-primary/50"
          }`}
        >
          <SlotTypeIcon type={st} size={18} />
          {SLOT_TYPE_LABELS[st]}
        </button>
      ))}
    </div>

    {placeholderSlotType === "class" && (
      <>
        <label className="text-xs text-text-secondary font-semibold mt-1">Classe</label>
        <input
          type="text"
          value={placeholderClass}
          onChange={(e) => setPlaceholderClass(e.target.value)}
          placeholder="Ex: Arcebispo"
          maxLength={30}
          list="class-suggestions"
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary"
        />
        <datalist id="class-suggestions">
          {getLeafClasses().map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </>
    )}

    <div className="flex gap-2 justify-end">
      <button
        onClick={() => { setShowPlaceholderForm(false); setPlaceholderClass(""); }}
        className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded-lg hover:bg-border transition-colors cursor-pointer"
      >
        Cancelar
      </button>
      <button
        onClick={handleAddPlaceholder}
        disabled={busy || (placeholderSlotType === "class" && !placeholderClass.trim())}
        className="px-3 py-1.5 text-xs text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
      >
        Adicionar
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 7: Update handleAddPlaceholder**

Find the `handleAddPlaceholder` function and update it to use the new slot fields:

```typescript
const handleAddPlaceholder = async () => {
  if (!schedule) return;
  setBusy(true);
  try {
    const label = placeholderSlotType === "class" ? placeholderClass.trim() : SLOT_TYPE_LABELS[placeholderSlotType];
    const slotClass = placeholderSlotType === "class" ? placeholderClass.trim() : null;
    await onAddPlaceholder(schedule.id, placeholderSlotType, label, slotClass);
    setShowPlaceholderForm(false);
    setPlaceholderClass("");
    await refreshPlaceholders();
  } finally {
    setBusy(false);
  }
};
```

- [ ] **Step 8: Update onAddPlaceholder prop type**

Update the `onAddPlaceholder` prop to match the new signature:

```typescript
onAddPlaceholder: (scheduleId: string, slotType: string, slotLabel: string, slotClass: string | null) => Promise<void>;
```

And remove `onGenerateInviteCode` and `onGetInviteCode` props.

- [ ] **Step 9: Update the dashboard page that passes these props**

In `src/app/dashboard/page.tsx`, remove `generateInviteCode` and `getInviteCode` from the props passed to `ScheduleModal`, and update `addPlaceholder` usage to match new signature.

- [ ] **Step 10: Verify build compiles**

Run: `npx next build`

- [ ] **Step 11: Commit**

```bash
git add src/components/schedules/schedule-modal.tsx src/app/dashboard/page.tsx
git commit -m "feat: slot type selector and icons in schedule modal, remove invite link"
```

---

## Task 9: Invite Link Generation in Friends Sidebar

**Files:**
- Modify: `src/components/friends/friends-sidebar.tsx`

- [ ] **Step 1: Add invite link generation state and handler**

Inside the `FriendsSidebar` component, add state:

```typescript
const [inviteLink, setInviteLink] = useState<string | null>(null);
const [inviteLoading, setInviteLoading] = useState(false);
const [inviteCopied, setInviteCopied] = useState(false);

const handleGenerateInvite = async () => {
  setInviteLoading(true);
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_friend_invite");
  setInviteLoading(false);

  if (error || !data) return;
  const code = (data as { code: string }).code;
  const link = `${window.location.origin}/invite/${code}`;
  setInviteLink(link);

  // Auto-hide after 10 seconds
  setTimeout(() => setInviteLink(null), 10000);
};

const handleCopyInvite = async () => {
  if (!inviteLink) return;
  await navigator.clipboard.writeText(inviteLink);
  setInviteCopied(true);
  setTimeout(() => setInviteCopied(false), 2000);
};
```

- [ ] **Step 2: Add the invite button/link UI**

In the sidebar, above the "Add friend input" section (before line 233 `{/* Add friend input */}`), add:

```tsx
{/* Invite link */}
<div className="px-4 py-2 border-t border-border">
  {inviteLink ? (
    <button
      onClick={handleCopyInvite}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
    >
      <span className="truncate flex-1 text-left">{inviteLink}</span>
      <span className="flex-shrink-0 font-semibold">{inviteCopied ? "Copiado!" : "Copiar"}</span>
    </button>
  ) : (
    <button
      onClick={handleGenerateInvite}
      disabled={inviteLoading}
      className="w-full px-3 py-2 text-xs text-primary-secondary bg-surface border border-primary-secondary/30 rounded-lg hover:border-primary-secondary transition-colors cursor-pointer disabled:opacity-50"
    >
      {inviteLoading ? "Gerando..." : "Gerar link de convite"}
    </button>
  )}
</div>
```

- [ ] **Step 3: Add createClient import if missing**

Verify `createClient` is imported at the top:

```typescript
import { createClient } from "@/lib/supabase/client";
```

- [ ] **Step 4: Verify build compiles**

Run: `npx next build`

- [ ] **Step 5: Commit**

```bash
git add src/components/friends/friends-sidebar.tsx
git commit -m "feat: invite link generation in friends sidebar"
```

---

## Task 10: Manual Testing + Cleanup

- [ ] **Step 1: Test friend invite flow (authenticated)**

1. Open the app, go to dashboard
2. In friends sidebar, click "Gerar link de convite"
3. Copy the generated link
4. Open in an incognito window (not logged in)
5. Verify: see creator avatar + name + login buttons
6. Log in with a different account
7. Verify: see "Aceitar convite" button
8. Accept → verify friendship created, redirect to dashboard

- [ ] **Step 2: Test invite edge cases**

1. Visit own invite link → "Este é seu próprio convite"
2. Visit used invite link → "Convite já utilizado"
3. Visit random code → "Convite inválido"
4. Visit invite from existing friend → "Você já é amigo de..."

- [ ] **Step 3: Test placeholder slot types in schedule modal**

1. Create a schedule
2. Open it, click "Adicionar vaga"
3. Select "DPS Físico" → verify icon + badge appear correctly
4. Select "DPS Mágico" → verify icon + badge
5. Select "Artista" → verify icon + badge says "Artista"
6. Select "Classe" → verify class input appears, type "Arcebispo" → verify icon + badge
7. Remove a placeholder → verify it disappears

- [ ] **Step 4: Clean up any remaining references**

Search for any remaining references to removed code:

```bash
grep -r "schedule_invites\|ScheduleInvite\|InviteData\|useInvite\|use-invite\|getInviteCode\|generateInviteCode\|character_name.*placeholder\|character_class.*placeholder" src/ --include="*.ts" --include="*.tsx"
```

Fix any found references.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: cleanup remaining references to old invite system"
```
