import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Rate limit: 10 per minute per IP
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`mvp-kills:${ip}`, 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { mvp_id, killed_at, server_id } = (await request.json()) as {
    mvp_id: number;
    killed_at: string;
    server_id: number;
  };

  // Validate input
  if (!mvp_id || !killed_at || !server_id) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const killedAtDate = new Date(killed_at);
  if (isNaN(killedAtDate.getTime()) || killedAtDate.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: "invalid_killed_at" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Validate mvp_id exists for this server
  const { data: mvp } = await admin
    .from("mvps")
    .select("id")
    .eq("id", mvp_id)
    .eq("server_id", server_id)
    .single();

  if (!mvp) {
    return NextResponse.json({ error: "invalid_mvp" }, { status: 400 });
  }

  // Check if authenticated (optional)
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not authenticated — that's fine
  }

  // Insert unverified kill
  const { error } = await admin.from("mvp_kills").insert({
    mvp_id,
    killed_at: killedAtDate.toISOString(),
    verified: false,
    group_id: null,
    registered_by: null,
    killer_character_id: null,
  });

  if (error) {
    console.error("Error inserting MVP kill:", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return new NextResponse(null, { status: 201 });
}
