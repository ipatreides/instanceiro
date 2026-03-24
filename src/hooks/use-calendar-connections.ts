"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface CalendarConnection {
  provider: "google" | "outlook";
  enabled: boolean;
  lastSyncError: string | null;
}

interface UseCalendarConnectionsReturn {
  loading: boolean;
  connections: CalendarConnection[];
  isGoogleLogin: boolean;
  toggle: (provider: "google" | "outlook", enabled: boolean) => Promise<void>;
  disconnect: (provider: "google" | "outlook") => Promise<void>;
}

export function useCalendarConnections(): UseCalendarConnectionsReturn {
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGoogleLogin, setIsGoogleLogin] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }

      setIsGoogleLogin(user.app_metadata?.provider === "google");

      const { data } = await supabase
        .from("calendar_connections")
        .select("provider, enabled, last_sync_error")
        .eq("user_id", user.id);

      setConnections(
        (data ?? []).map((c) => ({
          provider: c.provider as "google" | "outlook",
          enabled: c.enabled,
          lastSyncError: c.last_sync_error,
        }))
      );
      setLoading(false);
    });
  }, []);

  const toggle = useCallback(async (provider: "google" | "outlook", enabled: boolean) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("calendar_connections")
      .update({ enabled })
      .eq("user_id", user.id)
      .eq("provider", provider);

    setConnections((prev) =>
      prev.map((c) => c.provider === provider ? { ...c, enabled } : c)
    );
  }, []);

  const disconnect = useCallback(async (provider: "google" | "outlook") => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("calendar_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", provider);

    setConnections((prev) => prev.filter((c) => c.provider !== provider));
  }, []);

  return { loading, connections, isGoogleLogin, toggle, disconnect };
}
