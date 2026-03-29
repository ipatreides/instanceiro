# Friend Invite Simplification + Placeholder Redesign

## Summary

Two changes:

1. **Friend invite link**: Replace the schedule-bound invite system with a simple **friend invite link**. Each invite is a disposable single-use 8-char code that, when accepted, creates an `accepted` friendship between inviter and invitee. The old `schedule_invites` table and its RPCs (`resolve_invite`, `accept_invite`) are removed.

2. **Placeholder redesign**: Keep `schedule_placeholders` but redesign them to support role-based slots (DPS Físico, DPS Mágico, Artista) in addition to specific-class slots. DPS slots are **informational** (any class can fill them), while Artista and class-specific slots are **restrictive**. Each slot type has a distinct icon and color identity.

## Motivation

The current invite page (`/invite/[code]`) is tightly coupled to schedules — it shows instance name, time, participant count, and requires character selection. This is unnecessary friction. The primary value of an invite link is **adding a friend**. Schedule joining can happen separately through the dashboard once users are friends.

Placeholders currently only support a specific class name. Expanding to role categories gives schedule creators more flexibility when composing a party ("preciso de 2 DPS Físico e 1 Artista").

---

## Database

### New table: `friend_invites`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| code | varchar(8) | UNIQUE, NOT NULL |
| created_by | uuid | FK → profiles(id) ON DELETE CASCADE |
| used_by | uuid | nullable, FK → profiles(id) ON DELETE SET NULL |
| used_at | timestamptz | nullable |
| created_at | timestamptz | default now() |

**Behavior:**
- Each invite is **single-use** (disposable). Once `used_by` is set, the code is consumed.
- Users can generate multiple invite codes.
- Code is 8 alphanumeric chars (a-z, A-Z, 0-9), generated via `generate_invite_code()` (already exists).

### RLS Policies

**friend_invites:**
- SELECT: creator only (`created_by = auth.uid()`). Resolution happens via SECURITY DEFINER RPC.
- INSERT: `created_by = auth.uid()`
- UPDATE: none (claiming happens via RPC)
- DELETE: `created_by = auth.uid()`

### New RPC: `resolve_friend_invite(invite_code TEXT)`

Read-only function. Returns JSON with creator info for the invite page. Must work **without authentication** (for unauth users to see who invited them).

```sql
-- Unauthenticated user, valid invite:
{ "status": "unauthenticated", "creator": { "id", "username", "display_name", "avatar_url" } }

-- Authenticated, valid invite:
{ "status": "valid", "creator": { "id", "username", "display_name", "avatar_url" } }

-- Already friends with the inviter:
{ "status": "already_friends", "creator": { "id", "username", "display_name", "avatar_url" } }

-- User is the invite creator:
{ "status": "self_invite" }

-- Invite code already used:
{ "status": "used" }

-- Code doesn't exist:
{ "status": "invalid" }
```

**Logic:**
1. Look up `friend_invites` by code
2. If not found → `invalid`
3. If `used_by IS NOT NULL` → `used`
4. If `auth.uid() IS NULL` → `unauthenticated` (with creator info)
5. If `created_by = auth.uid()` → `self_invite`
6. Check if friendship already exists between `auth.uid()` and `created_by` → `already_friends`
7. Otherwise → `valid`

**SECURITY DEFINER**, **STABLE**.

**Permissions:** `GRANT EXECUTE ON FUNCTION resolve_friend_invite TO anon, authenticated` — must be callable without auth for the unauth invite page.

### New RPC: `accept_friend_invite(invite_code TEXT)`

Mutating function. Requires authentication. Returns JSON:

```sql
-- Success:
{ "status": "accepted" }

-- Already friends:
{ "status": "already_friends" }

-- Self invite:
{ "status": "self_invite" }

-- Already used by someone else:
{ "status": "used" }

-- Code doesn't exist:
{ "status": "invalid" }
```

**Logic:**
1. Look up `friend_invites` by code
2. If not found → `invalid`
3. If `used_by IS NOT NULL` → `used`
4. If `created_by = auth.uid()` → `self_invite`
5. Check existing friendship → `already_friends`
6. Insert into `friendships` (requester_id = auth.uid(), addressee_id = created_by, status = 'accepted')
7. Mark invite as used: `UPDATE friend_invites SET used_by = auth.uid(), used_at = now()`
8. Return `accepted`

