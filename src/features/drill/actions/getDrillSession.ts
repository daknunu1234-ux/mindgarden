'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetDrillSessionDto } from '../dto/GetDrillSessionDto'
import { buildDrillSession } from '../services/drillSession'
import type { DrillSession } from '../types'

// Auth: Optional. Input: { slug } or { deckId }, plus optional limit (1–50, default 20).
export async function getDrillSession(input: unknown): Promise<ActionResult<DrillSession>> {
  const parsed = GetDrillSessionDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  return buildDrillSession(supabase, parsed.data, crypto.randomUUID())
}
