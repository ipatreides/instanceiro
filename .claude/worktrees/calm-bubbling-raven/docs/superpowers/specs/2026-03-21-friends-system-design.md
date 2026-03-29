# Friends System

## Goal

Allow users to send friend requests via @username. Friendships are mutual (require acceptance). Friends list shown in a sidebar on the dashboard. Prepares for future instance scheduling/group features.

## Schema

New table `friendships`:

```sql
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id)
);
```

RLS:
- Both sides can SELECT their friendships
- Requester can INSERT (send request) and DELETE (cancel/remove)
- Addressee can UPDATE status (accept) and DELETE (reject/remove)

## Sidebar

Right sidebar on dashboard:
- **Desktop (lg+):** always visible, ~260px wide, fixed on right
- **Mobile/tablet:** drawer that opens with a button (floating or in header)

Contents:
1. **Pedidos pendentes** — shown if any, with Accept/Reject buttons
2. **Amigos** — list with avatar, @username, remove button on hover
3. **Adicionar amigo** — input `@username` at bottom with send button

## Dashboard Layout Change

Main content area becomes `flex` with content on the left and sidebar on the right. On desktop, sidebar is always visible. Main content max-width adjusts.

## Hook

`useFriendships()` returns:
- `friends`: accepted friendships with username/avatar
- `pendingReceived`: pending requests where current user is addressee
- `pendingSent`: pending requests where current user is requester
- `sendRequest(username)`: send friend request
- `acceptRequest(friendshipId)`: accept pending
- `rejectRequest(friendshipId)`: reject/delete pending
- `removeFriend(friendshipId)`: remove accepted friendship

## Files

- Migration: `supabase/migrations/008_friendships.sql`
- Types: `src/lib/types.ts` — add Friendship interface
- Hook: `src/hooks/use-friendships.ts`
- Component: `src/components/friends/friends-sidebar.tsx`
- Modify: `src/app/dashboard/page.tsx` — add sidebar to layout
