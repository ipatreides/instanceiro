import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateMapWithTomb } from "@/lib/map-image";

const DISCORD_API = "https://discord.com/api/v10";

async function sendChannelMessage(
  botToken: string,
  channelId: string,
  content: string,
  embed?: { title: string; description: string; color: number },
  imageBuffer?: Buffer
): Promise<boolean> {
  const url = `${DISCORD_API}/channels/${channelId}/messages`;
  const headers: Record<string, string> = {
    Authorization: `Bot ${botToken}`,
  };

  // If we have an image, send as multipart/form-data with embed
  if (imageBuffer && embed) {
    const boundary = `----formdata-${Date.now()}`;
    headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;

    const payloadJson = JSON.stringify({
      content,
      embeds: [
        {
          title: embed.title,
          description: embed.description,
          image: { url: "attachment://map.png" },
          color: embed.color,
        },
      ],
      allowed_mentions: { parse: ["everyone"] },
    });

    const parts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="payload_json"\r\n`,
      `Content-Type: application/json\r\n\r\n`,
      payloadJson,
      `\r\n--${boundary}\r\n`,
      `Content-Disposition: form-data; name="files[0]"; filename="map.png"\r\n`,
      `Content-Type: image/png\r\n\r\n`,
    ];
    const closing = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(parts.join(""), "utf8"),
      imageBuffer,
      Buffer.from(closing, "utf8"),
    ]);

    const res = await fetch(url, { method: "POST", headers, body });
    return res.ok;
  }

  // No image — send JSON content-only (current behavior)
  headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, allowed_mentions: { parse: ["everyone"] } }),
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

  // Batch fetch all related data
  const killIds = [...new Set(alerts.map((a) => a.mvp_kill_id))];
  const groupIds = [...new Set(alerts.map((a) => a.group_id))];

  const [killsRes, groupsRes] = await Promise.all([
    supabase.from("mvp_kills").select("id, killed_at, tomb_x, tomb_y, mvp_id").in("id", killIds),
    supabase.from("mvp_groups").select("id, created_by").in("id", groupIds),
  ]);

  const killMap = new Map((killsRes.data ?? []).map((k: Record<string, unknown>) => [k.id as string, k]));
  const groupMap = new Map((groupsRes.data ?? []).map((g: Record<string, unknown>) => [g.id as string, g]));

  // Fetch Discord configs for group owners
  const ownerIds = [...new Set((groupsRes.data ?? []).map((g: Record<string, unknown>) => g.created_by as string))];
  const { data: discordConfigs } = await supabase
    .from("discord_notifications")
    .select("user_id, bot_channel_id, alert_minutes")
    .in("user_id", ownerIds);
  const discordMap = new Map((discordConfigs ?? []).map((d: Record<string, unknown>) => [d.user_id as string, d]));

  // Fetch MVPs for all kills
  const mvpIds = [...new Set((killsRes.data ?? []).map((k: Record<string, unknown>) => k.mvp_id as number))];
  const { data: mvpsData } = await supabase.from("mvps").select("id, name, map_name, respawn_ms, delay_ms").in("id", mvpIds);
  const mvpMap = new Map((mvpsData ?? []).map((m: Record<string, unknown>) => [m.id as number, m]));

  // Fetch map metadata for coordinate conversion
  const mapNames = [...new Set((mvpsData ?? []).map((m: Record<string, unknown>) => m.map_name as string))];
  const { data: mapMetaData } = await supabase
    .from("mvp_map_meta")
    .select("map_name, width, height")
    .in("map_name", mapNames);
  const mapMetaMap = new Map(
    (mapMetaData ?? []).map((m: Record<string, unknown>) => [
      m.map_name as string,
      { width: m.width as number, height: m.height as number },
    ])
  );

  // Collect sent alert IDs for batch update
  const sentIds: string[] = [];

  for (const alert of alerts) {
    const kill = killMap.get(alert.mvp_kill_id) as Record<string, unknown> | undefined;
    if (!kill) continue;

    const mvp = mvpMap.get(kill.mvp_id as number) as { name: string; map_name: string; respawn_ms: number; delay_ms: number } | undefined;
    if (!mvp) continue;

    const group = groupMap.get(alert.group_id) as { created_by: string } | undefined;
    if (!group) continue;
    const discordConfig = discordMap.get(group.created_by) as { bot_channel_id: string | null; alert_minutes: number } | undefined;
    if (!discordConfig?.bot_channel_id) continue;

    const killedAt = new Date(kill.killed_at as string);
    const spawnAt = new Date(killedAt.getTime() + mvp.respawn_ms);
    const spawnEnd = new Date(spawnAt.getTime() + mvp.delay_ms);

    let content: string;
    let embed: { title: string; description: string; color: number } | undefined;
    let imageBuffer: Buffer | undefined;

    if (alert.alert_type === "pre_spawn") {
      const parts = [
        `@everyone`,
        `🔴 **${mvp.name}** (${mvp.map_name})`,
        `⏰ Spawn em ${discordConfig.alert_minutes} minutos (${formatBrt(spawnAt)} ~ ${formatBrt(spawnEnd)} BRT)`,
      ];
      if (kill.tomb_x != null) parts.push(`📍 Tumba: ${kill.tomb_x}, ${kill.tomb_y}`);
      content = parts.join("\n");

      // Build embed + image when tomb coords exist
      const mapMeta = mapMetaMap.get(mvp.map_name);
      if (kill.tomb_x != null && kill.tomb_y != null && mapMeta) {
        embed = {
          title: `🔴 ${mvp.name} (${mvp.map_name})`,
          description: `⏰ Spawn em ${discordConfig.alert_minutes} minutos (${formatBrt(spawnAt)} ~ ${formatBrt(spawnEnd)} BRT)\n📍 Tumba: ${kill.tomb_x}, ${kill.tomb_y}`,
          color: 12350259, // 0xB87333 copper
        };
        try {
          imageBuffer = await generateMapWithTomb(mvp.map_name, kill.tomb_x as number, kill.tomb_y as number, mapMeta.width, mapMeta.height);
        } catch (e) {
          console.warn(`Failed to generate map image for ${mvp.map_name}:`, e);
        }
      }
    } else {
      const parts = [
        `@everyone`,
        `🟢 **${mvp.name}** (${mvp.map_name}) pode ter nascido!`,
      ];
      if (kill.tomb_x != null) parts.push(`📍 Última tumba: ${kill.tomb_x}, ${kill.tomb_y}`);
      content = parts.join("\n");

      const mapMeta = mapMetaMap.get(mvp.map_name);
      if (kill.tomb_x != null && kill.tomb_y != null && mapMeta) {
        embed = {
          title: `🟢 ${mvp.name} (${mvp.map_name}) pode ter nascido!`,
          description: `📍 Última tumba: ${kill.tomb_x}, ${kill.tomb_y}`,
          color: 12350259,
        };
        try {
          imageBuffer = await generateMapWithTomb(mvp.map_name, kill.tomb_x as number, kill.tomb_y as number, mapMeta.width, mapMeta.height);
        } catch (e) {
          console.warn(`Failed to generate map image for ${mvp.map_name}:`, e);
        }
      }
    }

    const sent = await sendChannelMessage(botToken, discordConfig.bot_channel_id, content, embed, imageBuffer);
    if (sent) {
      sentIds.push(alert.id);
      processed++;
    }
  }

  // Batch update sent alerts
  if (sentIds.length > 0) {
    await supabase.from("mvp_alert_queue").update({ sent: true }).in("id", sentIds);
  }

  return NextResponse.json({ processed });
}
