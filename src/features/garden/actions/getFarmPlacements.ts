'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { GetFarmPlacementsDto } from '../dto/FarmDto'
import type { Placement } from '../lib/farmGrid'
import { listPlacements } from '../services/placements'

// Auth: Optional. A farm's placements: your own (no ownerId) or a neighbour's (visitor mode, their
// items and public trees only). Signed out without an ownerId → an empty farm.
export async function getFarmPlacements(input: unknown = {}): Promise<ActionResult<Placement[]>> {
  const parsed = GetFarmPlacementsDto.safeParse(input ?? {})
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const ownerId = parsed.data.ownerId ?? user?.id
  if (!ownerId) return ok([])
  return listPlacements(supabase, ownerId)
}
