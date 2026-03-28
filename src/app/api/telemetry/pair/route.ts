import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/telemetry'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { pairing_code } = await request.json()

  if (!pairing_code) {
    return NextResponse.json({ error: 'Missing pairing_code' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Look up pairing request (from the separate table)
  const { data: pairingReq, error: pairErr } = await supabase
    .from('telemetry_pairing_requests')
    .select('id, callback_url, expires_at')
    .eq('pairing_code', pairing_code)
    .single()

  if (pairErr || !pairingReq) {
    return NextResponse.json({ error: 'Invalid pairing code' }, { status: 400 })
  }

  if (new Date(pairingReq.expires_at) < new Date()) {
    // Clean up expired
    await supabase.from('telemetry_pairing_requests').delete().eq('id', pairingReq.id)
    return NextResponse.json({ error: 'Pairing code expired' }, { status: 400 })
  }

  // Generate API token and exchange code
  const apiToken = randomUUID()
  const exchangeCode = randomUUID()
  const exchangeExpiresAt = new Date(Date.now() + 60 * 1000).toISOString()

  // Create the real telemetry_tokens row with the authenticated user
  const { error: tokenErr } = await supabase
    .from('telemetry_tokens')
    .insert({
      user_id: user.id,
      token_hash: hashToken(apiToken),
      exchange_code: exchangeCode,
      exchange_expires_at: exchangeExpiresAt,
      temporary_token: apiToken,
    })

  if (tokenErr) {
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 })
  }

  // Delete the pairing request (used)
  await supabase.from('telemetry_pairing_requests').delete().eq('id', pairingReq.id)

  const callbackUrl = `${pairingReq.callback_url}?exchange_code=${exchangeCode}`

  return NextResponse.json({ callback_url: callbackUrl })
}