**SECURITY DEFINER**.

### New RPC: `create_friend_invite()`

Generates a new disposable invite code for the current user.

```sql
CREATE FUNCTION create_friend_invite()
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
```

### Redesigned table: `schedule_placeholders`

**Keep the table**, but change schema to support role-based slots:

| Column | Type | Constraints | Change |
|--------|------|-------------|--------|
| id | uuid | PK | unchanged |
| schedule_id | uuid | FK → instance_schedules ON DELETE CASCADE | unchanged |
| slot_type | text | NOT NULL, CHECK IN ('class', 'dps_fisico', 'dps_magico', 'artista') | **NEW** (replaces character_class) |
| slot_label | text | NOT NULL | **NEW** (replaces character_name — display label, e.g. "Arcebispo", "DPS Físico", "Artista") |
| slot_class | text | nullable | **NEW** (specific class name, only set when slot_type = 'class') |
| added_by | uuid | FK → profiles(id) | unchanged |
| claimed_by | uuid | nullable, FK → profiles(id) | unchanged |
| claimed_character_id | uuid | nullable, FK → characters(id) | unchanged |
| created_at | timestamptz | default now() | unchanged |

**Removed columns:** `character_name`, `character_class` (replaced by `slot_type`, `slot_label`, `slot_class`)

#### Slot types and claim rules

| slot_type | slot_label | slot_class | Quem pode pegar | Badge UI |
|-----------|-----------|------------|-----------------|----------|
| `class` | "Arcebispo" | "Arcebispo" | Só personagem da classe exata | Nome da classe |
| `dps_fisico` | "DPS Físico" | NULL | **Qualquer classe** | "DPS Físico" |
| `dps_magico` | "DPS Mágico" | NULL | **Qualquer classe** | "DPS Mágico" |
| `artista` | "Artista" | NULL | **Só Trovador ou Musa** | "Artista" |

**Claim validation logic** (enforced server-side in RPC):
- `class` → character.class must match `slot_class`
- `dps_fisico` / `dps_magico` → no class restriction (informational only)
- `artista` → character.class must be `'Trovador'` or `'Musa'`

### New RPC: `claim_placeholder(p_placeholder_id UUID, p_character_id UUID)`

When a user joins a schedule and wants to fill an open placeholder slot. Returns JSON:

```sql
-- Success:
{ "status": "claimed" }

-- Placeholder already claimed:
{ "status": "already_claimed" }

-- Character class doesn't match restriction:
{ "status": "class_mismatch" }

-- Character not owned by user:
{ "status": "not_owner" }

-- Placeholder not found:
{ "status": "not_found" }
```

**Logic:**
1. Look up placeholder by id, verify it exists and `claimed_by IS NULL`
2. Look up character, verify `user_id = auth.uid()`
3. Validate class restriction:
   - `slot_type = 'class'` → character.class must equal `slot_class`
   - `slot_type = 'artista'` → character.class must be in ('Trovador', 'Musa')
   - `slot_type IN ('dps_fisico', 'dps_magico')` → no restriction
4. `UPDATE schedule_placeholders SET claimed_by = auth.uid(), claimed_character_id = p_character_id`
5. Return `claimed`

Uses `FOR UPDATE SKIP LOCKED` on the placeholder row to prevent race conditions.

**SECURITY DEFINER**.

### Table to DROP (new migration)

- `schedule_invites` (table + RLS policies)

### Functions to DROP

- `resolve_invite(TEXT)`
- `accept_invite(TEXT, UUID)`

Keep `generate_invite_code(INT)` — reused by the new system.

---

## Placeholder Visual Identity

Each slot type has a **unique icon** (duotone SVG, matching the existing ShieldIcon pattern) and **unique color**. Icons use `stroke` + `fill` with `fill-opacity: var(--icon-fill-opacity)` over a `color-mix` translucent background.

### Color tokens (new, added to `globals.css`)

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--slot-dps-fisico` | `#e07040` | TBD | DPS Físico icon + badge |
| `--slot-dps-magico` | `#7b68ee` | TBD | DPS Mágico icon + badge |
| `--slot-artista` | `#e8a665` | TBD | Artista icon + badge (same as `--primary-secondary`) |
| `--slot-classe` | `#4a9a8a` | TBD | Classe específica icon + badge |

