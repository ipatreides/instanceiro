"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InviteData } from "@/lib/types";

interface UseInviteReturn {
  data: InviteData | null;
  loading: boolean;
  error: string | null;
  acceptInvite: (characterId: string) => Promise<"joined" | "friendship_only" | "already_joined" | "full" | "error">;
  acceptInviteWithNewChar: (charData: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => Promise<"joined" | "friendship_only" | "already_joined" | "full" | "error">;
  createFriendshipOnly: () => Promise<"friendship_only" | "error">;
}

export function useInvite(code: string): UseInviteReturn {
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: result, error: rpcError } = await supabase.rpc("resolve_invite", {
        invite_code: code,
      });

      if (rpcError) {
        setError("Erro ao carregar convite");
        setLoading(false);
        return;
      }

      const parsed = result as InviteData & { error?: string };
      if (parsed.error === "invite_not_found") {
        setError("Convite não encontrado");
        setLoading(false);
        return;
      }

      setData(parsed);
      setLoading(false);
    };

    load();
  }, [code]);

  const acceptInvite = useCallback(async (characterId: string) => {
    const supabase = createClient();
    const { data: result, error: rpcError } = await supabase.rpc("accept_invite", {
      invite_code: code,
      p_character_id: characterId,
    });

    if (rpcError) return "error" as const;
    return (result as { status: string }).status as "joined" | "friendship_only" | "already_joined" | "full" | "error";
  }, [code]);

  const acceptInviteWithNewChar = useCallback(async (charData: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "error" as const;

    // Create character first
    const { data: newChar, error: charError } = await supabase
      .from("characters")
      .insert({
        user_id: user.id,
        name: charData.name,
        class: charData.class_name,
        class_path: charData.class_path,
        level: charData.level,
      })
      .select("id")
      .single();

    if (charError || !newChar) return "error" as const;

    // Then accept invite
    return acceptInvite(newChar.id);
  }, [acceptInvite]);

  const createFriendshipOnly = useCallback(async () => {
    const supabase = createClient();
    const { data: result, error: rpcError } = await supabase.rpc("accept_invite", {
      invite_code: code,
    });

    if (rpcError) return "error" as const;
    return (result as { status: string }).status as "friendship_only" | "error";
  }, [code]);

  return { data, loading, error, acceptInvite, acceptInviteWithNewChar, createFriendshipOnly };
}
