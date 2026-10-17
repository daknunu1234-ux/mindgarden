'use server'

import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { createClient } from '@/shared/lib/supabase/server'
import { ok, type ActionResult } from '@/shared/types/result'
import type { Membership } from '../lib/plans'
import { readMembership } from '../services/orders'
import { isPaymentConfigured } from '../services/payos'

export type MembershipView = Membership & { paymentsEnabled: boolean }

// Auth: Optional. The signed-in gardener's Pro membership (users.pro_until), and whether this server
// can take payments (PayOS configured). Signed out: not Pro. For the header and the upgrade modal.
export async function getMembership(): Promise<ActionResult<MembershipView>> {
  const paymentsEnabled = isPaymentConfigured()
  const user = await getRequestUser()
  if (!user) return ok({ isPro: false, lifetime: false, proUntil: null, paymentsEnabled })
  return ok({ ...(await readMembership(await createClient(), user.id)), paymentsEnabled })
}
