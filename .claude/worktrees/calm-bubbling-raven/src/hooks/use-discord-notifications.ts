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
  botGuildId: string | null;
  botChannelId: string | null;
  alertMinutes: number;
}

export function useDiscordNotifications() {
  const [state, setState] = useState<DiscordNotificationState>({
    loading: true,
    discordUserId: null,
    hourlyEnabled: false,
    scheduleEnabled: false,
    discordUsername: null,
    isDiscordLogin: false,
    botGuildId: null,
    botChannelId: null,
    alertMinutes: 5,
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
        .select("discord_user_id, hourly_enabled, schedule_enabled, bot_guild_id, bot_channel_id, alert_minutes")
        .eq("user_id", user.id)
        .maybeSingle();

      setState({
        loading: false,
        discordUserId: notif?.discord_user_id ?? discordIdFromAuth,
        hourlyEnabled: notif?.hourly_enabled ?? false,
        scheduleEnabled: notif?.schedule_enabled ?? false,
        discordUsername: notif ? (discordUsername ?? "Discord") : discordUsername,
        isDiscordLogin,
        botGuildId: notif?.bot_guild_id ?? null,
        botChannelId: notif?.bot_channel_id ?? null,
        alertMinutes: notif?.alert_minutes ?? 5,
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
      botGuildId: null,
      botChannelId: null,
      alertMinutes: 5,
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

  const setBotChannel = useCallback(async (channelId: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("discord_notifications").update({ bot_channel_id: channelId }).eq("user_id", user.id);
    setState((s) => ({ ...s, botChannelId: channelId }));
  }, []);

  const setAlertMinutes = useCallback(async (mins: number) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("discord_notifications").update({ alert_minutes: mins }).eq("user_id", user.id);
    setState((s) => ({ ...s, alertMinutes: mins }));
  }, []);

  const fetchChannels = useCallback(async (): Promise<{ id: string; name: string }[] | { error: string }> => {
    const res = await fetch("/api/discord-channels");
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Erro ao buscar canais" };
    return data;
  }, []);

  const getBotOAuthURL = useCallback((): string => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "";
    const oauthState = crypto.randomUUID();
    document.cookie = `discord_bot_oauth_state=${oauthState}; path=/; max-age=600; SameSite=Lax`;
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/discord-bot-callback`);
    return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=3072&scope=bot%20identify&redirect_uri=${redirectUri}&response_type=code&state=${oauthState}`;
  }, []);

  return {
    ...state,
    toggleHourly, toggleSchedule, disconnect, sendTest,
    setBotChannel, setAlertMinutes, fetchChannels, getBotOAuthURL,
  };
}
