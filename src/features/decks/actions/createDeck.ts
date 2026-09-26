'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { CreateDeckDto } from '../dto/CreateDeckDto'
import { insertDeck } from '../services/authoring'
import type { Deck } from '../types'

// Auth: Required. The slug is generated from the title (collisions get -2, -3, …).
export async function createDeck(input: unknown): Promise<ActionResult<Deck>> {
  const parsed = CreateDeckDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to plant a tree')

  return insertDeck(supabase, user.id, parsed.data)
}
