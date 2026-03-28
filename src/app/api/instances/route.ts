import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 3600; // ISR: revalidate every hour

export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("instances")
    .select("id, name, level_required, party_min, cooldown_type, cooldown_hours, available_day, difficulty, reward, mutual_exclusion_group, level_max, wiki_url, start_map, liga_tier, liga_coins, is_solo, aliases")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
