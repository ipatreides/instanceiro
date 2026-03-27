"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/types";

interface UseNotificationsReturn {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  respondToPartyConfirm: (notificationId: string, accepted: boolean) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, user_id, type, payload, is_read, responded, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) {
      setNotifications([]);
      return;
    }

    // Filter out expired unresponded notifications
    const now = new Date().toISOString();
    const filtered = data.filter(
      (n: AppNotification) => n.responded || n.expires_at > now
    );

    setNotifications(filtered);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    const supabase = createClient();

    // Get user ID to scope the realtime filter
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;

      fetchNotifications().then(() => {
        if (!cancelled) setLoading(false);
      });

      const debouncedFetch = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchNotifications(), 5000);
      };

      const filterOpts: { event: "*"; schema: "public"; table: "notifications"; filter?: string } = {
        event: "*",
        schema: "public",
        table: "notifications",
      };
      if (user) {
        filterOpts.filter = `user_id=eq.${user.id}`;
      }

      channelRef = supabase
        .channel("notifications-changes")
        .on("postgres_changes", filterOpts, debouncedFetch)
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [fetchNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read && !n.responded).length,
    [notifications]
  );

  const respondToPartyConfirm = useCallback(async (notificationId: string, accepted: boolean) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, responded: true } : n))
    );

    const supabase = createClient();
    const { error } = await supabase.rpc("respond_party_notification", {
      p_notification_id: notificationId,
      p_accepted: accepted,
    });

    if (error) {
      // Revert optimistic update on failure
      await fetchNotifications();
      throw error;
    }
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) {
      // Revert optimistic update on failure
      await fetchNotifications();
      throw error;
    }
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    respondToPartyConfirm,
    markAsRead,
  };
}
