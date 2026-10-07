'use server'

import { localDay, resolveTimeZone } from '@/shared/lib/localDay'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { HarvestFruitDto } from '../dto/HarvestFruitDto'
import { harvestFruit } from '../services/fruit'

// Auth: Required (the tree's owner). Collects today's fruit of a tree practised yesterday:
// FRUIT_PER_HARVEST 🍎 into the island's inventory, once per tree per day (harvest_tree_fruit(),
// service role; no coins: fruit becomes candy at the Candy Factory). No revalidatePath: the farm
// removes the fruit and adds it to the 🍎 counter optimistically, then settles on `totalFruit`.
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, DECK_NOT_FOUND (not yours), FRUIT_NOT_READY, INTERNAL_ERROR.
export async function harvestTreeFruit(input: unknown): Promise<ActionResult<{ fruitEarned: number; totalFruit: number }>> {
  const parsed = HarvestFruitDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to harvest your trees')

  return harvestFruit(user.id, parsed.data.deckId, localDay(new Date(), resolveTimeZone(parsed.data.timeZone)))
}
