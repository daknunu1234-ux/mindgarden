import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'

// Keeps each `.in()` filter well under URL length limits (a UUID is 36 chars).
const ID_CHUNK = 150

// The player's mastery level per item (only practised items have a row).
export async function fetchMasteryLevels(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemIds: string[],
): Promise<ActionResult<Map<string, number>>> {
  const levels = new Map<string, number>()
  for (let i = 0; i < itemIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('user_progress')
      .select('knowledge_item_id, mastery_level')
      .eq('user_id', userId)
      .in('knowledge_item_id', itemIds.slice(i, i + ID_CHUNK))

    if (error) {
      console.error('[progress] fetchMasteryLevels failed', error)
      return fail('INTERNAL_ERROR', 'Could not load progress')
    }
    for (const row of data) levels.set(row.knowledge_item_id, row.mastery_level)
  }
  return ok(levels)
}
