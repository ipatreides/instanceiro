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
