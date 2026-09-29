'use server'

import { revalidatePath } from 'next/cache'
import { findCoinPackage } from '@/shared/lib/economy'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { CoinTopUpDto } from '../dto/CoinTopUpDto'
import { isDevTopUpAllowed } from '../lib/devMode'
import { grantDevCoins } from '../services/coins'

// Auth: Required. DEVELOPMENT ONLY: credits a Coin Shop package without payment ("Simulate
// Top-up (Dev Mode)"). Refused with AUTH_FORBIDDEN in production builds.
export async function simulateCoinTopUp(input: unknown): Promise<ActionResult<{ coinsAdded: number; totalCoins: number }>> {
  if (!isDevTopUpAllowed()) return fail('AUTH_FORBIDDEN', 'Test top-ups are only available in development')

  const parsed = CoinTopUpDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const pack = findCoinPackage(parsed.data.packageId)
  if (!pack) return fail('VALIDATION_FAILED', 'Unknown coin package')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to top up your coins')

  const granted = await grantDevCoins(user.id, pack.coins)
  if (!granted.success) return granted

  revalidatePath('/')
  revalidatePath('/profile')
  return ok({ coinsAdded: pack.coins, totalCoins: granted.data })
}
