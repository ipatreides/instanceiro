import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { NextRequest } from 'next/server'

export interface TelemetryContext {
  userId: string
  characterId: number
  accountId: number
  groupId: string
  serverId: number
  sessionId: string
  tokenId: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Resolves telemetry request headers into full context:
 * token → user → character → group
 *
 * Returns null with appropriate error response if any step fails.
 */
export async function resolveTelemetryContext(
  request: NextRequest
): Promise<{ ctx: TelemetryContext } | { error: string; status: number }> {
  const token = request.headers.get('x-api-token')
  const accountId = Number(request.headers.get('x-account-id'))
  const characterId = Number(request.headers.get('x-character-id'))

  if (!token || !accountId || !characterId) {
    return { error: 'Missing required headers', status: 400 }
  }

  const supabase = createAdminClient()
  const tokenHash = hashToken(token)

  // Validate token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('telemetry_tokens')
    .select('id, user_id')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single()

  if (tokenErr || !tokenRow) {
    return { error: 'Invalid or revoked token', status: 401 }
  }

  // Update last_used_at
  await supabase
    .from('telemetry_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)

  // Find character's group membership
  const { data: membership, error: memberErr } = await supabase
    .from('mvp_group_members')
    .select('group_id, mvp_groups!inner(server_id)')
    .eq('character_id', String(characterId))
    .eq('user_id', tokenRow.user_id)
    .single()

  if (memberErr || !membership) {
    return { error: 'Character not in a group', status: 404 }
  }

  const groupId = membership.group_id as string
  const serverId = (membership as any).mvp_groups.server_id as number

  // Upsert session
  const { data: session, error: sessionErr } = await supabase
    .from('telemetry_sessions')
    .upsert(
      {
        token_id: tokenRow.id,
        user_id: tokenRow.user_id,
        character_id: characterId,
        account_id: accountId,
        group_id: groupId,
        last_heartbeat: new Date().toISOString(),
      },
      { onConflict: 'token_id,character_id' }
    )
    .select('id, config_version')
    .single()

  if (sessionErr || !session) {
    return { error: 'Failed to create session', status: 500 }
  }

  return {
    ctx: {
      userId: tokenRow.user_id,
      characterId,
      accountId,
      groupId,
      serverId,
      sessionId: session.id,
      tokenId: tokenRow.id,
    },
  }
}

export { hashToken }
