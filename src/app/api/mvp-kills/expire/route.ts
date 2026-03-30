import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = createAdminClient()

  const { data: expireCount, error: expireErr } = await supabase.rpc('expire_unvalidated_kills')

  // Clean old event log entries (7-day retention)
  await supabase.rpc('cleanup_telemetry_event_log')

  if (expireErr) {
    return NextResponse.json({ error: expireErr.message }, { status: 500 })
  }

  return NextResponse.json({ expired: expireCount ?? 0 })
}
