"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Friendship } from "@/lib/types";

interface UseFriendshipsReturn {
  friends: Friendship[];
  pendingReceived: Friendship[];
  pendingSent: Friendship[];
  loading: boolean;
  sendRequest: (username: string) => Promise<{ error?: string }>;
  acceptRequest: (id: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
  removeFriend: (id: string) => Promise<void>;
}

export function useFriendships(): UseFriendshipsReturn {
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data } = await supabase
      .from("friendships")
      .select("*")
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
        username: profile?.username ?? "???",
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      };
    });

    setFriendships(enriched);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
    loading,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
  };
}
