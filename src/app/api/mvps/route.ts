import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get("server_id");

  const admin = createAdminClient();

  let query = admin
    .from("mvps")
    .select("id, server_id, monster_id, name, map_name, respawn_ms, delay_ms, level, hp")
    .order("name");

  if (serverId) {
    query = query.eq("server_id", parseInt(serverId, 10));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
