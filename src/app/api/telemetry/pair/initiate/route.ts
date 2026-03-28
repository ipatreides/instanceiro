import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // Clean up expired pairing requests
  await supabase
    .from('telemetry_pairing_requests')
    .delete()
    .lt('expires_at', new Date().toISOString())

  const pairingCode = generatePairingCode()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('telemetry_pairing_requests')
    .insert({
      pairing_code: pairingCode,
      callback_url,
      expires_at: expiresAt,
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to create pairing' }, { status: 500 })
  }

  return NextResponse.json({
    pairing_code: pairingCode,
    expires_at: expiresAt,
  })
}
