import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER = '11111111-1111-4111-8111-111111111111'
const purse = new Map<string, number>()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/shared/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } })),
}))
// dev_grant_coins with the migration's semantics (1–100 per call).
vi.mock('@/shared/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (_fn: string, { p_user_id, p_amount }: { p_user_id: string; p_amount: number }) => {
      if (p_amount < 1 || p_amount > 100) return { data: null, error: { code: '22023', message: 'INVALID_AMOUNT' } }
      purse.set(p_user_id, (purse.get(p_user_id) ?? 0) + p_amount)
      return { data: purse.get(p_user_id), error: null }
    },
  }),
}))

import { simulateCoinTopUp } from '../actions/simulateCoinTopUp'
import { isDevTopUpAllowed } from '../lib/devMode'

describe('isDevTopUpAllowed', () => {
  it('is off in production builds only', () => {
    expect(isDevTopUpAllowed('production')).toBe(false)
    expect(isDevTopUpAllowed('development')).toBe(true)
    expect(isDevTopUpAllowed('test')).toBe(true)
  })
})

describe('simulateCoinTopUp', () => {
  beforeEach(() => {
    purse.clear()
    purse.set(USER, 40)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('credits the chosen package in development and returns the new total', async () => {
    expect(await simulateCoinTopUp({ packageId: 'coins-100' })).toEqual({ success: true, data: { coinsAdded: 100, totalCoins: 140 } })
    expect(await simulateCoinTopUp({ packageId: 'coins-10' })).toEqual({ success: true, data: { coinsAdded: 10, totalCoins: 150 } })
  })

  it('takes the amount from the price list, never from the client', async () => {
    const res = await simulateCoinTopUp({ packageId: 'coins-100', coins: 1_000_000 })
    expect(res.success && res.data.coinsAdded).toBe(100)
    expect((await simulateCoinTopUp({ packageId: 'coins-9999' })).success).toBe(false)
  })

  it('is refused in production: no free coins', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await simulateCoinTopUp({ packageId: 'coins-100' })
    expect(res).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(purse.get(USER)).toBe(40)
  })
})
