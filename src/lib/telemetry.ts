import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { NextRequest } from 'next/server'

export interface TelemetryContext {
  userId: string
  characterUuid: string
  characterId: string
  accountId: string
  groupId: string
  serverId: number
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
  const accountId = request.headers.get('x-account-id') ?? ''
  const characterId = request.headers.get('x-character-id') ?? ''

  if (!token) {
    return { error: 'Missing required headers', status: 400 }
  }

  const supabase = createAdminClient()
  const tokenHash = hashToken(token)

  // Validate token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('telemetry_tokens')
    .select('id, user_id, last_used_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single()

  if (tokenErr || !tokenRow) {
    return { error: 'Invalid or revoked token', status: 401 }
  }

  // Auto-revoke tokens inactive for more than 1 hour
  if (tokenRow.last_used_at) {
    const lastUsed = new Date(tokenRow.last_used_at).getTime()
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    if (lastUsed < oneHourAgo) {
      await supabase
        .from('telemetry_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenRow.id)
      return { error: 'Token expired due to inactivity', status: 401 }
    }
  }

  // Update last_used_at (fire and forget)
  supabase
    .from('telemetry_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)
    .then(() => {})

  // Find any of the user's characters that is in a group
  // The sniffer sends game-level IDs, but the DB uses UUIDs.
  // We resolve by user_id from the token — the user's group membership
  // determines context. If user has multiple characters in different groups,
  // we pick the first one (single group per character constraint).
  const { data: membership, error: memberErr } = await supabase
    .from('mvp_group_members')
    .select('group_id, character_id, mvp_groups!inner(server_id)')
    .eq('user_id', tokenRow.user_id)
    .limit(1)
    .single()

  if (memberErr || !membership) {
    return { error: 'Character not in a group', status: 404 }
  }

  const groupId = membership.group_id as string
  const characterUuid = membership.character_id as string
  const serverId = (membership as any).mvp_groups.server_id as number

  return {
    ctx: {
      userId: tokenRow.user_id,
      characterUuid,
      characterId,
      accountId,
      groupId,
      serverId,
      tokenId: tokenRow.id,
    },
  }
}

export { hashToken }
