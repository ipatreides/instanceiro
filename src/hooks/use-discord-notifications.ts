"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface DiscordNotificationState {
  loading: boolean;
  discordUserId: string | null;
  hourlyEnabled: boolean;
  scheduleEnabled: boolean;
  discordUsername: string | null;
  isDiscordLogin: boolean;
}

export function useDiscordNotifications() {
  const [state, setState] = useState<DiscordNotificationState>({
    loading: true,
    discordUserId: null,
    hourlyEnabled: false,
    scheduleEnabled: false,
    discordUsername: null,
    isDiscordLogin: false,
  });

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      const provider = user.app_metadata?.provider;
      const isDiscordLogin = provider === "discord";
      const meta = user.user_metadata;
      const discordUsername = isDiscordLogin
        ? (meta?.full_name ?? meta?.name ?? null)
        : null;
      const discordIdFromAuth = isDiscordLogin
        ? (meta?.provider_id ?? null)
        : null;

      const { data: notif } = await supabase
        .from("discord_notifications")
        .select("discord_user_id, hourly_enabled, schedule_enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      setState({
        loading: false,
        discordUserId: notif?.discord_user_id ?? discordIdFromAuth,
        hourlyEnabled: notif?.hourly_enabled ?? false,
        scheduleEnabled: notif?.schedule_enabled ?? false,
        discordUsername: notif ? (discordUsername ?? "Discord") : discordUsername,
        isDiscordLogin,
      });
    });
  }, []);

  const toggleHourly = useCallback(async (enabled: boolean) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !state.discordUserId) return;

    if (enabled) {
      await supabase.from("discord_notifications").upsert({
        user_id: user.id,
        discord_user_id: state.discordUserId,
        hourly_enabled: true,
      });
    } else {
      await supabase
        .from("discord_notifications")
        .update({ hourly_enabled: false })
        .eq("user_id", user.id);
    }

    setState((s) => ({ ...s, hourlyEnabled: enabled }));
  }, [state.discordUserId]);

  const toggleSchedule = useCallback(async (enabled: boolean) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !state.discordUserId) return;

    if (enabled) {
      await supabase.from("discord_notifications").upsert({
        user_id: user.id,
        discord_user_id: state.discordUserId,
        schedule_enabled: true,
      });
    } else {
      await supabase
        .from("discord_notifications")
        .update({ schedule_enabled: false })
        .eq("user_id", user.id);
    }

    setState((s) => ({ ...s, scheduleEnabled: enabled }));
  }, [state.discordUserId]);

  const disconnect = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("discord_notifications")
      .delete()
      .eq("user_id", user.id);

    setState((s) => ({
      ...s,
      discordUserId: s.isDiscordLogin ? s.discordUserId : null,
      hourlyEnabled: false,
      scheduleEnabled: false,
      discordUsername: s.isDiscordLogin ? s.discordUsername : null,
    }));
  }, []);

  const sendTest = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch("/api/discord-notify-test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Erro ao enviar teste" };
    }
    return { ok: true };
  }, []);

  return { ...state, toggleHourly, toggleSchedule, disconnect, sendTest };
}
