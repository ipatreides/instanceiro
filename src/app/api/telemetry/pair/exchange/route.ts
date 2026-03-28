import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const { exchange_code } = await request.json()

  if (!exchange_code) {
    return NextResponse.json({ error: 'Missing exchange_code' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: token, error } = await supabase
    .from('telemetry_tokens')
    .select('id, temporary_token, exchange_expires_at')
    .eq('exchange_code', exchange_code)
    .single()

  if (error || !token) {
    return NextResponse.json({ error: 'Invalid exchange code' }, { status: 400 })
  }

  if (new Date(token.exchange_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Exchange code expired' }, { status: 400 })
  }

  const apiToken = token.temporary_token

  // Clear exchange code + temporary token (single use)
  await supabase
    .from('telemetry_tokens')
    .update({
      exchange_code: null,
      exchange_expires_at: null,
      temporary_token: null,
    })
    .eq('id', token.id)

  return NextResponse.json({ token: apiToken })
}
