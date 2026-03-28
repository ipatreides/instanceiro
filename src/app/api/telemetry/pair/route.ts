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

  const { data: token, error } = await supabase
    .from('telemetry_tokens')
    .select('id, pairing_callback, pairing_expires_at')
    .eq('pairing_code', pairing_code)
    .is('revoked_at', null)
    .single()

  if (error || !token) {
    return NextResponse.json({ error: 'Invalid pairing code' }, { status: 400 })
  }

  if (new Date(token.pairing_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Pairing code expired' }, { status: 400 })
  }

  const apiToken = randomUUID()
  const exchangeCode = randomUUID()
  const exchangeExpiresAt = new Date(Date.now() + 60 * 1000).toISOString()

  await supabase
    .from('telemetry_tokens')
    .update({
      user_id: user.id,
      token_hash: hashToken(apiToken),
      pairing_code: null,
      pairing_expires_at: null,
      exchange_code: exchangeCode,
      exchange_expires_at: exchangeExpiresAt,
      temporary_token: apiToken,
    })
    .eq('id', token.id)

  const callbackUrl = `${token.pairing_callback}?exchange_code=${exchangeCode}`

  return NextResponse.json({ callback_url: callbackUrl })
}