Note: DPS Físico uses orange (`#e07040`) instead of red to avoid confusion with `--status-error` (`#c44040`).

### Icons

| Slot type | Icon | SVG description |
|-----------|------|-----------------|
| DPS Físico | Alvo (crosshair) | Circle with crosshair lines + filled center dot |
| DPS Mágico | Estrela | 6-pointed star polygon |
| Artista | Nota musical | Single music note with stem and flag |
| Classe específica | Escudo | Shield shape (same as ShieldIcon silhouette) |

### Badge pattern

Same pattern as `StatusBadge`: `bg-[color-mix(in srgb, var(--slot-{type}) 15%, transparent)] text-slot-{type}`

### Placeholder row in participant list

- **Icon**: 44x44px rounded-md container with translucent background + duotone SVG
- **Text**: "Vaga aberta" (italic, `text-text-secondary`) with description below ("Qualquer classe" / "Trovador ou Musa" / "Classe específica")
- **Badge**: Right-aligned colored badge with slot type label

### Frontend constants

```typescript
// src/lib/class-roles.ts
export const ARTISTA_CLASSES = ['Trovador', 'Musa'] as const;

export type SlotType = 'class' | 'dps_fisico' | 'dps_magico' | 'artista';

export const SLOT_TYPE_LABELS: Record<SlotType, string> = {
  class: 'Classe',
  dps_fisico: 'DPS Físico',
  dps_magico: 'DPS Mágico',
  artista: 'Artista',
};
```

### New component: `SlotTypeIcon`

```typescript
// src/components/ui/slot-type-icon.tsx
interface SlotTypeIconProps {
  type: SlotType;
  size?: number;       // default 44
  className?: string;
}
```

Renders the appropriate duotone SVG icon with the slot type's color.

---

## Frontend

### Page: `/invite/[code]`

Remove `/invite` from protected routes in middleware. The page renders for both authenticated and unauthenticated users.

#### Unauthenticated user

The page calls `resolve_friend_invite` (which works without auth) and shows the creator's avatar + name:

```
┌─────────────────────────────┐
│                             │
│        [Avatar]             │
│    Fulano te convidou       │
│    para o Instanceiro       │
│                             │
│   ┌───────────────────┐     │
│   │   Criar conta     │     │
│   └───────────────────┘     │
│   ┌───────────────────┐     │
│   │  Já tenho conta   │     │
│   └───────────────────┘     │
│                             │
└─────────────────────────────┘
```

- "Criar conta" → OAuth signup with `?redirect=/invite/{code}`
- "Já tenho conta" → OAuth login with `?redirect=/invite/{code}`

For `used` and `invalid` statuses, show the error message without login buttons.

#### Authenticated user

| Status | UI |
|--------|-----|
| `valid` | Avatar + display name do criador + "**Fulano** te convidou para o Instanceiro" + botão **"Aceitar convite"**. On click: chama `accept_friend_invite()`, mostra toast de sucesso, redireciona para `/dashboard` |
| `already_friends` | Avatar + "Você já é amigo de **Fulano**" + link "Ir para o dashboard" |
| `self_invite` | "Este é seu próprio convite" + link "Ir para o dashboard" |
| `used` | "Este convite já foi utilizado" + link "Ir para o dashboard" |
| `invalid` | "Convite inválido" + link "Ir para o dashboard" |

### Hook: `useFriendInvite`

Replace current `use-invite.ts` entirely:

```typescript
interface UseFriendInviteReturn {
  status: 'loading' | 'valid' | 'already_friends' | 'self_invite' | 'used' | 'invalid' | 'unauthenticated';
  creator: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  acceptInvite: () => Promise<'accepted' | 'already_friends' | 'used' | 'error'>;
  accepting: boolean;
}
```

### Generating invite codes

Button in friends sidebar (below the add-by-username input): "Gerar link de convite".

**UX flow:**
1. User clicks "Gerar link de convite"
2. Button enters loading state, calls `create_friend_invite()` RPC
3. Button is replaced by an inline row showing the link (truncated) + copy icon button
4. On click of copy button: copies `{origin}/invite/{code}` to clipboard, shows brief "Copiado!" feedback
5. After 10 seconds (or on next interaction), the row reverts to the "Gerar link" button

Each click generates a **new** disposable code. No need to store/list previous codes in the UI.

