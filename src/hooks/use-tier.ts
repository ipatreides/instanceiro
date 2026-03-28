"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tier } from "@/lib/types";

interface TierContextValue {
  tier: Tier;
  loading: boolean;
  isPremium: boolean;
  isFounder: boolean;
  refreshTier: () => Promise<void>;
}

const TierContext = createContext<TierContextValue>({
  tier: "free",
  loading: true,
  isPremium: false,
  isFounder: false,
  refreshTier: async () => {},
});

export function useTier() {
  return useContext(TierContext);
}

export { TierContext };

export function useTierProvider(userId: string | null): TierContextValue {
  const [tier, setTier] = useState<Tier>("free");
  const [loading, setLoading] = useState(true);

  const fetchTier = useCallback(async () => {
    if (!userId) {
      setTier("free");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("tier")
      .eq("id", userId)
      .single();

    if (data?.tier) {
      setTier(data.tier as Tier);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchTier();
  }, [fetchTier]);

  // Realtime subscription on profiles.tier
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`tier:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const newTier = payload.new.tier as Tier;
          if (newTier && newTier !== tier) {
            setTier(newTier);
            // Refresh JWT to sync RLS
            supabase.auth.refreshSession();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, tier]);

  return {
    tier,
    loading,
    isPremium: tier === "premium" || tier === "legacy_premium",
    isFounder: tier === "legacy_premium",
    refreshTier: fetchTier,
  };
}
