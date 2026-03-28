import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Rate limit: 5 per minute per IP
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`gift:${ip}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = (await request.json()) as { code: string };
  if (!code || typeof code !== "string" || code.length > 20) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("redeem_gift_code", {
    p_code: code.toUpperCase().trim(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: 400 });
  }

  // Sync JWT claim
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  if (profile) {
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { tier: profile.tier },
    });
  }

  return NextResponse.json(data);
}