---

## Auth flow

1. Unauth user visits `/invite/{code}`
2. Middleware does NOT redirect (invite removed from protected routes)
3. Page calls `resolve_friend_invite` → gets `unauthenticated` status with creator info
4. Page renders avatar + name + login/signup buttons
5. User clicks login → OAuth → callback with `?redirect=/invite/{code}`
6. Callback redirects to `/invite/{code}`
7. Now authenticated, page calls `resolve_friend_invite` again → gets `valid` status
8. User clicks "Aceitar convite" → `accept_friend_invite()` → friendship created → redirect to `/dashboard`

---

## Files to modify/remove

### Remove entirely
- `src/hooks/use-invite.ts` — rewrite from scratch
- `src/lib/__tests__/invite-types.test.ts` — rewrite for new types

### Modify
- `src/app/invite/[code]/page.tsx` — rewrite with simplified friend-invite UI (unauth + auth flows)
- `src/lib/types.ts` — remove `ScheduleInvite`, `InviteData`; update `SchedulePlaceholder` for new slot fields; add `FriendInvite` types
- `src/hooks/use-schedules.ts` — remove `generateInviteCode`, `getInviteCode`; update placeholder methods for new slot_type/slot_label/slot_class fields
- `src/components/schedules/schedule-modal.tsx` — remove invite link section; update placeholder UI with slot type selector (class, DPS Físico, DPS Mágico, Artista) and new icons
- `src/lib/supabase/middleware.ts` — remove `/invite` from protected routes
- `src/components/auth/login-button.tsx` — may need adjustment for redirect from invite page
- `src/app/globals.css` — add slot color tokens (`--slot-dps-fisico`, `--slot-dps-magico`, `--slot-artista`, `--slot-classe`)
- `src/components/friends/friends-sidebar.tsx` — add "Gerar link de convite" button

### New files
- `supabase/migrations/013_friend_invites_and_placeholder_redesign.sql` — friend_invites table, new RPCs, alter schedule_placeholders, drop schedule_invites and old RPCs
- `src/hooks/use-friend-invite.ts` — new hook for friend invite page
- `src/lib/class-roles.ts` — slot type constants, Artista class list, slot type labels
- `src/components/ui/slot-type-icon.tsx` — duotone SVG icon component per slot type

### Docs (mark as superseded)
- `docs/superpowers/specs/2026-03-21-schedule-invite-links-design.md`
- `docs/superpowers/plans/2026-03-21-schedule-invite-links.md`

---

## Migration strategy

Single migration `013_friend_invites_and_placeholder_redesign.sql`:

**Part A — Friend invites:**
1. Create `friend_invites` table + RLS
2. Create `resolve_friend_invite`, `accept_friend_invite`, `create_friend_invite` RPCs

**Part B — Drop old invite system:**
3. Drop `accept_invite(TEXT, UUID)` function
4. Drop `resolve_invite(TEXT)` function
5. Drop `schedule_invites` table

**Part C — Placeholder redesign:**
6. Add new columns with defaults: `slot_type` (text DEFAULT 'class'), `slot_label` (text DEFAULT ''), `slot_class` (text nullable)
7. Migrate existing data: `UPDATE schedule_placeholders SET slot_type = 'class', slot_label = character_class, slot_class = character_class`
8. Make columns NOT NULL: `ALTER COLUMN slot_type SET NOT NULL`, `ALTER COLUMN slot_label SET NOT NULL`
9. Drop defaults: `ALTER COLUMN slot_type DROP DEFAULT`, `ALTER COLUMN slot_label DROP DEFAULT`
10. Drop old columns: `character_name`, `character_class`
11. Add CHECK constraint on `slot_type` IN ('class', 'dps_fisico', 'dps_magico', 'artista')
12. Create `claim_placeholder` RPC

Order matters: drop functions before tables (functions reference the tables). Placeholder alter runs last since it's independent. New columns are added with defaults first to handle existing rows safely.

---

## Out of scope

- Schedule sharing/joining via link (can be re-added later as separate feature)
- Invite expiration (could add later with `expires_at` column)
- Rate limiting invite generation (could add later)
- Additional role categories beyond DPS Físico/Mágico/Artista (e.g., Suporte, Tank — can add later by expanding the CHECK constraint and constants)
- Light theme values for slot color tokens (define during implementation)
