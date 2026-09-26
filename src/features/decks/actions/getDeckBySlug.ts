'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetDeckBySlugDto } from '../dto/GetDeckBySlugDto'
import { findDeckBySlug } from '../services/decks'
import type { DeckDetail } from '../types'

// Auth: Optional. Public decks for everyone; private decks only for their owner (RLS).
export async function getDeckBySlug(input: unknown): Promise<ActionResult<DeckDetail>> {
  const parsed = GetDeckBySlugDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  return findDeckBySlug(supabase, parsed.data)
}
