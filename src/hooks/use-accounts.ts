"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Account, Server } from "@/lib/types";

interface UseAccountsReturn {
  accounts: Account[];
  servers: Server[];
  loading: boolean;
  createAccount: (name: string, serverId: number) => Promise<Account>;
  updateAccount: (id: string, data: { name?: string }) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  reorderAccounts: (orderedIds: string[]) => Promise<void>;
  reorderCharacters: (accountId: string, orderedCharIds: string[]) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching accounts:", error);
      return;
    }

    setAccounts(data ?? []);
  }, []);

  const fetchServers = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("servers")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching servers:", error);
      return;
    }

    setServers(data ?? []);
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchAccounts(), fetchServers()]);
    setLoading(false);
  }, [fetchAccounts, fetchServers]);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    Promise.all([fetchAccounts(), fetchServers()]).then(() => {
      if (!cancelled) setLoading(false);
    });

    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchAccounts(), 300);
    };

    // Subscribe to realtime changes on accounts (multi-tab sync)
    const supabase = createClient();
    const channel = supabase
      .channel("accounts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, debouncedFetch)
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchAccounts, fetchServers]);

  const createAccount = useCallback(
    async (name: string, serverId: number): Promise<Account> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Determine next sort_order
      const maxSortOrder = accounts.length > 0
        ? Math.max(...accounts.map((a) => a.sort_order))
        : -1;

      const { data: account, error } = await supabase
        .from("accounts")
        .insert({
          user_id: user.id,
          server_id: serverId,
          name,
          sort_order: maxSortOrder + 1,
        })
        .select()
        .single();

      if (error || !account) {
        throw error ?? new Error("Failed to create account");
      }

      setAccounts((prev) => [...prev, account]);
      return account;
    },
    [accounts]
  );

  const updateAccount = useCallback(
    async (id: string, data: { name?: string }): Promise<void> => {
      // Optimistic update
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                ...(data.name !== undefined && { name: data.name }),
              }
            : a
        )
      );

      const supabase = createClient();
      const updatePayload: Record<string, unknown> = {};
      if (data.name !== undefined) updatePayload.name = data.name;
      const { error } = await supabase
        .from("accounts")
        .update(updatePayload)
        .eq("id", id);

      if (error) {
        await fetchAccounts();
        throw error;
      }
    },
    [fetchAccounts]
  );

  const deleteAccount = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic update
      setAccounts((prev) => prev.filter((a) => a.id !== id));

      const supabase = createClient();
      const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id);

      if (error) {
        await fetchAccounts();
        throw error;
      }
    },
    [fetchAccounts]
  );

  const reorderAccounts = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      // Optimistic update
      setAccounts((prev) => {
        const accountMap = new Map(prev.map((a) => [a.id, a]));
        return orderedIds
          .map((id, index) => {
            const account = accountMap.get(id);
            return account ? { ...account, sort_order: index } : null;
          })
          .filter((a): a is Account => a !== null);
      });

      const supabase = createClient();
      const updates = orderedIds.map((id, index) =>
        supabase
          .from("accounts")
          .update({ sort_order: index })
          .eq("id", id)
      );

      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        await fetchAccounts();
        throw failed.error;
      }
    },
    [fetchAccounts]
  );

  const reorderCharacters = useCallback(
    async (accountId: string, orderedCharIds: string[]): Promise<void> => {
      void accountId; // accountId context kept for caller semantics

      const supabase = createClient();
      const updates = orderedCharIds.map((id, index) =>
        supabase
          .from("characters")
          .update({ sort_order: index })
          .eq("id", id)
      );

      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        throw failed.error;
      }
    },
    []
  );

  return {
    accounts,
    servers,
    loading,
    createAccount,
    updateAccount,
    deleteAccount,
    reorderAccounts,
    reorderCharacters,
    refetch,
  };
}
