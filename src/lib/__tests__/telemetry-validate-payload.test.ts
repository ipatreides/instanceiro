import { validateTimestamp, reconstructKilledAt } from '../telemetry/validate-payload'

describe('validateTimestamp', () => {
  it('accepts timestamp within valid range', () => {
    const now = Date.now()
    const fiveMinAgo = Math.floor((now - 5 * 60 * 1000) / 1000)
    expect(validateTimestamp(fiveMinAgo)).toEqual({ valid: true, date: expect.any(Date) })
  })

  it('rejects timestamp more than 60s in the future', () => {
    const future = Math.floor((Date.now() + 120_000) / 1000)
    expect(validateTimestamp(future)).toEqual({ valid: false, reason: 'timestamp_future' })
  })

  it('rejects timestamp more than 24h in the past', () => {
    const old = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000)
    expect(validateTimestamp(old)).toEqual({ valid: false, reason: 'timestamp_stale' })
  })

  it('rejects non-numeric timestamp', () => {
    expect(validateTimestamp(null as any)).toEqual({ valid: false, reason: 'timestamp_invalid' })
    expect(validateTimestamp(NaN)).toEqual({ valid: false, reason: 'timestamp_invalid' })
  })
})

describe('reconstructKilledAt', () => {
  it('builds UTC date from BRT hour:minute anchored to reference date', () => {
    const ref = new Date('2026-03-30T14:30:00Z')
    const result = reconstructKilledAt(11, 0, ref)
    expect(result!.getUTCHours()).toBe(14)
    expect(result!.getUTCMinutes()).toBe(0)
    expect(result!.getUTCDate()).toBe(30)
  })

  it('subtracts a day if inferred time is after reference', () => {
    const ref = new Date('2026-03-30T01:00:00Z')
    const result = reconstructKilledAt(23, 50, ref)
    expect(result!.getUTCDate()).toBe(29)
  })

  it('returns null if no hour/minute provided', () => {
    expect(reconstructKilledAt(null as any, null as any, new Date())).toBeNull()
  })

  test('rejects time outside respawn window', () => {
    const reference = new Date('2026-04-04T23:00:00Z') // 20:00 BRT
    const result = reconstructKilledAt(15, 0, reference, 3600000)
    expect(result).toBeNull()
  })

  test('accepts time within respawn window', () => {
    const reference = new Date('2026-04-04T23:00:00Z') // 20:00 BRT
    const result = reconstructKilledAt(19, 30, reference, 3600000)
    expect(result).not.toBeNull()
  })

  test('crosses midnight within respawn window', () => {
    const reference = new Date('2026-04-05T03:10:00Z') // 00:10 BRT Apr 5
    const result = reconstructKilledAt(23, 50, reference, 3600000)
    expect(result).not.toBeNull()
    expect(result!.toISOString()).toBe('2026-04-05T02:50:00.000Z')
  })

  test('backward compat: no respawnMs means no window check', () => {
    const reference = new Date('2026-04-04T23:00:00Z')
    const result = reconstructKilledAt(15, 0, reference)
    expect(result).not.toBeNull()
  })
})
