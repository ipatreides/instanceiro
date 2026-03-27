import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DISCORD_API = "https://discord.com/api/v10";

async function sendChannelMessage(botToken: string, channelId: string, content: string): Promise<boolean> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  return res.ok;
}

function formatBrt(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!serviceRoleKey || !botToken) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  // Fetch pending alerts with related data
  const { data: alerts, error } = await supabase
    .from("mvp_alert_queue")
    .select("id, group_id, mvp_kill_id, alert_at, alert_type")
    .eq("sent", false)
    .lte("alert_at", new Date().toISOString())
    .limit(50);

  if (error) {
    console.error("Error fetching alerts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;

  for (const alert of alerts) {
    // Fetch kill + mvp + group data
    const { data: kill } = await supabase
      .from("mvp_kills")
      .select("killed_at, tomb_x, tomb_y, mvp_id")
      .eq("id", alert.mvp_kill_id)
      .single();

    if (!kill) continue;

    const { data: mvp } = await supabase
      .from("mvps")
      .select("name, map_name, respawn_ms, delay_ms")
      .eq("id", kill.mvp_id)
      .single();

    if (!mvp) continue;

    const { data: group } = await supabase
      .from("mvp_groups")
      .select("discord_channel_id, alert_minutes")
      .eq("id", alert.group_id)
      .single();

    if (!group?.discord_channel_id) continue;

    const killedAt = new Date(kill.killed_at);
    const spawnAt = new Date(killedAt.getTime() + mvp.respawn_ms);
    const spawnEnd = new Date(spawnAt.getTime() + mvp.delay_ms);

    let message: string;

    if (alert.alert_type === "pre_spawn") {
      const parts = [
        `🔴 **${mvp.name}** (${mvp.map_name})`,
        `⏰ Spawn em ${group.alert_minutes} minutos (${formatBrt(spawnAt)} ~ ${formatBrt(spawnEnd)} BRT)`,
      ];
      if (kill.tomb_x != null) parts.push(`📍 Tumba: ${kill.tomb_x}, ${kill.tomb_y}`);
      message = parts.join("\n");
    } else {
      const parts = [
        `🟢 **${mvp.name}** (${mvp.map_name}) pode ter nascido!`,
      ];
      if (kill.tomb_x != null) parts.push(`📍 Última tumba: ${kill.tomb_x}, ${kill.tomb_y}`);
      message = parts.join("\n");
    }

    const sent = await sendChannelMessage(botToken, group.discord_channel_id, message);

    if (sent) {
      await supabase
        .from("mvp_alert_queue")
        .update({ sent: true })
        .eq("id", alert.id);
      processed++;
    }
  }

  return NextResponse.json({ processed });
}
