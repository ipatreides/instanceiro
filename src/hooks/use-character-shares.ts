"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface ShareEntry {
  shared_with_user_id: string;
  username: string;
  created_at: string;
}

interface UseCharacterSharesReturn {
  shares: ShareEntry[];
  loading: boolean;
  addShare: (username: string) => Promise<{ error?: string }>;
  removeShare: (userId: string) => Promise<void>;
}

export function useCharacterShares(characterId: string | null): UseCharacterSharesReturn {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchShares = useCallback(async () => {
    if (!characterId) {
      setShares([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("character_shares")
      .select("shared_with_user_id, created_at, profiles!character_shares_shared_with_user_id_fkey(username)")
      .eq("character_id", characterId);

    if (data) {
      setShares(
        data.map((d: Record<string, unknown>) => {
          const profiles = d.profiles as { username: string } | null;
          return {
            shared_with_user_id: d.shared_with_user_id as string,
            username: profiles?.username ?? "???",
            created_at: d.created_at as string,
          };
        })
      );
    }
    setLoading(false);
  }, [characterId]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const addShare = useCallback(
    async (username: string): Promise<{ error?: string }> => {
      if (!characterId) return { error: "Sem personagem" };
      const supabase = createClient();

      // Lookup user by username
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (!profile) return { error: "Usuário não encontrado" };

      // Check not self
      const { data: { user } } = await supabase.auth.getUser();
      if (profile.id === user?.id) return { error: "Não pode compartilhar consigo mesmo" };

      // Check not already shared
      if (shares.some((s) => s.shared_with_user_id === profile.id)) {
        return { error: "Já compartilhado com este usuário" };
      }

      const { error } = await supabase
        .from("character_shares")
        .insert({ character_id: characterId, shared_with_user_id: profile.id });

      if (error) return { error: "Erro ao compartilhar" };

      await fetchShares();
      return {};
    },
    [characterId, shares, fetchShares]
  );

  const removeShare = useCallback(
    async (userId: string) => {
      if (!characterId) return;
      const supabase = createClient();

      await supabase
        .from("character_shares")
        .delete()
        .eq("character_id", characterId)
        .eq("shared_with_user_id", userId);

      setShares((prev) => prev.filter((s) => s.shared_with_user_id !== userId));
    },
    [characterId]
  );

  return { shares, loading, addShare, removeShare };
}
