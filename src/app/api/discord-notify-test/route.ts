import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";

async function sendDiscordDM(botToken: string, discordUserId: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    return { ok: false, error: "Nao foi possivel criar canal DM. Verifique se voce esta no servidor do Instanceiro." };
  }

  const channel = await channelRes.json();

  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!msgRes.ok) {
    return { ok: false, error: "Nao foi possivel enviar DM. Verifique se as DMs estao ativadas para o servidor." };
  }

  return { ok: true };
}

export async function POST() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot nao configurado" }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { data: notif } = await supabase
    .from("discord_notifications")
    .select("discord_user_id")
    .eq("user_id", user.id)
    .single();

  if (!notif) {
    return NextResponse.json({ error: "Discord nao conectado" }, { status: 400 });
  }

  const result = await sendDiscordDM(
    botToken,
    notif.discord_user_id,
    "Teste do Instanceiro! Se voce recebeu esta mensagem, as notificacoes estao funcionando."
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
