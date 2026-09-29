import { describe, expect, it, vi } from 'vitest'
import { readCoins } from '../services/coins'

// The player's own client for `users.select('coins').eq('id').maybeSingle()` + ensure_user_profile.
function client(row: { coins: number } | null) {
  const rpc = vi.fn(async () => ({ data: 300, error: null }))
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error: null }) }
  return { c: { from: () => q, rpc }, rpc }
}

describe('readCoins', () => {
  it('reads an existing balance without touching the profile', async () => {
    const { c, rpc } = client({ coins: 120 })
    expect(await readCoins(c as never, 'u1')).toEqual({ success: true, data: 120 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('heals a missing profile row: the player gets the 300-coin starter purse, not 0', async () => {
    const { c, rpc } = client(null)
    expect(await readCoins(c as never, 'u1')).toEqual({ success: true, data: 300 })
    expect(rpc).toHaveBeenCalledWith('ensure_user_profile')
  })
})
