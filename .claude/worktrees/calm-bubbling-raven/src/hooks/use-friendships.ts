"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Friendship } from "@/lib/types";

export interface SuggestedUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface UseFriendshipsReturn {
  friends: Friendship[];
  pendingReceived: Friendship[];
  pendingSent: Friendship[];
  suggestions: SuggestedUser[];
  loading: boolean;
  sendRequest: (username: string) => Promise<{ error?: string }>;
  acceptRequest: (id: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
  removeFriend: (id: string) => Promise<void>;
}

export function useFriendships(): UseFriendshipsReturn {
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, created_at")
      .order("created_at", { ascending: false });

    if (!data) return;

    // For each friendship, fetch the OTHER user's profile
    const otherIds = data.map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    const uniqueIds = [...new Set(otherIds)];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", uniqueIds);

    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; username: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
    );

    const enriched: Friendship[] = data.map((f) => {
      const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      const profile = profileMap.get(otherId);
      return {
        ...f,
        other_user_id: otherId,
        username: profile?.username ?? "???",
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      };
    });

    setFriendships(enriched);

    // Fetch suggestions: all users with username, excluding self and anyone in friendships
    const relatedIds = new Set([user.id, ...uniqueIds]);
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .not("username", "is", null)
      .eq("is_test_user", false);

    const suggestedUsers = (allProfiles ?? [])
      .filter((p) => !relatedIds.has(p.id) && p.username)
      .map((p) => ({
        id: p.id,
        username: p.username!,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      }));

    setSuggestions(suggestedUsers);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(() => { if (!cancelled) setLoading(false); });

    // Subscribe to realtime changes on friendships
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchAll(), 5000);
    };

    const supabase = createClient();
    const channel = supabase
      .channel("friendships-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        debouncedFetch
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const friends = friendships.filter((f) => f.status === "accepted");
  const pendingReceived = friendships.filter((f) => f.status === "pending" && f.addressee_id === userId);
  const pendingSent = friendships.filter((f) => f.status === "pending" && f.requester_id === userId);

  const sendRequest = useCallback(async (username: string): Promise<{ error?: string }> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Não autenticado" };

    // Lookup user by username
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (!profile) return { error: "Usuário não encontrado" };
    if (profile.id === user.id) return { error: "Não pode adicionar a si mesmo" };

    // Check if friendship already exists (either direction)
    const existing = friendships.find(
      (f) =>
        (f.requester_id === user.id && f.addressee_id === profile.id) ||
        (f.requester_id === profile.id && f.addressee_id === user.id)
    );
    if (existing) {
      if (existing.status === "accepted") return { error: "Já são amigos" };
      return { error: "Pedido já enviado" };
    }

    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: profile.id });

    if (error) return { error: "Erro ao enviar pedido" };

    await fetchAll();
    return {};
  }, [friendships, fetchAll]);

  const acceptRequest = useCallback(async (id: string) => {
    const supabase = createClient();
    await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", id);
    await fetchAll();
  }, [fetchAll]);

  const rejectRequest = useCallback(async (id: string) => {
    const supabase = createClient();
    await supabase.from("friendships").delete().eq("id", id);
    setFriendships((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const removeFriend = useCallback(async (id: string) => {
    const supabase = createClient();
    await supabase.from("friendships").delete().eq("id", id);
    setFriendships((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return {
    friends,
    pendingReceived,
    pendingSent,
    suggestions,
    loading,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
  };
}
