import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const redirect = searchParams.get("redirect");
      const target = redirect && redirect.startsWith("/invite/") ? redirect : "/dashboard";
      return NextResponse.redirect(`${origin}${target}`);
    }

    // PKCE code_verifier missing (e.g. Discord mobile opens in different browser)
    // Redirect to a client-side page that retries the exchange in the browser context
    const redirect = searchParams.get("redirect") ?? "";
    return NextResponse.redirect(
      `${origin}/auth/callback-client?code=${encodeURIComponent(code)}&redirect=${encodeURIComponent(redirect)}`
    );
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
