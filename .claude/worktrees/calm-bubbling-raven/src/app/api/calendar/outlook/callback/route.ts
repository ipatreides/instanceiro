import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("calendar_oauth_state")?.value;
  cookieStore.delete("calendar_oauth_state");

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/profile?calendar=error`);
  }

  try {
    const tokenRes = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID!,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/calendar/outlook/callback`,
        scope: "Calendars.ReadWrite offline_access",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${origin}/profile?calendar=error`);
    }

    const tokens = await tokenRes.json();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/profile?calendar=error`);
    }

    const encryptedAccess = await encrypt(tokens.access_token);
    const encryptedRefresh = await encrypt(tokens.refresh_token);
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    await supabase.from("calendar_connections").upsert({
      user_id: user.id,
      provider: "outlook",
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: expiresAt,
      enabled: true,
      last_sync_error: null,
    }, { onConflict: "user_id,provider" });

    return NextResponse.redirect(`${origin}/profile?calendar=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/profile?calendar=error`);
  }
}
