import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function POST(request: NextRequest) {
  const { callback_url } = await request.json()

  if (!callback_url) {
    return NextResponse.json({ error: 'Missing callback_url' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Clean up expired pairing rows
  await supabase
    .from('telemetry_tokens')
    .delete()
    .eq('user_id', '00000000-0000-0000-0000-000000000000')
    .lt('pairing_expires_at', new Date().toISOString())

  const pairingCode = generatePairingCode()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  // Create a placeholder token row with pairing info (no user yet)
  const { error } = await supabase
    .from('telemetry_tokens')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      token_hash: 'pending-' + randomUUID(),
      pairing_code: pairingCode,
      pairing_callback: callback_url,
      pairing_expires_at: expiresAt,
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to create pairing' }, { status: 500 })
  }

  return NextResponse.json({
    pairing_code: pairingCode,
    expires_at: expiresAt,
  })
}
