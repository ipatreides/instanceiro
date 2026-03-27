import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";

// In-memory cache: guild_id -> { channels, fetchedAt }
const channelCache = new Map<string, { channels: { id: string; name: string }[]; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's bot_guild_id
  const { data: notif } = await supabase
    .from("discord_notifications")
    .select("bot_guild_id")
    .eq("user_id", user.id)
    .single();

  if (!notif?.bot_guild_id) {
    return NextResponse.json({ error: "no_guild" }, { status: 400 });
  }

  const guildId = notif.bot_guild_id;

  // Check cache
  const cached = channelCache.get(guildId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.channels);
  }

  // Fetch from Discord
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      return NextResponse.json({ error: "bot_not_in_guild" }, { status: 404 });
    }
    return NextResponse.json({ error: "Discord API error" }, { status: 502 });
  }

  const allChannels = await res.json();

  // Filter to text channels only (type 0)
  const textChannels = allChannels
    .filter((c: { type: number }) => c.type === 0)
    .map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

  // Cache
  channelCache.set(guildId, { channels: textChannels, fetchedAt: Date.now() });

  return NextResponse.json(textChannels);
}
