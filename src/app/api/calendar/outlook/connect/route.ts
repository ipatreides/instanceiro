import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("calendar_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID!,
    redirect_uri: `${origin}/api/calendar/outlook/callback`,
    response_type: "code",
    scope: "Calendars.ReadWrite offline_access",
    state,
  });

  return NextResponse.redirect(`${MS_AUTH_URL}?${params}`);
}
