# Friends System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friend request system with sidebar on dashboard showing friends list, pending requests, and add friend input.

**Architecture:** New `friendships` table with RLS. `useFriendships` hook for all CRUD. `FriendsSidebar` component always visible on desktop, drawer on mobile. Dashboard layout split into main content + sidebar.

**Tech Stack:** Supabase (Postgres), Next.js, React, TypeScript, Tailwind CSS

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/008_friendships.sql`

- [ ] **Step 1: Write migration**

```sql
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id)
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Both sides can see their friendships
CREATE POLICY "Users can view own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Requester can send requests
CREATE POLICY "Users can send friend requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Addressee can accept (update status)
CREATE POLICY "Addressee can accept requests"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id);

-- Both sides can delete (remove/reject/cancel)
CREATE POLICY "Users can remove friendships"
  ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
```

- [ ] **Step 2: Run migration**

Run: `cd D:/rag/instance-tracker && npx supabase db query --linked -f supabase/migrations/008_friendships.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_friendships.sql
git commit -m "feat: add friendships table with RLS"
```

---

### Task 2: Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add Friendship interface**

```ts
export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  // Joined fields
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Friendship type"
```

---

### Task 3: useFriendships hook

**Files:**
- Create: `src/hooks/use-friendships.ts`

- [ ] **Step 1: Create hook**

Fetch all friendships for the current user. Separate into:
- `friends`: accepted, with the OTHER user's profile data
- `pendingReceived`: pending where addressee = me
- `pendingSent`: pending where requester = me

Actions:
- `sendRequest(username)`: lookup profile by username, insert friendship
- `acceptRequest(id)`: update status to 'accepted'
- `rejectRequest(id)`: delete the friendship
- `removeFriend(id)`: delete the friendship

Use SECURITY DEFINER function `get_friendship_profiles()` to fetch friendships with joined profile data (avoids RLS issues with cross-user profile lookups — profiles SELECT is already public).

Actually, since profiles SELECT policy is "Anyone can read profiles", we can join directly without a special function.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-friendships.ts
git commit -m "feat: add useFriendships hook"
```

---

### Task 4: FriendsSidebar component

**Files:**
- Create: `src/components/friends/friends-sidebar.tsx`

- [ ] **Step 1: Create component**

Sidebar with three sections:
1. **Pedidos pendentes** (if any): avatar + @username + Accept/Reject buttons
2. **Amigos**: avatar + @username, remove button on hover
3. **Adicionar**: input `@username` + send button at bottom

Styled with the purple theme. Loading/error states.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/friends/friends-sidebar.tsx
git commit -m "feat: add FriendsSidebar component"
```

---

### Task 5: Dashboard layout with sidebar

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Update layout**

Changes:
- Add `showFriends` state for mobile drawer toggle
- Add a friends button in the header (mobile only) to toggle drawer
- Wrap main content area in flex container:
  - Left: existing main content (flex-1)
  - Right: FriendsSidebar (hidden on mobile unless drawer open, visible on lg+)
- Adjust max-width handling for the new layout

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add friends sidebar to dashboard layout"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run tests**

Run: `npm test`

- [ ] **Step 2: Full build**

Run: `npm run build`

- [ ] **Step 3: Manual test**

1. User A sends friend request to @userB
2. User B sees pending request in sidebar, accepts
3. Both users see each other in friends list
4. User A removes friend — disappears from both
