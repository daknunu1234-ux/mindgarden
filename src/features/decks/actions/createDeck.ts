'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { CreateDeckDto } from '../dto/CreateDeckDto'
import { plantDeck, type PlantedDeck } from '../services/authoring'

// Auth: Required. Plants a tree for 100 🪙 (SEED_PRICE_COINS): INSUFFICIENT_COINS when the purse
// is short. The slug is generated from the title (collisions get -2, -3, …). Returns the deck
// and the purse after paying.
export async function createDeck(input: unknown): Promise<ActionResult<PlantedDeck>> {
  const parsed = CreateDeckDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to plant a tree')

  const res = await plantDeck(supabase, parsed.data)
  if (res.success) {
    // Farm (new plot + HUD purse) and profile (orchard, purse). The page navigates to the new tree.
    revalidatePath('/')
    revalidatePath('/profile')
  }
  return res
}
