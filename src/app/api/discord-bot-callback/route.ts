import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";

const DISCORD_API = "https://discord.com/api/v10";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const guildId = searchParams.get("guild_id");
  const state = searchParams.get("state");

  // CSRF validation
  const cookieStore = await cookies();
  const storedState = cookieStore.get("discord_bot_oauth_state")?.value;
  cookieStore.delete("discord_bot_oauth_state");

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/profile?bot=error`);
  }

  try {
    // Exchange code for token (validates the OAuth flow)
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/discord-bot-callback`,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${origin}/profile?bot=error`);
    }

    const tokenData = await tokenRes.json();

    // guild_id comes from query params or token response
    const resolvedGuildId = guildId || tokenData.guild?.id;
    if (!resolvedGuildId) {
      return NextResponse.redirect(`${origin}/profile?bot=error`);
    }

    // Save to database
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${origin}/profile?bot=error`);
    }

    await supabase
      .from("discord_notifications")
      .update({ bot_guild_id: resolvedGuildId })
      .eq("user_id", user.id);

    return NextResponse.redirect(`${origin}/profile?bot=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/profile?bot=error`);
  }
}
